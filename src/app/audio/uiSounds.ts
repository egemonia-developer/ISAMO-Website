// ── UI sound effects (navigation feedback) ────────────────────────────────────
// All sounds are decoded once into AudioBuffers and played through the shared
// DynamicsCompressor hard-limiter in audioContext.ts — eliminates clipping even
// when many sounds fire simultaneously (rapid arrow-key navigation, etc.).

import { loadBuffer, playBuffer, setMasterGain, getMasterGain } from './audioContext';

export type UiSoundName =
  | 'horizontalLeft' | 'horizontalRight' | 'horizontal'
  | 'verticalUp'     | 'verticalDown'
  | 'hover'
  | 'click'          // ← void/empty click (mouse click on background, no element hit)
  | 'clickCursor'    // ← click landed on an interactive element
  | 'conferma'       | 'undo'
  | 'mute'           | 'unmute'
  | 'enterText'
  | 'fxScroll';      // ← scrolling over an FX value in the sound player

const SRC: Record<UiSoundName, string> = {
  horizontalLeft:  '/sounds/horizontal-left.mp3',
  horizontalRight: '/sounds/horizontal-right.mp3',
  horizontal:      '/sounds/horizontal.mp3',
  verticalUp:      '/sounds/vertical-up.mp3',
  verticalDown:    '/sounds/vertical-down.mp3',
  hover:           '/sounds/hover.mp3',
  click:           '/sounds/click.mp3',
  clickCursor:     '/sounds/click-cursor.mp3',
  conferma:        '/sounds/conferma.mp3',
  undo:            '/sounds/undo.mp3',
  mute:            '/sounds/mute.mp3',
  unmute:          '/sounds/unmute.mp3',
  enterText:       '/sounds/enter-text.mp3',
  fxScroll:        '/sounds/scroll-fx.mp3',
};

// Per-sound volumes (0.0–1.0). Hover is subtle since it fires often.
const VOLUMES: Record<UiSoundName, number> = {
  horizontalLeft:  0.65, horizontalRight: 0.65, horizontal:   0.65,
  verticalUp:      0.65, verticalDown:    0.65,
  hover:           0.30,
  click:           0.45, clickCursor:     0.60,
  conferma:        0.80, undo:            0.75,
  mute:            0.80, unmute:          0.80,
  enterText:       0.80,
  fxScroll:        0.60,
};

// Per-sound min interval (ms) — prevents machine-gunning when keys are held.
// Hover gets a longer throttle since cursor sweeps trigger many enters.
// fxScroll gets the same treatment — wheel events fire continuously.
const THROTTLE_MS: Record<UiSoundName, number> = {
  horizontalLeft:  60, horizontalRight: 60, horizontal:   60,
  verticalUp:      60, verticalDown:    60,
  hover:          110,
  click:           50, clickCursor:     50,
  conferma:        80, undo:            80,
  mute:            80, unmute:          80,
  enterText:       80,
  fxScroll:        80,
};

const buffers  = new Map<UiSoundName, AudioBuffer>();
const lastPlay = new Map<UiSoundName, number>();
let   muted    = false;

// Sounds that fire faster than their own length (continuous scroll feedback)
// "choke": a retrigger stops the still-playing instance first, so they never
// pile up into an overlapping wash.
const CHOKE_GROUP = new Set<UiSoundName>(['fxScroll']);
const activeSources = new Map<UiSoundName, AudioBufferSourceNode>();

let loadPromise: Promise<void> | null = null;

/** Pre-load + decode every sound once. Resolves once every sound is ready (or failed). */
export function preloadUiSounds(): Promise<void> {
  if (!loadPromise) {
    // Restore persisted volume
    const saved = localStorage.getItem('isamo-ui-volume');
    if (saved !== null) setMasterGain(parseFloat(saved));
    loadPromise = Promise.all(
      (Object.keys(SRC) as UiSoundName[]).map(key =>
        loadBuffer(SRC[key]).then(buf => buffers.set(key, buf)).catch(() => {}))
    ).then(() => {});
  }
  return loadPromise;
}

/** Set the master UI volume (0–1) and persist it. */
export function setUiVolume(v: number): void {
  const clamped = Math.max(0, Math.min(2, v));
  setMasterGain(clamped);
  localStorage.setItem('isamo-ui-volume', String(clamped));
}

/** Get the current master UI volume (0–1). */
export function getUiVolume(): number { return getMasterGain(); }

/** Play a UI sound. No-op when muted, throttled, or buffer not yet decoded. */
export function playUi(name: UiSoundName) {
  if (muted) return;
  const now  = performance.now();
  const last = lastPlay.get(name) ?? 0;
  if (now - last < THROTTLE_MS[name]) return;
  lastPlay.set(name, now);

  const buf = buffers.get(name);
  if (!buf) return; // still decoding — skip rather than stutter

  if (CHOKE_GROUP.has(name)) {
    try { activeSources.get(name)?.stop(); } catch { /* already stopped */ }
    const src = playBuffer(buf, VOLUMES[name]);
    activeSources.set(name, src);
    src.onended = () => { if (activeSources.get(name) === src) activeSources.delete(name); };
    return;
  }

  playBuffer(buf, VOLUMES[name]);
}

export function setUiMuted(m: boolean) { muted = m; }
export function isUiMuted()            { return muted; }
