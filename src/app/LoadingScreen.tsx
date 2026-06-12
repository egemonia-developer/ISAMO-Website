import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { playKeyboardSound, preloadKeyboardSounds } from './audio/keyboardSounds';
import { preloadUiSounds } from './audio/uiSounds';

interface Props {
  onComplete: () => void;
}

const LOAD_MIN_MS    = 2500;
const MAX_WAIT_MS    = 9000; // hard cap so a slow connection never blocks the UI forever
const BANG_HOLD_MS   = 1150; // how long "(!)" stays on screen before "(ISAMO !)"
const LOADED_HOLD_MS = 1300; // how long "(ISAMO !)" stays before completing
const CLOSE_MS       =  160; // brackets snap shut before the "!" pops in and reopens them

// ── Asset preloading — the dot animation loops (repeat: Infinity) until both
// LOAD_MIN_MS has elapsed AND every asset below is ready (or MAX_WAIT_MS hits). ──
function preloadAssets(): Promise<void> {
  const tasks: Promise<unknown>[] = [
    preloadKeyboardSounds(),
    preloadUiSounds(),
  ];
  if (typeof document !== 'undefined' && document.fonts?.ready) tasks.push(document.fonts.ready);

  const timeout = new Promise<void>(resolve => setTimeout(resolve, MAX_WAIT_MS));
  return Promise.race([Promise.all(tasks).then(() => {}), timeout]);
}

// ── Wordmark, set in the UI font (same glyphs as the persistent "(ISAMO !)" logo) ──
// All widths below are derived from the font's own advance widths (per 1000 units)
// at FONT_SIZE, so the "slot" between the brackets sizes itself exactly to its
// content — no DOM measurement needed.
const FONT_SIZE = 100; // px — overall size of the loading wordmark
const adv = (units: number) => units / 1000 * FONT_SIZE;

const BRACKET_ADV = adv(231); // '(' / ')' advance — echo step
const DOT_GAP     = 14;       // px gap between loading dots
const DOTS_W      = adv(271) * 3 + DOT_GAP * 2;               // "..." slot width
const BANG_W      = adv(488);                                  // "!" slot width
const FULL_W      = adv(182 + 490 + 529 + 729 + 646 + 200) + BANG_W; // "ISAMO !" slot width

const POP_SPRING   = { type: 'spring' as const, stiffness: 700, damping: 12, mass: 0.5 };
const CLOSE_TWEEN  = { duration: CLOSE_MS / 1000, ease: 'easeIn' as const };
const REVEAL_TWEEN = { duration: 0.3, ease: 'easeOut' as const };

const N_ECHO = 5;
// Peak opacity, closest → farthest
const ECHO_OPACITIES = [1, 0.72, 0.46, 0.24, 0.09];

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

type Phase = 'loading' | 'closed' | 'bang' | 'full';

export function LoadingScreen({ onComplete }: Props) {
  const [phase,    setPhase]    = useState<Phase>('loading');
  const [showEcho, setShowEcho] = useState(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // One random keyboard sound per dot at its appearance time, repeating for
    // every loop of the dot animation — on a slow connection the loading
    // phase can far outlast a single 2.5s cycle, and the dots keep looping
    // (repeat: Infinity) until assets are actually ready.
    const scheduleDotSounds = () => {
      [0, 1, 2].forEach((i) => {
        const ms = Math.round((i * 0.16 + 0.02) * LOAD_MIN_MS); // 50 ms, 450 ms, 850 ms
        timers.push(setTimeout(() => { if (!cancelled) playKeyboardSound(); }, ms));
      });
    };
    scheduleDotSounds();
    const dotSoundLoop = setInterval(scheduleDotSounds, LOAD_MIN_MS);
    timers.push(dotSoundLoop as unknown as ReturnType<typeof setTimeout>);

    // The dots keep looping (repeat: Infinity) until the page has actually
    // finished loading its media — not just after a fixed delay.
    const minDelay = new Promise<void>(resolve => {
      timers.push(setTimeout(resolve, LOAD_MIN_MS));
    });

    Promise.all([minDelay, preloadAssets()]).then(() => {
      if (cancelled) return;
      clearInterval(dotSoundLoop);

      // Dots fade out and the brackets snap shut first…
      setPhase('closed');

      timers.push(setTimeout(() => {
        if (cancelled) return;
        // …then reopen as the "!" pops in.
        setPhase('bang');
        new Audio('/sounds/ui-loading_end.mp3').play().catch(() => {});
        // Slight delay so echo fires as the ! reaches its peak
        timers.push(setTimeout(() => setShowEcho(true), 60));
        timers.push(setTimeout(() => setShowEcho(false), 60 + 800));
        // After "(!)" has held for a moment, reveal the full "(ISAMO !)" wordmark
        timers.push(setTimeout(() => setPhase('full'), BANG_HOLD_MS));
        timers.push(setTimeout(() => onCompleteRef.current?.(), BANG_HOLD_MS + LOADED_HOLD_MS));
      }, CLOSE_MS));
    });

    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);

  const slotWidth = phase === 'loading' ? DOTS_W
    : phase === 'closed' ? 0
    : phase === 'bang'   ? BANG_W
    : FULL_W;

  const slotTransition = phase === 'closed' ? CLOSE_TWEEN
    : phase === 'bang'  ? POP_SPRING
    : REVEAL_TWEEN;

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
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'baseline',
          fontFamily: 'var(--font-main)',
          fontSize: FONT_SIZE,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          // Accent while loading; flips to the complement once the "!" appears
          color: (phase === 'bang' || phase === 'full') ? 'var(--ui-complement)' : 'var(--ui-fg)',
          transition: 'color 0.25s ease',
        }}
      >
        {/* ── Echo copies — '(' radiates left, ')' radiates right ── */}
        {showEcho && Array.from({ length: N_ECHO }, (_, i) => (
          <motion.span
            key={`echo-L-${i}`}
            style={{ position: 'absolute', top: 0, right: `calc(100% + ${i * BRACKET_ADV}px)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, ECHO_OPACITIES[i], 0] }}
            transition={{ duration: 0.42, delay: i * 0.038, ease: 'easeInOut', times: [0, 0.25, 1] }}
          >(</motion.span>
        ))}
        {showEcho && Array.from({ length: N_ECHO }, (_, i) => (
          <motion.span
            key={`echo-R-${i}`}
            style={{ position: 'absolute', top: 0, left: `calc(100% + ${i * BRACKET_ADV}px)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, ECHO_OPACITIES[i], 0] }}
            transition={{ duration: 0.42, delay: i * 0.038, ease: 'easeInOut', times: [0, 0.25, 1] }}
          >)</motion.span>
        ))}

        <span>(</span>

        {/* ── Middle slot — sized exactly to its content; its width animation
               IS the "brackets close, then reopen" effect (no transforms needed
               on the brackets themselves). ── */}
        <motion.div
          animate={{ width: slotWidth }}
          transition={slotTransition}
          style={{ overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'baseline' }}
        >
          {/* Loading: three animated dots — fade out as the slot collapses */}
          <AnimatePresence>
            {phase === 'loading' && (
              <motion.span
                key="dots"
                style={{ display: 'inline-flex', gap: DOT_GAP }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeOut' } }}
              >
                {[0, 1, 2].map(i => (
                  <motion.span key={i} custom={i} variants={dotVariants} initial="idle" animate="animating">
                    .
                  </motion.span>
                ))}
              </motion.span>
            )}
          </AnimatePresence>

          {/* "!" pops in as the slot reopens; "ISAMO " fades in before it once revealed */}
          {(phase === 'bang' || phase === 'full') && (
            <motion.span
              style={{ display: 'inline-flex', transformOrigin: 'center' }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...POP_SPRING, opacity: { duration: 0.08, ease: 'easeOut' } }}
            >
              <AnimatePresence>
                {phase === 'full' && (
                  <motion.span
                    key="isamo"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    style={{ display: 'inline-block' }}
                  >
                    ISAMO&nbsp;
                  </motion.span>
                )}
              </AnimatePresence>
              !
            </motion.span>
          )}
        </motion.div>

        <span>)</span>
      </div>
    </motion.div>
  );
}
