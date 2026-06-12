import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LoadingScreen, warmMediaCache } from './LoadingScreen';
import { SplashScreen } from './SplashScreen';
import { Home, applyColorVars } from './Home';
import { WordReveal } from './WordReveal';
import { LoadingDots } from './LoadingDots';
import { subscribeTtsLoading, getTtsLoading, cancelTts } from './audio/tts';
import { Icon } from './icons';
import { type Lang } from './i18n/strings';

import { useGamepadNav } from './hooks/useGamepadNav';
import { cursorState } from './hooks/cursorState';
import { useLowConnection } from './hooks/useLowConnection';
import { preloadUiSounds, playUi, setUiMuted } from './audio/uiSounds';
import { preloadKeyboardSounds, setKeyboardSoundMuted } from './audio/keyboardSounds';

type Screen    = 'loading' | 'splash' | 'home';
export type InputMode = 'keyboard' | 'controller';

const CURSOR_SIZE    = 20;
const CURSOR_IDLE_MS = 2500; // ms of right-stick inactivity before cursor hides

// ── ISAMO logo — rendered once here so it persists across splash → home with no
//    re-mount and no entrance/exit animation (mirrors the Home/Splash anchor). ──
const LOGO_LEFT       = 24;
const LOGO_W          = 88;
const LOGO_TOP        = 28;
const LOGO_ICON_PX    = 15;
const LOGO_ANCHOR_TOP = `calc(50% + ${LOGO_TOP / 2 - LOGO_ICON_PX / 2 - 36}px)`;
const MAGNET_RADIUS_NORMAL = 100; // px — pills, logo, generic interactive elements
const MAGNET_RADIUS_STRONG = 180; // px — XMB text columns + sound list (data-magnet="strong")

// Catches BOTH semantic elements (button/a/…) AND React inline-styled divs with
// cursor:pointer (the dominant pattern in this codebase — XMB cols, pills, moodboard, etc.)
const INTERACTIVE_SEL = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
  // React inline-style elements (dominant pattern in this codebase — XMB cols, pills, sound list, etc.)
  // :not([data-no-magnet]) excludes moodboard video items per user request
  '[style*="cursor: pointer"]:not([data-no-magnet])',
  '[style*="cursor:pointer"]:not([data-no-magnet])',
].join(', ');

// ── Cursor magnetism ──────────────────────────────────────────────────────────
/**
 * Two-tier magnetism:
 *  • data-magnet="strong"  → XMB columns + sound list: radius 180px, pull up to 98% (near-snap)
 *  • everything else       → pills, logo, etc.: radius 100px, pull up to 92%
 * Strong takes priority. Raw position is untouched so movement stays fluid.
 */
function applyMagnetism(x: number, y: number): [number, number] {
  let bestStrong = MAGNET_RADIUS_STRONG; let sx = x, sy = y;
  let bestNormal = MAGNET_RADIUS_NORMAL; let nx = x, ny = y;

  for (const el of document.querySelectorAll<Element>(INTERACTIVE_SEL)) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const ecx  = rect.left + rect.width  / 2;
    const ecy  = rect.top  + rect.height / 2;
    const dist = Math.hypot(ecx - x, ecy - y);

    if (el.hasAttribute('data-magnet') && el.getAttribute('data-magnet') === 'strong') {
      if (dist < bestStrong) { bestStrong = dist; sx = ecx; sy = ecy; }
    } else {
      if (dist < bestNormal) { bestNormal = dist; nx = ecx; ny = ecy; }
    }
  }

  // Strong magnet takes priority when in range
  if (bestStrong < MAGNET_RADIUS_STRONG) {
    const t    = 1 - bestStrong / MAGNET_RADIUS_STRONG;
    const pull = t * 0.98; // near-snap at close range
    return [x + (sx - x) * pull, y + (sy - y) * pull];
  }

  // Fall back to normal magnet
  if (bestNormal < MAGNET_RADIUS_NORMAL) {
    const t    = 1 - bestNormal / MAGNET_RADIUS_NORMAL;
    const pull = t * 0.92;
    return [x + (nx - x) * pull, y + (ny - y) * pull];
  }

  return [x, y];
}

// Mute/unmute icon — inner symbol inheriting var(--ui-fg) (accent).
// Inlined so the symbol can pick up the CSS var.
function MuteGeneralIcon({ muted, size = 18 }: { muted: boolean; size?: number }) {
  return (
    // top:-2 — SVG is box-centred, but the adjacent key-font glyphs sit in the
    // upper part of their em box; nudge up to share the same visual centre.
    <svg viewBox="0 0 1080.25 1080.25" width={size} height={size}
      style={{ display: 'block', flexShrink: 0, fill: 'var(--ui-fg)', position: 'relative', top: -2 }}>
      {muted ? (
        <>
          <rect x="472.48" y="877.56" width="135.03" height="67.52" />
          <rect x="472.48" y="135.06" width="135.03" height="67.52" />
          <rect x="404.97" y="202.76" width="67.52" height="67.59" />
          <rect x="337.45" y="269.99" width="67.52" height="67.59" />
          <rect x="269.94" y="337.58" width="67.52" height="67.59" />
          <rect x="404.97" y="809.61" width="67.52" height="67.59" />
          <rect x="337.45" y="742.37" width="67.52" height="67.59" />
          <rect x="269.94" y="674.78" width="67.52" height="67.59" />
          <rect x="134.9" y="405.09" width="135.03" height="67.51" />
          <rect x="67.39" y="405.09" width="67.51" height="269.7" />
          <rect x="540" y="202.76" width="67.51" height="674.8" />
          <rect x="134.9" y="607.61" width="135.03" height="67.51" />
          <rect x="675.1" y="337.68" width="67.24" height="67.24" />
          <rect x="742.57" y="405.15" width="67.24" height="67.24" />
          <rect x="810.03" y="472.61" width="67.24" height="67.24" />
          <rect x="877.49" y="540.07" width="67.24" height="67.24" />
          <rect x="944.96" y="607.54" width="67.24" height="67.24" />
          <rect x="944.96" y="337.68" width="67.24" height="67.24" transform="translate(1957.15 742.6) rotate(180)" />
          <rect x="877.49" y="405.15" width="67.24" height="67.24" transform="translate(1822.23 877.53) rotate(180)" />
          <rect x="810.03" y="472.61" width="67.24" height="67.24" transform="translate(1687.3 1012.46) rotate(180)" />
          <rect x="742.57" y="540.07" width="67.24" height="67.24" transform="translate(1552.37 1147.38) rotate(180)" />
          <rect x="675.1" y="607.54" width="67.24" height="67.24" transform="translate(1417.45 1282.31) rotate(180)" />
        </>
      ) : (
        <>
          <rect x="506.44" y="877.56" width="135.03" height="67.52" />
          <rect x="506.44" y="135.06" width="135.03" height="67.52" />
          <rect x="438.93" y="202.76" width="67.52" height="67.59" />
          <rect x="371.41" y="269.99" width="67.52" height="67.59" />
          <rect x="303.9" y="337.58" width="67.52" height="67.59" />
          <rect x="438.93" y="809.61" width="67.52" height="67.59" />
          <rect x="371.41" y="742.37" width="67.52" height="67.59" />
          <rect x="303.9" y="674.78" width="67.52" height="67.59" />
          <rect x="168.86" y="405.09" width="135.03" height="67.51" />
          <rect x="101.35" y="405.09" width="67.51" height="269.7" />
          <rect x="573.96" y="202.76" width="67.51" height="674.8" />
          <rect x="168.86" y="607.61" width="135.03" height="67.51" />
          <rect x="709.06" y="337.68" width="67.24" height="67.24" />
          <rect x="844.15" y="270.17" width="67.24" height="67.24" />
          <rect x="844.15" y="674.96" width="67.24" height="67.24" />
          <rect x="911.66" y="337.75" width="67.24" height="337.37" />
          <rect x="709.06" y="202.93" width="134.7" height="67.24" />
          <rect x="709.06" y="742.54" width="134.7" height="67.24" />
          <rect x="776.53" y="405.15" width="67.24" height="134.79" />
          <rect x="776.53" y="540.07" width="67.24" height="67.24" transform="translate(1620.29 1147.38) rotate(180)" />
          <rect x="709.06" y="607.54" width="67.24" height="67.24" transform="translate(1485.37 1282.31) rotate(180)" />
        </>
      )}
    </svg>
  );
}

// Big [ ] bracket — fills its container height, accent coloured.
function BigBracket({ dir }: { dir: 'L' | 'R' }) {
  const rects = dir === 'L'
    ? [['0','134.85','134.3','810.09'], ['134.3','0','136.5','134.85'], ['134.3','945.03','136.5','134.85']]
    : [['136.5','134.85','134.3','810.09'], ['0','0','136.5','134.85'], ['0','945.03','136.5','134.85']];
  return (
    <svg viewBox="0 0 270.8 1079.88" style={{ height: '100%', width: 'auto', display: 'block', fill: 'var(--ui-fg)' }}>
      {rects.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} />)}
    </svg>
  );
}

// Splash → Home transition: brackets slide in from the edges to frame the exclamation
// mark (same height as the brackets), with a sound. H is the content height (vh).
function IntroTransition({ onDone }: { onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    // Sound fires as the brackets slide in (transition start)
    new Audio('/sounds/transition.mp3').play().catch(() => {});
    const t = setTimeout(() => onDoneRef.current(), 1150);
    return () => clearTimeout(t);
  }, []);
  const ease = [0.16, 1, 0.3, 1] as const;
  const H = '88vh';   // leaves top/bottom margin (≈ preview space padding)
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeInOut' } }}
      style={{ position: 'fixed', inset: 0, zIndex: 99998, pointerEvents: 'none',
               display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5vw' }}
    >
      <motion.div style={{ height: H, display: 'flex', alignItems: 'center' }}
        initial={{ x: '-55vw', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease }}>
        <BigBracket dir="L" />
      </motion.div>

      <motion.svg viewBox="338.31 0 540.13 1080.13"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 700, damping: 12, mass: 0.5, delay: 0.16, opacity: { duration: 0.08, delay: 0.16 } }}
        style={{ height: H, width: 'auto', display: 'block', fill: 'var(--ui-complement)',
                 transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        <polygon points="878.44 67.5 743.41 67.5 743.41 .04 473.34 .04 473.34 67.5 338.31 67.5 338.31 270.03 405.83 270.03 405.83 472.56 473.34 472.56 473.34 675.08 540.86 675.08 540.86 810.1 675.88 810.1 675.88 675.08 743.41 675.08 743.41 472.56 810.92 472.56 810.92 270.03 878.44 270.03 878.44 67.5" />
        <polygon points="670.61 877.64 535.58 877.64 535.58 945.15 468.06 945.15 468.06 1012.66 535.58 1012.66 535.58 1080.13 670.61 1080.13 670.61 1012.66 738.13 1012.66 738.13 945.15 670.61 945.15 670.61 877.64" />
      </motion.svg>

      <motion.div style={{ height: H, display: 'flex', alignItems: 'center' }}
        initial={{ x: '55vw', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease }}>
        <BigBracket dir="R" />
      </motion.div>
    </motion.div>
  );
}

// Single-button language toggle: short labels + cycle order (matches the old
// It / Fr / En / Jp row order).
const LANG_SHORT: Record<Lang, string> = { en: 'En', it: 'It', fr: 'Fr', jp: 'Jp' };
const LANG_CYCLE: Lang[] = ['it', 'fr', 'en', 'jp'];

export default function App() {
  const [screen,        setScreen]        = useState<Screen>('loading');
  const [showIntro,     setShowIntro]     = useState(false);
  const [inputMode,     setInputMode]     = useState<InputMode>('keyboard');
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorHovered, setCursorHovered] = useState(false); // true = cursor is on an interactive element
  const [generalMuted,  setGeneralMuted]  = useState(false);
  const [muteAllHovered, setMuteAllHovered] = useState(false);
  const [logoHovered,   setLogoHovered]   = useState(false);
  const [homeReset,     setHomeReset]     = useState(0); // bump → Home returns to its idle root
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem('isamo-lang') as Lang | null) ?? 'en'
  );
  const setLangTo = (next: Lang) => {
    if (next === lang) return;
    cancelTts();   // stop any ometto playback when switching language
    setLang(next);
    localStorage.setItem('isamo-lang', next);
    playUi('click');
  };
  // Mirror lang into a ref so the global keydown effect (deps []) can cycle from
  // the current value without re-subscribing.
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);
  const cycleLang = () => {
    const i = LANG_CYCLE.indexOf(lang);
    setLangTo(LANG_CYCLE[(i + 1) % LANG_CYCLE.length]);
  };

  // Global loading indicator (driven by the TTS engine while it warms up speech).
  const [ttsLoading, setTtsLoading] = useState(getTtsLoading);
  useEffect(() => subscribeTtsLoading(setTtsLoading), []);

  // Warm the HTTP cache for every board/gallery video + library sound once Home
  // is reached, so they play back instantly. Deferred (and delayed) so these
  // ~56 large fetches don't steal bandwidth from the loading screen's sounds
  // or the splash→home transition sound that plays right before this. Runs once.
  const lowConnection = useLowConnection();
  const warmedRef = useRef(false);
  useEffect(() => {
    if (screen !== 'home' || warmedRef.current) return;
    warmedRef.current = true;
    const t = setTimeout(() => warmMediaCache(lowConnection), 1500);
    return () => clearTimeout(t);
  }, [screen, lowConnection]);

  // Japanese mode: Latin keeps the base Isamo font; Japanese glyphs (absent from
  // the Isamo fonts) fall through to 'Isamo Jap' (rasterized Hiragino Sans GB).
  useEffect(() => {
    const r = document.documentElement.style;
    if (lang === 'jp') {
      // Japanese mode: ALL Latin uses the base Isamo font (not Fat); Japanese → Isamo Jap.
      r.setProperty('--font-main', "'Isamo Rasterize', 'Isamo Jap', sans-serif");
      r.setProperty('--font-fat',  "'Isamo Rasterize', 'Isamo Jap', sans-serif");
    } else {
      r.setProperty('--font-main', "'Isamo Rasterize', sans-serif");
      r.setProperty('--font-fat',  "'Isamo Fat', sans-serif");
    }
  }, [lang]);


  // ── Refs ──────────────────────────────────────────────────────────────────────
  const cursorRef      = useRef<HTMLDivElement>(null);
  // Lazy-init cursor position to viewport centre (no SSR → window is safe)
  const cursorPosRef   = useRef<{ x: number; y: number } | null>(null);
  if (cursorPosRef.current === null) {
    cursorPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  const cursorVisibleRef = useRef(false);       // mirror of cursorVisible for RAF callbacks
  const cursorHoveredRef = useRef(false);       // mirror of cursorHovered for RAF callbacks
  const idleTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHoverElRef   = useRef<Element | null>(null);
  const inputModeRef     = useRef<InputMode>('keyboard');
  const screenRef        = useRef<Screen>('loading');
  // ── Controller scrub drag state ───────────────────────────────────────────
  const aHeldRef         = useRef(false);           // true while A is physically held
  const scrubElRef       = useRef<Element | null>(null); // scrubber element being dragged
  useEffect(() => { inputModeRef.current = inputMode; }, [inputMode]);
  useEffect(() => { screenRef.current    = screen;    }, [screen]);

  // Apply the saved colours at startup so the splash screen already reflects them
  useEffect(() => {
    const c1 = parseInt(localStorage.getItem('isamo-color1-idx') ?? '0', 10) || 0;
    const c2 = parseInt(localStorage.getItem('isamo-color2-idx') ?? '0', 10) || 0;
    applyColorVars(c1, c2);
  }, []);

  // Hide / reset cursor when leaving controller mode
  useEffect(() => {
    if (inputMode === 'controller') return;
    if (!cursorVisibleRef.current) return;
    cursorVisibleRef.current = false;
    setCursorVisible(false);
    cursorHoveredRef.current = false;
    setCursorHovered(false);
    cursorState.active = false;
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    // Fire mouseout on whatever was hovered
    if (prevHoverElRef.current) {
      prevHoverElRef.current.dispatchEvent(
        new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window })
      );
      prevHoverElRef.current = null;
    }
  }, [inputMode]);

  // Hide the OS cursor (and override every inline `cursor: pointer`) while in
  // controller mode. A class on <html> + `cursor: none !important` in index.css
  // is the only way to win over inline styles. Reverting to keyboard mode pulls
  // the class off and the system cursor reappears immediately.
  useEffect(() => {
    const root = document.documentElement;
    if (inputMode === 'controller') root.classList.add('cursor-hidden');
    else                            root.classList.remove('cursor-hidden');
    return () => root.classList.remove('cursor-hidden');
  }, [inputMode]);

  // Any trusted event → back to keyboard mode + preload UI sounds on first gesture.
  // Keydown also handles the global M shortcut for general mute (works on all screens).
  useEffect(() => {
    const toKb = (e: Event) => {
      if (!e.isTrusted) return;
      setInputMode('keyboard');
      preloadUiSounds();
      preloadKeyboardSounds();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      setInputMode('keyboard');
      preloadUiSounds();
      // Skip global shortcuts while any text input is focused (search bar, etc.)
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'm' || e.key === 'M') {
        // setGeneralMuted setter is stable — safe inside a [] effect
        setGeneralMuted(prev => {
          const next = !prev;
          if (next) { playUi('mute'); setUiMuted(true); setKeyboardSoundMuted(true); }
          else      { setUiMuted(false); setKeyboardSoundMuted(false); playUi('unmute'); }
          return next;
        });
      }
      if (e.key === 'l' || e.key === 'L') {
        // Cycle language from the latest value (langRef), setLang is stable
        cancelTts();   // stop any ometto playback when switching language
        const i = LANG_CYCLE.indexOf(langRef.current);
        const next = LANG_CYCLE[(i + 1) % LANG_CYCLE.length];
        setLang(next);
        localStorage.setItem('isamo-lang', next);
        playUi('click');
      }
    };
    window.addEventListener('keydown',     onKey);
    window.addEventListener('mousemove',   toKb);
    window.addEventListener('pointerdown', toKb);
    return () => {
      window.removeEventListener('keydown',     onKey);
      window.removeEventListener('mousemove',   toKb);
      window.removeEventListener('pointerdown', toKb);
    };
  }, []);

  // Global void-click feedback — fires `click.mp3` when the user clicks on
  // background (no interactive element under the pointer). Clicks landing on
  // interactive elements stay silent here; they get `clickCursor.mp3` from
  // their own onClick handlers (XmbCol items, sound list, artist gallery, …).
  // Synthetic clicks (e.g. dispatched by the gamepad cursor confirm) carry
  // `isTrusted=false` and are skipped to avoid double-fire.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      const target = e.target as Element | null;
      if (!target) return;
      const interactive =
        !!target.closest(INTERACTIVE_SEL) ||
        getComputedStyle(target).cursor === 'pointer' ||
        !!target.closest('[data-no-magnet]'); // moodboard videos — have own mute/unmute sounds
      if (!interactive) playUi('click');
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const onControllerInput = useCallback(() => setInputMode('controller'), []);

  // ── General mute (global, persists across screens) ────────────────────────────
  function toggleGeneralMute() {
    setGeneralMuted(prev => {
      const next = !prev;
      if (next) { playUi('mute'); setUiMuted(true); setKeyboardSoundMuted(true); }
      else      { setUiMuted(false); setKeyboardSoundMuted(false); playUi('unmute'); }
      return next;
    });
  }

  // ── Right-stick cursor + hover simulation ────────────────────────────────────
  useGamepadNav({
    onCursorDelta: (dx, dy) => {
      if (inputModeRef.current !== 'controller') return;

      // Move raw cursor position, clamped to viewport
      const pos = cursorPosRef.current!;
      pos.x = Math.max(0, Math.min(window.innerWidth,  pos.x + dx));
      pos.y = Math.max(0, Math.min(window.innerHeight, pos.y + dy));

      // Apply magnetism → display position (raw pos stays unchanged for smooth movement)
      const [dispX, dispY] = applyMagnetism(pos.x, pos.y);

      // Update DOM position directly — no React re-render
      if (cursorRef.current) {
        cursorRef.current.style.transform =
          `translate(${dispX - CURSOR_SIZE / 2}px, ${dispY - CURSOR_SIZE / 2}px)`;
      }

      // Sync shared state with display position so clicks land correctly
      cursorState.x = dispX;
      cursorState.y = dispY;
      cursorState.active = true;

      // Switch to hover cursor when over an interactive element (only on transitions)
      const elUnder    = document.elementFromPoint(dispX, dispY);
      const nowHovered = !!(elUnder && getComputedStyle(elUnder).cursor === 'pointer');
      if (nowHovered !== cursorHoveredRef.current) {
        cursorHoveredRef.current = nowHovered;
        setCursorHovered(nowHovered);
      }

      // Trigger React re-render only on the hidden→visible transition
      if (!cursorVisibleRef.current) {
        cursorVisibleRef.current = true;
        setCursorVisible(true);
      }

      // Restart idle timer
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        cursorVisibleRef.current = false;
        setCursorVisible(false);
        cursorHoveredRef.current = false;
        setCursorHovered(false);
        cursorState.active = false;
        idleTimerRef.current = null;
        if (prevHoverElRef.current) {
          prevHoverElRef.current.dispatchEvent(
            new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window,
              clientX: dispX, clientY: dispY })
          );
          prevHoverElRef.current = null;
        }
      }, CURSOR_IDLE_MS);

      // ── Hover event simulation (use display position) ─────────────────────────
      const el   = document.elementFromPoint(dispX, dispY);
      const prev = prevHoverElRef.current;

      if (el !== prev) {
        // Leave old element
        if (prev) {
          prev.dispatchEvent(new MouseEvent('mouseout', {
            bubbles: true, cancelable: true, view: window,
            clientX: dispX, clientY: dispY, relatedTarget: el,
          }));
        }
        // Enter new element
        if (el) {
          el.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true, cancelable: true, view: window,
            clientX: dispX, clientY: dispY, relatedTarget: prev,
          }));
        }
        prevHoverElRef.current = el;
      }

      // Always fire mousemove on current element
      if (el) {
        el.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, cancelable: true, view: window,
          clientX: dispX, clientY: dispY,
        }));
      }

      // If A is held and we have a captured scrubber, dispatch pointermove on it
      if (aHeldRef.current && scrubElRef.current) {
        scrubElRef.current.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
          clientX: dispX, clientY: dispY, buttons: 1,
        }));
      }
    },

    // A / RT with cursor active → click at cursor position (only in Home, not Splash)
    onConfirm: () => {
      if (!cursorState.active) return;          // cursor idle → child screens handle confirm
      if (screenRef.current !== 'home') return; // splash manages its own A/RT (mute toggle)
      if (aHeldRef.current) return;             // being handled as a scrubber drag
      const { x, y } = cursorState;
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      el.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y,
        detail: 1, // passes e.detail >= 1 checks (real-click guards)
      }));
      const isInteractive =
        !!el.closest(INTERACTIVE_SEL) ||
        getComputedStyle(el).cursor === 'pointer';
      // Interactive elements play their own sound via onClick — don't add a second one.
      // Only play void-click for background areas with nothing interactive under the cursor.
      if (!isInteractive) playUi('click');
    },
    // A pressed → start scrubber drag if cursor is over a [data-scrubber] bar
    onADown: () => {
      if (!cursorState.active || screenRef.current !== 'home') return;
      const { x, y } = cursorState;
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      const scrubber = el.closest('[data-scrubber]') as Element | null;
      if (!scrubber) return;
      aHeldRef.current  = true;
      scrubElRef.current = scrubber;
      scrubber.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
        clientX: x, clientY: y, button: 0, buttons: 1,
      }));
    },
    // A released → end scrubber drag
    onAUp: () => {
      if (!aHeldRef.current) return;
      const el  = scrubElRef.current;
      const { x, y } = cursorState;
      aHeldRef.current   = false;
      scrubElRef.current = null;
      if (el) {
        el.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
          clientX: x, clientY: y, button: 0, buttons: 0,
        }));
      }
    },
    // X button → global mute toggle (all screens)
    onX: () => toggleGeneralMute(),
  });

  // Cursor initial position for React style (updated by direct DOM between renders)
  const { x: cx, y: cy } = cursorPosRef.current!;

  return (
    <>
      <AnimatePresence mode="sync">
        {screen === 'loading' && (
          <LoadingScreen
            key="loading"
            onComplete={() => setScreen('splash')}
          />
        )}
        {screen === 'splash' && (
          <SplashScreen
            key="splash"
            onStart={() => setShowIntro(true)}
            inputMode={inputMode}
            onControllerInput={onControllerInput}
            generalMuted={generalMuted}
            onToggleGeneralMute={toggleGeneralMute}
            dimmed={showIntro}
            logoHovered={logoHovered}
            lang={lang}
          />
        )}
        {screen === 'home' && (
          <Home
            key="home"
            onBack={() => { cancelTts(); setScreen('splash'); }}
            inputMode={inputMode}
            onControllerInput={onControllerInput}
            generalMuted={generalMuted}
            logoHovered={logoHovered}
            homeReset={homeReset}
            lang={lang}
            onLangChange={setLangTo}
          />
        )}
      </AnimatePresence>

      {/* ── Persistent ISAMO logo — the SAME element on splash and home. It never
             re-mounts and never animates (no fade-in, no fade-out, no slide); it is
             simply always present, anchoring the splash → home transition. ──────── */}
      {screen !== 'loading' && (
        <motion.div
          aria-label="ISAMO"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 620, damping: 14, mass: 0.6, delay: 0.12 }}
          whileHover={{ opacity: 0.6 }}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          onClick={() => {
            setLogoHovered(false); // dismiss the acronym overlay on click
            if (screenRef.current === 'home') setHomeReset(n => n + 1);
          }}
          style={{ transformOrigin: 'left center',
            // The logo is now just the wordmark text "(ISAMO !)" set in the UI font.
            position:  'fixed',
            left:      LOGO_LEFT,
            top:       `calc(50% + ${LOGO_TOP / 2 - 36}px)`,
            y:         '-50%',
            color:     'var(--ui-complement, #000)',
            fontFamily: 'var(--font-main)',
            fontSize:   19,            // matches FS_SMALL — the XMB columns' body text size
            lineHeight: 1,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            cursor:    screen === 'home' ? 'pointer' : 'default',
            zIndex:    9500,
          } as React.CSSProperties}
        >
          (ISAMO !)
        </motion.div>
      )}

      {/* ── ISAMO acronym reveal on logo hover — above every element (App level) ── */}
      {screen !== 'loading' && <WordReveal active={logoHovered} lang={lang} />}

      {/* ── Global loading-dots overlay (e.g. ometto warming up speech) ── */}
      <LoadingDots active={ttsLoading} />

      {/* ── Splash → Home bracket transition (over everything) ─────────────────── */}
      <AnimatePresence>
        {showIntro && <IntroTransition key="intro" onDone={() => { setScreen('home'); setShowIntro(false); }} />}
      </AnimatePresence>


      {/* ── Gamepad cursor ─────────────────────────────────────────────────────── */}
      <div
        ref={cursorRef}
        style={{
          position:      'fixed',
          left:          0,
          top:           0,
          width:         CURSOR_SIZE,
          height:        CURSOR_SIZE,
          pointerEvents: 'none',
          zIndex:        99999,
          opacity:       cursorVisible && inputMode === 'controller' ? 1 : 0,
          transition:    'opacity 0.3s ease',
          transform:     `translate(${cx - CURSOR_SIZE / 2}px, ${cy - CURSOR_SIZE / 2}px)`,
        }}
      >
        {/* Masked so the cursor renders in the exact accent-complement colour */}
        <div
          style={{
            height: '100%', width: '100%',
            background: 'var(--ui-complement, #000)',
            WebkitMaskImage: `url("${cursorHovered ? '/icons/cursor-hover.svg' : '/icons/cursor.svg'}")`,
            maskImage: `url("${cursorHovered ? '/icons/cursor-hover.svg' : '/icons/cursor.svg'}")`,
            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center', maskPosition: 'center',
            WebkitMaskSize: 'contain', maskSize: 'contain',
            maskMode: 'alpha', WebkitMaskMode: 'alpha',
          } as React.CSSProperties}
        />
      </div>

      {/* ── Bottom-left controls: global mute + language toggle ─────────────── */}
      <AnimatePresence>
        {screen !== 'loading' && (
          <motion.div
            key="bottom-controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            style={{
              position:   'fixed',
              left:        24,
              bottom:      16,
              display:    'flex',
              alignItems: 'center',
              gap:         12,
              zIndex:      9000,
            }}
          >
            {/* Mute button */}
            <button
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              data-magnet="strong"
              onClick={toggleGeneralMute}
              onMouseEnter={() => { setMuteAllHovered(true); playUi('hover'); }}
              onMouseLeave={() => setMuteAllHovered(false)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                opacity: muteAllHovered ? 0.7 : 1, transition: 'opacity 0.15s ease',
              }}
            >
              <Icon
                name={inputMode === 'controller' ? 'controller-X' : 'key-m'}
                size={19}
                color="var(--ui-complement)"
              />
              <MuteGeneralIcon muted={generalMuted} size={17} />
            </button>

            {/* Language toggle — single button: L key + current language; click cycles */}
            <button
              data-magnet="strong"
              onClick={cycleLang}
              onMouseEnter={() => playUi('hover')}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, marginLeft: 9,
              }}
            >
              {inputMode !== 'controller' && (
                <Icon name="key-l" size={19} color="var(--ui-complement)" />
              )}
              <span style={{
                fontFamily: "var(--font-fat)", fontSize: 11, lineHeight: 1,
                letterSpacing: '0.08em', color: 'var(--ui-fg)', userSelect: 'none',
              }}>
                {LANG_SHORT[lang]}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
