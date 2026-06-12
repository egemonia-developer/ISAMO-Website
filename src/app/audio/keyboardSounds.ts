// ── Keyboard typing sounds ────────────────────────────────────────────────────
// All 13 samples are decoded once into AudioBuffers and played through the
// shared DynamicsCompressor hard-limiter — simultaneous keypresses can no
// longer clip the output.

import { loadBuffer, playBuffer } from './audioContext';

const FILES = [
  '/sounds/keyboard-1.mp3',
  '/sounds/keyboard-2.mp3',
  '/sounds/keyboard-3.mp3',
  '/sounds/keyboard-4.mp3',
  '/sounds/keyboard-5.mp3',
  '/sounds/keyboard-6.mp3',
  '/sounds/keyboard-7.mp3',
  '/sounds/keyboard-8.mp3',
  '/sounds/keyboard-9.mp3',
  '/sounds/keyboard-11.mp3',
  '/sounds/keyboard-12.mp3',
  '/sounds/keyboard-13.mp3',
  '/sounds/keyboard-14.mp3',
] as const;

const VOLUME = 0.55;

const buffers: AudioBuffer[] = [];
let   muted                  = false;
// Index of the last file played — used to guarantee variety
let   lastIdx                = -1;

let loadPromise: Promise<void> | null = null;

/** Fetch + decode all keyboard samples. Resolves once every sample is ready (or failed). */
export function preloadKeyboardSounds(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all(
      FILES.map((file, idx) => loadBuffer(file).then(buf => { buffers[idx] = buf; }).catch(() => {}))
    ).then(() => {});
  }
  return loadPromise;
}

/** Pick a random sample (never the same as the last one) and play it. */
export function playKeyboardSound() {
  if (muted || buffers.length === 0) return;

  // Build list of decoded buffers (some may still be pending on first call)
  const ready = buffers.filter(Boolean);
  if (ready.length === 0) return;

  // Random index into the full FILES list, re-roll once on repeat
  let idx = Math.floor(Math.random() * FILES.length);
  if (idx === lastIdx && FILES.length > 1) {
    idx = (idx + 1 + Math.floor(Math.random() * (FILES.length - 1))) % FILES.length;
  }

  // If this particular buffer isn't decoded yet, fall back to any ready one
  const buf = buffers[idx] ?? ready[Math.floor(Math.random() * ready.length)];
  lastIdx = idx;

  playBuffer(buf, VOLUME);
}

export function setKeyboardSoundMuted(m: boolean) { muted = m; }
