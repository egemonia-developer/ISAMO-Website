import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { type Lang, getStrings } from './i18n/strings';

const FONT = "var(--font-main)";

// ISAMO = Intelligent Sound And Motion Organiser (localised per language)
const WORD_INTERVAL = 520;        // ms between words
const BASE_FONT = 120;

const wordStyle: CSSProperties = {
  fontFamily: FONT,
  color: 'var(--ui-complement)',
  fontSize: BASE_FONT,
  lineHeight: 0.9,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  display: 'inline-block',
  userSelect: 'none',
};

/**
 * Behind-/over-content overlay. While `active` (ISAMO logo hover), the acronym
 * words appear one after another — big, in the complement colour. Every word
 * uses a single text size: the one "Intelligent" needs to fit the viewport
 * (shorter words are simply narrower, never larger).
 */
export function WordReveal({ active, lang = 'en' }: { active: boolean; lang?: Lang }) {
  const words = getStrings(lang).isamoWords;
  // Size every word to the longest one so they share a single, stable size.
  const refWord = words.reduce((a, b) => (b.length > a.length ? b : a), words[0] ?? '');
  const [idx, setIdx] = useState(0);
  const [scale, setScale] = useState(1);
  const measureRef = useRef<HTMLSpanElement>(null);

  // Lock the size to the reference word ("Intelligent"); recompute on resize.
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const el = measureRef.current;
      if (!el) return;
      const nW = el.scrollWidth, nH = el.offsetHeight;
      if (nW <= 0 || nH <= 0) return;
      setScale(Math.min((window.innerWidth * 0.92) / nW, (window.innerHeight * 0.62) / nH));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, refWord]);

  useEffect(() => {
    if (!active) { setIdx(0); return; }
    setIdx(0);
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % words.length;
      setIdx(i);
    }, WORD_INTERVAL);
    return () => clearInterval(id);
  }, [active, words.length]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="word-reveal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 99990,        // above every UI element (below only the cursor)
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Hidden reference — the single size all words use is "Intelligent"'s */}
          <span ref={measureRef} aria-hidden style={{ ...wordStyle, position: 'absolute', visibility: 'hidden' }}>
            {refWord}
          </span>
          <span style={{ ...wordStyle, transform: `scale(${scale})`, transformOrigin: 'center' }}>
            {words[idx]}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
