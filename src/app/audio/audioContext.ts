// ── Shared Web Audio API context + master hard-limiter ───────────────────────
// All sound modules route through: perGain → masterGain → limiter → destination
// masterGain allows a global UI volume knob without touching per-sound levels.

let _ctx:        AudioContext           | null = null;
let _limiter:    DynamicsCompressorNode | null = null;
let _masterGain: GainNode              | null = null;

export function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext();

    // ── Master hard-limiter ─────────────────────────────────────────────────
    _limiter = _ctx.createDynamicsCompressor();
    _limiter.threshold.value = -2;
    _limiter.knee.value      =  0;
    _limiter.ratio.value     = 20;
    _limiter.attack.value    = 0.001;
    _limiter.release.value   = 0.08;

    // ── Master gain (UI volume control) ────────────────────────────────────
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 1;

    // Chain: masterGain → limiter → destination
    _masterGain.connect(_limiter);
    _limiter.connect(_ctx.destination);
  }

  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
}

function getInsertPoint(): AudioNode {
  getCtx();
  return _masterGain!;
}

// ── Master gain control ───────────────────────────────────────────────────────
export function setMasterGain(v: number): void {
  getCtx();
  // Ceiling of 2.0 allows the UI volume to be pushed above unity; the downstream
  // limiter still catches any resulting clipping.
  if (_masterGain) _masterGain.gain.value = Math.max(0, Math.min(2, v));
}

export function getMasterGain(): number {
  return _masterGain?.gain.value ?? 1;
}

// ── Buffer loading ────────────────────────────────────────────────────────────
export async function loadBuffer(url: string): Promise<AudioBuffer> {
  const ctx = getCtx();
  const res = await fetch(url);
  const raw = await res.arrayBuffer();
  return ctx.decodeAudioData(raw);
}

// ── Playback ──────────────────────────────────────────────────────────────────
export function playBuffer(buffer: AudioBuffer, volume: number): void {
  const ctx  = getCtx();
  const src  = ctx.createBufferSource();
  src.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  src.connect(gain);
  gain.connect(getInsertPoint()); // → masterGain → limiter → destination
  src.start(0);
}
