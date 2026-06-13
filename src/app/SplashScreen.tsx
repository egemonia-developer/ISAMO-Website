import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGamepadNav } from './hooks/useGamepadNav';
import { playUi } from './audio/uiSounds';
import { preloadKeyboardSounds } from './audio/keyboardSounds';
import { useTypewriter } from './hooks/useTypewriter';
import { INITIAL_BOARD_VIDEOS } from './Home';
import { VideoTile } from './VideoTile';
import type { InputMode } from './App';
import { type Lang, getStrings } from './i18n/strings';
import { Icon } from './icons';

// ── Data — shared with the Board (single source of truth in Home.tsx) ──────────
// The splash gallery shows a random handful of board clips (~10), reshuffled each
// time the splash mounts.
const SPLASH_COUNT = 10;
function pickRandom<T>(arr: readonly T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

// ── Layout constants — mirrored from Home.tsx ─────────────────────────────────
const LOGO_LEFT   = 24;
const LOGO_W      = 88;   // same as Home's logo width
const LOGO_TOP    = 28;
const ICON_PX     = 15;
const COLUMN_GAP  = 160;
const NAV_LEFT    = LOGO_LEFT + LOGO_W + 20;          // 132 — 1st XMB column, right of the logo
const X_LEFT      = NAV_LEFT + COLUMN_GAP;            // 292 — 2nd column
const COL3_LEFT   = X_LEFT + COLUMN_GAP + 30;        // 482 — 3rd column (matches Home's Z_LEFT)
const PANEL_LEFT  = 652;
const ANCHOR_TOP  = `calc(50% + ${LOGO_TOP / 2 - ICON_PX / 2 - 36}px)`;
// Press-start line — shifted up so its lowest glyph aligns with the ISAMO logo's bottom edge.
const START_LINE_TOP = `calc(50% + ${LOGO_TOP / 2 - ICON_PX / 2 - 36 - 10}px)`;
// Small navigation hint — sits just below the press-start line.
const NAV_LINE_TOP = `calc(50% - 2px)`;

// ── Gallery (mono-column board: data left, video right; auto-scrolling) ─────────
const META_W         = 220;   // metadata column width
const ITEM_GAP       = 64;    // vertical gap between rows
const SCROLL_SECONDS = 90;    // time for one full loop (one set of items)

// ── Fonts ──────────────────────────────────────────────────────────────────────
const FONT     = "var(--font-main)";
const FONT_FAT = "var(--font-fat)";

// ── Selection visuals (mirror the XMB columns) ───────────────────────────────
const TITLE_FS  = 19;
const NAV_SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 } as const;

function SplashTitle({ label, selected, dim }: { label: string; selected: boolean; dim: boolean }) {
  const col = selected ? 'var(--ui-complement)' : 'var(--ui-fg)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: META_W - 10 }}>
      <motion.span animate={{ opacity: selected ? 1 : 0 }} transition={{ duration: 0.15 }}
        style={{ fontSize: TITLE_FS, lineHeight: 1, color: col, flexShrink: 0 }}>(</motion.span>
      <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
        <motion.span
          animate={{ left: selected ? '50%' : '0%', x: selected ? '-50%' : '0%', opacity: dim ? 0.45 : 1 }}
          transition={NAV_SPRING}
          style={{ position: 'absolute', top: '50%', y: '-50%',
                   fontSize: TITLE_FS, fontFamily: FONT, color: col,
                   whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}
        >
          {label}
        </motion.span>
      </span>
      <motion.span animate={{ opacity: selected ? 1 : 0 }} transition={{ duration: 0.15 }}
        style={{ fontSize: TITLE_FS, lineHeight: 1, color: col, flexShrink: 0 }}>)</motion.span>
    </div>
  );
}

// ── Tag label — plain uppercase small body text (replaces the old pill shape) ─
function TagLabel({ label }: { label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      onMouseEnter={() => { setHovered(true); playUi('hover'); }}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: TITLE_FS, fontFamily: FONT, lineHeight: 1, letterSpacing: '0.04em',
        // Default: complement color. Hover: simply revert to the base UI color.
        color: hovered ? 'var(--ui-fg)' : 'var(--ui-complement)',
        whiteSpace: 'nowrap', userSelect: 'none', transition: 'color 0.12s ease',
        flexShrink: 0,
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}

// ── Typewriter "Press … to start" (defined outside so they never remount) ──────
const PRESS_START_DELAY = 520; // ms
const PRESS_START_SPEED = 30;  // ms per character

function KeyboardPressText({ lang }: { lang: Lang }) {
  const S = getStrings(lang);
  const [showSuffix, setShowSuffix] = useState(false);
  const prefixText = useTypewriter(S.pressPrefix, PRESS_START_SPEED, PRESS_START_DELAY, () => setTimeout(() => setShowSuffix(true), 60));
  const suffixText = useTypewriter(showSuffix ? S.pressSuffix : '', PRESS_START_SPEED);
  return (
    <>
      {prefixText}
      {showSuffix && (
        <>
          <Icon name="key-spacebar" size="1em" color="var(--ui-complement)" style={{ verticalAlign: 'middle', margin: '0 4px' }} />
          {S.pressOr}
          <Icon name="key-enter" size="1em" color="var(--ui-complement)" style={{ verticalAlign: 'middle', margin: '0 4px' }} />
        </>
      )}
      {suffixText}
    </>
  );
}

function ControllerPressText({ lang }: { lang: Lang }) {
  const S = getStrings(lang);
  const [showSuffix, setShowSuffix] = useState(false);
  const prefixText = useTypewriter(S.pressPrefix, PRESS_START_SPEED, PRESS_START_DELAY, () => setTimeout(() => setShowSuffix(true), 60));
  const suffixText = useTypewriter(showSuffix ? S.pressSuffix : '', PRESS_START_SPEED);
  return (
    <>
      {prefixText}
      {showSuffix && (
        <Icon name="start" size="1em" color="var(--ui-complement)" style={{ verticalAlign: 'middle', margin: '0 4px' }} />
      )}
      {suffixText}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  onStart?:              () => void;
  inputMode?:            InputMode;
  onControllerInput?:    () => void;
  generalMuted?:         boolean;
  onToggleGeneralMute?:  () => void;
  dimmed?:               boolean;
  logoHovered?:          boolean;
  lang?:                 Lang;
}

export function SplashScreen({ onStart, inputMode = 'keyboard', onControllerInput, dimmed = false, lang = 'en' }: Props) {
  const S = getStrings(lang);
  // Random subset of board clips for this splash mount.
  const [projects] = useState(() => pickRandom(INITIAL_BOARD_VIDEOS, SPLASH_COUNT));
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});

  useEffect(() => { preloadKeyboardSounds(); }, []);

  // Keyboard: Space / Enter start the experience. The directional arrows do NOT
  // navigate to Home — they drive the video gallery instead.
  useEffect(() => {
    onKeyRef.current = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart?.(); return; }
      if (e.key === 'ArrowDown')  { e.preventDefault(); selectByIndex((galleryIdxRef.current ?? -1) + 1, 1); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); selectByIndex((galleryIdxRef.current ?? 0) - 1, -1); return; }
      // Left / Right → focus the gallery (select the first clip if not yet in it)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (galleryIdxRef.current === null) selectByIndex(0, 1);
        return;
      }
    };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Gamepad: A / Start → start.
  useGamepadNav({
    onAnyInput: onControllerInput,
    onConfirm:  () => onStart?.(),
    onStart:    () => onStart?.(),
  }, true);

  // ── Gallery hover: pause the auto-scroll & play the hovered row's video. ──
  const containerRef  = useRef<HTMLDivElement>(null);
  const alignLayerRef = useRef<HTMLDivElement>(null);
  const playingRef     = useRef<HTMLVideoElement | null>(null);
  const currentRowRef  = useRef<Element | null>(null);
  // Auto-scroll (rAF-driven so wheel input can co-exist & override it).
  const scrollRef      = useRef<HTMLDivElement>(null);
  const offsetRef      = useRef(0);          // current scroll offset (px)
  const listHeightRef  = useRef(0);          // height of one (un-duplicated) list
  const pausedRef      = useRef(false);      // auto-scroll paused (hover / wheel)
  const wheelIdleRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRafRef  = useRef<number | null>(null);  // rAF-gates handlePointer's elementFromPoint hit-test
  // Keyboard navigation of the gallery (null = not focused on the gallery yet).
  const galleryIdxRef = useRef<number | null>(null);
  // Selected row index in the duplicated list → drives bracket + title zoom.
  const [selIdx, setSelIdx] = useState<number | null>(null);
  // Clips are muted by default; this holds the project ids the user un-muted.
  const [unmuted, setUnmuted] = useState<Set<string>>(new Set());

  const selectRow = (rowEl: Element) => {
    // Play this row's video — colourise it, grey out the previous one.
    const v = rowEl.querySelector('video') as HTMLVideoElement | null;
    if (v && playingRef.current !== v) {
      if (playingRef.current) { playingRef.current.pause(); playingRef.current.style.filter = 'grayscale(1)'; }
      v.style.filter = 'none';
      const pid = (rowEl as HTMLElement).dataset.pid;
      v.muted = !(pid && unmuted.has(pid));   // honour the per-clip mute toggle
      v.play().catch(() => {});
      playingRef.current = v;
    }
  };

  // Select a gallery row by index (keyboard nav). `wrapped` (0..n-1) tracks the
  // logical position for repeated up/down presses; `selRowIdx` is the actual
  // duplicated-list element (wrapped or wrapped+n) that ends up centred on
  // screen once the scroll offset is adjusted — selection/video must follow it,
  // not the (possibly off-screen) `wrapped` copy.
  const selectByIndex = (idx: number, dir: 1 | -1) => {
    const rows = alignLayerRef.current?.querySelectorAll('[data-row]');
    const n = projects.length;
    if (!rows || !rows.length || n === 0) return;
    const wrapped = ((idx % n) + n) % n;
    galleryIdxRef.current = wrapped;
    pausedRef.current = true;

    // Scroll so the selected row is centred in the gallery, so keyboard
    // navigation always brings the current item into view.
    let selRowIdx = wrapped;
    const container = containerRef.current;
    const h = listHeightRef.current;
    if (container && h > 0) {
      const containerRect = container.getBoundingClientRect();
      const rowRect = (rows[wrapped] as HTMLElement).getBoundingClientRect();
      const delta = (rowRect.top + rowRect.height / 2) - (containerRect.top + containerRect.height / 2);
      let newOffset = offsetRef.current + delta;
      if (newOffset < 0) { newOffset += h; selRowIdx = wrapped + n; }
      offsetRef.current = newOffset;
    }

    const row = rows[selRowIdx];
    if (!row) return;
    setSelIdx(selRowIdx);
    currentRowRef.current = row;
    selectRow(row);
    playUi(dir === 1 ? 'verticalDown' : 'verticalUp');
  };

  // rAF-gated: `elementFromPoint` is a hit-test against the (continuously,
  // rAF-transformed) scroll layer, so running it on every raw mousemove stacks
  // a second hit-test onto the same frame as the auto-scroll tick. Coalescing
  // to one hit-test per frame keeps fast mouse movement from doubling that cost.
  const handlePointer = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    if (pointerRafRef.current !== null) return;
    pointerRafRef.current = requestAnimationFrame(() => {
      pointerRafRef.current = null;
      const el = document.elementFromPoint(clientX, clientY);
      // Selection is driven by the metadata text only — hovering a video does nothing.
      const meta = el ? el.closest('[data-meta]') : null;
      if (meta) {
        const row = meta.closest('[data-row]');
        if (row) {
          pausedRef.current = true;
          if (row !== currentRowRef.current) {
            currentRowRef.current = row;
            // Keep keyboard nav + selection visuals in sync with the hovered row
            const rows = alignLayerRef.current?.querySelectorAll('[data-row]');
            if (rows) { const pos = Array.prototype.indexOf.call(rows, row); if (pos >= 0) { galleryIdxRef.current = pos % projects.length; setSelIdx(pos); } }
            selectRow(row);
          }
        }
      }
      // Pointer is on a video / empty space → keep the current selection
      // (released only by leaving the gallery or hovering another title).
    });
  };

  // Clear the current selection (playing video + visuals).
  const deselect = () => {
    currentRowRef.current = null;
    galleryIdxRef.current = null;
    setSelIdx(null);
    if (playingRef.current) { playingRef.current.pause(); playingRef.current.style.filter = 'grayscale(1)'; }
    playingRef.current = null;
  };

  const handleLeave = () => {
    pausedRef.current = false;
    deselect();
  };

  // Mouse wheel → manual scroll. Pauses the auto-scroll, drops the current
  // selection, and resumes auto-scroll after a short idle (unless still hovered).
  const handleWheel = (e: React.WheelEvent) => {
    offsetRef.current += e.deltaY;
    pausedRef.current = true;
    if (currentRowRef.current) deselect();
    if (wheelIdleRef.current) clearTimeout(wheelIdleRef.current);
    wheelIdleRef.current = setTimeout(() => {
      if (!currentRowRef.current) pausedRef.current = false;
    }, 1200);
  };

  // rAF auto-scroll loop — advances the offset unless paused; wraps seamlessly.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const h = listHeightRef.current;
      if (h > 0) {
        if (!pausedRef.current) offsetRef.current += (h / SCROLL_SECONDS) * dt;
        offsetRef.current = ((offsetRef.current % h) + h) % h;
        if (scrollRef.current) scrollRef.current.style.transform = `translateY(${-offsetRef.current}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (pointerRafRef.current !== null) cancelAnimationFrame(pointerRafRef.current);
    };
  }, []);

  // Measure one (un-duplicated) list height for the wrap point.
  useLayoutEffect(() => {
    const measure = () => { const el = scrollRef.current; if (el) listHeightRef.current = el.scrollHeight / 2; };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <motion.div
      key="splash-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      style={{
        width: '100vw', height: '100vh',
        background: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT,
      }}
    >
      {/* The ISAMO logo is rendered at the App level. Everything below fades out
          when the intro transition starts, leaving only that constant logo. */}
      <motion.div
        animate={{ opacity: dimmed ? 0 : 1 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 0, pointerEvents: dimmed ? 'none' : 'auto' }}
      >

      {/* ── Press … to start — next to the logo, on the first XMB column ── */}
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.3, delay: 0.22 }}
        style={{
          position: 'absolute', left: X_LEFT, top: ANCHOR_TOP, height: ICON_PX,
          display: 'flex', alignItems: 'center', margin: 0,
          fontSize: 46, color: 'var(--ui-fg)', letterSpacing: '0.04em', whiteSpace: 'nowrap',
        }}
      >
        <AnimatePresence mode="wait">
          {inputMode === 'controller' ? (
            <motion.span key="ctrl" exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <ControllerPressText lang={lang} />
            </motion.span>
          ) : (
            <motion.span key="kb" exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }} style={{ display: 'inline-block' }}>
              <KeyboardPressText lang={lang} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.p>

      {/* ── Small navigation hint — second line, below the first ── */}
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.3, delay: 0.7 }}
        style={{
          position: 'absolute', left: X_LEFT, top: NAV_LINE_TOP, maxWidth: 600,
          margin: 0, fontSize: 19, lineHeight: 1.3, color: 'var(--ui-fg)', letterSpacing: '0.04em',
        }}
      >
        {S.navHint1}<br />{S.navHintUse}{' '}
        {(inputMode === 'controller'
          ? (['croce-right', 'croce-down', 'croce-left', 'croce-up'] as const)
          : (['key-right', 'key-down', 'key-left', 'key-up'] as const)
        ).map(n => (
          <Icon key={n} name={n} size="1em" color="var(--ui-complement)" style={{ verticalAlign: 'middle', margin: '0 2px' }} />
        ))}
        {' '}{S.navHintExplore}
      </motion.p>

      {/* ── Video gallery — mono-column Board (data left, video right), auto-scroll ── */}
      <motion.div
        ref={containerRef}
        initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        onMouseEnter={handlePointer} onMouseMove={handlePointer} onMouseLeave={handleLeave}
        onWheel={handleWheel}
        style={{ position: 'absolute', left: PANEL_LEFT, right: 48, top: 6, bottom: 6, overflow: 'hidden' }}
      >
        {/* Row container — used to query rows for keyboard nav + hover selection */}
        <div ref={alignLayerRef}>
          {/* Continuous scroll layer — rAF-driven (auto-scroll + mouse wheel) */}
          <div ref={scrollRef} style={{ willChange: 'transform' }}>
            {/* List duplicated → translateY(-50%) loops seamlessly */}
            {[...projects, ...projects].map((p, i) => {
              const isSelected = selIdx === i;
              const isMuted = !unmuted.has(p.id);
              return (
              <div key={i} data-row data-pid={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 28, marginBottom: ITEM_GAP }}>
                {/* Metadata — left */}
                <div data-meta style={{ width: META_W, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  {/* Title row — bracket + complement colour + zoom on selection */}
                  <SplashTitle label={p.label} selected={isSelected} dim={selIdx !== null && !isSelected} />
                  <span style={{ fontFamily: FONT, fontSize: 12, color: 'var(--ui-fg)', opacity: 0.6, letterSpacing: '0.10em' }}>
                    {p.year}{p.country ? ` · ${p.country}` : ''}
                  </span>
                  {p.tags && p.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                      {p.tags.map(tag => <TagLabel key={tag} label={tag} />)}
                    </div>
                  )}
                </div>
                {/* Video — right (plays only while its row is hovered/selected) */}
                <div style={{ flexShrink: 0, position: 'relative' }}>
                  <VideoTile
                    src={p.src}
                    style={{ height: '40vh', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block', filter: 'grayscale(1)', transition: 'filter 0.3s ease' }}
                  />
                  {/* Mute / unmute overlay — like the Board: blended (difference), shown on selection, click toggles audio.
                      `mixBlendMode` is only set while selected — with 20 of these rows mounted,
                      leaving 'difference' on the rest keeps them all in the compositor's blend
                      isolation group for no visual benefit. */}
                  <motion.div
                    animate={{ opacity: isSelected ? 0.75 : 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    onClick={e => {
                      e.stopPropagation();
                      const vid = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement | null;
                      setUnmuted(prev => {
                        const next = new Set(prev);
                        const willUnmute = !next.has(p.id);
                        if (willUnmute) next.add(p.id); else next.delete(p.id);
                        if (vid) vid.muted = !willUnmute;
                        playUi(willUnmute ? 'unmute' : 'mute');
                        return next;
                      });
                    }}
                    style={{
                      position: 'absolute', inset: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      mixBlendMode: isSelected ? 'difference' : 'normal', cursor: 'pointer',
                      pointerEvents: isSelected ? 'auto' : 'none',
                    }}
                  >
                    <Icon key={isMuted ? 'muted' : 'unmuted'}
                      name={isMuted ? 'mute' : 'unmute'} size="9.5vh" color="#fff" />
                  </motion.div>
                </div>
              </div>
            );})}
          </div>
        </div>
      </motion.div>
      </motion.div>{/* end fade-out wrapper */}
    </motion.div>
  );
}
