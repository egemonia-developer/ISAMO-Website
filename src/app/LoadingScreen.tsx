import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { playKeyboardSound, preloadKeyboardSounds } from './audio/keyboardSounds';

interface Props {
  onComplete: () => void;
}

const LOAD_MIN_MS    = 2500;
const LOADED_HOLD_MS =  900;

const DOT_XS = [270.8, 540.86, 810.92] as const;

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

// ── Bracket geometry (from bracket.svg, viewBox 0 0 270.8 1079.88) ─────────────
const VB_W      = 1216.75; // loading SVG viewBox width
const BRACKET_W = 270.8;   // width of one half-bracket

// [ shape — long vertical bar on the LEFT (outer when placed left of centre)
function BracketLeft() {
  return (
    <>
      <rect fill="currentColor" x="0"     y="134.85" width="134.3" height="810.09" />
      <rect fill="currentColor" x="134.3" y="0"      width="136.5" height="134.85" />
      <rect fill="currentColor" x="134.3" y="945.03" width="136.5" height="134.85" />
    </>
  );
}

// ] shape — long vertical bar on the RIGHT (outer when placed right of centre)
// Mirror of BracketLeft about x = BRACKET_W / 2:
//   x=0,w=134.3  → x=136.5,w=134.3  (bar moves to right)
//   x=134.3,w=136.5 → x=0,w=136.5   (corners move to left)
function BracketRight() {
  return (
    <>
      <rect fill="currentColor" x="136.5" y="134.85" width="134.3" height="810.09" />
      <rect fill="currentColor" x="0"     y="0"      width="136.5" height="134.85" />
      <rect fill="currentColor" x="0"     y="945.03" width="136.5" height="134.85" />
    </>
  );
}

// Full frame used for the permanent centre bracket
function BracketFrame() {
  return (
    <g>
      {/* Left side */}
      <BracketLeft />
      {/* Right side — place ] flush against the right edge */}
      <g transform={`translate(${VB_W - BRACKET_W}, 0)`}>
        <BracketRight />
      </g>
    </g>
  );
}

const N_ECHO = 5;
// Peak opacity, closest → farthest
const ECHO_OPACITIES = [1, 0.72, 0.46, 0.24, 0.09];

export function LoadingScreen({ onComplete }: Props) {
  const [phase,    setPhase]    = useState<'loading' | 'loaded'>('loading');
  const [showEcho, setShowEcho] = useState(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => { preloadKeyboardSounds(); }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // ── Dot sounds — one random keyboard sound per dot at its appearance time ──
    // Dot i becomes visible at keyframe time (i * 0.16 + 0.02) within the 2.5 s cycle
    DOT_XS.forEach((_, i) => {
      const ms = Math.round((i * 0.16 + 0.02) * LOAD_MIN_MS); // 50 ms, 450 ms, 850 ms
      timers.push(setTimeout(() => playKeyboardSound(), ms));
    });

    timers.push(setTimeout(() => {
      setPhase('loaded');
      new Audio('/sounds/ui-loading_end.mp3').play().catch(() => {});
      // Slight delay so echo fires as the ! reaches its peak
      timers.push(setTimeout(() => setShowEcho(true), 60));
      timers.push(setTimeout(() => setShowEcho(false), 60 + 800));
      timers.push(setTimeout(() => onCompleteRef.current?.(), 60 + 800 + LOADED_HOLD_MS));
    }, LOAD_MIN_MS));

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25, ease: 'easeInOut' } }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      style={{
        position:       'fixed',
        inset:          0,
        background:     '#ffffff',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         9000,
        overflow:       'hidden',
      }}
    >
      <svg
        viewBox="0 0 1216.75 1080.25"
        style={{ width: 'auto', height: 76, overflow: 'visible',
                 // Accent while loading; flips to the complement when the "!" appears
                 color: phase === 'loaded' ? 'var(--ui-complement)' : 'var(--ui-fg)',
                 transition: 'color 0.25s ease' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Centre bracket — always visible */}
        <BracketFrame />

        {/* ── Echo copies ────────────────────────────────────────────
            Each copy is a SINGLE half-bracket so the long bar
            always faces outward:
              Left  copies → [ (BracketLeft)  at x = -(i+1)*BRACKET_W
              Right copies → ] (BracketRight) at x =  VB_W + i*BRACKET_W
            Stagger: inner first (i=0), outer last.            ── */}
        {showEcho && (
          <>
            {Array.from({ length: N_ECHO }, (_, i) => (
              <motion.g
                key={`echo-L-${i}`}
                transform={`translate(${-(i + 1) * BRACKET_W}, 0)`}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, ECHO_OPACITIES[i], 0] }}
                transition={{ duration: 0.42, delay: i * 0.038, ease: 'easeInOut', times: [0, 0.25, 1] }}
              >
                <BracketLeft />
              </motion.g>
            ))}
            {Array.from({ length: N_ECHO }, (_, i) => (
              <motion.g
                key={`echo-R-${i}`}
                transform={`translate(${VB_W + i * BRACKET_W}, 0)`}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, ECHO_OPACITIES[i], 0] }}
                transition={{ duration: 0.42, delay: i * 0.038, ease: 'easeInOut', times: [0, 0.25, 1] }}
              >
                <BracketRight />
              </motion.g>
            ))}
          </>
        )}

        {/* ── Loading: three animated dots ───────────────────────── */}
        <AnimatePresence>
          {phase === 'loading' && (
            <motion.g
              key="dots"
              exit={{ opacity: 0, transition: { duration: 0 } }}
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
            </motion.g>
          )}
        </AnimatePresence>

        {/* ── Loaded: exclamation mark — fast spring, impactful ─── */}
        <AnimatePresence>
          {phase === 'loaded' && (
            <motion.g
              key="loaded"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              transition={{
                type:      'spring',
                stiffness: 700,
                damping:   12,
                mass:      0.5,
                opacity:   { duration: 0.08, ease: 'easeOut' },
              }}
            >
              <polygon fill="currentColor" points="878.44 67.5 743.41 67.5 743.41 .04 473.34 .04 473.34 67.5 338.31 67.5 338.31 270.03 405.83 270.03 405.83 472.56 473.34 472.56 473.34 675.08 540.86 675.08 540.86 810.1 675.88 810.1 675.88 675.08 743.41 675.08 743.41 472.56 810.92 472.56 810.92 270.03 878.44 270.03 878.44 67.5" />
              <polygon fill="currentColor" points="670.61 877.64 535.58 877.64 535.58 945.15 468.06 945.15 468.06 1012.66 535.58 1012.66 535.58 1080.13 670.61 1080.13 670.61 1012.66 738.13 1012.66 738.13 945.15 670.61 945.15 670.61 877.64" />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    </motion.div>
  );
}
