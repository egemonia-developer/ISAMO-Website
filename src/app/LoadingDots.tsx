import { motion, AnimatePresence } from 'motion/react';

// ── Loading-dots overlay ──────────────────────────────────────────────────────
// The three blinking dots from the LoadingScreen, blown up to the logo-hover
// (WordReveal) size and shown as a fixed, complement-coloured overlay in front
// of everything. Use it to indicate that something is loading (e.g. the ometto
// warming up its speech).

const DOT_XS = [270.8, 540.86, 810.92] as const;

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
          }}
        >
          {/* Same viewBox as the loading screen; sized to roughly the logo-hover scale. */}
          <svg
            viewBox="0 0 1216.75 1080.25"
            style={{ width: 'min(80vw, 90vh)', height: 'auto', overflow: 'visible',
                     transform: `translateY(${AXIS_OFFSET}px)` }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {DOT_XS.map((x, i) => (
              <motion.rect
                key={x}
                fill="currentColor"
                x={x} y={472.61} width={135.03} height={135.03}
                custom={i}
                variants={dotVariants}
                initial="idle"
                animate="animating"
              />
            ))}
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
