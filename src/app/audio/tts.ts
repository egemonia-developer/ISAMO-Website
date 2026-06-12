// ── Text-to-Speech ───────────────────────────────────────────────────────────
// Integrates talkmodachi (https://github.com/dylanpdx/talkmodachi): Tomodachi
// Life's Mii voice. The voice is generated server-side (a patched ROM running in
// Citra) and exposed as an HTTP endpoint that returns a WAV — the public site is
// just a frontend to it. We call that same endpoint (CORS is open) for the real
// Mii voice, and fall back to the browser's speechSynthesis if it's unreachable.
//
// Speaks ONLY when there is actual (non-empty) text and TTS is enabled.

const TTS_API = 'https://talkmodachi.dylanpdx.io/tts';
const MAX_LEN = 2000; // engine limit

export type TtsParams = {
  pitch: number; speed: number; quality: number;
  tone: number; accent: number; intonation: number; lang: string;
};

export const TTS_LANGS = ['useng', 'eueng', 'es', 'de', 'fr', 'it', 'jp'] as const;
export const INTONATIONS = [0, 1, 2, 3] as const; // talkmodachi intonation presets

export const DEFAULT_TTS_PARAMS: TtsParams = {
  pitch: 56, speed: 52, quality: 50, tone: 50, accent: 50, intonation: 1, lang: 'useng',
};

let enabled = false;
let params: TtsParams = { ...DEFAULT_TTS_PARAMS };
let lastSpoken = '';
let reqId = 0;
let audioEl: HTMLAudioElement | null = null;
let curUrl: string | null = null;
let onEndCb: (() => void) | null = null;   // fired when speech finishes naturally

// ── Loading state (drives the global loading-dots overlay) ────────────────────
// Kept visible for at least MIN_LOADING_MS once shown, so even a quick fetch
// produces a perceptible "moment of silence" with the dots.
const MIN_LOADING_MS = 600;
let loading = false;
let loadingSince = 0;
let loadingOffTimer: ReturnType<typeof setTimeout> | null = null;
const loadingListeners = new Set<(b: boolean) => void>();
function emitLoading(b: boolean) {
  if (loading === b) return;
  loading = b;
  loadingListeners.forEach(fn => fn(b));
}
function setLoading(b: boolean) {
  if (b) {
    if (loadingOffTimer) { clearTimeout(loadingOffTimer); loadingOffTimer = null; }
    if (!loading) { loadingSince = Date.now(); emitLoading(true); }
  } else {
    if (!loading) return;
    const remaining = MIN_LOADING_MS - (Date.now() - loadingSince);
    if (remaining <= 0) { emitLoading(false); }
    else {
      if (loadingOffTimer) clearTimeout(loadingOffTimer);
      loadingOffTimer = setTimeout(() => { loadingOffTimer = null; emitLoading(false); }, remaining);
    }
  }
}
export function getTtsLoading(): boolean { return loading; }
export function subscribeTtsLoading(fn: (b: boolean) => void): () => void {
  loadingListeners.add(fn);
  return () => { loadingListeners.delete(fn); };
}

// Cache generated audio by (text+params) so repeats are instant.
const cache = new Map<string, string>(); // key → object URL

const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
let preferredVoice: SpeechSynthesisVoice | null = null;

// ── Live amplitude analysis (drives the talking-mouth animation) ──────────────
let actx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let srcNode: MediaElementAudioSourceNode | null = null;
let levelBuf: Uint8Array | null = null;

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}

function ensureAnalyser() {
  const el = ensureAudio();
  if (!actx) {
    try {
      actx = new AudioContext();
      srcNode = actx.createMediaElementSource(el);
      analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      levelBuf = new Uint8Array(analyser.fftSize);
      srcNode.connect(analyser);
      analyser.connect(actx.destination);
    } catch { actx = null; analyser = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}

/** Current speech amplitude, 0..~1 (RMS). 0 when silent / unsupported. */
export function getTtsLevel(): number {
  if (!analyser || !levelBuf) return 0;
  analyser.getByteTimeDomainData(levelBuf);
  let sum = 0;
  for (let i = 0; i < levelBuf.length; i++) { const v = (levelBuf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / levelBuf.length);
}

export function setTtsEnabled(v: boolean) {
  enabled = v;
  if (!v) cancelTts();
}
export function isTtsEnabled() { return enabled; }

// True while audio is actively playing (used to decide stop-vs-replay on toggle).
export function isTtsPlaying(): boolean {
  if (audioEl && !audioEl.paused && !audioEl.ended && audioEl.currentTime > 0) return true;
  if (hasSpeech && window.speechSynthesis.speaking) return true;
  return false;
}

export function setTtsParams(p: Partial<TtsParams>) {
  params = { ...params, ...p };
  cache.clear(); // params changed → previously cached audio is stale
}
export function getTtsParams(): TtsParams { return { ...params }; }

export function cancelTts() {
  reqId++;
  setLoading(false);              // a cancel hides any pending loading indicator
  onEndCb = null;                 // a cancel must not fire the natural-end callback
  if (audioEl) { try { audioEl.pause(); } catch {} audioEl.onended = null; audioEl.src = ''; }
  curUrl = null; // cached URLs are reused, so don't revoke here
  if (hasSpeech) window.speechSynthesis.cancel();
  lastSpoken = '';
}

function buildUrl(text: string): string {
  const q = new URLSearchParams({
    text: text.slice(0, MAX_LEN),
    pitch: String(params.pitch), speed: String(params.speed),
    quality: String(params.quality), tone: String(params.tone),
    accent: String(params.accent), intonation: String(params.intonation),
    lang: params.lang,
  });
  return `${TTS_API}?${q.toString()}`;
}

function cacheKey(text: string): string {
  return JSON.stringify([text, params]);
}

/** Pre-generate audio for a phrase without playing it (warms the cache → no lag). */
export async function prefetch(text: string) {
  if (!enabled) return;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const key = cacheKey(clean);
  if (cache.has(key)) return;
  try {
    const resp = await fetch(buildUrl(clean));
    if (!resp.ok) return;
    const blob = await resp.blob();
    cache.set(key, URL.createObjectURL(blob));
  } catch { /* ignore — speak() will fall back */ }
}

/**
 * Speak text with the talkmodachi (Mii) voice. No-op when disabled or empty.
 * Uses the cache when warm (instant); otherwise fetches, then falls back to the
 * browser speech engine if the API can't be reached.
 */
export async function speak(text: string, opts?: { force?: boolean; onEnd?: () => void; indicateLoading?: boolean }) {
  if (!enabled) return;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;                       // ← only when there's text
  if (!opts?.force && clean === lastSpoken) return;
  lastSpoken = clean;

  cancelTts();
  lastSpoken = clean;
  onEndCb = opts?.onEnd ?? null;            // (cancelTts cleared it)
  const myId = ++reqId;
  const key = cacheKey(clean);

  // Cache hit → play immediately (no loading needed)
  const cached = cache.get(key);
  if (cached) { playUrl(cached, myId); return; }

  if (opts?.indicateLoading) setLoading(true);  // warming the cache → show the dots
  try {
    const resp = await fetch(buildUrl(clean));
    if (!resp.ok) throw new Error(`tts ${resp.status}`);
    const blob = await resp.blob();
    if (myId !== reqId) return;
    const url = URL.createObjectURL(blob);
    cache.set(key, url);
    playUrl(url, myId);
  } catch {
    if (myId !== reqId) return;
    setLoading(false);
    fallbackSpeak(clean);
  }
}

function playUrl(url: string, myId: number) {
  if (myId !== reqId) return;
  setLoading(false);              // audio ready → hide the loading indicator
  curUrl = url;
  ensureAnalyser();           // route through analyser so the mouth can follow the audio
  const el = ensureAudio();
  el.src = url;
  el.onended = () => { if (myId === reqId) { const cb = onEndCb; onEndCb = null; cb?.(); } };
  el.play().catch(() => {});
}

// ── Fallback: browser speechSynthesis ────────────────────────────────────────
function pickVoice(): SpeechSynthesisVoice | null {
  if (!hasSpeech) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefer = ['Samantha', 'Google US English', 'Karen', 'Daniel'];
  for (const n of prefer) { const v = voices.find(vc => vc.name.includes(n)); if (v) return v; }
  return voices.find(v => v.lang.startsWith('en')) ?? voices[0];
}

function fallbackSpeak(text: string) {
  if (!hasSpeech) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = preferredVoice ?? (preferredVoice = pickVoice());
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  // Map talkmodachi 0–100 params onto the browser engine's ranges.
  u.rate = 0.5 + (params.speed / 100) * 1.5;
  u.pitch = (params.pitch / 100) * 2;
  u.onend = () => { const cb = onEndCb; onEndCb = null; cb?.(); };
  window.speechSynthesis.speak(u);
}
