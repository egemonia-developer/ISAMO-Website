'use strict';
/**
 * OLA (Overlap-Add) pitch shifter — AudioWorkletProcessor
 *
 * Shifts pitch by ±semitones WITHOUT changing playback speed or duration.
 *
 * Key design:
 *   GRAIN = 512 samples  (~12 ms @ 44.1 kHz)
 *   HOP   = 128 samples  = AudioWorklet render quantum
 *
 * One grain is synthesised per process() call (HOP == render size),
 * so there is no accumulation loop — the read/write positions stay
 * naturally in sync.
 *
 *   Analysis hop  h_a = HOP × 2^(semitones/12)
 *   Synthesis hop h_s = HOP  (fixed)
 *
 * h_a > h_s  →  analysis reads input faster  →  pitch UP
 * h_a < h_s  →  analysis reads input slower  →  pitch DOWN
 *
 * When pitching UP the analysis cursor approaches the write cursor;
 * it is clamped rather than allowed to overrun (small periodic artefact
 * for large shifts, imperceptible for ±1–6 semitones).
 *
 * Hann windowing + sum-of-squares normalisation keeps amplitude flat
 * across all overlapping grains (WOLA reconstruction).
 */

const GRAIN = 512;
const HOP   = 128;   // must equal AudioWorklet render quantum
const CHMX  = 2;     // stereo

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'semitones',
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automationRate: 'k-rate',
    }];
  }

  constructor() {
    super();
    const CAP   = (sampleRate | 0) * 6;   // 6-second ring buffer
    this._CAP   = CAP;

    this._hann  = new Float32Array(GRAIN);
    for (let i = 0; i < GRAIN; i++)
      this._hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (GRAIN - 1)));

    this._ch = Array.from({ length: CHMX }, () => ({
      inBuf:  new Float32Array(CAP),
      outBuf: new Float32Array(CAP),
      winBuf: new Float32Array(CAP),
      inW:  0,     // input write cursor (integer)
      inR:  0.0,   // analysis read cursor (fractional)
      outW: 0,     // output write cursor
      outR: 0,     // output read cursor
      init: false, // true once OLA has been bootstrapped
    }));
  }

  /** Linear interpolation on circular ring buffer */
  _lerp(buf, pos) {
    const C = this._CAP;
    const i = ((Math.floor(pos) % C) + C) % C;
    return buf[i] + (buf[(i + 1) % C] - buf[i]) * (pos - Math.floor(pos));
  }

  _processChannel(st, inp, outp, sem) {
    const C = this._CAP;

    // Write input to ring buffer (always, even during bypass)
    for (let i = 0; i < HOP; i++) {
      st.inBuf[st.inW % C] = inp[i];
      st.inW++;
    }

    // ── Bypass: direct pass-through ─────────────────────────────────────────
    if (Math.abs(sem) < 0.01) {
      outp.set(inp);
      st.init = false;   // reset so OLA re-bootstraps cleanly next time
      return;
    }

    // Warm-up silence: need at least GRAIN samples before first grain
    if (st.inW < GRAIN) {
      outp.fill(0);
      return;
    }

    // ── Bootstrap OLA on first non-bypass frame ──────────────────────────────
    if (!st.init) {
      st.inR  = st.inW - GRAIN;   // analysis starts GRAIN samples behind write
      st.outW = st.inW - GRAIN;   // output write at same absolute position
      st.outR = st.inW - GRAIN;   // output read aligned with write
      // Clear output ring in the region we are about to fill (avoids stale data)
      for (let n = 0; n < GRAIN * 8; n++) {
        const idx = (st.outW + n) % C;
        st.outBuf[idx] = 0;
        st.winBuf[idx] = 0;
      }
      st.init = true;
    }

    const factor = Math.pow(2, sem / 12);
    const hopA   = HOP * factor;   // analysis hop (fractional)

    // Clamp analysis cursor: must not read past the write position
    if (st.inR + GRAIN > st.inW)
      st.inR = st.inW - GRAIN;
    // Clamp: don't fall more than half the buffer behind write
    if (st.inW - st.inR > C * 0.5)
      st.inR = st.inW - C * 0.5;

    // ── Synthesise one Hann-windowed grain ───────────────────────────────────
    for (let n = 0; n < GRAIN; n++) {
      const w   = this._hann[n];
      const s   = this._lerp(st.inBuf, st.inR + n);
      const idx = (st.outW + n) % C;
      st.outBuf[idx] += s * w;
      st.winBuf[idx] += w * w;
    }

    // Advance analysis and synthesis pointers
    st.inR  += hopA;
    st.outW += HOP;

    // Re-clamp after advance (may have overshot for fast pitch-up)
    if (st.inR + GRAIN > st.inW)
      st.inR = st.inW - GRAIN;

    // ── Read HOP output samples (sum-of-squares normalisation) ───────────────
    for (let i = 0; i < HOP; i++) {
      const idx = st.outR % C;
      const w   = st.winBuf[idx];
      outp[i]   = w > 1e-4 ? st.outBuf[idx] / w : 0;
      st.outBuf[idx] = 0;   // clear slot after reading
      st.winBuf[idx] = 0;
      st.outR++;
    }
  }

  process(inputs, outputs, parameters) {
    const sem = parameters.semitones[0] ?? 0;
    for (let ch = 0; ch < CHMX; ch++) {
      const inp  = inputs[0]?.[ch];
      const outp = outputs[0]?.[ch];
      if (!inp || !outp) continue;
      this._processChannel(this._ch[ch], inp, outp, sem);
    }
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor);
