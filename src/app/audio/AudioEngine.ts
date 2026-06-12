export class AudioEngine {
  ctx: AudioContext | null = null;

  private chainInput: GainNode | null = null;

  // EQ Three (Ableton-inspired)
  private eqLow: BiquadFilterNode | null = null;
  private eqMid: BiquadFilterNode | null = null;
  private eqHigh: BiquadFilterNode | null = null;

  // Reverb (synthetic convolution)
  private reverbConv: ConvolverNode | null = null;
  private reverbDryGain: GainNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private reverbMix: GainNode | null = null;

  // Delay (feedback tape delay)
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayDryGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;
  private delayMix: GainNode | null = null;

  // Magic — granular delay (6-voice LFO-modulated delay cloud)
  private magicVoices: Array<{ delay: DelayNode; gain: GainNode }> = [];
  private magicDryGain: GainNode | null = null;
  private magicWetGain: GainNode | null = null;
  private magicMix: GainNode | null = null;

  private masterGain: GainNode | null = null;

  // Playback
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private _startedAt = 0;
  private _pausedAt = 0;
  private _isPlaying = false;
  playbackRate = 1;

  onEnded: (() => void) | null = null;
  loop = false;

  get isPlaying() {
    return this._isPlaying;
  }

  get currentTime() {
    if (this._isPlaying && this.ctx) {
      const elapsed = (this.ctx.currentTime - this._startedAt) * this.playbackRate;
      return this._pausedAt + elapsed;
    }
    return this._pausedAt;
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this._buildGraph();
  }

  private _buildGraph() {
    const ctx = this.ctx!;

    this.chainInput = ctx.createGain();

    // — EQ Three ——————————————————————————————————————————————
    // Low shelf at 80 Hz (bass): exact same corner as Ableton EQ Three band 1
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 80;
    this.eqLow.gain.value = 0;

    // Mid peaking at 1 kHz, Q=0.71 (≈ Ableton band 2 default)
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.71;
    this.eqMid.gain.value = 0;

    // High shelf at 8 kHz (presence/air): Ableton EQ Three band 3
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 8000;
    this.eqHigh.gain.value = 0;

    // — Reverb ————————————————————————————————————————————————
    this.reverbConv = ctx.createConvolver();
    this.reverbConv.buffer = this._generateImpulse(2.8, 2.5);
    this.reverbDryGain = ctx.createGain();
    this.reverbWetGain = ctx.createGain();
    this.reverbMix = ctx.createGain();
    this.reverbDryGain.gain.value = 1;
    this.reverbWetGain.gain.value = 0;

    // — Delay —————————————————————————————————————————————————
    this.delayNode = ctx.createDelay(4.0);
    this.delayNode.delayTime.value = 0.25;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0;
    this.delayDryGain = ctx.createGain();
    this.delayWetGain = ctx.createGain();
    this.delayMix = ctx.createGain();
    this.delayDryGain.gain.value = 1;
    this.delayWetGain.gain.value = 0;

    // — Magic: granular delay cloud ————————————————————————————
    // 6 voices with staggered delay times and independent LFO pitch/time modulation
    // Inspired by granular processing in SuperCollider / Ardour Stutter plugins
    this.magicVoices = Array.from({ length: 6 }, (_, i) => {
      const delay = ctx.createDelay(1.0);
      // Stagger voices across 50–420 ms (prime-like spacing to avoid comb filtering)
      const baseTime = [0.05, 0.09, 0.14, 0.21, 0.30, 0.42][i];
      delay.delayTime.value = baseTime;

      const gain = ctx.createGain();
      gain.gain.value = 1 / 6;

      // LFO modulates delay time (creates grain scatter)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07 + i * 0.05; // 0.07–0.32 Hz
      const lfoDepth = ctx.createGain();
      // Depth increases with voice index (outer voices scatter more)
      lfoDepth.gain.value = 0.008 + i * 0.004;
      lfo.connect(lfoDepth);
      lfoDepth.connect(delay.delayTime);
      lfo.start();

      return { delay, gain };
    });

    this.magicDryGain = ctx.createGain();
    this.magicWetGain = ctx.createGain();
    this.magicMix = ctx.createGain();
    this.magicDryGain.gain.value = 1;
    this.magicWetGain.gain.value = 0;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.9;

    // — Wire signal chain ——————————————————————————————————————
    // input → EQ
    this.chainInput.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);

    // EQ → reverb send (dry + wet → mix)
    this.eqHigh.connect(this.reverbDryGain);
    this.eqHigh.connect(this.reverbConv);
    this.reverbConv.connect(this.reverbWetGain);
    this.reverbDryGain.connect(this.reverbMix);
    this.reverbWetGain.connect(this.reverbMix);

    // reverb mix → delay (dry + feedback loop + wet → mix)
    this.reverbMix.connect(this.delayDryGain);
    this.reverbMix.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode); // feedback loop
    this.delayNode.connect(this.delayWetGain);
    this.delayDryGain.connect(this.delayMix);
    this.delayWetGain.connect(this.delayMix);

    // delay mix → magic granular (dry + 6 voices → mix)
    this.delayMix.connect(this.magicDryGain);
    this.magicVoices.forEach(({ delay, gain }) => {
      this.delayMix!.connect(delay);
      delay.connect(gain);
      gain.connect(this.magicWetGain!);
    });
    this.magicDryGain.connect(this.magicMix);
    this.magicWetGain.connect(this.magicMix);

    this.magicMix.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
    (window as any).__audioEngine = this;
    console.log('[AudioEngine] graph built, ctx.state=', ctx.state);
  }

  // Synthetic impulse response: exponentially decaying stereo noise
  private _generateImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        // Exponential decay with random phase (slightly different per channel for width)
        const env = Math.pow(1 - i / len, decay);
        d[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buf;
  }

  async loadFile(src: string): Promise<void> {
    this.init();
    if (this.bufferCache.has(src)) {
      this.buffer = this.bufferCache.get(src)!;
      return;
    }
    const resp = await fetch(src);
    const ab = await resp.arrayBuffer();
    this.buffer = await this.ctx!.decodeAudioData(ab);
    this.bufferCache.set(src, this.buffer);
  }

  async play(from?: number) {
    if (!this.ctx || !this.buffer || !this.chainInput) return;

    // Must await resume — ctx.currentTime doesn't advance while suspended
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this._stopSource();

    const offset = from !== undefined ? from : this._pausedAt;
    const safeOffset = Math.max(0, Math.min(offset, this.buffer.duration));

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.playbackRate;
    this.source.loop = this.loop;
    this.source.connect(this.chainInput);
    this.source.start(0, safeOffset);
    this._startedAt = this.ctx.currentTime - safeOffset / this.playbackRate;
    this._isPlaying = true;

    this.source.onended = () => {
      // Only fires when loop=false and playback reaches the end naturally
      if (this._isPlaying && !this.loop) {
        this._isPlaying = false;
        this._pausedAt = 0;
        this.onEnded?.();
      }
    };
  }

  pause() {
    if (!this._isPlaying) return;
    this._pausedAt = this.currentTime;
    this._stopSource();
  }

  seek(time: number) {
    const clamped = Math.max(0, Math.min(time, this.duration));
    this._pausedAt = clamped;
    if (this._isPlaying) this.play(clamped);
  }

  setPlaybackRate(rate: number) {
    this.playbackRate = rate;
    if (this.source) this.source.playbackRate.value = rate;
    // Recalculate startedAt so currentTime stays accurate after rate change
    if (this._isPlaying && this.ctx) {
      this._startedAt = this.ctx.currentTime - this._pausedAt / rate;
    }
  }

  // EQ Three: knob 0–100 maps to –24 dB … +12 dB (center 50 = 0 dB)
  setEQ(low: number, mid: number, high: number, enabled: boolean) {
    const toDb = (v: number) => enabled ? (v - 50) * 0.72 : 0;
    const lb = toDb(low), mb = toDb(mid), hb = toDb(high);
    console.log('[AudioEngine] setEQ', { low: lb, mid: mb, high: hb, enabled });
    if (this.eqLow) this.eqLow.gain.value = lb;
    if (this.eqMid) this.eqMid.gain.value = mb;
    if (this.eqHigh) this.eqHigh.gain.value = hb;
  }

  // Reverb: intensity 0–100 controls wet mix
  setReverb(intensity: number, enabled: boolean) {
    const wet = enabled ? (intensity / 100) * 0.85 : 0;
    console.log('[AudioEngine] setReverb', { wet, enabled, nodes: !!this.reverbWetGain });
    if (this.reverbWetGain) this.reverbWetGain.gain.value = wet;
    if (this.reverbDryGain) this.reverbDryGain.gain.value = 1;
  }

  // Delay: intensity controls feedback + wet; time sets delay length
  setDelay(intensity: number, time: '1/8' | '1/4' | '1/2' | '1', enabled: boolean) {
    const times: Record<string, number> = { '1/8': 0.125, '1/4': 0.25, '1/2': 0.5, '1': 1.0 };
    if (this.delayNode) this.delayNode.delayTime.value = times[time];
    const wet = enabled ? intensity / 100 : 0;
    console.log('[AudioEngine] setDelay', { wet, time, enabled, nodes: !!this.delayWetGain });
    if (this.delayFeedback) this.delayFeedback.gain.value = wet * 0.55;
    if (this.delayWetGain) this.delayWetGain.gain.value = wet * 0.65;
    if (this.delayDryGain) this.delayDryGain.gain.value = 1;
  }

  // Magic — granular delay: intensity 0–100 controls cloud density + wet mix
  setMagic(intensity: number, enabled: boolean) {
    const wet = enabled ? intensity / 100 : 0;
    console.log('[AudioEngine] setMagic', { wet, enabled, nodes: !!this.magicWetGain });
    if (this.magicWetGain) this.magicWetGain.gain.value = wet * 0.75;
    if (this.magicDryGain) this.magicDryGain.gain.value = 1;
    this.magicVoices.forEach(({ gain }) => {
      gain.gain.value = (1 / this.magicVoices.length) * (0.4 + wet * 0.6);
    });
  }

  private _stopSource() {
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
    this._isPlaying = false;
  }

  destroy() {
    this._stopSource();
    this.ctx?.close();
    this.ctx = null;
  }
}
