import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const FONT = "var(--font-main)";
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
 * Huge, brief centred flash — shown when entering FX mode. Same fixed,
 * scale-to-fit overlay style as the ISAMO logo-hover WordReveal.
 */
export function FxModeOverlay({ active, text }: { active: boolean; text: string }) {
  const [scale, setScale] = useState(1);
  const measureRef = useRef<HTMLSpanElement>(null);

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
  }, [active, text]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="fx-mode-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 99990,
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <span ref={measureRef} aria-hidden style={{ ...wordStyle, position: 'absolute', visibility: 'hidden' }}>
            {text}
          </span>
          <span style={{ ...wordStyle, transform: `scale(${scale})`, transformOrigin: 'center' }}>
            {text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
