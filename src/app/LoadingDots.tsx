import { motion, AnimatePresence } from 'motion/react';

// ── Loading-dots overlay ──────────────────────────────────────────────────────
// The three blinking dots from the LoadingScreen, set in the UI font and blown
// up to roughly the logo-hover (WordReveal) size, shown as a fixed,
// complement-coloured overlay in front of everything. Use it to indicate that
// something is loading (e.g. the ometto warming up its speech).

const FONT = "var(--font-main)";
const DOT_GAP = '0.18em';

// Vertical offset of the shared ISAMO central axis from the viewport centre
// (mirrors ANCHOR_TOP / axisY in Home & SplashScreen): 50% + LOGO_TOP/2 − 36.
const LOGO_TOP    = 28;
const AXIS_OFFSET = LOGO_TOP / 2 - 36; // ≈ −22px

const dotVariants = {
  idle: { opacity: 0 },
  animating: (i: number) => ({
    opacity: [0, 0, 1, 1, 0, 0] as number[],
    transition: {
      times: [0, i * 0.16 + 0.02, i * 0.16 + 0.02 + 0.001, 0.76, 0.84, 1],
      duration: 2.5,
      repeat: Infinity,
      ease: 'linear' as const,
    },
  }),
};

export function LoadingDots({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="loading-dots"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 99995,            // above every UI element (below only the cursor)
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ui-complement)',
            transform: `translateY(${AXIS_OFFSET}px)`,
          }}
        >
          <div style={{
            display: 'flex', gap: DOT_GAP,
            fontFamily: FONT, fontSize: 'min(18vw, 22vh)', lineHeight: 1,
            whiteSpace: 'nowrap', userSelect: 'none',
          }}>
            {[0, 1, 2].map(i => (
              <motion.span key={i} custom={i} variants={dotVariants} initial="idle" animate="animating">
                .
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
