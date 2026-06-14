import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Icon } from './icons';
import { getStrings, type Lang } from './i18n/strings';
import { getCtx } from './audio/audioContext';
import { preloadKeyboardSounds } from './audio/keyboardSounds';
import { preloadUiSounds } from './audio/uiSounds';
import { useGamepadNav } from './hooks/useGamepadNav';

interface Props {
  onWake: () => void;
  onControllerInput?: () => void;       // switch the app into controller mode
  inputMode?: 'keyboard' | 'controller';
  lang?: Lang;
}

// ── WakeScreen — pre-loading audio-unlock gate ────────────────────────────────
// Browsers block all audio until the user interacts with the page (autoplay
// policy). The loading screen is the very first paint, so its sounds can never
// play on a cold web visit. This minimal prompt sits in front of it: the first
// key/click resumes the shared AudioContext and primes HTMLAudio *inside the
// gesture*, unlocking sound for the whole session — then the loading animation
// runs WITH audio. A controller button also advances it and flips into
// controller mode (note: gamepad input is not a "user gesture" for autoplay, so
// waking with a pad may leave the loading sounds muted until a key/click later).
export function WakeScreen({ onWake, onControllerInput, inputMode = 'keyboard', lang = 'en' }: Props) {
  const S = getStrings(lang);
  const firedRef = useRef(false);

  // Stable wake handler (ref-backed) so the keydown effect and the gamepad hook
  // both call the latest version without re-subscribing.
  const wakeRef = useRef<(viaController?: boolean) => void>(() => {});
  wakeRef.current = (viaController = false) => {
    if (firedRef.current) return;
    firedRef.current = true;

    if (viaController) onControllerInput?.();

    // Resume the shared Web Audio context within the gesture.
    getCtx();

    // Prime HTMLAudio (the loading "!" pop uses `new Audio().play()` ~2.5 s
    // later — a play() called now inside the gesture unlocks it for the session).
    try {
      const primer = new Audio('/sounds/ui-loading_end.mp3');
      primer.volume = 0;
      primer.play().then(() => { primer.pause(); primer.currentTime = 0; }).catch(() => {});
    } catch { /* ignore */ }

    // Start decoding samples now (also kicked off by the loading screen).
    preloadKeyboardSounds();
    preloadUiSounds();

    onWake();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      wakeRef.current(false);
    };
    const onPointer = () => wakeRef.current(false);

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  // Any controller input wakes the screen and switches into controller mode.
  useGamepadNav({ onAnyInput: () => wakeRef.current(true) }, true);

  const isCtrl = inputMode === 'controller';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeInOut' } }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
      style={{
        position:       'fixed',
        inset:          0,
        background:     '#ffffff',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         9100,
        cursor:         'pointer',
        userSelect:     'none',
      }}
    >
      <motion.p
        animate={{ opacity: [1, 0.15, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          margin:        0,
          fontSize:      22,
          color:         'var(--ui-fg)',
          letterSpacing: '0.04em',
          whiteSpace:    'nowrap',
          fontFamily:    'var(--font-main)',
          display:       'inline-flex',
          alignItems:    'center',
        }}
      >
        {S.wakePrefix}
        <Icon name={isCtrl ? 'controller-A' : 'key-enter'} size="1em" color="var(--ui-complement)" style={{ verticalAlign: 'middle', margin: '0 0.25em' }} />
        {S.wakeSuffix}
      </motion.p>
    </motion.div>
  );
}
