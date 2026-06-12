import { useState, useEffect, useRef } from 'react';
import { playKeyboardSound } from '../audio/keyboardSounds';

// ── useTypewriter ─────────────────────────────────────────────────────────────
// Returns the progressively-revealed slice of `text`.
// A random keyboard sound fires for every non-whitespace character that appears.
// `startDelay` (ms) postpones the first character — useful when the parent
// element has its own enter animation (e.g. opacity fade) and you want the
// typing to begin exactly when the element becomes visible.

export function useTypewriter(
  text:        string,
  speed        = 20,   // ms between characters (base; ±15 % jitter added)
  startDelay   = 0,    // ms before the first character appears
  onComplete?: () => void,
  soundEvery   = 1,    // play a sound every N non-whitespace characters (1 = every letter)
): string {
  const [count, setCount] = useState(0);

  // Keep onComplete always fresh — it's called asynchronously inside the timeout chain
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    setCount(0);
    if (!text) { onCompleteRef.current?.(); return; }

    let i               = 0;
    let charsSinceSound = 0;   // counts non-whitespace chars since last sound
    let tid: ReturnType<typeof setTimeout>;

    function next() {
      i++;
      setCount(i);

      const char = text[i - 1];
      if (char && char.trim()) {
        charsSinceSound++;
        if (charsSinceSound >= soundEvery) {
          playKeyboardSound();
          charsSinceSound = 0;
        }
      }

      if (i < text.length) {
        // ±15 % jitter for a slightly organic rhythm
        const jitter = speed * 0.15 * (Math.random() * 2 - 1);
        tid = setTimeout(next, Math.max(6, speed + jitter));
      } else {
        onCompleteRef.current?.();
      }
    }

    // First character appears after startDelay + one step
    tid = setTimeout(next, startDelay + speed);
    return () => clearTimeout(tid);
  }, [text, speed, startDelay, soundEvery]); // re-run when any of these change

  return text.slice(0, count);
}
