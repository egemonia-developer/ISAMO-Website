import { useState, useEffect, useLayoutEffect, useRef, useMemo, type ReactNode, type WheelEvent as ReactWheelEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { type Lang, LANGS, getStrings, tLabel } from './i18n/strings';

// Native display name for each UI language (shown in the Settings → Language picker)
const LANG_DISPLAY: Record<Lang, string> = { en: 'English', it: 'Italiano', fr: 'Français', jp: '日本語' };
import { useGamepadNav } from './hooks/useGamepadNav';
import { cursorState } from './hooks/cursorState';
import { playUi, setUiMuted, setUiVolume } from './audio/uiSounds';
import { playKeyboardSound, preloadKeyboardSounds } from './audio/keyboardSounds';
import { speak, prefetch, cancelTts, getTtsLevel, isTtsPlaying, setTtsEnabled, setTtsParams, DEFAULT_TTS_PARAMS, TTS_LANGS, INTONATIONS, type TtsParams } from './audio/tts';
import { useTypewriter } from './hooks/useTypewriter';
import type { InputMode } from './App';
import { motion, AnimatePresence, useIsPresent } from 'motion/react';
import { Icon, type IconName } from './icons';

// ── Data ──────────────────────────────────────────────────────────────────────
type WItem    = { id: string; label: string; title: string; duration: string };
type ZItem    = { label: string; src?: string; wItems?: WItem[]; tags?: string[]; preview?: string; previewFit?: 'contain' | 'cover' };
type XItem    = { label: string; iconName?: IconName; zItems?: ZItem[]; src?: string; wItems?: WItem[]; preview?: string; previewFit?: 'contain' | 'cover' };
type Category = { id: string; label: string; icon: IconName; xItems: XItem[]; preview?: string; previewFit?: 'contain' | 'cover' };

// ── Settings W-items ──────────────────────────────────────────────────────────
// label = short code shown in the pill; title = readable name shown alongside
const mkSetting = (id: string, label: string, title: string): WItem =>
  ({ id, label, title, duration: '' });

// ── Accent colour presets ────────────────────────────────────────────────────
// CSS filters (icon-filter) recolour black <img> SVGs to the accent; cursorFilter
// recolours to the complement. complement = paired colour used for the cursor,
// sound/video progress fill, etc. Filters solved to hit each exact hex.
const F_PURPLE = 'brightness(0) saturate(100%) invert(39%) sepia(97%) saturate(3008%) hue-rotate(224deg) brightness(100%) contrast(100%)';
const F_GREEN  = 'brightness(0) saturate(100%) invert(58%) sepia(19%) saturate(5950%) hue-rotate(36deg) brightness(104%) contrast(98%)';
const F_PINK   = 'brightness(0) saturate(100%) invert(55%) sepia(67%) saturate(2103%) hue-rotate(264deg) brightness(100%) contrast(90%)';
const F_ORANGE = 'brightness(0) saturate(100%) invert(49%) sepia(81%) saturate(4357%) hue-rotate(359deg) brightness(99%) contrast(108%)';
const F_RED    = 'brightness(0) saturate(100%) invert(9%) sepia(87%) saturate(7483%) hue-rotate(2deg) brightness(103%) contrast(106%)';

const C_PURPLE = '#5e67fe', C_GREEN = '#99ae02', C_PINK = '#ef65f2', C_ORANGE = '#ff5800', C_RED = '#e50101';

// Accent ↔ complement combos:
//   PINK ↔ GREEN · RED ↔ GREEN · ORANGE ↔ PURPLE · GREEN ↔ PINK · PURPLE ↔ ORANGE
export const ACCENT_PRESETS = [
  { name: 'DEFAULT',    fg: '#000',     previewBg: '#ededed', iconFilter: 'brightness(0)', cursorFilter: '',       complement: '#000000' },
  { name: 'PINK',       fg: C_PINK,     previewBg: '#fde4fe', iconFilter: F_PINK,   cursorFilter: F_GREEN,  complement: C_GREEN  },
  { name: 'RED',        fg: C_RED,      previewBg: '#fde2e2', iconFilter: F_RED,    cursorFilter: F_GREEN,  complement: C_GREEN  },
  { name: 'ORANGE',     fg: C_ORANGE,   previewBg: '#ffe9dd', iconFilter: F_ORANGE, cursorFilter: F_PURPLE, complement: C_PURPLE },
  { name: 'GREEN',      fg: C_GREEN,    previewBg: '#f4f6e0', iconFilter: F_GREEN,  cursorFilter: F_PINK,   complement: C_PINK   },
  { name: 'PURPLE',     fg: C_PURPLE,   previewBg: '#e7e8ff', iconFilter: F_PURPLE, cursorFilter: F_ORANGE, complement: C_ORANGE },
  { name: '#swag',      fg: C_PINK,     previewBg: '#fde4fe', iconFilter: F_PINK,   cursorFilter: F_GREEN,  complement: C_GREEN  },
] as const;

type AccentPreset = typeof ACCENT_PRESETS[number];

// Apply one preset's CSS variables (colours, filters, complement, mouse cursor).
function applyAccentPreset(p: AccentPreset) {
  const r = document.documentElement.style;
  r.setProperty('--ui-fg',         p.fg);
  r.setProperty('--ui-preview-bg', p.previewBg);
  r.setProperty('--icon-filter',   p.iconFilter);
  r.setProperty('--cursor-filter', p.cursorFilter);
  const comp = p.complement ?? p.fg;
  r.setProperty('--ui-complement', comp);
  // Recolour the OS mouse cursor (a static black SVG can't be filtered).
  setCursorColor(comp);
}

// Recolours the OS crosshair cursor. Uses a Blob object-URL (a cached resource,
// like a file) instead of a data-URI: Chrome re-decodes data-URI cursors on
// repaint and flickers them back to the default, whereas blob-URL cursors are
// stable. Applied to <html> + <body> (cursor inherits to all children).
let cursorBlobUrl: string | null = null;
function setCursorColor(color: string) {
  const apply = (val: string) => {
    document.documentElement.style.cursor = val;
    document.body.style.cursor = val;
  };
  try {
    const S = 20;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d ctx');
    ctx.fillStyle = color;
    ctx.fillRect(9, 0, 2, S); // vertical bar
    ctx.fillRect(0, 9, S, 2); // horizontal bar
    c.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      apply(`url("${url}") 10 10, crosshair`);
      if (cursorBlobUrl) URL.revokeObjectURL(cursorBlobUrl); // free the previous one
      cursorBlobUrl = url;
    }, 'image/png');
  } catch {
    const cross = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect x='9' y='0' width='2' height='20' fill='${color}'/><rect x='0' y='9' width='20' height='2' fill='${color}'/></svg>`;
    apply(`url("data:image/svg+xml,${encodeURIComponent(cross)}") 10 10, crosshair`);
  }
}

// The coloured presets #swag draws from.
export const MULTICOLOR_CYCLE = ACCENT_PRESETS.filter(p => p.name !== 'DEFAULT' && p.name !== '#swag');

// #swag — deterministic per-element colour from a seed (a fixed random arrangement).
function swagIndex(key: number, seed: number): number {
  let h = (((key + 1) * 2654435761) ^ seed) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) % MULTICOLOR_CYCLE.length;
}
export function swagColorFor(key: number, seed: number): string { return MULTICOLOR_CYCLE[swagIndex(key, seed)].fg; }
export function swagFilterFor(key: number, seed: number): string { return MULTICOLOR_CYCLE[swagIndex(key, seed)].iconFilter; }

// Global vars (logo, progress, cursor) for #swag — seeded so they're stable.
export function applySwagVars(seed: number) {
  const r = document.documentElement.style;
  const fg = swagColorFor(0, seed);
  const comp = swagColorFor(1, seed);
  r.setProperty('--ui-fg',         fg);
  r.setProperty('--ui-preview-bg', '#ededed');
  r.setProperty('--icon-filter',   swagFilterFor(0, seed));
  r.setProperty('--cursor-filter', swagFilterFor(1, seed));
  r.setProperty('--ui-complement', comp);
  setCursorColor(comp);
}

// Module-level so App can call it at startup (before Home mounts).
export function applyAccentVars(idx: number) {
  applyAccentPreset(ACCENT_PRESETS[idx] ?? ACCENT_PRESETS[0]);
}
export { applyAccentPreset };

// ── Independent colour selection ─────────────────────────────────────────────
// Two settings sections pick from this palette: Color 1 = primary (--ui-fg),
// Color 2 = complement (--ui-complement / cursor / progress fill).
export const COLOR_OPTIONS = [
  { name: 'BLACK',  hex: '#000000', filter: 'brightness(0)', previewBg: '#ededed' },
  { name: 'PINK',   hex: C_PINK,    filter: F_PINK,   previewBg: '#fde4fe' },
  { name: 'RED',    hex: C_RED,     filter: F_RED,    previewBg: '#fde2e2' },
  { name: 'ORANGE', hex: C_ORANGE,  filter: F_ORANGE, previewBg: '#ffe9dd' },
  { name: 'GREEN',  hex: C_GREEN,   filter: F_GREEN,  previewBg: '#f4f6e0' },
  { name: 'PURPLE', hex: C_PURPLE,  filter: F_PURPLE, previewBg: '#e7e8ff' },
] as const;

// Apply both chosen colours to the CSS custom properties.
export function applyColorVars(c1idx: number, c2idx: number) {
  const r = document.documentElement.style;
  const c1 = COLOR_OPTIONS[c1idx] ?? COLOR_OPTIONS[0];
  const c2 = COLOR_OPTIONS[c2idx] ?? COLOR_OPTIONS[0];
  r.setProperty('--ui-fg',         c1.hex);
  r.setProperty('--icon-filter',   c1.filter);
  r.setProperty('--ui-preview-bg', c1.previewBg);
  r.setProperty('--ui-complement', c2.hex);
  r.setProperty('--cursor-filter', c2.filter);
  setCursorColor(c2.hex);
}

const SETTINGS_AUDIO_ITEMS: WItem[] = [
  mkSetting('ui-sounds', 'S.AU', 'UI Sounds'),
  mkSetting('tts',       'S.TS', 'TTS'),
];
const SETTINGS_DISPLAY_ITEMS: WItem[] = [
  mkSetting('color-1', 'S.C1', 'Color 1'),
  mkSetting('color-2', 'S.C2', 'Color 2'),
];
// The languages live directly at the W level (no extra single-item column).
const SETTINGS_LANGUAGE_ITEMS: WItem[] = LANGS.map(l => mkSetting(`lang-${l}`, 'S.LG', LANG_DISPLAY[l]));
const SETTINGS_ACCOUNT_ITEMS: WItem[] = [];

// Generates a numbered sound list with a category prefix (e.g. "A.SM" → A.SM01…A.SM09).
// The prefix categorizes by source: artist initials for artist packs, instrument
// type for Library (MV=Movement, RT=Rotation, CM=Camera, FX=Effects).
function makeSounds(prefix: string, count = 9, titleFn?: (n: number) => string): WItem[] {
  return Array.from({ length: count }, (_, i) => {
    const label = `${prefix}${String(i + 1).padStart(2, '0')}`;
    return {
      id:    label,
      label,
      title: titleFn ? titleFn(i + 1) : (i === 0 ? 'Lovely sound for lonely people' : 'Generic sound example'),
      duration: '00:00:00',
    };
  });
}

// Per-artist sound packs — alphabetical order
const EGEMONIA_SOUNDS = makeSounds('A.EG', 9, n => `Egemonia-${n}`);
const KAY_YOKO_SOUNDS = makeSounds('A.KY', 9, n => `Kay Yoko-${n}`);
const MACLOW_SOUNDS   = makeSounds('A.MC', 9, n => `Maclow-${n}`);
const RUSOWSKY_SOUNDS = makeSounds('A.RS', 9, n => `Rusowsky-${n}`);
const SAMPHA_SOUNDS   = makeSounds('A.SM', 9, n => `Sampha-${n}`);

// ── Board / splash gallery clips — title / designer / country left blank to fill ──
export const INITIAL_BOARD_VIDEOS = [
  { id: '1',  src: '/refs/13-1.mp4',                       label: '', author: '', country: '', year: 2025, tags: ['B.A01']  },
  { id: '2',  src: '/refs/alessandro-vogel-01-sound.mp4',  label: '', author: '', country: '', year: 2025, tags: ['B.A02'] },
  { id: '3',  src: '/refs/alessandro-vogel-01.mp4',        label: '', author: '', country: '', year: 2025, tags: ['B.A03'] },
  { id: '4',  src: '/refs/alessandro-vogel-02.mp4',        label: '', author: '', country: '', year: 2025, tags: ['B.A04'] },
  { id: '5',  src: '/refs/alessandro-vogel-03.mp4',        label: '', author: '', country: '', year: 2025, tags: ['B.A05'] },
  { id: '6',  src: '/refs/alessandro-vogel-04.mp4',        label: '', author: '', country: '', year: 2025, tags: ['B.A06'] },
  { id: '7',  src: '/refs/diplomes-1.mp4',                 label: '', author: '', country: '', year: 2025, tags: ['B.A07'] },
  { id: '8',  src: '/refs/diplomes-111.mp4',               label: '', author: '', country: '', year: 2025, tags: ['B.V01'] },
  { id: '9',  src: '/refs/diplomes-1_1.mp4',               label: '', author: '', country: '', year: 2025, tags: ['B.V02'] },
  { id: '10', src: '/refs/diplomes-1_2.mp4',               label: '', author: '', country: '', year: 2025, tags: ['B.V03'] },
  { id: '11', src: '/refs/diplomes-1_3.mp4',               label: '', author: '', country: '', year: 2025, tags: ['C.CT01'] },
  { id: '12', src: '/refs/diplomes-1_4.mp4',               label: '', author: '', country: '', year: 2025, tags: ['C.CT02'] },
  { id: '13', src: '/refs/diplomes-1_5.mp4',               label: '', author: '', country: '', year: 2025, tags: ['C.CT03'] },
  { id: '14', src: '/refs/diplomes-1_6.mp4',               label: '', author: '', country: '', year: 2025, tags: ['C.ZM01'] },
  { id: '15', src: '/refs/diplomes-1_7.mp4',               label: '', author: '', country: '', year: 2025, tags: ['C.ZM02'] },
  { id: '16', src: '/refs/diplomes-1_8.mp4',               label: '', author: '', country: '', year: 2025, tags: ['E.GL01'] },
  { id: '17', src: '/refs/ecal-1.mp4',                     label: '', author: '', country: '', year: 2025, tags: ['E.GL02'] },
  { id: '18', src: '/refs/ecal-2.mp4',                     label: '', author: '', country: '', year: 2025, tags: ['E.GL03'] },
  { id: '19', src: '/refs/raffinerie.mp4',                 label: '', author: '', country: '', year: 2025, tags: ['E.GL04'] },
  { id: '20', src: '/refs/video-1.mp4',                    label: '', author: '', country: '', year: 2025, tags: ['E.GL05'] },
  { id: '21', src: '/refs/video-2.mp4',                    label: '', author: '', country: '', year: 2025, tags: ['E.ST01'] },
  { id: '22', src: '/refs/video-3.mp4',                    label: '', author: '', country: '', year: 2025, tags: ['E.ST02'] },
  { id: '23', src: '/refs/wf22_2-1.mp4',                   label: '', author: '', country: '', year: 2025, tags: ['M.R01']  },
  { id: '24', src: '/refs/zhdk.mp4',                       label: '', author: '', country: '', year: 2025, tags: ['M.R02']  },
];

// Board search match — shared by render filter + keyboard navigation
function boardItemMatches(v: typeof INITIAL_BOARD_VIDEOS[number], idx: number, q: string): boolean {
  if (!q) return true;
  const num = String(idx + 1).padStart(2, '0');
  return num.includes(q) ||
    String(idx + 1).includes(q) ||
    v.label.toLowerCase().includes(q) ||
    v.author?.toLowerCase().includes(q) ||
    v.country?.toLowerCase().includes(q) ||
    String(v.year).includes(q) ||
    v.tags?.some(t => t.toLowerCase().includes(q));
}

// Library axes — one shared pack per category (Movement, Rotation, Camera, Effects)
function makeAxisItems(prefix: string, category: string): ZItem[] {
  return [
    { label: 'X-Axis', wItems: makeSounds(prefix, 9, n => `${category}-X-${n}`) },
    { label: 'Y-Axis', wItems: makeSounds(prefix, 9, n => `${category}-Y-${n}`) },
    { label: 'Z-Axis', wItems: makeSounds(prefix, 9, n => `${category}-Z-${n}`) },
  ];
}

// ── Transport icons (pixel-art style, inline SVG) ────────────────────────────
function PlayIcon({ size = 12 }: { size?: number }) {
  // Staircase right-pointing triangle (pixel-art play ▷)
  const u = size / 12;
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} fill="currentColor" style={{ display: 'block' }}>
      <rect x="0" y="1"  width={u*2} height={u*10}/>
      <rect x={u*2} y="2"  width={u*2} height={u*8}/>
      <rect x={u*4} y="3"  width={u*2} height={u*6}/>
      <rect x={u*6} y="4"  width={u*2} height={u*4}/>
      <rect x={u*8} y="5"  width={u*2} height={u*2}/>
    </svg>
  );
}
function PauseIcon({ size = 12 }: { size?: number }) {
  const u = size / 12;
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} fill="currentColor" style={{ display: 'block' }}>
      <rect x={u*1} y={u*1} width={u*4} height={u*10}/>
      <rect x={u*7} y={u*1} width={u*4} height={u*10}/>
    </svg>
  );
}

function DownloadButton({ inputMode, onClick }: { inputMode?: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  // Hover → theme complement; otherwise accent
  const col = hovered ? 'var(--ui-complement)' : 'var(--ui-fg)';
  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
               color: col, fontSize: FS_SMALL, letterSpacing: '0.04em', userSelect: 'none' }}
    >
      <Icon
        name={inputMode === 'controller' ? 'start' : 'key-s'}
        size={FS_SMALL}
        color="var(--ui-complement)"
        style={{ opacity: hovered ? 1 : 0.5, position: 'relative', top: -1 }}
      />
      DOWNLOAD
      <Icon
        name="download"
        size={FS_SMALL}
        color="var(--ui-complement)"
        // Same glyph bounding box as key-s in the font (806x776 vs 807x776) — the
        // mismatch came from `alignSelf: 'baseline'` overriding the row's centred
        // alignment for this icon only. Use the same center + nudge as key-s instead.
        style={{ opacity: hovered ? 1 : 0.5, position: 'relative', top: -1 }}
      />
    </span>
  );
}

const CATEGORIES: Category[] = [
  {
    id: 'library', label: 'Library', icon: 'library',
    preview: '/previews/library.mp4', previewFit: 'cover',
    xItems: [
      { label: 'Movement',    iconName: 'movement',    preview: '/previews/movement-final.mp4', previewFit: 'cover', zItems: [
        { label: 'Rotation', wItems: makeSounds('M.R',  5, n => `Rotation-${n}`),   preview: '/previews/rotation-general.mp4', previewFit: 'cover' },
        { label: 'Space',    wItems: makeSounds('M.SP', 5, n => `Space-${n}`), preview: '/previews/space.mp4', previewFit: 'cover' },
      ]},
      { label: 'Camera',      iconName: 'camera',      preview: '/previews/camera.mp4', previewFit: 'cover', zItems: [
        { label: 'Zoom',  wItems: makeSounds('C.ZM', 2, n => `Zoom-${n}`), preview: '/previews/zoom-mod.mp4', previewFit: 'cover' },
        { label: 'Depth', wItems: [], preview: '/previews/focus-mod.mp4', previewFit: 'cover' },
        { label: 'Cuts',  wItems: makeSounds('C.CT', 3, n => `Cuts-${n}`), preview: '/previews/cuts-mod.mp4', previewFit: 'cover' },
      ]},
      { label: 'Effects',     iconName: 'effects',     preview: '/previews/effects-general.mp4', previewFit: 'cover', zItems: [
        { label: 'Glitch', wItems: makeSounds('E.GL', 5, n => `Glitch-${n}`), preview: '/previews/glitch.mp4', previewFit: 'cover' },
        { label: 'Strobe', wItems: makeSounds('E.ST', 2, n => `Strobe-${n}`), preview: '/previews/strobe.mp4', previewFit: 'cover' },
      ]},
      { label: 'Backing',     iconName: 'backing', preview: '/previews/backing-mod.mp4', previewFit: 'cover', zItems: [
        { label: 'Ambient', wItems: makeSounds('B.A', 7, n => `Ambient-${n}`), preview: '/previews/ambient-mod.mp4', previewFit: 'cover' },
        { label: 'Voices',  wItems: makeSounds('B.V', 3, n => `Voices-${n}`), preview: '/previews/voices-mod.mp4', previewFit: 'cover' },
      ]},
    ],
  },
  {
    id: 'community', label: 'Community', icon: 'online',
    preview: '/previews/online.mp4', previewFit: 'cover',
    xItems: [
      { label: '...',    wItems: [] },
      { label: 'Board',  iconName: 'board' },
      { label: 'Upload', iconName: 'upload' },
    ],
  },
  {
    id: 'artists', label: 'Artists', icon: 'artists',
    preview: '/previews/artists.mp4', previewFit: 'cover',
    xItems: [
      { label: '...', wItems: [] },
      { label: 'Egemonia', src: '/artists/egemonia.jpg',   wItems: EGEMONIA_SOUNDS },
      { label: 'Kay Yoko', src: '/artists/kay-yoko.jpg',   wItems: KAY_YOKO_SOUNDS },
      { label: 'Maclow',   src: '/artists/maclow.jpg',     wItems: MACLOW_SOUNDS   },
      { label: 'Rusowsky', src: '/artists/rusowsky.jpg',   wItems: RUSOWSKY_SOUNDS },
      { label: 'Sampha',   src: '/artists/sampha.jpg',     wItems: SAMPHA_SOUNDS   },
    ],
  },
  {
    id: 'settings', label: 'Settings', icon: 'settings',
    preview: '/previews/settings-shake.mp4', previewFit: 'cover',
    xItems: [
      { label: 'Audio',    wItems: SETTINGS_AUDIO_ITEMS,    preview: '/previews/settings-audio.mp4', previewFit: 'cover' },
      { label: 'Display',  wItems: SETTINGS_DISPLAY_ITEMS,  preview: '/previews/settings-display.mp4', previewFit: 'cover' },
      { label: 'Language', wItems: SETTINGS_LANGUAGE_ITEMS, preview: '/previews/settings-shake.mp4', previewFit: 'cover' },
      { label: 'Account',  wItems: SETTINGS_ACCOUNT_ITEMS },
    ],
  },
];

// ── Sound-path lookup ─────────────────────────────────────────────────────────
// Resolves a pill tag (e.g. 'B.A.01') → { y, x, z, w } navigation indices.
// Tries the tag as-is, then strips a leading dot before trailing digits
// ('B.A.01' → 'B.A01') to reconcile display-format tags with sound labels.
function findSoundPath(tag: string): { y: number; x: number; z: number | null; w: number } | null {
  const normalized = tag.replace(/\.(\d+)$/, '$1');
  // Compare case-insensitively so pills like 'M.AX01' match sound IDs like 'm.ax01'
  const candidates = Array.from(new Set([tag, normalized])).map(s => s.toLowerCase());

  for (let y = 0; y < CATEGORIES.length; y++) {
    const xItems = CATEGORIES[y].xItems;
    for (let x = 0; x < xItems.length; x++) {
      const xi = xItems[x];
      // Artist / flat wItems (no Z level)
      if (xi.wItems) {
        for (const c of candidates) {
          const w = xi.wItems.findIndex(s => s.id.toLowerCase() === c || s.label.toLowerCase() === c);
          if (w !== -1) return { y, x, z: null, w };
        }
      }
      // Library zItems
      if (xi.zItems) {
        for (let z = 0; z < xi.zItems.length; z++) {
          const wItems = xi.zItems[z].wItems ?? [];
          for (const c of candidates) {
            const w = wItems.findIndex(s => s.id.toLowerCase() === c || s.label.toLowerCase() === c);
            if (w !== -1) return { y, x, z, w };
          }
        }
      }
    }
  }
  return null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FONT       = "var(--font-main)";
const FONT_FAT   = "var(--font-fat)";
const LOGO_W     = 88;
const LOGO_TOP   = 28;
const LOGO_LEFT  = 24;
const NAV_LEFT   = LOGO_LEFT + LOGO_W + 20;  // 132
const COLUMN_GAP = 160;
const X_LEFT     = NAV_LEFT + COLUMN_GAP;    // 292
const Z_LEFT     = X_LEFT   + COLUMN_GAP;        // 452
const PANEL_LEFT = Z_LEFT   + COLUMN_GAP;        // 612 — sound panel (Library path)
// Preview space is ALWAYS square — side fits the available area (same system used
// by the Home preview space, the sound-player upload space, and the third-column
// boundary in the sound player's W list).
const PREVIEW_SQUARE_SIZE = `min(calc(100vw - 6px - ${PANEL_LEFT}px), calc(100vh - 12px))`;
// Settings columns — evenly spaced by COLUMN_GAP
const SETTINGS_W_LEFT      = X_LEFT          + COLUMN_GAP;     // 452 — W items (3rd col)
const SETTINGS_V_LEFT      = SETTINGS_W_LEFT + COLUMN_GAP;     // 612 — values (4th col, default)
const SETTINGS_V_LEFT_TTS  = SETTINGS_V_LEFT + COLUMN_GAP;     // 772 — speech values (5th col)
const SETTINGS_AVATAR_LEFT = SETTINGS_V_LEFT_TTS + COLUMN_GAP; // 932 — TTS avatar (6th col)
const ICON_PX        = 20;
const ANCHOR_Y       = 0;
const ACCENT         = '#ff8956';
// Vertical position of the navigation anchor — all columns' first item and the
// logo share this same y. Derived from the 4-item X column reference: we want its
// first item (which was at ANCHOR_OLD − 36 when centred) to stay put, so:
// ANCHOR_TOP = (50% + LOGO_TOP/2 − ICON_PX/2) − 36  ≈ calc(50% − 29.5px)
const ANCHOR_TOP = `calc(50% + ${LOGO_TOP / 2 - ICON_PX / 2 - 36}px)`;
// Sound list top in library-panel mode — below the logo row
const PLAYER_SOUND_TOP = `calc(${ANCHOR_TOP} + 110px)`;

// ── Transport bar layout (relative to sound-list container top = selected item) ─
// Effects panel: 2×3 grid of XMB-style bracket-focus cells, two FS_SMALL text lines each.
const TRANSPORT_FX_ROW_H = 19 + 6 + 19;                             // value line + gap + label line (FS_SMALL each)
const TRANSPORT_FX_GAP   = 8;                                       // gap between the two grid rows
const TRANSPORT_FX_H     = TRANSPORT_FX_ROW_H * 2 + TRANSPORT_FX_GAP;
const TRANSPORT_TOP    = ICON_PX + 10;                              // 25 px — progress bar start
const TRANSPORT_PROG_H = 32;                                        // progress bar height (enlarged)
const TRANSPORT_CTL_Y  = TRANSPORT_TOP + TRANSPORT_PROG_H + 8;     // controls row y
const TRANSPORT_CTL_H  = 24;                                        // controls row height (enlarged)
// Extra vertical space inserted below the selected item so d>0 items clear the bar
const TRANSPORT_EXTRA  = TRANSPORT_CTL_Y + TRANSPORT_CTL_H + 12;   // ≈ 93 px
// Start-point scrubber inside the right upload panel
const VIDEO_SCRUB_H    = 14;

// ── Artist gallery ────────────────────────────────────────────────────────────
const ARTIST_IMG_W_PREVIEW   = 360; // selected image — preview mode (no sounds open)
const ARTIST_IMG_W_PANEL     = 140; // selected image — panel mode (sounds open)
const ARTIST_IMG_W_SMALL     =  80; // non-selected items (above / below selected)
const ARTIST_LABEL_TO_IMG    =  14; // gap: label row → image
const ARTIST_ITEM_BOTTOM_GAP =  18; // gap: image bottom → next item's label
const ARTIST_IMG_TWEEN = { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as const };

// ── Artist XMB slot positions ─────────────────────────────────────────────────
// Selected (d=0): label row is centred on the ANCHOR_TOP axis (item top = -ICON_PX/2).
// Image starts below the label, so it sits beneath ANCHOR_TOP.
// d>0: stack downward; d<0: stack upward using small-item height.
function artistItemY(d: number, selW: number): number {
  const itemTop    = -ICON_PX / 2 + 10;                                          // label centre = ANCHOR_TOP + slight downward nudge
  const selItemH   = ICON_PX + ARTIST_LABEL_TO_IMG + selW;                       // full height of selected item
  const smallItemH = ICON_PX + ARTIST_LABEL_TO_IMG + ARTIST_IMG_W_SMALL;         // full height of small item
  if (d === 0) return itemTop;
  if (d  >  0) return itemTop + selItemH + ARTIST_ITEM_BOTTOM_GAP + (d - 1) * (smallItemH + ARTIST_ITEM_BOTTOM_GAP);
  return             itemTop - Math.abs(d) * (smallItemH + ARTIST_ITEM_BOTTOM_GAP);
}

// ── Audio helpers ─────────────────────────────────────────────────────────────
/** Resolve audio src from a WItem id → /sounds/{id}.mp3 */
function soundSrc(id: string) { return `/sounds/${id}.mp3`; }

/** Encodes an AudioBuffer as a 16-bit PCM WAV Blob (for the "download with FX" feature). */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh   = buffer.numberOfChannels;
  const sr      = buffer.sampleRate;
  const dataLen = buffer.length * numCh * 2;
  const out     = new ArrayBuffer(44 + dataLen);
  const view    = new DataView(out);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true); // byte rate
  view.setUint16(32, numCh * 2, true);      // block align
  view.setUint16(34, 16, true);             // bits per sample
  writeStr(36, 'data'); view.setUint32(40, dataLen, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

/** Format seconds → "HH:MM:SS" */
function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '00:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ── FX constants ──────────────────────────────────────────────────────────────
const DELAY_DIVS       = ['1/8', '1/4', '1/2', '1'] as const;
const DELAY_DIV_LABELS = ['LITTLE', 'MEDIUM', 'A LOT', 'MAX'] as const; // qualitative display for DELAY_DIVS (translated via tLabel)
const DELAY_TIMES      = [0.25, 0.5, 1.0, 2.0]; // seconds (at ~120 bpm)
const MAGIC_MAX_V      = 7;                      // Flanger: rate levels (1..7)
const FLANGER_RATE_MIN = 0.05;                   // Hz, sweep speed at rate level 1
const FLANGER_RATE_MAX = 0.6;                    // Hz, sweep speed at rate level MAGIC_MAX_V

// ── Arpeggiatore — rhythmic gain-gate (square LFO) ────────────────────────────
const ARP_RATE_MIN = 2;   // Hz, gate rate at amount = 0 (effect inaudible: depth = 0)
const ARP_RATE_MAX = 12;  // Hz, gate rate at amount = 100

// ── Effects panel — 2×3 grid, row-major: [EQ, REVERB, PAN] / [DELAY, FLANGER, ARP] ─
const FX_VALUE_W = 100; // fixed bracket slot per value cell — sized to fit the longest delay-division word across all languages ("MEDIUM")
const FX_DRAG_STEP_PX = 7; // vertical mouse travel per value step when click-dragging a value
const FX_PARAM_COUNT = [3, 1, 1, 2, 2, 2] as const; // sub-values per group
// Canonical (English) group labels, in the same row-major order as FX_PARAM_COUNT —
// used both for the on-screen labels (via tLabel) and for the hover explanations.
const FX_GROUP_LABELS = ['Equalizer', 'Reverb', 'Left/Right', 'Delay', 'Flanger', 'Arpeggiator'] as const;
// Flat row-major sequence of every (group, param) pair — navigation mode is
// directly active once inside the FX panel: ←/→ step through this sequence
// (wrapping), ↑/↓ adjust the focused parameter's value. No separate "edit" step.
const FX_PARAM_SEQ: readonly (readonly [number, number])[] =
  FX_PARAM_COUNT.flatMap((n, g) => Array.from({ length: n }, (_, p) => [g, p] as const));
const fxSeqIdx = (g: number, p: number) => FX_PARAM_SEQ.findIndex(([gg, pp]) => gg === g && pp === p);
const fxNext = (g: number, p: number) => FX_PARAM_SEQ[(fxSeqIdx(g, p) + 1) % FX_PARAM_SEQ.length];
const fxPrev = (g: number, p: number) => FX_PARAM_SEQ[(fxSeqIdx(g, p) - 1 + FX_PARAM_SEQ.length) % FX_PARAM_SEQ.length];

/** Generates a synthetic reverb impulse response (exponential noise decay). */
function makeSyntheticIR(ctx: BaseAudioContext, duration = 2.2, decay = 2.0): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.ceil(sr * duration);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const logoSpring = { type: 'spring' as const, stiffness: 220, damping: 26, mass: 1 };
const NAV_SPRING = { type: 'spring' as const, stiffness: 480, damping: 40, mass: 0.7 };

// XMB idle entrance — categories pop in one-by-one once the home mounts (i.e. after
// the splash → home transition). Snappy spring with a little overshoot = "pop".
const XMB_POP        = { type: 'spring' as const, stiffness: 620, damping: 14, mass: 0.6 };
const XMB_ENTER_BASE = 0.28; // s — let the intro transition clear + Home spring settle
const XMB_ENTER_STEP = 0.08; // s — stagger between categories

// ── Magnetic wheel scroll ─────────────────────────────────────────────────────
const WHEEL_THRESHOLD  = 220; // px accumulated before a snap fires
const MIN_NAV_INTERVAL = 80;  // ms cooldown after each snap — blocks momentum, allows rapid re-scroll
const BOARD_HEADER_H   = 40;  // height of the sticky header inside the Board panel
const BOARD_META_W     = 200; // width of the per-video metadata column (left of each video)
// Below this viewport width the Board is locked to single-column (no 2/4 layouts).
const BOARD_SINGLE_COL_MAX_W = 900;
const ORDER_BY_CATS    = ['Author', 'Date', 'Sound Name'] as const;
type OrderByCat        = typeof ORDER_BY_CATS[number];

// ── Two font sizes — scale-based zoom (fontSize steps cause choppy frames) ─────
// Both bumped ~×1.15 together so the small text is more legible while the zoom
// ratio (SCALE_LARGE) stays the same.
const FS_LARGE = 46;
const FS_SMALL = 19;
// Top offset so the first line of the top-left info text (ometto explanation /
// Sound Player hint) lines up with the Board search-bar's text line (header:
// top 6, height BOARD_HEADER_H, single centred FS_SMALL line) — kept consistent
// across every screen, whether or not the Board is actually visible.
const TOP_INFO_TOP = 6 + (BOARD_HEADER_H - FS_SMALL * 1.3) / 2; // ≈ 13.65
// Top clearance for a board item so its zoomed label (visually FS_LARGE tall, centred in
// an ICON_PX div) doesn't overflow the scroll-container boundary and get clipped.
const BOARD_ITEM_INSET = Math.ceil(FS_LARGE / 2) + 16; // 34px
// All text renders at FS_SMALL; selected item is scaled up.
// transformOrigin:'left center' so it grows rightward from the label start.
const SCALE_LARGE = FS_LARGE / FS_SMALL; // ≈ 2.77
const SCALE_SMALL = 1;
// Max full-scale width (px) for an enlarged column label. Longer (translated)
// labels are scaled down to fit instead of spilling into the next column.
const LABEL_FIT_BUDGET = 112;
// Fixed pixel width between ( and ) for all nav columns. Icon + label scale to fit.
// Fixed width of the full ( icon label ) group — right bracket always at this offset from column left.
const NAV_BRACKET_W = COLUMN_GAP - 10; // 150px

// ── Artist A–Z timeline column ────────────────────────────────────────────────
// Sits just right of the artist images and gets its own reserved width so the
// ometto + bio (which follow it) never overlap the letters.
const ARTIST_TIMELINE_LEFT = Z_LEFT + NAV_BRACKET_W + 14; // ≈616
const ARTIST_TIMELINE_W    = 36;                          // reserved letter column

// ── Pixel bracket ─────────────────────────────────────────────────────────────
const U  = 2;
const BH = 8 * U;
// Scrubber in/out handles — proper square brackets. The spine spans the full height
// and the arms connect to it (the old version left the corners empty, so the bracket
// rendered as a disconnected zigzag). Handles stand taller than the bar (BH) so the
// start/end points read as grabbable markers rather than part of the fill.
const BRK_H   = BH + 10;   // handle height — overhangs the bar top & bottom
const BRK_ARM = 3 * U;     // horizontal arm length

function BracketLeft({ color = 'var(--ui-fg)', height = BRK_H, arm = BRK_ARM }: { color?: string; height?: number; arm?: number }) {
  const w = U + arm;
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}
      style={{ display: 'block', flexShrink: 0, shapeRendering: 'crispEdges' }}
    >
      <rect x={0} y={0}          width={U} height={height} style={{ fill: color }} />
      <rect x={0} y={0}          width={w} height={U}      style={{ fill: color }} />
      <rect x={0} y={height - U} width={w} height={U}      style={{ fill: color }} />
    </svg>
  );
}

function BracketRight({ color = 'var(--ui-fg)', height = BRK_H, arm = BRK_ARM }: { color?: string; height?: number; arm?: number }) {
  const w = U + arm;
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}
      style={{ display: 'block', flexShrink: 0, shapeRendering: 'crispEdges' }}
    >
      <rect x={w - U} y={0}          width={U} height={height} style={{ fill: color }} />
      <rect x={0}     y={0}          width={w} height={U}      style={{ fill: color }} />
      <rect x={0}     y={height - U} width={w} height={U}      style={{ fill: color }} />
    </svg>
  );
}


// ── Artist card corner brackets (viewfinder L-shapes) ─────────────────────────
function CardCorners({ inset = 14, armLen = 20, th = 2, color = 'var(--ui-fg)' }: {
  inset?: number; armLen?: number; th?: number; color?: string;
}) {
  return (
    <>
      <div style={{ position:'absolute', background:color, top:inset,    left:inset,  width:armLen, height:th     }} />
      <div style={{ position:'absolute', background:color, top:inset,    left:inset,  width:th,     height:armLen }} />
      <div style={{ position:'absolute', background:color, top:inset,    right:inset, width:armLen, height:th     }} />
      <div style={{ position:'absolute', background:color, top:inset,    right:inset, width:th,     height:armLen }} />
      <div style={{ position:'absolute', background:color, bottom:inset, left:inset,  width:armLen, height:th     }} />
      <div style={{ position:'absolute', background:color, bottom:inset, left:inset,  width:th,     height:armLen }} />
      <div style={{ position:'absolute', background:color, bottom:inset, right:inset, width:armLen, height:th     }} />
      <div style={{ position:'absolute', background:color, bottom:inset, right:inset, width:th,     height:armLen }} />
    </>
  );
}

// ── Sound pill — pill.svg shape with Isamo Fat label ─────────────────────────
// ── Tag label — plain uppercase small body text (replaces the old pill shape) ─
function TagLabel({ label, onClick }: {
  label: string;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      onMouseEnter={() => { setHovered(true); playUi('hover'); }}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      style={{
        fontSize: FS_SMALL,
        fontFamily: FONT,
        lineHeight: 1,
        letterSpacing: '0.04em',
        // Default: complement color. Hover: simply revert to the base UI color.
        color: hovered ? 'var(--ui-fg)' : 'var(--ui-complement)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'color 0.12s ease',
        flexShrink: 0,
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}

// ── Moodboard video item — plays only when active; muted prop toggleable ─────
function MoodboardVideoItem({ src, isActive, isMuted, fullView = false }: { src: string; isActive: boolean; isMuted: boolean; fullView?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isActive) v.play().catch(() => {});
    else v.pause();
  }, [isActive]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = isMuted;
  }, [isMuted]);

  return (
    <video
      ref={ref}
      src={src}
      muted loop playsInline
      style={{ width: '100%', display: 'block',
               aspectRatio: fullView ? '16 / 9' : '1 / 1',
               objectFit: fullView ? 'contain' : 'cover' }}
    />
  );
}


// ── Canvas-based text measurement for the Board title shrink-to-fit system ────
let __measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, fontPx: number, family: string): number {
  if (!__measureCtx) {
    const c = document.createElement('canvas');
    __measureCtx = c.getContext('2d');
  }
  if (!__measureCtx) return text.length * fontPx * 0.6;
  __measureCtx.font = `${fontPx}px ${family}`;
  return __measureCtx.measureText(text).width;
}

// Re-renders once the custom font finishes loading, so the first measurement
// (taken before the font is ready and falling back to a system font) gets
// corrected to use the real glyph metrics.
function useFontsReadyTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready.then(() => { if (!cancelled) setTick(t => t + 1); });
    return () => { cancelled = true; };
  }, []);
  return tick;
}

function BoardTitle({ label, active, cols, hovered = false }: { label: string; active: boolean; cols: 1 | 2 | 4; hovered?: boolean }) {
  const w = cols === 4 ? 120 : 190;
  const fontsReadyTick = useFontsReadyTick();

  // Reimpicciolimento: shrink the label's font size so it fits harmoniously
  // within the bracket span, instead of overflowing/clipping.
  const fittedFs = useMemo(() => {
    if (typeof document === 'undefined') return FS_SMALL;
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-main').trim() || 'sans-serif';
    const bracketW = measureTextWidth('(', FS_SMALL, family);
    const available = w - bracketW * 2;
    const tracking = FS_SMALL * 0.04 * label.length;
    const natural = measureTextWidth(label, FS_SMALL, family) + tracking;
    if (natural <= available || natural <= 0) return FS_SMALL;
    return Math.max(FS_SMALL * (available / natural), FS_SMALL * 0.5);
  }, [label, w, fontsReadyTick]);

  // Hover gets its own dedicated treatment — separate from the selected/active
  // state — and turns the title the theme's complement color.
  const col = hovered ? 'var(--ui-complement)' : 'var(--ui-fg)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: w }}>
      <motion.span animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.15 }}
        style={{ fontSize: FS_SMALL, lineHeight: 1, color: col, flexShrink: 0 }}>(</motion.span>
      <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch', overflow: 'hidden' }}>
        <motion.span
          animate={{ left: active ? '50%' : '0%', x: active ? '-50%' : '0%', opacity: active ? 1 : 0.28 }}
          transition={NAV_SPRING}
          style={{ position: 'absolute', top: '50%', y: '-50%',
                   fontSize: fittedFs, fontFamily: FONT, color: col,
                   whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}
        >
          {label}
        </motion.span>
      </span>
      <motion.span animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.15 }}
        style={{ fontSize: FS_SMALL, lineHeight: 1, color: col, flexShrink: 0 }}>)</motion.span>
    </div>
  );
}

// ── Slot table — uniform 24px step, no extra gap around selected item ─────────
const SLOTS: Record<number, { dy: number; fs: number; op: number }> = {
  [-4]: { dy: -96, fs: FS_SMALL, op: 0.10 },
  [-3]: { dy: -72, fs: FS_SMALL, op: 0.15 },
  [-2]: { dy: -48, fs: FS_SMALL, op: 0.28 },
  [-1]: { dy: -24, fs: FS_SMALL, op: 0.50 },
  [ 0]: { dy:   0, fs: FS_LARGE, op: 1.00 },
  [ 1]: { dy:  24, fs: FS_SMALL, op: 0.50 },
  [ 2]: { dy:  48, fs: FS_SMALL, op: 0.28 },
  [ 3]: { dy:  72, fs: FS_SMALL, op: 0.15 },
  [ 4]: { dy:  96, fs: FS_SMALL, op: 0.10 },
};
function slot(d: number) { return SLOTS[Math.max(-4, Math.min(4, d))]; }

function lockedSlot(d: number): { dy: number; fs: number; op: number } {
  const abs = Math.min(3, Math.abs(d));
  return { dy: d * 24, fs: FS_SMALL, op: d === 0 ? 1.0 : Math.max(0.10, 0.28 - abs * 0.06) };
}

// ── Generic XMB column ────────────────────────────────────────────────────────
interface ColItem { label: string; iconName?: IconName }

function XmbCol({ left, items, focused, isActive, isLocked, onSelect, panelMode = false, colorFn, lang = 'en', onHoverChange }: {
  left: number; items: ColItem[]; focused: number | null;
  isActive: boolean; isLocked?: boolean; onSelect?: (i: number) => void;
  panelMode?: boolean; colorFn?: (i: number) => string; lang?: Lang;
  onHoverChange?: (i: number | null) => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const isIdle = focused === null;
  return (
    <div style={{ position: 'absolute', left, top: ANCHOR_TOP, pointerEvents: 'auto' }}>
      {items.map((item, i) => {
        const isSelected = focused === i;
        const d = focused !== null ? i - focused : 0;
        let y: number, op: number;
        if (isIdle)        { y = i * 24;                             op = isActive ? 0.28 : 0.18; }
        else if (isLocked) { const s = lockedSlot(d); y = ANCHOR_Y + s.dy; op = s.op; }
        else               { const s = slot(d);        y = ANCHOR_Y + s.dy; op = s.op; }

        const displayOp = panelMode ? (isSelected ? op : 0) : (hoveredIdx === i ? 1 : op);

        return (
          <motion.div key={item.label} animate={{ y, opacity: displayOp }} transition={NAV_SPRING}
            onMouseEnter={() => { setHoveredIdx(i); onHoverChange?.(i); playUi('hover'); }}
            onMouseLeave={() => { setHoveredIdx(null); onHoverChange?.(null); }}
            onClick={() => { onSelect?.(i); playUi('click'); }}
            data-magnet="strong"
            style={{ position: 'absolute', top: 0, left: 0, height: ICON_PX,
                     display: 'flex', alignItems: 'center', overflow: 'visible',
                     cursor: 'pointer',
                     pointerEvents: (panelMode && !isSelected) ? 'none' : 'auto' }}
          >
            {/* Sequential "pop" entrance — cell by cell when the column appears */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...XMB_POP, delay: i * XMB_ENTER_STEP }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35em',
                       width: NAV_BRACKET_W, transformOrigin: 'left center' }}
            >
              <motion.span animate={{ opacity: isSelected ? 1 : 0 }} transition={{ duration: 0.15 }}
                style={{ fontSize: FS_SMALL, lineHeight: 1, color: colorFn ? colorFn(i) : 'var(--ui-fg)', flexShrink: 0 }}>(</motion.span>
              {item.iconName && (
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}><Icon name={item.iconName} size={FS_SMALL} color={colorFn ? colorFn(i) : 'var(--ui-fg)'} /></span>
              )}
              <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
                <motion.span
                  animate={{ left: isSelected ? '50%' : '0%', x: isSelected ? '-50%' : '0%' }}
                  transition={NAV_SPRING}
                  style={{ position: 'absolute', top: '50%', y: '-50%',
                           fontSize: FS_SMALL, color: colorFn ? colorFn(i) : 'var(--ui-fg)',
                           whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}
                >
                  {tLabel(item.label, lang)}
                </motion.span>
              </span>
              <motion.span animate={{ opacity: isSelected ? 1 : 0 }} transition={{ duration: 0.15 }}
                style={{ fontSize: FS_SMALL, lineHeight: 1, color: colorFn ? colorFn(i) : 'var(--ui-fg)', flexShrink: 0 }}>)</motion.span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── FX bracket — XmbCol-style "( … )" focus wrapper for the effects panel ─────
// Same pattern as XmbCol's nav brackets: a fixed-width slot with "(" / ")" that
// fade in on focus, and the content sliding to the horizontal centre between
// them when active (left-aligned otherwise).
function FxBracket({ children, active, color = 'var(--ui-fg)', onClick, onWheel,
                    onPointerDown, onPointerMove, onPointerUp, cursor, width = NAV_BRACKET_W }: {
  children: ReactNode; active: boolean; color?: string; onClick?: () => void;
  onWheel?: (e: ReactWheelEvent) => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  cursor?: string; width?: number;
}) {
  return (
    <span onClick={onClick} onWheel={onWheel}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em',
               width, transformOrigin: 'left center',
               cursor: cursor ?? (onClick ? 'pointer' : undefined),
               touchAction: onPointerDown ? 'none' : undefined }}>
      <motion.span animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.15 }}
        style={{ fontSize: FS_SMALL, lineHeight: 1, color, flexShrink: 0 }}>(</motion.span>
      <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
        <motion.span
          animate={{ left: active ? '50%' : '0%', x: active ? '-50%' : '0%' }}
          transition={NAV_SPRING}
          style={{ position: 'absolute', top: '50%', y: '-50%', whiteSpace: 'nowrap', lineHeight: 1 }}
        >
          {children}
        </motion.span>
      </span>
      <motion.span animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.15 }}
        style={{ fontSize: FS_SMALL, lineHeight: 1, color, flexShrink: 0 }}>)</motion.span>
    </span>
  );
}

// Welcome text, TTS phrases, and welcome pages are now derived from lang inside Home.
// (see welcomePages computed in render body)
const WELCOME_PAGE_GAP = 20; // vertical gap between stacked intro pages

// ── Sound-player entry hint text (keyboard / controller variants) ─────────────
function SoundPlayerHintTextController({ lang }: { lang: Lang }) {
  const S = getStrings(lang);
  const isPresent  = useIsPresent();
  const [showSuffix, setShowSuffix] = useState(false);
  const prefixText = useTypewriter(isPresent ? S.pressPrefix : '', 18, 120, () => setTimeout(() => setShowSuffix(true), 60));
  const suffixText = useTypewriter(isPresent && showSuffix ? S.soundPlayerHintSuffixCtrl : '', 18);
  return (
    <p style={{
      margin:         0,
      fontSize:       FS_LARGE * 2,
      lineHeight:     1.0,
      color:         '#fff',
      letterSpacing: '0.04em',
      fontFamily:     FONT,
    }}>
      {prefixText}
      {showSuffix && (
        <Icon name="controller-A" size="1em" color="#fff"
          style={{ verticalAlign: 'middle', marginLeft: '0.25em', marginRight: '4px' }} />
      )}
      {suffixText}
    </p>
  );
}

function SoundPlayerHintText({ inputMode, lang = 'en', color = '#fff', fontSize = FS_LARGE * 2, iconColor = '#fff', iconSize = "1em" }: {
  inputMode:   'keyboard' | 'controller';
  lang?:       Lang;
  color?:      string;
  fontSize?:   number;
  iconColor?:  string;
  iconSize?:   number | string;   // fixed icon height (defaults to 0.7em, scaling with the text)
}) {
  const S = getStrings(lang);
  if (inputMode === 'controller') return <SoundPlayerHintTextController lang={lang} />;
  const isPresent = useIsPresent();
  const [showSuffix, setShowSuffix] = useState(false);
  const prefixText = useTypewriter(isPresent ? S.pressPrefix : '', 18, 120, () => setTimeout(() => setShowSuffix(true), 60));
  const suffixText = useTypewriter(isPresent && showSuffix ? S.soundPlayerHintSuffix : '', 18);
  return (
    <p style={{
      margin:        0,
      fontSize,
      lineHeight:    1.0,
      color,
      letterSpacing: '0.04em',
      fontFamily:    FONT,
    }}>
      {prefixText}
      {showSuffix && (
        <>
          <Icon name="key-right" size={iconSize} color={iconColor} style={{ verticalAlign: 'middle', margin: '0 0.25em' }} />
          {S.pressOr.trim()}
          <Icon name="key-enter" size={iconSize} color={iconColor} style={{ verticalAlign: 'middle', margin: '0 0.25em' }} />
          {' '}
        </>
      )}
      {suffixText}
    </p>
  );
}

// One page of the intro text. Types `text`; when done, shows a blinking enter
// icon if `hasMore` (indicates there's a continuation behind Enter).
function WelcomePage({ text, hasMore, active, onDone }: { text: string; hasMore: boolean; active: boolean; onDone?: () => void }) {
  const typed = useTypewriter(active ? text : '', 11, 1000, undefined, 2);
  const done = typed.length >= text.length;
  useEffect(() => { if (done) onDone?.(); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <p style={{
      margin:         0,
      fontSize:       FS_LARGE,
      lineHeight:     1.0,
      color:         'var(--ui-fg)',
      letterSpacing: '0.04em',
      fontFamily:     FONT,
    }}>
      {typed}
      {done && hasMore && (
        <motion.span
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '0.35em' }}
        >
          <Icon name="key-enter" size="1em" color="var(--ui-complement)" />
        </motion.span>
      )}
    </p>
  );
}

// ── Upload space text (same typewriter style as WelcomeText) ─────────────────
// ── ISAMO auto-categorization (deterministic from filename) ─────────────────
const ISAMO_TAG_POOL = ['A.MV', 'A.RT', 'A.CM', 'A.FX', 'M.AX01', 'B.A.01', 'EE2', 'AA1', 'BB1'];
function isamoTags(filename: string): string[] {
  const seed = filename.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const t1 = ISAMO_TAG_POOL[seed % ISAMO_TAG_POOL.length];
  const t2 = ISAMO_TAG_POOL[(seed + 3) % ISAMO_TAG_POOL.length];
  return ['ISAMO', t1, t2].filter((v, i, a) => a.indexOf(v) === i);
}

// Defined outside Home so it remounts fresh each time the upload space appears.
function UploadText({ inputMode, lang = 'en' }: { inputMode?: 'keyboard' | 'controller'; lang?: Lang }) {
  const S = getStrings(lang);
  const isPresent = useIsPresent();
  const text = useTypewriter(isPresent ? S.uploadText : '', 11, 400, undefined, 2);
  return (
    <p style={{
      margin:        0,
      fontSize:      FS_LARGE,
      lineHeight:    1.0,
      color:         'var(--ui-fg)',
      letterSpacing: '0.04em',
      fontFamily:    FONT,
      whiteSpace:    'pre-line',
    }}>
      <Icon name={inputMode === 'controller' ? 'controller-Y' : 'key-u'} size="1em"
        color="var(--ui-complement)" style={{ verticalAlign: 'middle', marginRight: '0.25em' }} />
      {text}
    </p>
  );
}

// ── Board upload text (Online → Upload) ─────────────────────────────────────
function BoardUploadText({ inputMode, lang = 'en' }: { inputMode?: 'keyboard' | 'controller'; lang?: Lang }) {
  const S = getStrings(lang);
  const isPresent = useIsPresent();
  const text = useTypewriter(isPresent ? S.boardUploadText : '', 11, 400, undefined, 2);
  return (
    <p style={{ margin: 0, fontSize: FS_LARGE * 2, lineHeight: 1.0, color: 'var(--ui-fg)',
                letterSpacing: '0.04em', fontFamily: FONT, whiteSpace: 'pre-line' }}>
      <Icon name={inputMode === 'controller' ? 'controller-Y' : 'key-u'} size="1em"
        color="var(--ui-complement)" style={{ verticalAlign: 'middle', marginRight: '0.25em' }} />
      {text}
    </p>
  );
}

// ── Account placeholder text (same typewriter style as the upload prompts) ───
function AccountText({ lang = 'en' }: { lang?: Lang }) {
  const S = getStrings(lang);
  const isPresent = useIsPresent();
  const text = useTypewriter(isPresent ? S.accountWip : '', 11, 400, undefined, 2);
  return (
    <p style={{ margin: 0, fontSize: FS_LARGE * 2, lineHeight: 1.0, color: 'var(--ui-fg)',
                letterSpacing: '0.04em', fontFamily: FONT, whiteSpace: 'pre-line' }}>
      {text}
    </p>
  );
}

// ── Online "..." info text — same size/style as the Artists "..." bio ───────
function OnlineInfoText({ lang = 'en' }: { lang?: Lang }) {
  const S = getStrings(lang);
  const isPresent = useIsPresent();
  const text = useTypewriter(isPresent ? S.onlineInfoText : '', 11, 400, undefined, 2);
  return (
    <p style={{ margin: 0, fontSize: FS_LARGE, lineHeight: 1.0, color: 'var(--ui-fg)',
                letterSpacing: '0.04em', fontFamily: FONT, whiteSpace: 'pre-line' }}>
      {text}
    </p>
  );
}

// FX hover explanation — small typewriter text shown top-left next to the ometto.
function FxExplanationText({ text }: { text: string }) {
  const isPresent = useIsPresent();
  const displayed = useTypewriter(isPresent ? text : '', 11, 150, undefined, 2);
  return (
    <p style={{ margin: 0, fontSize: FS_SMALL, lineHeight: 1.3, color: 'var(--ui-fg)',
                letterSpacing: '0.04em', fontFamily: FONT, whiteSpace: 'pre-line' }}>
      {displayed}
    </p>
  );
}

// Artist bios are now sourced from the i18n strings (see getStrings(lang).artistBios).

// Defined outside Home — remounts only when artist changes (key={focusedX}).
function ArtistBioText({ bio, color = 'var(--ui-fg)', onDone }: { bio: string; color?: string; onDone?: () => void }) {
  const isPresent = useIsPresent();
  const text = useTypewriter(isPresent ? bio : '', 11, 300, onDone, 2); // sound every 2 letters
  return (
    <p style={{
      margin:        0,
      fontSize:      FS_LARGE,
      lineHeight:    1.0,
      color,
      letterSpacing: '0.04em',
      fontFamily:    FONT,
    }}>
      {text}
    </p>
  );
}

// ── Pan bar ─────────────────────────────────────────────────────────────────
// Horizontal stereo-pan slider: drag left/right, centre = 0. Double-click resets.
function PanBar({ value, onChange, width = 74, height = 18 }: {
  value: number; onChange: (v: number) => void; width?: number; height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const setFromX = (clientX: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let t = (clientX - r.left) / r.width;          // 0..1
    t = Math.max(0, Math.min(1, t));
    let v = t * 2 - 1;                              // -1..1
    if (Math.abs(v) < 0.06) v = 0;                 // snap to centre
    onChange(parseFloat(v.toFixed(2)));
  };
  const pos = (value + 1) / 2;                      // 0..1
  return (
    <div
      ref={ref}
      onPointerDown={e => { dragging.current = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {} setFromX(e.clientX); }}
      onPointerMove={e => { if (dragging.current) setFromX(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onDoubleClick={() => onChange(0)}
      style={{ position: 'relative', width, height, cursor: 'ew-resize', touchAction: 'none', flexShrink: 0 }}
    >
      {/* Track */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2,
        background: 'var(--ui-fg)', opacity: 0.18, transform: 'translateY(-50%)' }} />
      {/* Centre tick */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1, height: height * 0.45,
        background: 'var(--ui-fg)', opacity: 0.3, transform: 'translate(-50%,-50%)' }} />
      {/* Fill from centre to thumb */}
      <div style={{ position: 'absolute', top: '50%', height: 2, transform: 'translateY(-50%)',
        background: 'var(--ui-complement)',
        left:  value >= 0 ? '50%' : `${pos * 100}%`,
        right: value >= 0 ? `${(1 - pos) * 100}%` : '50%' }} />
      {/* Thumb */}
      <div style={{ position: 'absolute', top: '50%', left: `${pos * 100}%`, width: 6, height: height * 0.65,
        background: 'var(--ui-fg)', transform: 'translate(-50%,-50%)' }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  onBack?:            () => void;
  inputMode?:         InputMode;
  onControllerInput?: () => void;
  generalMuted?:      boolean; // lifted from App — mutes all video audio + UI sounds
  logoHovered?:       boolean; // ISAMO logo hover (App-level) → acronym word reveal
  homeReset?:         number;  // bumped when the ISAMO logo is clicked → return to idle root
  lang?:              Lang;
  onLangChange?:      (l: Lang) => void; // Settings → Language picker
}

export function Home({ onBack, onControllerInput, inputMode = 'keyboard', generalMuted = false, logoHovered = false, homeReset = 0, lang = 'en', onLangChange }: Props) {
  // ── i18n: all user-visible strings derived from the active language ───────────
  const S = getStrings(lang);
  const welcomePages = [S.welcomeText, ...S.ttsPhrases];
  // Ref so effects with stale closures always read the current pages
  const welcomePagesRef = useRef(welcomePages);
  welcomePagesRef.current = welcomePages;
  const randomPreview = () => S.ttsPhrases[Math.floor(Math.random() * S.ttsPhrases.length)];
  const [focusedY, setFocusedY] = useState<number | null>(null);
  const [focusedX, setFocusedX] = useState<number | null>(null);
  const [focusedZ, setFocusedZ] = useState<number | null>(null);
  const [focusedW, setFocusedW] = useState<number | null>(null);
  const [focusedV, setFocusedV] = useState<number | null>(null); // Settings 5th column
  // Effects panel (sound player) — XMB-style column focus, separate from the sound list.
  // fxFocus: 0-5 = focused effect group (2×3 grid, row-major); null = sound list has focus.
  // Once fxFocus !== null, navigation IS the active mode: ←/→ step through every
  // parameter (FX_PARAM_SEQ), ↑/↓ adjust the focused parameter's value directly.
  const [fxFocus, setFxFocus] = useState<number | null>(null);
  const [fxParam, setFxParam] = useState(0);    // which sub-value of the focused group is highlighted
  // ISAMO logo click (App-level) → return to the home idle root (clear navigation).
  useEffect(() => {
    if (homeReset <= 0) return;
    setFocusedY(null); setFocusedX(null); setFocusedZ(null); setFocusedW(null); setFocusedV(null);
  }, [homeReset]);
  const clampColor = (n: number) => Math.max(0, Math.min(COLOR_OPTIONS.length - 1, n || 0));
  const [color1Idx, setColor1Idx] = useState<number>(
    () => clampColor(parseInt(localStorage.getItem('isamo-color1-idx') ?? '0', 10))
  );
  const [color2Idx, setColor2Idx] = useState<number>(
    () => clampColor(parseInt(localStorage.getItem('isamo-color2-idx') ?? '0', 10))
  );
  // Language picker helper + fresh refs (the keyboard handler is mounted once with
  // empty deps, so it reads the live language / callback through these refs).
  const isLangItem = (id?: string) => !!id && id.startsWith('lang-');
  const langOf     = (id: string) => id.slice('lang-'.length) as Lang;
  const langRef = useRef(lang);                 langRef.current = lang;
  const onLangChangeRef = useRef(onLangChange); onLangChangeRef.current = onLangChange;

  // Color settings helpers (Color 1 → primary, Color 2 → complement).
  const isColorItem  = (id?: string) => id === 'color-1' || id === 'color-2';
  const colorIdxOf   = (id?: string) => (id === 'color-2' ? color2Idx : color1Idx);
  const setColorIdxOf = (id: string | undefined, v: number) => {
    const n = clampColor(v);
    if (id === 'color-2') setColor2Idx(n); else setColor1Idx(n);
  };
  // #swag: seed for the per-element random colour arrangement (null when off)
  const [swagSeed, setSwagSeed] = useState<number | null>(null);
  // Per-element colour resolver: random (seeded) in #swag, else the accent var.
  const swColor  = (key: number) => swagSeed != null ? swagColorFor(key, swagSeed)  : 'var(--ui-fg)';
  const swFilter = (key: number) => swagSeed != null ? swagFilterFor(key, swagSeed) : 'var(--icon-filter)';
  const [hoveredYIdx,         setHoveredYIdx]         = useState<number | null>(null);
  // X/Z column item currently under the mouse — drives the nav-explanation overlay on hover.
  const [hoveredXIdx,         setHoveredXIdx]         = useState<number | null>(null);
  const [hoveredZIdx,         setHoveredZIdx]         = useState<number | null>(null);
  // Y-category label fit: cap the enlarged label's scale so long translations
  // don't spill into the X column.
  const yLabelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [hoveredSound,        setHoveredSound]        = useState<{ idx: number; part: 'title' | 'download' } | null>(null);
  const [hoveredMoodboardIdx, setHoveredMoodboardIdx] = useState<number | null>(null);
  const [boardVideos, setBoardVideos] = useState(() => [...INITIAL_BOARD_VIDEOS]);
  const [mutedVideos,         setMutedVideos]         = useState<Set<number>>(
    () => new Set(INITIAL_BOARD_VIDEOS.map((_, i) => i))   // tutti muted di default
  );
  const [boardCols,           setBoardCols]           = useState<1 | 2 | 4>(2);
  // Narrow viewport → Board is single-column only (2/4 layouts unavailable).
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < BOARD_SINGLE_COL_MAX_W);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < BOARD_SINGLE_COL_MAX_W);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => { if (isNarrow) setBoardCols(1); }, [isNarrow]);
  const [boardSearch,         setBoardSearch]         = useState('');
  const [boardOrderBy,        setBoardOrderBy]        = useState<OrderByCat | null>(null);
  const [boardSortAsc,        setBoardSortAsc]        = useState(true);
  // muteFlashSet: videos whose mute icon is currently visible (transient flash on toggle)
  const [muteFlashSet, setMuteFlashSet] = useState<Set<number>>(new Set());
  const muteFlashTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Show the mute icon for DISPLAY_DURATION ms, then fade it out
  const MUTE_DISPLAY_MS = 1400;
  function flashMuteIcon(idx: number) {
    const existing = muteFlashTimers.current.get(idx);
    if (existing) clearTimeout(existing);
    setMuteFlashSet(prev => prev.has(idx) ? prev : new Set([...prev, idx]));
    const t = setTimeout(() => {
      setMuteFlashSet(prev => { const s = new Set(prev); s.delete(idx); return s; });
      muteFlashTimers.current.delete(idx);
    }, MUTE_DISPLAY_MS);
    muteFlashTimers.current.set(idx, t);
  }

  const [searchFocused,       setSearchFocused]       = useState(false);
  const [playerSearch,        setPlayerSearch]        = useState('');
  const [playerSearchFocused, setPlayerSearchFocused] = useState(false);
  const [artistSearch,        setArtistSearch]        = useState('');
  const [artistSearchFocused, setArtistSearchFocused] = useState(false);

  // ── Back-to-board deep-link state ─────────────────────────────────────────
  const [fromBoard, setFromBoard] = useState(false);
  const boardReturnPath = useRef<{ y: number; x: number; z: number | null; w: number } | null>(null);
  // True while the B button is physically held down (for the progress ring)
  const [bHoldActive, setBHoldActive] = useState(false);

  // ── Sound player ─────────────────────────────────────────────────────────────
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [soundProgress, setSoundProgress] = useState(0);       // 0..1
  const [playbackRate,  setPlaybackRate]  = useState(1);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  // Resolved durations from loadedmetadata, keyed by item.id
  const [loadedDurations, setLoadedDurations] = useState<Record<string, string>>({});
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const audioBarFillRef = useRef<HTMLDivElement | null>(null);
  const videoSyncHeadRef = useRef<HTMLDivElement | null>(null);
  const audioRafRef     = useRef(0);

  // ── Video player (user-uploaded, syncs with audio) ────────────────────────
  const [videoUrl,       setVideoUrl]       = useState<string | null>(null);
  const [videoStartTime, setVideoStartTime] = useState(0);   // in-point  (seconds)
  const [videoEndTime,   setVideoEndTime]   = useState(0);   // out-point (seconds, 0 = not set yet)
  const [videoDuration,  setVideoDuration]  = useState(0);   // total duration of uploaded video
  const [videoDragHandle, setVideoDragHandle] = useState<'start' | 'end' | null>(null);
  const [videoHovered,    setVideoHovered]    = useState(false);   // hover over the uploaded clip → show remove overlay
  const [asyncVideo,      setAsyncVideo]      = useState(false);   // true = video free-running
  const [asyncAudio,      setAsyncAudio]      = useState(false);   // true = audio free-running
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);     // actual video position (async)
  const [soundScrubDragging,  setSoundScrubDragging]  = useState(false);
  const [soundStartTime,  setSoundStartTime]  = useState(0);   // in-point  (seconds)
  const [soundEndTime,    setSoundEndTime]     = useState(0);   // out-point (seconds, 0 = full dur)
  const [soundDuration,   setSoundDuration]    = useState(0);   // resolved from loadedmetadata
  const [soundDragHandle, setSoundDragHandle]  = useState<'start' | 'end' | 'scrub' | null>(null);
  const soundStartRef = useRef(0);
  const soundEndRef   = useRef(0);
  const [isDragOver,          setIsDragOver]          = useState(false);
  const [uploadHovered,       setUploadHovered]       = useState(false);   // hover over the empty clip zone
  const [boardIsDragOver,     setBoardIsDragOver]     = useState(false);
  const [boardUploadSuccess,  setBoardUploadSuccess]  = useState(false);
  const videoRef         = useRef<HTMLVideoElement | null>(null);
  const videoUploadRef   = useRef<HTMLInputElement | null>(null);
  const dragCounterRef   = useRef(0);
  const boardUploadRef   = useRef<HTMLInputElement | null>(null);
  const boardDragCounter = useRef(0);
  // Refs for use inside audio effects (avoid stale closures)
  const videoUrlRef    = useRef<string | null>(null);
  const videoStartRef  = useRef(0);
  const videoEndRef    = useRef(0);   // mirrors videoEndTime for audio-effect closures
  // When true, video plays freely — onTime skips video sync (set by Shift+Space)
  const asyncVideoRef   = useRef(false);
  // When true, audio plays freely — onTime skips video sync (set by Z+Space)
  const asyncAudioRef   = useRef(false);
  // Tracks whether Z is currently held — used to detect the Z+Space combo
  const zHeldRef        = useRef(false);

  // ── Reverse playback ─────────────────────────────────────────────────────────
  const [isReversed,      setIsReversed]      = useState(false);
  const isReversedRef     = useRef(false);
  const reverseCtxRef     = useRef<AudioContext | null>(null);
  const reverseSrcRef     = useRef<AudioBufferSourceNode | null>(null);
  const reverseBufRef     = useRef<{ id: string; buf: AudioBuffer } | null>(null); // cached decoded buffer
  const reverseStartPos    = useRef(0);   // audio.currentTime when reverse node last started
  const reverseCtxStart    = useRef(0);   // AudioContext.currentTime when reverse node last started
  const reverseRafRef      = useRef(0);   // rAF id for progress updates during reverse
  const reversePauseOffset = useRef(0);   // offset into decoded buffer when playback was paused
  // ── Settings state ──────────────────────────────────────────────────────────
  const [uiSoundsMuted, setUiSoundsMuted] = useState(
    () => localStorage.getItem('isamo-ui-muted') === 'true'
  );
  // Read volume from localStorage (AudioContext may not exist yet at render time)
  const [uiSoundsVolume, setUiSoundsVolume] = useState<number>(() => {
    const saved = localStorage.getItem('isamo-ui-volume');
    return saved !== null ? Math.round(parseFloat(saved) * 100) : 100;
  });
  // Text-to-speech toggle (ON by default)
  const [ttsEnabled, setTtsEnabledState] = useState(
    () => localStorage.getItem('isamo-tts') !== 'false'
  );
  useEffect(() => { setTtsEnabled(ttsEnabled); }, [ttsEnabled]);
  // Intro text — revealed count + currently focused page (can go back to greyed pages)
  const [welcomePagesShown, setWelcomePagesShown] = useState(1);
  const [welcomePageIdx, setWelcomePageIdx] = useState(0);
  const welcomePageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [welcomeShiftY, setWelcomeShiftY] = useState(0);
  // Which pages have finished typing — TTS may only read a page once its text is shown
  const [typedPages, setTypedPages] = useState<Set<number>>(new Set());
  const lastSpokenPageRef = useRef(-1);
  // Move forward (reveals the next page if needed) / backward through intro pages.
  // Navigating (Enter / arrows / wheel) stops the ometto's current playback —
  // unless `stopOmetto` is false, letting it keep talking across the page change.
  const welcomeNext = (stopOmetto: boolean = true) => {
    if (stopOmetto) { cancelTts(); setWelcomeMuted(true); }
    setWelcomePageIdx(idx => {
      const next = Math.min(welcomePagesRef.current.length - 1, idx + 1);
      if (next > idx) { setWelcomePagesShown(s => Math.max(s, next + 1)); playUi('enterText'); }
      return next;
    });
  };
  const welcomePrev = () => {
    cancelTts(); setWelcomeMuted(true);
    setWelcomePageIdx(idx => Math.max(0, idx - 1));
  };
  // Welcome text speech state: true = muted (not speaking). Hover/flash like board.
  const [welcomeMuted, setWelcomeMuted] = useState(true);
  const [welcomeHovered, setWelcomeHovered] = useState(false);
  const [welcomeFlash, setWelcomeFlash] = useState(false);
  const welcomeFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Talking-mouth animation: open/close the mouth following the live TTS amplitude
  const [talkFrame, setTalkFrame] = useState(false);
  useEffect(() => {
    if (!ttsEnabled) { setTalkFrame(false); return; }
    let raf = 0;
    let last = false;
    const tick = () => {
      const open = getTtsLevel() > 0.05;   // mouth open when sound is present
      if (open !== last) { last = open; setTalkFrame(open); }
      raf = requestAnimationFrame(tick);   // ~16ms, follows the speech rhythm
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ttsEnabled]);
  const toggleWelcomeSpeech = () => {
    if (welcomeFlashTimer.current) clearTimeout(welcomeFlashTimer.current);
    setWelcomeFlash(true);
    welcomeFlashTimer.current = setTimeout(() => setWelcomeFlash(false), 1400);
    if (welcomeMuted) {
      setWelcomeMuted(false);              // OFF → ON (effect reads the current page)
    } else if (isTtsPlaying()) {
      setWelcomeMuted(true);               // playing → stop (ON → OFF)
    } else if (typedPages.has(welcomePageIdx)) {
      lastSpokenPageRef.current = welcomePageIdx;   // ON but idle → replay current page
      speak(welcomePagesRef.current[welcomePageIdx], { force: true, indicateLoading: true });
    }
  };
  // Drive TTS playback: speak the focused page only once its text is typed, and
  // keep reading across page changes while ON. Stays ON until the user toggles it
  // off (no auto-mute on end), so advancing through pages keeps the avatar active.
  useEffect(() => {
    if (welcomeMuted || !ttsEnabled) { lastSpokenPageRef.current = -1; cancelTts(); return; }
    if (lastSpokenPageRef.current === welcomePageIdx) return; // already reading this page
    if (!typedPages.has(welcomePageIdx)) {
      cancelTts();
      lastSpokenPageRef.current = -1;
      return;                                                // ← never start before the text
    }
    lastSpokenPageRef.current = welcomePageIdx;
    speak(welcomePagesRef.current[welcomePageIdx], { force: true, indicateLoading: true });
  }, [welcomeMuted, welcomePageIdx, typedPages, ttsEnabled]);
  // Artist bio ometto — reads the selected artist's bio (also via T)
  const [artistMuted, setArtistMuted] = useState(true);
  const [artistHovered, setArtistHovered] = useState(false);
  // True once the bio finished typing → triggers a blink on the Sound Player hint.
  const [bioDone, setBioDone] = useState(false);
  // FX panel — group index currently hovered (0..5, see FX_GROUP_LABELS), or null.
  const [hoveredFxGroup, setHoveredFxGroup] = useState<number | null>(null);
  // Navigation explanation — canonical label of the category / sub-category currently
  // being browsed (top-left mini text). null while idle, in a panel, or on an item that
  // already has its own overlay (artist bios, Community "...").
  const navExplLabel: string | null = (() => {
    // Mouse hover takes priority — explain whatever item the pointer is over right now.
    if (focusedY !== null && focusedX !== null && hoveredZIdx !== null) {
      const zi = CATEGORIES[focusedY].xItems[focusedX]?.zItems?.[hoveredZIdx];
      if (zi) return zi.label;
    }
    if (focusedY !== null && hoveredXIdx !== null) {
      const xi = CATEGORIES[focusedY].xItems[hoveredXIdx];
      if (xi && !xi.src && !(CATEGORIES[focusedY].id === 'community' && xi.label === '...')) return xi.label;
    }
    if (hoveredYIdx !== null && focusedW === null) return CATEGORIES[hoveredYIdx].label;

    if (focusedY === null || focusedW !== null) return null; // idle, or inside a panel
    const cat = CATEGORIES[focusedY];
    if (focusedX === null) return cat.label;                 // browsing the Y category itself
    const xi = cat.xItems[focusedX];
    if (xi.src) return null;                                 // artist → handled by the bio overlay
    if (cat.id === 'community' && xi.label === '...') return null; // → online info overlay
    if (focusedZ !== null && xi.zItems && xi.zItems[focusedZ]) return xi.zItems[focusedZ].label;
    return xi.label;
  })();
  const navExpl = navExplLabel ? (S.navExplanations[navExplLabel] ?? '') : '';
  const artistBio = (focusedY !== null && focusedX !== null
    && CATEGORIES[focusedY].xItems.some(xi => xi.src))
    ? (S.artistBios[CATEGORIES[focusedY].xItems[focusedX].label] ?? '')
    // Online → "..." reuses the same ometto/TTS toggle to read its info text.
    : (focusedY !== null && focusedX === 0 && CATEGORIES[focusedY].id === 'community')
      ? S.onlineInfoText
      // Effects panel — hovering a group name shows its explanation via the same ometto.
      : (hoveredFxGroup !== null)
        ? (S.fxExplanations[FX_GROUP_LABELS[hoveredFxGroup]] ?? '')
        // Navigation — browsing a category / sub-category shows its explanation.
        : navExpl;
  const toggleArtistSpeech = () => {
    if (!ttsEnabled || !artistBio) return;
    if (artistMuted) { setArtistMuted(false); speak(artistBio, { force: true, indicateLoading: true }); }
    else if (isTtsPlaying()) { setArtistMuted(true); cancelTts(); }
    else { speak(artistBio, { force: true, indicateLoading: true }); }   // idle → replay
  };
  // Reset/stop when the focused nav item changes, you leave the artist view,
  // navigate into/out of the sound player (focusedW), or hover a different FX group.
  useEffect(() => { setArtistMuted(true); cancelTts(); }, [focusedX, focusedY, focusedZ, focusedW, hoveredFxGroup]);
  // Reset the bio-finished flag whenever the bio changes (artist switch).
  useEffect(() => { setBioDone(false); }, [artistBio]);

  // Adjustable talkmodachi voice params
  const [ttsParams, setTtsParamsState] = useState<TtsParams>(() => {
    try { const s = localStorage.getItem('isamo-tts-params'); if (s) return { ...DEFAULT_TTS_PARAMS, ...JSON.parse(s) }; } catch {}
    return { ...DEFAULT_TTS_PARAMS };
  });
  useEffect(() => {
    setTtsParams(ttsParams);
    localStorage.setItem('isamo-tts-params', JSON.stringify(ttsParams));
  }, [ttsParams]);

  // TTS voice follows the chosen UI language automatically.
  useEffect(() => {
    const UI_TO_TTS: Record<Lang, string> = { en: 'useng', it: 'it', fr: 'fr', jp: 'jp' };
    const ttsLang = UI_TO_TTS[lang] ?? 'useng';
    setTtsParamsState(p => p.lang === ttsLang ? p : { ...p, lang: ttsLang });
  }, [lang]);


  // True while editing inside the 5th column (a param's value). The 4th column
  // (names/toggle) and 5th column (values) are navigated independently: → enters
  // the value, ↑↓ adjust it, ← returns to the names column.
  const [ttsValueActive, setTtsValueActive] = useState(false);
  // Voice-param V rows for the 'tts' setting, in display order
  const TTS_V_KEYS: (keyof TtsParams)[] = ['pitch', 'speed', 'quality', 'tone', 'accent', 'intonation', 'lang'];
  // randomPreview is defined above from S.ttsPhrases (i18n)
  // Adjust a tts param by direction (+1 / −1). vRow: 0 = on/off toggle, 1.. = params
  const adjustTtsParam = (vRow: number, dir: 1 | -1) => {
    if (vRow === 0) {
      const next = !ttsEnabled;
      setTtsEnabledState(next);
      localStorage.setItem('isamo-tts', String(next));
      if (next) { setTtsParams(ttsParams); speak(randomPreview(), { force: true, indicateLoading: true }); }
      else cancelTts();
      return;
    }
    if (!ttsEnabled) return;
    const key = TTS_V_KEYS[vRow - 1];
    const p = { ...ttsParams };
    if (key === 'lang') {
      const i = TTS_LANGS.indexOf(ttsParams.lang as typeof TTS_LANGS[number]);
      p.lang = TTS_LANGS[(i + dir + TTS_LANGS.length) % TTS_LANGS.length];
    } else if (key === 'intonation') {
      const i = INTONATIONS.indexOf(ttsParams.intonation as typeof INTONATIONS[number]);
      p.intonation = INTONATIONS[(i + dir + INTONATIONS.length) % INTONATIONS.length];
    } else {
      p[key] = Math.max(0, Math.min(100, (ttsParams[key] as number) + dir * 10)) as never;
    }
    setTtsParamsState(p);
    setTtsParams(p);                       // apply to engine immediately…
    speak(randomPreview(), { force: true, indicateLoading: true });   // …then preview with the new params
  };

  // ── FX state (EQ 3 + Reverb + Delay + Magic) ────────────────────────────────
  const [eqLow,       setEqLow]       = useState(0);    // dB  –12..+12
  const [eqMid,       setEqMid]       = useState(0);
  const [eqHigh,      setEqHigh]      = useState(0);
  const [reverbWet,   setReverbWet]   = useState(0);    // 0..1
  const [delayWet,    setDelayWet]    = useState(0);    // 0..1
  const [delayDivIdx, setDelayDivIdx] = useState(2);    // default = '1/2' (1.0 s)
  const [magicWet,    setMagicWet]    = useState(0);    // 0..1
  const [magicVoices, setMagicVoices] = useState(4);   // 1..7 (Hyper voice count)
  const [pan,         setPan]         = useState(0);    // -1 (L) .. 0 (C) .. +1 (R)
  const [arpAmount,   setArpAmount]   = useState(0);    // 0..100 (ARPEGGIATORE: rhythmic gate amount)

  // FX value drag — hold on a value and move the mouse up/down to adjust it.
  // `acc` accumulates vertical movement; every FX_DRAG_STEP_PX of travel = one step.
  const fxDragRef      = useRef<{ group: number; param: number; acc: number } | null>(null);
  const fxDragMovedRef = useRef(false); // set once a drag actually changed the value → suppresses the click

  // Guard: prevents a second simultaneous play() call (e.g. gamepad A + synthetic Space)
  const playPendingRef  = useRef(false);
  // Debounce: timestamp of the last togglePlay() call — rejects calls within 60 ms
  const lastToggleRef   = useRef(0);

  const moodboardContainerRef  = useRef<HTMLDivElement>(null);
  const moodboardItemRefs      = useRef<(HTMLDivElement | null)[]>([]);

  // ── FX chain refs (Web Audio nodes) ──────────────────────────────────────────
  const fxInitRef    = useRef(false);
  const fxCtxRef     = useRef<AudioContext | null>(null);
  const fxSourceRef  = useRef<MediaElementSourceNode | null>(null);
  const eqLowRef     = useRef<BiquadFilterNode | null>(null);
  const eqMidRef     = useRef<BiquadFilterNode | null>(null);
  const eqHighRef    = useRef<BiquadFilterNode | null>(null);
  const reverbDryRef = useRef<GainNode | null>(null);
  const reverbWetRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayDryRef  = useRef<GainNode | null>(null);
  const delayWetRef  = useRef<GainNode | null>(null);
  const magicDryRef       = useRef<GainNode | null>(null);
  const magicWetRef       = useRef<GainNode | null>(null);
  const flangerDelayRef   = useRef<DelayNode | null>(null);
  const flangerLfoRef     = useRef<OscillatorNode | null>(null);
  const panNodeRef         = useRef<StereoPannerNode | null>(null);
  const fadeGainRef        = useRef<GainNode | null>(null);
  const arpGateRef         = useRef<GainNode | null>(null);
  const arpLfoRef          = useRef<OscillatorNode | null>(null);
  const arpDepthRef        = useRef<GainNode | null>(null);
  const searchInputRef         = useRef<HTMLInputElement>(null);
  const playerSearchInputRef   = useRef<HTMLInputElement>(null);
  const artistSearchInputRef   = useRef<HTMLInputElement>(null);
  // Tracks the last item on which the user explicitly confirmed mute toggle.
  // On first confirm the item is just "selected"; mute only toggles on re-confirm.
  const lastMuteConfirmW      = useRef<number | null>(null);
  // Sorted + filtered board indices — kept in sync in render body, read by keyboard handler
  const sortedBoardIdxRef = useRef<number[]>([]);

  // Preload keyboard sounds once on mount
  useEffect(() => { preloadKeyboardSounds(); }, []);

  // Apply accent colour preset to CSS custom properties + persist.
  // MULTICOLOR cycles through the coloured presets on an interval.
  useEffect(() => {
    localStorage.setItem('isamo-color1-idx', String(color1Idx));
    localStorage.setItem('isamo-color2-idx', String(color2Idx));
    applyColorVars(color1Idx, color2Idx);
  }, [color1Idx, color2Idx]);

  // Keep video refs in sync with state (used inside audio effects)
  useEffect(() => { videoUrlRef.current   = videoUrl;       }, [videoUrl]);
  useEffect(() => { videoStartRef.current = videoStartTime; }, [videoStartTime]);
  useEffect(() => { videoEndRef.current   = videoEndTime;   }, [videoEndTime]);
  useEffect(() => { soundStartRef.current = soundStartTime; }, [soundStartTime]);
  useEffect(() => { soundEndRef.current   = soundEndTime;   }, [soundEndTime]);

  // ── FX param → Web Audio node sync ───────────────────────────────────────────
  useEffect(() => { if (eqLowRef.current)  eqLowRef.current.gain.value  = eqLow;  }, [eqLow]);
  useEffect(() => { if (eqMidRef.current)  eqMidRef.current.gain.value  = eqMid;  }, [eqMid]);
  useEffect(() => { if (eqHighRef.current) eqHighRef.current.gain.value = eqHigh; }, [eqHigh]);
  useEffect(() => {
    if (reverbDryRef.current) reverbDryRef.current.gain.value = 1 - reverbWet;
    if (reverbWetRef.current) reverbWetRef.current.gain.value = reverbWet;
  }, [reverbWet]);
  useEffect(() => {
    if (delayDryRef.current) delayDryRef.current.gain.value = 1 - delayWet;
    if (delayWetRef.current) delayWetRef.current.gain.value = delayWet;
  }, [delayWet]);
  useEffect(() => {
    if (delayNodeRef.current) delayNodeRef.current.delayTime.value = DELAY_TIMES[delayDivIdx];
  }, [delayDivIdx]);
  useEffect(() => {
    if (magicDryRef.current) magicDryRef.current.gain.value = 1 - magicWet;
    if (magicWetRef.current) magicWetRef.current.gain.value = magicWet;
  }, [magicWet]);
  useEffect(() => { if (panNodeRef.current) panNodeRef.current.pan.value = pan; }, [pan]);
  useEffect(() => {
    if (flangerLfoRef.current) {
      flangerLfoRef.current.frequency.value = FLANGER_RATE_MIN
        + (magicVoices - 1) / (MAGIC_MAX_V - 1) * (FLANGER_RATE_MAX - FLANGER_RATE_MIN);
    }
  }, [magicVoices]);
  useEffect(() => {
    const lfo = arpLfoRef.current, depthG = arpDepthRef.current, gate = arpGateRef.current, ctx = fxCtxRef.current;
    if (!lfo || !depthG || !gate || !ctx) return;
    const amt   = arpAmount / 100;             // 0 (off) .. 1 (full chop)
    const depth = amt / 2;
    const rate  = ARP_RATE_MIN + amt * (ARP_RATE_MAX - ARP_RATE_MIN);
    lfo.frequency.setTargetAtTime(rate, ctx.currentTime, 0.01);
    depthG.gain.setTargetAtTime(depth, ctx.currentTime, 0.01);
    gate.gain.setTargetAtTime(1 - depth, ctx.currentTime, 0.01);
  }, [arpAmount]);

  // Revoke object URL and close AudioContext when component unmounts
  useEffect(() => () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  // ── Track real video position for async-mode playhead ───────────────────────
  useEffect(() => {
    if (!videoUrl) return;
    const vid = videoRef.current;
    if (!vid) return;
    const onVidTime = () => {
      setVideoCurrentTime(vid.currentTime);
      // Keep the progress fill in sync (async mode, when the audio RAF isn't running)
      const vh = videoSyncHeadRef.current;
      if (vh && isFinite(vid.duration) && vid.duration > 0)
        vh.style.transform = `scaleX(${vid.currentTime / vid.duration})`;
      // [S, E] loop: when reaching the user-defined out-point, jump back to in-point.
      // Active independently of audio so pitch-shifted / async playback still loops —
      // but only while something is actually playing (forward audio OR reverse), so a
      // stopped/paused player never keeps the preview looping on its own.
      const playing = (audioRef.current && !audioRef.current.paused)
        || (isReversedRef.current && !!reverseSrcRef.current);
      const S = videoStartRef.current;
      const E = videoEndRef.current;
      if (playing && E > S && vid.currentTime >= E - 0.05) {
        vid.currentTime = S;
      }
    };
    vid.addEventListener('timeupdate', onVidTime);
    setVideoCurrentTime(vid.currentTime);
    return () => vid.removeEventListener('timeupdate', onVidTime);
  }, [videoUrl]);

  // ── Video loop from starting point ────────────────────────────────────────────
  // The <video> element does NOT use the native `loop` attribute (which always
  // rewinds to t=0). Instead we listen for `ended` and seek back to
  // videoStartRef.current so the loop honours the user-set starting point.
  useEffect(() => {
    if (!videoUrl) return;
    const vid = videoRef.current;
    if (!vid) return;
    const onVideoEnded = () => {
      // Only loop if audio is actively playing (onTime handles sync; this
      // covers the edge case where the video file ends before onTime catches it)
      if (audioRef.current && !audioRef.current.paused) {
        vid.currentTime = videoStartRef.current;
        vid.play().catch(() => {});
      }
    };
    vid.addEventListener('ended', onVideoEnded);
    return () => vid.removeEventListener('ended', onVideoEnded);
  }, [videoUrl]);

  // ── Stable keyboard handler ref (cbRef pattern — registered once, always fresh) ─
  // Avoids double-registration issues from deps-changing effects. The ref is
  // updated after every render so the handler always closes over current state.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // ── Wheel scroll refs (persist across renders, used by permanent listeners) ──
  const lastNavTimeRef = useRef(0);
  // layoutRef is updated after every render (see sync useEffect below)
  const layoutRef = useRef({
    mb: false, ip: false, fz: null as number | null, ac: false,
  });

  const goY = (y: number | null) => { setFocusedY(y); setFocusedX(null); setFocusedZ(null); setFocusedW(null); setFocusedV(null); };
  const goX = (x: number | null) => { setFocusedX(x); setFocusedZ(null); setFocusedW(null); setFocusedV(null); };
  const goZ = (z: number | null) => { setFocusedZ(z); setFocusedW(null); setFocusedV(null); };
  const goW = (w: number | null) => { setFocusedW(w); setFocusedV(null); setFxFocus(null); setFxParam(0); };
  const goV = (v: number | null) => setFocusedV(v);

  // Effects panel: adjust the value of group `g`'s sub-parameter `p` by one step.
  const adjustFxValue = (g: number, p: number, dir: 1 | -1) => {
    initFxChain(); // ensure the Web Audio graph exists so the change is audible
    switch (g) {
      case 0: // EQUALIZZATORE — LO/MID/HI, dB -12..12, step 1
        if (p === 0) setEqLow(v => Math.max(-12, Math.min(12, v + dir)));
        else if (p === 1) setEqMid(v => Math.max(-12, Math.min(12, v + dir)));
        else setEqHigh(v => Math.max(-12, Math.min(12, v + dir)));
        break;
      case 1: // RIVERBERO — wet 0..1, step 0.05
        setReverbWet(v => Math.max(0, Math.min(1, parseFloat((v + dir * 0.05).toFixed(2)))));
        break;
      case 2: // SINISTRA/DESTRA — pan -1..1, step 0.1
        setPan(v => Math.max(-1, Math.min(1, parseFloat((v + dir * 0.1).toFixed(2)))));
        break;
      case 3: // DELAY — wet 0..1 (param 0), divisione qualitativa 0..3 (param 1)
        if (p === 0) setDelayWet(v => Math.max(0, Math.min(1, parseFloat((v + dir * 0.05).toFixed(2)))));
        else setDelayDivIdx(v => (v + dir + DELAY_DIVS.length) % DELAY_DIVS.length);
        break;
      case 4: // FLANGER — wet 0..1 (param 0), velocità 1..MAGIC_MAX_V (param 1)
        if (p === 0) setMagicWet(v => Math.max(0, Math.min(1, parseFloat((v + dir * 0.05).toFixed(2)))));
        else setMagicVoices(v => Math.max(1, Math.min(MAGIC_MAX_V, v + dir)));
        break;
      case 5: // ARPEGGIATORE — p=0: SI/NO (on/off toggle), p=1: rate 0..100, step 5
        if (p === 0) setArpAmount(v => v > 0 ? 0 : 50); // off→on uses a sensible default rate
        else         setArpAmount(v => Math.max(0, Math.min(100, v + dir * 5)));
        break;
    }
    playUi('horizontal');
  };

  // Deep-link: jump directly to a sound from a board pill click.
  // All four setters fire in the same event → React 18 batches them into one render.
  const navigateToSound = (tag: string) => {
    const path = findSoundPath(tag);
    if (!path) return;
    // Save where we came from so the user can jump back
    boardReturnPath.current = { y: focusedY ?? 0, x: focusedX ?? 0, z: focusedZ, w: focusedW ?? 0 };
    setFromBoard(true);
    setFocusedY(path.y);
    setFocusedX(path.x);
    setFocusedZ(path.z);
    setFocusedW(path.w);
    playUi('clickCursor');
  };

  const backToBoard = () => {
    const p = boardReturnPath.current;
    if (!p) return;
    setFocusedY(p.y);
    setFocusedX(p.x);
    setFocusedZ(p.z);
    setFocusedW(p.w);
    setFromBoard(false);
    boardReturnPath.current = null;
    playUi('horizontalLeft');
  };

  // Update the keyboard handler ref after every render so it always closes over
  // fresh state — no stale closures, no dependency array needed here.
  useEffect(() => {
    // Visible (search-filtered + sorted) board indices — kept up-to-date in render body
    const visIdx = sortedBoardIdxRef.current;
    const MB = visIdx.length;
    const inMB = focusedY !== null && focusedX !== null
      && CATEGORIES[focusedY].xItems[focusedX].label === 'Board'
      && focusedZ !== null;

    const isArtistCat  = focusedY !== null && CATEGORIES[focusedY].xItems.some(xi => xi.src);
    const isSettingsCat = focusedY !== null && CATEGORIES[focusedY].id === 'settings';
    const nArtists = isArtistCat && focusedY !== null ? CATEGORIES[focusedY].xItems.length : 0;
    const inAG = nArtists > 0 && focusedX !== null && focusedW === null;

    // Sound-player (Library panel): search-filtered W indices — navigation operates
    // only on matching sounds, mirroring the Board search behaviour.
    const playerVisW = (() => {
      if (focusedY === null || focusedX === null || focusedZ === null) return null;
      if (isArtistCat || isSettingsCat) return null;
      if (CATEGORIES[focusedY].xItems[focusedX].label === 'Board') return null;
      const wArr = CATEGORIES[focusedY].xItems[focusedX].zItems?.[focusedZ]?.wItems ?? [];
      const q = playerSearch.trim().toLowerCase();
      const idxs = wArr.map((_, i) => i).filter(i => {
        const it = wArr[i];
        return !q || it.title.toLowerCase().includes(q) || it.label.toLowerCase().includes(q);
      });
      return idxs;
    })();

    // Artists section: search-filtered artist indices — navigation steps only
    // through matching artists, mirroring the Board search behaviour.
    const artistVisX = (() => {
      if (!isArtistCat || focusedY === null || focusedW !== null) return null;
      const arr = CATEGORIES[focusedY].xItems;
      const q = artistSearch.trim().toLowerCase();
      return arr.map((_, i) => i).filter(i => !q || arr[i].label.toLowerCase().includes(q));
    })();

    onKeyRef.current = (e: KeyboardEvent) => {
      // Play a keyboard sound on every non-modifier keypress, unless a search
      // input is already focused (it has its own onKeyDown sound handler).
      const isSearchFocused =
        playerSearchInputRef.current === document.activeElement ||
        searchInputRef.current      === document.activeElement ||
        artistSearchInputRef.current === document.activeElement;
      const isSilent = ['Shift', 'Control', 'Alt', 'Meta',
                        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                        'Enter'].includes(e.key)
        || (e.key === ' ' && isLibraryPanel && focusedW !== null); // space = play/pause in sound player
      if (!isSearchFocused && !isSilent) playKeyboardSound();

      // While the search bar is focused: let the browser handle all typing
      // normally and block most XMB shortcuts. Exceptions:
      //   • Escape → blur (exit search mode)
      //   • Backspace on empty input → blur (auto-exit search mode)
      //   • Any arrow key → fall through to XMB nav (navigate the results)
      if (playerSearchInputRef.current === document.activeElement) {
        if (e.key === 'Escape') { playerSearchInputRef.current?.blur(); return; }
        if (e.key === 'Backspace' && playerSearch === '') { playerSearchInputRef.current?.blur(); return; }
        if (!e.key.startsWith('Arrow')) return;   // all directional arrows navigate results
        // ArrowUp / ArrowDown fall through to the switch below
      }
      if (searchInputRef.current === document.activeElement) {
        if (e.key === 'Escape') { searchInputRef.current?.blur(); return; }
        if (e.key === 'Backspace' && boardSearch === '') { searchInputRef.current?.blur(); return; }
        if (!e.key.startsWith('Arrow')) return;   // all directional arrows navigate results
      }
      if (artistSearchInputRef.current === document.activeElement) {
        if (e.key === 'Escape') { artistSearchInputRef.current?.blur(); return; }
        if (e.key === 'Backspace' && artistSearch === '') { artistSearchInputRef.current?.blur(); return; }
        if (!e.key.startsWith('Arrow')) return;   // all directional arrows navigate results
      }

      switch (e.key) {

        // ── Right ──────────────────────────────────────────────
        case 'ArrowRight': {
          e.preventDefault();
          playUi('horizontalRight');
          // Effects panel: → steps to the next parameter (flat, wraps across groups/rows)
          if (isLibraryPanel && focusedW !== null && fxFocus !== null) {
            const [g, p] = fxNext(fxFocus, fxParam); setFxFocus(g); setFxParam(p);
            break;
          }
          if (focusedY === null) { goY(0); break; }
          if (focusedX === null) { goX(0); break; }
          if (isArtistCat || isSettingsCat) {
            // Artist + Settings: → entra negli item W direttamente (no Z level)
            if (focusedW === null) {
              const wi = CATEGORIES[focusedY].xItems[focusedX].wItems;
              // Language column → land on the currently-active language
              if (wi?.length && isLangItem(wi[0]?.id)) goW(Math.max(0, LANGS.indexOf(langRef.current)));
              else if (wi?.length) goW(0);
            } else if (isSettingsCat) {
              const item = currentWItems[focusedW];
              if (isLangItem(item?.id)) {
                onLangChangeRef.current?.(langOf(item!.id));   // apply language (no V level)
              } else if (focusedV === null) {
                // Enter V column (5th level)
                const vLen = item?.id === 'ui-sounds' ? 2 : item?.id === 'tts' ? 8 : isColorItem(item?.id) ? COLOR_OPTIONS.length : 0;
                if (vLen > 0) goV(isColorItem(item?.id) ? colorIdxOf(item?.id) : 0);
              } else if (item?.id === 'ui-sounds') {
                if (focusedV === 0) {
                  // Toggle ON/OFF
                  const next = !uiSoundsMuted;
                  setUiSoundsMuted(next); setUiMuted(next);
                  localStorage.setItem('isamo-ui-muted', String(next));
                } else if (focusedV === 1) {
                  // Volume +10 (up to 200% — gain 2.0, above unity)
                  const next = Math.min(200, uiSoundsVolume + 10);
                  setUiSoundsVolume(next); setUiVolume(next / 100);
                }
              } else if (item?.id === 'tts') {
                if (focusedV === 0) adjustTtsParam(0, 1);        // toggle ON/OFF
                else if (!ttsValueActive) setTtsValueActive(true); // enter 5th column
                else adjustTtsParam(focusedV, 1);                // already inside → increase
              }
              // color-1 / color-2: ← → non ciclano; ↑↓ gestiscono la selezione
            }
            break;
          }
          if (inMB) {
            // Moodboard: move to right column among visible items
            const pos = focusedW !== null ? visIdx.indexOf(focusedW) : -1;
            if (pos >= 0 && pos % boardCols < boardCols - 1 && pos + 1 < MB)
              goW(visIdx[pos + 1]);
            break;
          }
          if (inAG) {
            // Artist stack: always enter sounds on →
            const wi = CATEGORIES[focusedY].xItems[focusedX].zItems?.[focusedZ]?.wItems;
            if (wi?.length) goW(0);
            break;
          }
          // Board: enter moodboard grid (no Z level — focusedZ acts as "entered" flag)
          if (CATEGORIES[focusedY].xItems[focusedX].label === 'Board') {
            if (focusedZ === null) { setFocusedZ(0); setFocusedW(visIdx[0] ?? 0); }
            break;
          }
          // Normal: X → Z → W
          if (focusedZ === null) {
            const zi = CATEGORIES[focusedY].xItems[focusedX].zItems;
            if (zi?.length) goZ(0);
            break;
          }
          if (focusedW === null) {
            const wi = CATEGORIES[focusedY].xItems[focusedX].zItems?.[focusedZ]?.wItems;
            if (wi?.length) goW(0);
          }
          break;
        }

        // ── Left ───────────────────────────────────────────────
        case 'ArrowLeft': {
          e.preventDefault();
          playUi('horizontalLeft');
          // Effects panel: ← steps to the previous parameter (flat, wraps across groups/rows)
          if (isLibraryPanel && focusedW !== null && fxFocus !== null) {
            const [g, p] = fxPrev(fxFocus, fxParam); setFxFocus(g); setFxParam(p);
            break;
          }
          if (inMB) {
            const pos = focusedW !== null ? visIdx.indexOf(focusedW) : -1;
            if (pos > 0 && pos % boardCols !== 0) { goW(visIdx[pos - 1]); break; }
            else { goZ(null); break; }
          }
          if (isArtistCat || isSettingsCat) {
            if (focusedW !== null) {
              if (isSettingsCat) {
                if (focusedV !== null) {
                  const item = currentWItems[focusedW];
                  if (item?.id === 'ui-sounds' && focusedV === 1 && uiSoundsVolume > 0) {
                    // Volume -10 (exit V only when at 0)
                    const next = Math.max(0, uiSoundsVolume - 10);
                    setUiSoundsVolume(next); setUiVolume(next / 100);
                  } else if (item?.id === 'tts' && ttsValueActive) {
                    setTtsValueActive(false); // ← exit 5th column → back to names
                  } else {
                    goV(null); // exit V → back to W preview
                  }
                  break;
                }
                // No V active → exit W
                goW(null); break;
              }
              goW(null); break;
            }
            if (focusedX !== null) { goX(null); break; }
            if (focusedY !== null) { goY(null); break; }
            onBack?.();
            break;
          }
          // Exit sounds (artist gallery or Library)
          if (focusedW !== null) { goW(null); break; }
          if (inAG) {
            // Artist stack: ← always exits
            goZ(null); break;
          }
          if (focusedZ !== null) { goZ(null);  break; }
          if (focusedX !== null) { goX(null);  break; }
          if (focusedY !== null) { goY(null);  break; }
          onBack?.();
          break;
        }

        // ── Down ───────────────────────────────────────────────
        case 'ArrowDown': {
          e.preventDefault();
          playUi('verticalDown');
          // Effects panel: ↓ decreases the focused parameter's value
          if (isLibraryPanel && focusedW !== null && fxFocus !== null) {
            adjustFxValue(fxFocus, fxParam, -1);
            break;
          }
          // Idle intro: ↓ advances to the next (or new) page
          if (isYIdle) { if (welcomePageIdx < welcomePagesRef.current.length - 1) welcomeNext(); break; }
          // Settings V column navigation (takes priority)
          if (isSettingsCat && focusedV !== null) {
            const _itemId = focusedW !== null ? currentWItems[focusedW]?.id : undefined;
            // Inside the 5th column (value editor): ↓ decreases the value
            if (_itemId === 'tts' && ttsValueActive) { adjustTtsParam(focusedV, -1); break; }
            const vLen = _itemId === 'ui-sounds' ? 2 : _itemId === 'tts' ? 8 : isColorItem(_itemId) ? COLOR_OPTIONS.length : 0;
            if (focusedV < vLen - 1) {
              goV(focusedV + 1);
              if (isColorItem(_itemId)) setColorIdxOf(_itemId, focusedV + 1);
            }
            break;
          }
          if (inMB) {
            // Board: navigate rows (step = boardCols) among visible items
            if (focusedW === null) { goW(visIdx[0]); break; }
            const pos = visIdx.indexOf(focusedW);
            const next = pos + boardCols;
            if (next < MB) { goW(visIdx[next]); break; }
            goW(visIdx[pos % boardCols]);
            break;
          }
          if (inAG) {
            // Artist stack: step DOWN through search-filtered artists only
            if (artistVisX && focusedX !== null) {
              if (!artistVisX.length) break;
              const pos = artistVisX.indexOf(focusedX);
              const next = pos === -1 ? 0 : (pos + 1) % artistVisX.length;
              goX(artistVisX[next]);
              break;
            }
          }
          // Library sound-player: step through search-filtered sounds only
          if (playerVisW && focusedW !== null) {
            if (!playerVisW.length) break;
            const pos = playerVisW.indexOf(focusedW);
            const next = pos === -1 ? 0 : (pos + 1) % playerVisW.length;
            goW(playerVisW[next]);
            break;
          }
          // Regular columns: wrap at last item back to first
          if (focusedW !== null) {
            const wArr = (isArtistCat || isSettingsCat)
              ? CATEGORIES[focusedY!].xItems[focusedX!].wItems ?? []
              : CATEGORIES[focusedY!].xItems[focusedX!].zItems?.[focusedZ!]?.wItems ?? [];
            const maxW = (wArr.length || 1) - 1;
            const nw = focusedW === maxW ? 0 : focusedW + 1;
            goW(nw);
            if (isLangItem(wArr[nw]?.id)) onLangChangeRef.current?.(langOf(wArr[nw].id)); // live-apply
          } else if (focusedZ !== null) {
            const maxZ = (CATEGORIES[focusedY!].xItems[focusedX!].zItems?.length ?? 1) - 1;
            goZ(focusedZ === maxZ ? 0 : focusedZ + 1);
          } else if (focusedX !== null) {
            const maxX = CATEGORIES[focusedY!].xItems.length - 1;
            goX(focusedX === maxX ? 0 : focusedX + 1);
          } else if (focusedY !== null) {
            const maxY = CATEGORIES.length - 1;
            goY(focusedY === maxY ? 0 : focusedY + 1);
          }
          break;
        }

        // ── Up ─────────────────────────────────────────────────
        case 'ArrowUp': {
          e.preventDefault();
          playUi('verticalUp');
          // Effects panel: ↑ increases the focused parameter's value
          if (isLibraryPanel && focusedW !== null && fxFocus !== null) {
            adjustFxValue(fxFocus, fxParam, 1);
            break;
          }
          // Idle intro: ↑ goes back to the previous (greyed) page
          if (isYIdle) { if (welcomePageIdx > 0) welcomePrev(); break; }
          // Settings V column navigation (takes priority)
          if (isSettingsCat && focusedV !== null) {
            const _itemIdU = focusedW !== null ? currentWItems[focusedW]?.id : undefined;
            // Inside the 5th column (value editor): ↑ increases the value
            if (_itemIdU === 'tts' && ttsValueActive) { adjustTtsParam(focusedV, 1); break; }
            if (focusedV > 0) {
              goV(focusedV - 1);
              if (isColorItem(_itemIdU)) setColorIdxOf(_itemIdU, focusedV - 1);
            }
            break;
          }
          if (inMB) {
            // Board: navigate rows (step = boardCols) among visible items
            if (focusedW === null) { break; }
            const pos = visIdx.indexOf(focusedW);
            if (pos >= boardCols) { goW(visIdx[pos - boardCols]); break; }
            // at first row → wrap to last row of the same column
            const col = pos % boardCols;
            let last = col;
            while (last + boardCols < MB) last += boardCols;
            goW(visIdx[last]);
            break;
          }
          if (inAG) {
            // Artist stack: step UP through search-filtered artists only
            if (artistVisX && focusedX !== null) {
              if (!artistVisX.length) break;
              const pos = artistVisX.indexOf(focusedX);
              const prev = pos === -1 ? 0 : (pos - 1 + artistVisX.length) % artistVisX.length;
              goX(artistVisX[prev]);
              break;
            }
          }
          // Library sound-player: step through search-filtered sounds only
          if (playerVisW && focusedW !== null) {
            if (!playerVisW.length) break;
            const pos = playerVisW.indexOf(focusedW);
            const prev = pos === -1 ? 0 : (pos - 1 + playerVisW.length) % playerVisW.length;
            goW(playerVisW[prev]);
            break;
          }
          // Regular columns: wrap to last item instead of going back a level
          if (focusedW !== null) {
            const wArr = (isArtistCat || isSettingsCat)
              ? CATEGORIES[focusedY!].xItems[focusedX!].wItems ?? []
              : CATEGORIES[focusedY!].xItems[focusedX!].zItems?.[focusedZ!]?.wItems ?? [];
            const maxW = (wArr.length || 1) - 1;
            const nw = focusedW === 0 ? maxW : focusedW - 1;
            goW(nw);
            if (isLangItem(wArr[nw]?.id)) onLangChangeRef.current?.(langOf(wArr[nw].id)); // live-apply
          } else if (focusedZ !== null) {
            const maxZ = (CATEGORIES[focusedY!].xItems[focusedX!].zItems?.length ?? 1) - 1;
            goZ(focusedZ === 0 ? maxZ : focusedZ - 1);
          } else if (focusedX !== null) {
            const maxX = CATEGORIES[focusedY!].xItems.length - 1;
            goX(focusedX === 0 ? maxX : focusedX - 1);
          } else if (focusedY !== null) {
            const maxY = CATEGORIES.length - 1;
            goY(focusedY === 0 ? maxY : focusedY - 1);
          }
          break;
        }
        // ── C — cycle Order By ─────────────────────────────────
        case 'c':
        case 'C': {
          e.preventDefault();
          setBoardOrderBy(prev => {
            const idx = prev === null ? -1 : ORDER_BY_CATS.indexOf(prev);
            const next = ORDER_BY_CATS[(idx + 1) % ORDER_BY_CATS.length]; return next; });
          break;
        }
        // ── G — toggle sort direction (ascending / descending) ──
        case 'g':
        case 'G': {
          e.preventDefault();
          setBoardSortAsc(a => !a);
          break;
        }
        // ── H — toggle board layout (2 / 4 columns) ─────────────
        case 'h':
        case 'H': {
          e.preventDefault();
          if (isNarrow) break;   // narrow viewport → single-column only
          setBoardCols(c => (c === 1 ? 2 : c === 2 ? 4 : 1));
          break;
        }

        // ── F — focus search bar (board / artists / library panel) ────
        case 'f':
        case 'F': {
          e.preventDefault();
          if (isMoodboard) {
            // Board view: focus the board search input
            searchInputRef.current?.focus();
          } else if (isArtistCat && focusedW === null) {
            // Artist gallery: focus the artist name search
            if (focusedX === null) goX(0);
            requestAnimationFrame(() => artistSearchInputRef.current?.focus());
          } else if (currentWItems.length > 0) {
            // Library / artist: enter W panel first if not already in it,
            // then defer focus so the input has time to mount after the re-render.
            if (focusedW === null) goW(0);
            requestAnimationFrame(() => playerSearchInputRef.current?.focus());
          }
          break;
        }

        // ── T — toggle the TTS avatar (idle intro, or artist bio) ──────
        case 't':
        case 'T': {
          if (isYIdle && ttsEnabled) { e.preventDefault(); toggleWelcomeSpeech(); }
          else if (isArtistCat && focusedX !== null && focusedW === null && ttsEnabled) { e.preventDefault(); toggleArtistSpeech(); }
          else if (isOnlineInfo && ttsEnabled) { e.preventDefault(); toggleArtistSpeech(); }
          else if (hoveredFxGroup !== null && ttsEnabled) { e.preventDefault(); toggleArtistSpeech(); }
          else if (navExplLabel !== null && ttsEnabled) { e.preventDefault(); toggleArtistSpeech(); }
          break;
        }

        // ── S — download current sound ─────────────────────────
        case 's':
        case 'S': {
          if (!isLibraryPanel || focusedW === null) break;
          e.preventDefault();
          downloadSound();
          break;
        }



        // ── Z — track held state for Z+Space combo ────────────────────────────
        case 'z': {
          zHeldRef.current = true;
          break;
        }

        // ── Space variants — restart / play-pause ─────────────────────────────
        case ' ': {
          if (isLibraryPanel && focusedW !== null) {
            e.preventDefault();

            // Z+Space → async audio: restart from in-point, decouple from video sync
            // Also put video in async mode so its bar keeps showing the real video position
            if (zHeldRef.current) {
              asyncAudioRef.current = true;
              setAsyncAudio(true);
              asyncVideoRef.current = true;
              setAsyncVideo(true);
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = soundStartRef.current;
                setSoundProgress(soundStartRef.current / (audio.duration || 1));
                if (audio.paused) {
                  playPendingRef.current = true;
                  audio.play()
                    .then(() => { playPendingRef.current = false; if (!audio.paused) { fadeIn(); startAudioRaf(); setIsPlaying(true); } })
                    .catch(() => { playPendingRef.current = false; });
                } else {
                  fadeIn(); startAudioRaf();
                }
              }
              break;
            }

            // Shift+Space → async video: restart from in-point, decouple from audio sync
            if (e.shiftKey) {
              asyncVideoRef.current = true;
              setAsyncVideo(true);
              const vid = videoRef.current;
              if (vid && videoUrl) {
                vid.currentTime = videoStartRef.current;
                setVideoCurrentTime(videoStartRef.current);
                if (vid.paused) vid.play().catch(() => {});
              }
              break;
            }

            // Plain Space → play/pause; re-engage full sync
            asyncVideoRef.current = false;
            setAsyncVideo(false);
            asyncAudioRef.current = false;
            setAsyncAudio(false);
            togglePlay();
            break;
          }
          if (!inMB || focusedW === null) break;
          e.preventDefault();
          setMutedVideos(prev => {
            const next = new Set(prev);
            if (next.has(focusedW)) { next.delete(focusedW); playUi('unmute'); }
            else                    { next.add(focusedW);    playUi('mute');   }
            return next;
          });
          flashMuteIcon(focusedW);
          break;
        }

        // ── W — pitch up (+1 semitone, tape mode: speed+pitch together) ────────
        case 'w':
        case 'W': {
          if (!isLibraryPanel || focusedW === null) break;
          e.preventDefault();
          const nextPitchUp = pitchSemitones + 1;
          setPitchSemitones(nextPitchUp);
          const a = audioRef.current;
          if (a) {
            const r = Math.pow(2, nextPitchUp / 12);
            a.playbackRate = r;
            setPlaybackRate(r);
            // Apply same rate to reverse node if active
            if (isReversedRef.current && reverseSrcRef.current)
              reverseSrcRef.current.playbackRate.value = Math.abs(r);
          }
          // Pitch shift → decouple video from audio sync; force video to real-time speed
          if (nextPitchUp !== 0) {
            asyncVideoRef.current = true;
            setAsyncVideo(true);
            if (videoRef.current) videoRef.current.playbackRate = 1;
          }
          break;
        }

        // ── A — pitch down (−1 semitone, tape mode: speed+pitch together) ──────
        case 'a':
        case 'A': {
          if (!isLibraryPanel || focusedW === null) break;
          e.preventDefault();
          const nextPitchDown = pitchSemitones - 1;
          setPitchSemitones(nextPitchDown);
          const a = audioRef.current;
          if (a) {
            const r = Math.pow(2, nextPitchDown / 12);
            a.playbackRate = r;
            setPlaybackRate(r);
            // Apply same rate to reverse node if active
            if (isReversedRef.current && reverseSrcRef.current)
              reverseSrcRef.current.playbackRate.value = Math.abs(r);
          }
          // Pitch shift → decouple video from audio sync; force video to real-time speed
          if (nextPitchDown !== 0) {
            asyncVideoRef.current = true;
            setAsyncVideo(true);
            if (videoRef.current) videoRef.current.playbackRate = 1;
          }
          break;
        }

        // ── R — toggle reverse playback ───────────────────────────────────────
        case 'r':
        case 'R': {
          if (!isLibraryPanel || focusedW === null) break;
          e.preventDefault();
          toggleReverse();
          break;
        }

        // ── U — upload video (keyboard shortcut) ──────────────────────────────
        // (L is reserved for the global language toggle — see App.tsx)
        case 'u':
        case 'U': {
          if (!isLibraryPanel || focusedW === null || videoUrl) break;
          e.preventDefault();
          videoUploadRef.current?.click();
          break;
        }

        // ── F7 — rewind to start ───────────────────────────────────────────────
        case 'F7': {
          if (!isLibraryPanel || focusedW === null) break;
          e.preventDefault();
          rewindSound();
          break;
        }

        // ── F9 — skip forward 10 s ─────────────────────────────────────────────
        case 'F9': {
          if (!isLibraryPanel || focusedW === null) break;
          e.preventDefault();
          skipForward();
          break;
        }

        // ── Tab — toggle focus between the sound list and the effects panel ────
        case 'Tab': {
          if (!isLibraryPanel || focusedW === null) break;
          e.preventDefault();
          if (fxFocus === null) { initFxChain(); setFxFocus(0); setFxParam(0); }
          else                  { setFxFocus(null); setFxParam(0); }
          playUi('conferma');
          break;
        }

        // ── Escape — exit the effects panel ─────────────────────────────────────
        case 'Escape': {
          if (!isLibraryPanel || focusedW === null || fxFocus === null) break;
          e.preventDefault();
          setFxFocus(null); setFxParam(0);
          playUi('undo');
          break;
        }

        // ── Enter — activate focused setting OR navigate forward (= ArrowRight) ─
        case 'Enter': {
          e.preventDefault();
          // Sound player effects panel: Enter toggles in/out of FX navigation mode.
          // Once inside, navigation IS the active mode — arrows directly move
          // between parameters / adjust values, no further Enter needed.
          // initFxChain() runs here (inside the keypress gesture) so the Web Audio
          // graph exists and parameter changes are actually audible.
          if (isLibraryPanel && focusedW !== null) {
            if (fxFocus === null) { initFxChain(); setFxFocus(0); setFxParam(0); playUi('conferma'); }
            else                  { setFxFocus(null); setFxParam(0); playUi('undo'); }
            break;
          }
          // Idle intro: advance to the next page of text instead of navigating.
          // Ometto keeps talking across the page change — Enter only blocks it
          // once the last page is reached (handled below, before exiting idle).
          if (isYIdle && welcomePageIdx < welcomePagesRef.current.length - 1) {
            welcomeNext(false);
            break;
          }
          // Last page: Enter now exits the intro — block ometto's playback.
          if (isYIdle && welcomePageIdx === welcomePagesRef.current.length - 1) {
            cancelTts(); setWelcomeMuted(true);
          }
          // Settings-specific handling takes priority
          if (isSettingsCat && focusedW !== null && focusedY !== null && focusedX !== null) {
            const item = currentWItems[focusedW];
            if (!item) break;
            if (item.id === 'ui-sounds') {
              if (focusedV === null) {
                goV(0);
              } else if (focusedV === 0) {
                const next = !uiSoundsMuted;
                setUiSoundsMuted(next); setUiMuted(next);
                localStorage.setItem('isamo-ui-muted', String(next));
              }
              // focusedV === 1 = volume: use ←→ to adjust, Enter is no-op
            }
            if (item.id === 'tts') {
              if (focusedV === null) {
                goV(0);
              } else if (focusedV === 0) {
                const next = !ttsEnabled;
                setTtsEnabledState(next);
                localStorage.setItem('isamo-tts', String(next));
              } else {
                setTtsValueActive(v => !v); // enter/exit the 5th-column value editor
              }
            }
            if (isColorItem(item.id)) {
              if (focusedV === null) goV(colorIdxOf(item.id));
              // in V: ↑↓ change colour, Enter is no-op
            }
            break;
          }
          // Navigation progress: Enter = ArrowRight (except inside moodboard grid)
          if (!inMB) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          }
          break;
        }

      }
    };
  }); // no deps — runs after every render to keep handler fresh

  // Register exactly ONE stable keydown listener for the component's lifetime.
  // The stable wrapper always delegates to the latest onKeyRef.current so the
  // handler never goes stale, and we never have more than one active listener.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyRef.current(e);
    const upHandler = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z') zHeldRef.current = false;
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', upHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', upHandler);
    };
  }, []);

  // Reset mute-confirm tracking when exiting the board
  useEffect(() => {
    if (focusedZ === null) lastMuteConfirmW.current = null;
  }, [focusedZ]);

  // Leaving a row / the setting exits the 5th-column value editor
  useEffect(() => { setTtsValueActive(false); }, [focusedV, focusedW]);

  // Board: if the selected item is no longer visible (search / sort), snap to first visible
  useEffect(() => {
    if (focusedZ === null || focusedW === null || focusedY === null || focusedX === null) return;
    if (CATEGORIES[focusedY].xItems[focusedX].label !== 'Board') return;
    const sorted = sortedBoardIdxRef.current;
    if (!sorted.includes(focusedW)) {
      if (sorted.length > 0) setFocusedW(sorted[0]);
    }
  }, [boardSearch, boardOrderBy, boardSortAsc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound-player: if the selected sound is hidden by the search, snap to the first match
  useEffect(() => {
    if (focusedY === null || focusedX === null || focusedZ === null || focusedW === null) return;
    if (isArtistCategory || isSettingsCategory) return;
    if (CATEGORIES[focusedY].xItems[focusedX].label === 'Board') return;
    const q = playerSearch.trim().toLowerCase();
    if (!q) return;
    const wArr = CATEGORIES[focusedY].xItems[focusedX].zItems?.[focusedZ]?.wItems ?? [];
    const match = (it: WItem) => it.title.toLowerCase().includes(q) || it.label.toLowerCase().includes(q);
    if (!wArr[focusedW] || !match(wArr[focusedW])) {
      const first = wArr.findIndex(match);
      if (first >= 0) setFocusedW(first);
    }
  }, [playerSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Artists: if the selected artist is hidden by the search, snap to the first match
  useEffect(() => {
    if (!isArtistCategory || focusedY === null || focusedX === null || focusedW !== null) return;
    const q = artistSearch.trim().toLowerCase();
    if (!q) return;
    const arr = CATEGORIES[focusedY].xItems;
    if (!arr[focusedX] || !arr[focusedX].label.toLowerCase().includes(q)) {
      const first = arr.findIndex(a => a.label.toLowerCase().includes(q));
      if (first >= 0) setFocusedX(first);
    }
  }, [artistSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-mute a video when it loses focus (it's no longer in playback)
  const prevFocusedW = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevFocusedW.current;
    if (prev !== null && prev !== focusedW) {
      setMutedVideos(m => new Set([...m, prev]));
    }
    prevFocusedW.current = focusedW;
  }, [focusedW]);

  // ── Scroll moodboard: centre the selected item on the XMB columns' axis ─
  // Instant scroll (not smooth): native smooth scrolling is rAF-driven and gets
  // throttled/paused in background tabs, leaving the item off-axis. Re-centre on
  // every relevant change, on the next frame (layout settling) and on resize.
  useEffect(() => {
    const inBoard = focusedY !== null && focusedX !== null
      && CATEGORIES[focusedY].xItems[focusedX].label === 'Board';
    if (!inBoard) return;
    // Centre the focused item if it's currently visible (search/sort filter it);
    // otherwise fall back to the first visible item (preview state or filtered out).
    const visible = sortedBoardIdxRef.current;
    const idx = (focusedW != null && visible.includes(focusedW)) ? focusedW : (visible[0] ?? 0);
    const center = (behavior: ScrollBehavior = 'smooth') => {
      const container = moodboardContainerRef.current;
      const item      = moodboardItemRefs.current[idx];
      if (!container || !item) return;
      const containerTop = container.getBoundingClientRect().top;
      const anchorCenter = window.innerHeight / 2 + (LOGO_TOP / 2 - 36); // XMB label centre (≈ 50% − 22px)
      const target = Math.max(0, item.offsetTop + item.offsetHeight / 2 + containerTop - anchorCenter);
      container.scrollTo({ top: target, behavior });
    };
    center();                                       // smooth glide to the selected item
    const raf = requestAnimationFrame(() => center()); // re-aim after layout settles
    const onResize = () => center('auto');          // snap instantly on resize (no animation)
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [focusedW, focusedY, focusedX, boardCols, boardSearch, boardOrderBy, boardSortAsc]);


  const currentXItems: ColItem[] = focusedY !== null
    ? CATEGORIES[focusedY].xItems : [];
  const currentZItems: ColItem[] = (focusedY !== null && focusedX !== null)
    ? (CATEGORIES[focusedY].xItems[focusedX].zItems ?? []) : [];

  // The X/Z columns remount when the category/item changes — drop any stale hover index
  // so the nav-explanation overlay doesn't keep pointing at a now-hidden item.
  useEffect(() => { setHoveredXIdx(null); setHoveredZIdx(null); }, [focusedY]);
  useEffect(() => { setHoveredZIdx(null); }, [focusedX]);

  const currentZPreviewSrc: string | null = (() => {
    if (focusedY === null) return null;
    const cat = CATEGORIES[focusedY];
    // Y-level (no X focused): use category-level preview if available
    if (focusedX === null) return cat.preview ?? null;
    const xi = cat.xItems[focusedX];
    // ZItem-level preview takes priority, then XItem-level (no category fallback when xItem is focused)
    if (focusedZ !== null && xi.zItems?.[focusedZ]?.preview) return xi.zItems[focusedZ].preview!;
    return xi.preview ?? null;
  })();
  const currentZPreviewFit: 'contain' | 'cover' = (() => {
    if (focusedY === null) return 'contain';
    const cat = CATEGORIES[focusedY];
    if (focusedX === null) return cat.previewFit ?? 'contain';
    const xi = cat.xItems[focusedX];
    if (focusedZ !== null && xi.zItems?.[focusedZ]?.preview) return xi.zItems[focusedZ].previewFit ?? 'contain';
    return xi.previewFit ?? 'contain';
  })();

  const _isMoodboard = focusedY !== null && focusedX !== null
    && CATEGORIES[focusedY].xItems[focusedX].label === 'Board';
  const inPanel = focusedW !== null && !_isMoodboard;

  // ── Sorted + filtered board indices ──────────────────────────────────────────
  // Computed every render so keyboard handler (via sortedBoardIdxRef) is always fresh.
  const _boardQ = boardSearch.trim().toLowerCase();
  const sortedBoardIdx = (() => {
    let indices = boardVideos
      .map((_, i) => i)
      .filter(i => boardItemMatches(boardVideos[i], i, _boardQ));
    if (boardOrderBy !== null) {
      const asc = boardSortAsc;
      indices = [...indices].sort((a, b) => {
        const va = boardVideos[a], vb = boardVideos[b];
        let cmp = 0;
        switch (boardOrderBy) {
          case 'Author':
            cmp = va.label.localeCompare(vb.label);
            break;
          case 'Date':
            cmp = (va.year ?? 0) - (vb.year ?? 0);
            break;
          case 'Sound Name':
            cmp = (va.tags?.[0] ?? '').localeCompare(vb.tags?.[0] ?? '');
            break;
        }
        return asc ? cmp : -cmp;
      });
    }
    return indices;
  })();
  // Sync to ref — read by the keyboard handler useEffect (stale-closure safe)
  sortedBoardIdxRef.current = sortedBoardIdx;

  // ── Derived flags — all computed before showPreview to avoid TDZ ─────────────
  const isSettingsCategory = focusedY !== null && CATEGORIES[focusedY].id === 'settings';
  const isOnlineUpload     = focusedY !== null && CATEGORIES[focusedY].id === 'community' && focusedX === 2;
  // Online → "..." — info text about the future Board (community section).
  const isOnlineInfo       = focusedY !== null && CATEGORIES[focusedY].id === 'community' && focusedX === 0;
  const isLibraryPanel     = inPanel && !_isMoodboard && !isSettingsCategory;
  const isSettingsPanel    = isSettingsCategory && focusedW !== null;
  const isSettingsVActive  = isSettingsPanel && focusedV !== null;
  // Account settings X item (work in progress — no W items, no preview video).
  const isAccountSection   = isSettingsCategory && focusedX !== null
    && CATEGORIES[focusedY!].xItems[focusedX].label === 'Account';

  // Settings keeps the preview area visible even when a W item is selected
  const showPreview = (focusedY !== null && !inPanel) || isSettingsPanel;
  const isYIdle     = focusedY === null;

  // TTS speaks only when the user clicks the text (see welcome overlay below).
  // Stop any speech + reset the icon when leaving the idle screen.
  useEffect(() => {
    if (!isYIdle) {
      cancelTts(); setWelcomeMuted(true);
      setWelcomePagesShown(1); setWelcomePageIdx(0);
      setTypedPages(new Set()); lastSpokenPageRef.current = -1;
    }
  }, [isYIdle]);
  // Measure the height of the pages ABOVE the focused one so its first line stays
  // anchored on the central axis (older pages scroll up, newer ones scroll down).
  useEffect(() => {
    let off = 0;
    for (let i = 0; i < welcomePageIdx; i++)
      off += (welcomePageRefs.current[i]?.offsetHeight ?? 0) + WELCOME_PAGE_GAP;
    setWelcomeShiftY(off);
  }, [welcomePageIdx, welcomePagesShown, isYIdle]);
  // Warm the cache so the first click isn't delayed by server generation.
  useEffect(() => {
    if (ttsEnabled && isYIdle) prefetch(welcomePagesRef.current[welcomePageIdx]);
  }, [ttsEnabled, ttsParams, isYIdle, welcomePageIdx]);

  // Artist category: xItems carry src + wItems directly (no Z level)
  const isArtistCategory = focusedY !== null
    && CATEGORIES[focusedY].xItems.some(xi => xi.src);

  // Show "enter sound player" hint when user is at the deepest nav level before W
  const showSoundPlayerHint = showPreview && !isArtistCategory && !_isMoodboard
    && focusedZ !== null && focusedW === null;
  // Same hint for artist category: shown when an artist is selected but no sound yet
  const showArtistSoundHint = isArtistCategory && focusedX !== null && !inPanel;

  const currentWItems: WItem[] = (() => {
    if (focusedY === null || focusedX === null) return [];
    // Artist + Settings both have wItems directly on xItem (no Z level)
    if (isArtistCategory || isSettingsCategory)
      return CATEGORIES[focusedY].xItems[focusedX].wItems ?? [];
    if (focusedZ === null) return [];
    return CATEGORIES[focusedY].xItems[focusedX].zItems?.[focusedZ]?.wItems ?? [];
  })();

  const isMoodboard = _isMoodboard;

  // ── Settings V items — labels for the 5th-column items ───────────────────────
  const settingsVItems: string[] = (() => {
    if (!isSettingsPanel || focusedW === null) return [];
    const item = currentWItems[focusedW];
    if (!item) return [];
    const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    if (item.id === 'ui-sounds') return [tLabel(uiSoundsMuted ? 'Off' : 'On', lang), `${uiSoundsVolume}%`];
    if (item.id === 'tts') return [
      tLabel(ttsEnabled ? 'On' : 'Off', lang),  // row 0 toggle — lives in the 4th column
      ...['Pitch', 'Speed', 'Quality', 'Tone', 'Accent', 'Inton.', 'Lang'].map(l => tLabel(l, lang)),
    ];
    if (isColorItem(item.id)) return COLOR_OPTIONS.map(c => tLabel(titleCase(c.name), lang));
    return [];
  })();

  // Parallel values for the Speech params — rendered (and selected) in the 5th column.
  // Row 0 (the on/off toggle) has no 5th-column value.
  const settingsVValues: (string | null)[] = (focusedW !== null && currentWItems[focusedW]?.id === 'tts')
    ? [
        null,
        String(ttsParams.pitch), String(ttsParams.speed), String(ttsParams.quality),
        String(ttsParams.tone), String(ttsParams.accent), String(ttsParams.intonation),
        ttsParams.lang.charAt(0).toUpperCase() + ttsParams.lang.slice(1),
      ]
    : [];

  // Breadcrumb path shown in library panel mode
  const playerBreadcrumb = (() => {
    if (focusedY === null) return '';
    const parts: string[] = [CATEGORIES[focusedY].label];
    if (focusedX !== null) parts.push(CATEGORIES[focusedY].xItems[focusedX].label);
    if (focusedZ !== null) {
      const zlabel = CATEGORIES[focusedY].xItems[focusedX].zItems?.[focusedZ]?.label;
      if (zlabel) parts.push(zlabel);
    }
    return parts.join('/');
  })();

  const showSoundList = inPanel
    || (isSettingsCategory && focusedX !== null);
  const soundListLeft = isArtistCategory && !inPanel
    ? PANEL_LEFT
    : isLibraryPanel
      ? LOGO_LEFT
      : isSettingsCategory
        ? SETTINGS_W_LEFT
        : PANEL_LEFT;

  // The id of the currently-selected sound (null when not in library panel or no W)
  const currentSoundId = isLibraryPanel && focusedW !== null
    ? currentWItems[focusedW]?.id ?? null
    : null;

  // ── Audio loading + event wiring ──────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current ?? (audioRef.current = new Audio());

    // ── Hard stop: clear all playback state (including reverse) ──────────────
    cancelAnimationFrame(reverseRafRef.current);
    try { reverseSrcRef.current?.stop(); } catch {}
    reverseSrcRef.current = null;
    isReversedRef.current = false;
    setIsReversed(false);

    audio.pause();
    playPendingRef.current = false;
    lastToggleRef.current  = 0;
    setIsPlaying(false);
    setSoundProgress(0);
    setSoundStartTime(0); soundStartRef.current = 0;
    setSoundEndTime(0);   soundEndRef.current   = 0;
    setSoundDuration(0);

    if (!currentSoundId) {
      audio.src = '';
      setPlaybackRate(1);
      setPitchSemitones(0);
      return;
    }

    // ── Load new sound ────────────────────────────────────────────────────────
    audio.src          = soundSrc(currentSoundId);
    audio.loop         = false;
    audio.playbackRate = 1;
    audio.preservesPitch = false;   // tape mode: W/A shift pitch + speed together
    setPlaybackRate(1);
    setPitchSemitones(0);

    const onMeta = () => {
      setLoadedDurations(prev => ({ ...prev, [currentSoundId]: formatDuration(audio.duration) }));
      setSoundDuration(audio.duration);
    };

    const onTime = () => {
      // Progress + out-point are handled by the RAF loop (frame-precise, smooth)
      // Video sync only runs while audio is actively playing and neither track is free-running
      if (audio.paused || asyncVideoRef.current || asyncAudioRef.current) return;
      const vid = videoRef.current;
      if (!vid || !videoUrlRef.current) return;
      const S            = videoStartRef.current;
      const rawDur       = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
      if (!rawDur) return;
      const E            = videoEndRef.current > S ? videoEndRef.current : rawDur;
      const effectiveDur = Math.max(0.01, E - S);

      // When pitch is shifted (playbackRate !== 1), the video should keep playing
      // at real-time speed. Don't force-sync its position to the (now-accelerated)
      // audio — that would make the video jump. Just ensure it's playing and let
      // the standalone [S, E] loop watcher handle wraparound.
      if (audio.playbackRate !== 1) {
        if (vid.paused) {
          if (vid.currentTime < S || vid.currentTime >= E) vid.currentTime = S;
          vid.play().catch(() => {});
        }
        return;
      }

      const target = S + (audio.currentTime % effectiveDur);

      if (vid.paused) {
        // Audio playing but video still paused (e.g. play() not yet called) — start it
        vid.currentTime = target;
        vid.play().catch(() => {});
      } else if (Math.abs(vid.currentTime - target) > 0.1) {
        // Correct drift or out-point wraparound
        vid.currentTime = target;
      }
    };

    const onEnded = () => {
      stopAudioRaf();
      setIsPlaying(false);
      setSoundProgress(0);
      if (audioBarFillRef.current) audioBarFillRef.current.style.transform = 'scaleX(0)';
      videoRef.current?.pause();
    };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate',     onTime);
    audio.addEventListener('ended',          onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate',     onTime);
      audio.removeEventListener('ended',          onEnded);
    };
  }, [currentSoundId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVideoUpload = (file: File) => {
    // Validate max duration via a temporary element (real check after metadata loads)
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    videoUrlRef.current = url;
    setVideoStartTime(0);
    videoStartRef.current = 0;
    setVideoEndTime(0);
    videoEndRef.current = 0;
    setVideoDuration(0);
  };

  const removeVideo = () => {
    if (videoRef.current) videoRef.current.pause();
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    setVideoUrl(null);
    videoUrlRef.current = null;
    setVideoStartTime(0);
    videoStartRef.current = 0;
    setVideoEndTime(0);
    videoEndRef.current = 0;
    setVideoDuration(0);
  };

  // ── Board video upload (Online → Upload) ─────────────────────────────────────
  const handleBoardVideoUpload = (file: File) => {
    const url  = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^.]+$/, ''); // strip extension
    const tags = isamoTags(file.name);
    const newVideo = { id: String(Date.now()), src: url, label: name, year: new Date().getFullYear(), tags };
    setBoardVideos(prev => {
      const newIdx = prev.length;
      setMutedVideos(m => new Set([...m, newIdx])); // start muted
      return [...prev, newVideo];
    });
    // Brief success flash
    setBoardUploadSuccess(true);
    setTimeout(() => setBoardUploadSuccess(false), 2200);
  };

  // ── Hard-stop reverse: kills AudioContext source + RAF, resets state ─────────
  const stopReverse = () => {
    if (!isReversedRef.current) return;
    cancelAnimationFrame(reverseRafRef.current);
    try { reverseSrcRef.current?.stop(); } catch {}
    reverseSrcRef.current = null;
    isReversedRef.current = false;
    setIsReversed(false);
  };

  // ── Audio scrubber seek ───────────────────────────────────────────────────────
  // Called on pointer-down/move over the audio progress bar.
  // Seeks audio to the clicked position and keeps video in sync.
  const seekSound = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const t = Math.max(0, Math.min(1, ratio)) * audio.duration;
    audio.currentTime = t;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    setSoundProgress(clampedRatio);
    if (audioBarFillRef.current) audioBarFillRef.current.style.transform = `scaleX(${clampedRatio})`;
    // Keep video in sync with the new audio position
    const vid = videoRef.current;
    if (vid && videoUrlRef.current && vid.readyState >= 1) {
      const S   = videoStartRef.current;
      const dur = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
      if (dur > 0) {
        const effectiveDur = Math.max(0.01, dur - S);
        vid.currentTime = S + (t % effectiveDur);
      }
    }
  };

  const setStartPoint = (ratio: number) => {
    if (!videoDuration) return;
    const end = videoEndRef.current || videoDuration;
    const t   = Math.max(0, Math.min(end - 0.1, ratio * videoDuration));
    setVideoStartTime(t);
    videoStartRef.current = t;
    if (videoRef.current && !isPlaying) videoRef.current.currentTime = t;
  };

  const setEndPoint = (ratio: number) => {
    if (!videoDuration) return;
    const t = Math.max(videoStartRef.current + 0.1, Math.min(videoDuration, ratio * videoDuration));
    setVideoEndTime(t);
    videoEndRef.current = t;
  };

  const setSoundStartPoint = (ratio: number) => {
    const dur = audioRef.current?.duration ?? 0;
    if (!dur) return;
    const end = soundEndRef.current || dur;
    const t   = Math.max(0, Math.min(end - 0.1, ratio * dur));
    setSoundStartTime(t);
    soundStartRef.current = t;
    if (!isPlaying && audioRef.current) audioRef.current.currentTime = t;
  };

  const setSoundEndPoint = (ratio: number) => {
    const dur = audioRef.current?.duration ?? 0;
    if (!dur) return;
    const t = Math.max(soundStartRef.current + 0.1, Math.min(dur, ratio * dur));
    setSoundEndTime(t);
    soundEndRef.current = t;
  };

  // ── FX chain init (lazy — called on first play inside a user gesture) ────────
  // Creates an AudioContext, wires the MediaElementSourceNode through
  // EQ → Reverb → Delay → Magic → destination. Guard prevents double-init.
  // ── Audio progress RAF — reads currentTime every frame, writes directly to DOM ─
  const startAudioRaf = () => {
    cancelAnimationFrame(audioRafRef.current);
    const tick = () => {
      const audio = audioRef.current;
      const bar   = audioBarFillRef.current;
      if (audio && bar) {
        const dur = audio.duration;
        if (dur) bar.style.transform = `scaleX(${audio.currentTime / dur})`;
        // Video progress fill — follows the video's real position (DOM-direct)
        const vh = videoSyncHeadRef.current;
        const vid = videoRef.current;
        if (vh && vid) {
          const vdur = isFinite(vid.duration) ? vid.duration : 0;
          if (vdur > 0) vh.style.transform = `scaleX(${vid.currentTime / vdur})`;
        }
        // Out-point check at frame precision — stop BOTH audio and the synced video
        const sE = soundEndRef.current;
        if (sE > 0 && !audio.paused && audio.currentTime >= sE) {
          fadeOut(() => { audio.pause(); vid?.pause(); });
          setIsPlaying(false);
          return;
        }
      }
      audioRafRef.current = requestAnimationFrame(tick);
    };
    audioRafRef.current = requestAnimationFrame(tick);
  };
  const stopAudioRaf = () => cancelAnimationFrame(audioRafRef.current);

  const FADE_S = 0.015; // 15 ms — inaudible but eliminates click transients

  const fadeIn = () => {
    const g = fadeGainRef.current; const ctx = fxCtxRef.current;
    if (!g || !ctx) return;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);
  };

  const fadeOut = (then: () => void) => {
    const g = fadeGainRef.current; const ctx = fxCtxRef.current;
    if (!g || !ctx) { then(); return; }
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S);
    setTimeout(then, FADE_S * 1000 + 8);
  };

  const initFxChain = () => {
    fxCtxRef.current?.resume().catch(() => {});
    if (fxInitRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const ctx = new AudioContext();
      fxCtxRef.current = ctx;

      // Source
      const src = ctx.createMediaElementSource(audio);
      fxSourceRef.current = src;

      // ── EQ 3 ──────────────────────────────────────────────────────────────
      // Nodes are seeded with the CURRENT state values (not hardcoded zeros) so
      // any effect set before the first play is reflected the moment audio runs.
      const eqL = ctx.createBiquadFilter();
      eqL.type = 'lowshelf'; eqL.frequency.value = 120; eqL.gain.value = eqLow;
      const eqM = ctx.createBiquadFilter();
      eqM.type = 'peaking'; eqM.frequency.value = 1000; eqM.Q.value = 0.8; eqM.gain.value = eqMid;
      const eqH = ctx.createBiquadFilter();
      eqH.type = 'highshelf'; eqH.frequency.value = 8000; eqH.gain.value = eqHigh;
      eqLowRef.current = eqL; eqMidRef.current = eqM; eqHighRef.current = eqH;

      // ── Reverb (ConvolverNode + synthetic IR) ──────────────────────────────
      const convolver = ctx.createConvolver();
      convolver.buffer = makeSyntheticIR(ctx, 2.2, 2.0);
      const revDry = ctx.createGain(); revDry.gain.value = 1 - reverbWet;
      const revWet = ctx.createGain(); revWet.gain.value = reverbWet;
      const revBus = ctx.createGain();
      reverbDryRef.current = revDry; reverbWetRef.current = revWet;

      // ── Delay (with gentle feedback) ───────────────────────────────────────
      const delay = ctx.createDelay(4.0);
      delay.delayTime.value = DELAY_TIMES[delayDivIdx];
      const delFB  = ctx.createGain(); delFB.gain.value = 0.32;
      const delDry = ctx.createGain(); delDry.gain.value = 1 - delayWet;
      const delWet = ctx.createGain(); delWet.gain.value = delayWet;
      const delBus = ctx.createGain();
      delayNodeRef.current = delay; delayDryRef.current = delDry; delayWetRef.current = delWet;

      // ── Flanger — single modulated delay line + feedback ────────────────────
      // Classic jet/swoosh: a short delay (~5 ms) swept by a slow sine LFO, with
      // feedback fed back into the delay for resonance. magicWet sets the mix.
      const magDry = ctx.createGain(); magDry.gain.value = 1 - magicWet;
      const magWet = ctx.createGain(); magWet.gain.value = magicWet; // master wet level
      const magBus = ctx.createGain();
      magicDryRef.current = magDry;
      magicWetRef.current = magWet;

      const flangerDelay = ctx.createDelay(0.02);
      flangerDelay.delayTime.value = 0.005;            // 5 ms base delay
      const flangerFB = ctx.createGain();
      flangerFB.gain.value = 0.5;                      // resonant "jet" feedback amount

      const flangerLfo = ctx.createOscillator();
      flangerLfo.type = 'sine';
      flangerLfo.frequency.value = FLANGER_RATE_MIN
        + (magicVoices - 1) / (MAGIC_MAX_V - 1) * (FLANGER_RATE_MAX - FLANGER_RATE_MIN);
      const flangerLfoGain = ctx.createGain();
      flangerLfoGain.gain.value = 0.004;               // ±4 ms sweep around the base delay
      flangerLfo.connect(flangerLfoGain); flangerLfoGain.connect(flangerDelay.delayTime);
      flangerLfo.start();

      flangerDelayRef.current = flangerDelay;
      flangerLfoRef.current = flangerLfo;

      // ── Wire it all together ──────────────────────────────────────────────
      // src → EQ chain
      src.connect(eqL); eqL.connect(eqM); eqM.connect(eqH);

      // EQ → Reverb (dry + wet → revBus)
      eqH.connect(revDry); eqH.connect(convolver);
      convolver.connect(revWet);
      revDry.connect(revBus); revWet.connect(revBus);

      // revBus → Delay (dry + wet w/ feedback → delBus)
      revBus.connect(delDry); revBus.connect(delay);
      delay.connect(delFB); delFB.connect(delay); // feedback loop
      delay.connect(delWet);
      delDry.connect(delBus); delWet.connect(delBus);

      // delBus → Flanger (dry + modulated-delay-with-feedback → magBus)
      delBus.connect(magDry);
      delBus.connect(flangerDelay);
      flangerDelay.connect(flangerFB); flangerFB.connect(flangerDelay); // feedback loop
      flangerDelay.connect(magWet);
      magDry.connect(magBus); magWet.connect(magBus);

      // magBus → fade gain → panner → speakers
      const fadeGain = ctx.createGain();
      fadeGain.gain.value = 0; // starts silent; ramped up on each play
      fadeGainRef.current = fadeGain;

      // ── Stereo panner (L ↔ R) ──────────────────────────────────────────────
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panNodeRef.current = panner;

      // ── Arpeggiatore — rhythmic gain gate (square LFO modulating a GainNode).
      // amount = 0 → depth 0, gate stays at gain 1 (no audible effect).
      const arpAmt0   = arpAmount / 100;
      const arpDepth0 = arpAmt0 / 2;
      const arpLfo = ctx.createOscillator();
      arpLfo.type = 'square';
      arpLfo.frequency.value = ARP_RATE_MIN + arpAmt0 * (ARP_RATE_MAX - ARP_RATE_MIN);
      const arpDepth = ctx.createGain(); arpDepth.gain.value = arpDepth0;
      const arpGate  = ctx.createGain(); arpGate.gain.value = 1 - arpDepth0;
      arpLfo.connect(arpDepth); arpDepth.connect(arpGate.gain);
      arpLfo.start();
      arpGateRef.current = arpGate; arpLfoRef.current = arpLfo; arpDepthRef.current = arpDepth;

      // ── Limiter — catches loud peaks before output ─────────────────────────
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -9;    // start limiting above -9 dBFS
      limiter.knee.value      = 0;     // hard knee — true limiter behaviour
      limiter.ratio.value     = 20;    // 20:1 ≈ brick-wall limiter
      limiter.attack.value    = 0.001; // 1 ms — catches fast transients
      limiter.release.value   = 0.15;  // 150 ms — natural release

      magBus.connect(fadeGain);
      fadeGain.connect(panner);
      panner.connect(arpGate);
      arpGate.connect(limiter);
      limiter.connect(ctx.destination);

      fxInitRef.current = true;
    } catch (err) {
      console.warn('[FX] init failed:', err);
    }
  };

  const togglePlay = () => {
    initFxChain(); // lazy-init + resume on every user play gesture
    const audio = audioRef.current;
    if (!audio || !currentSoundId) return;

    // In reverse mode: Space starts/pauses the reversed audio (doesn't exit reverse)
    if (isReversedRef.current) {
      if (reverseSrcRef.current) pauseReverseNode();
      else                       startReverseNode();
      return;
    }

    // Use audio.paused as ground truth (React state can lag by one render).
    if (!audio.paused) {
      // ── Pause — fade out then pause ────────────────────────────────────────
      setIsPlaying(false);
      playPendingRef.current = false;
      stopAudioRaf();
      const vid = videoRef.current;
      fadeOut(() => { audio.pause(); vid?.pause(); });
    } else {
      // ── Play — debounce double-fires (gamepad A + synthesised Space keydown)
      const now = performance.now();
      if (now - lastToggleRef.current < 80) return;
      lastToggleRef.current = now;
      if (playPendingRef.current) return;   // play() already in flight
      playPendingRef.current = true;

      // If we're parked at/after the out-point (or before the in-point), restart from
      // the in-point — otherwise play() instantly re-trips the out-point stop and the
      // progress bar freezes.
      const dur0  = audio.duration || 0;
      const inPt  = soundStartRef.current;
      const outPt = soundEndRef.current > 0 ? soundEndRef.current : dur0;
      if (dur0 && (audio.currentTime >= outPt - 0.02 || audio.currentTime < inPt)) {
        audio.currentTime = inPt;
        setSoundProgress(inPt / (dur0 || 1));
      }

      audio.play().then(() => {
        playPendingRef.current = false;
        if (audio.paused) return;           // paused while promise was in flight
        fadeIn();
        startAudioRaf();
        setIsPlaying(true);

        // Sync video position and start playback
        const vid = videoRef.current;
        if (!vid || !videoUrlRef.current || vid.readyState < 1) return;
        const S          = videoStartRef.current;
        const rawDur     = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
        const E          = videoEndRef.current > S ? videoEndRef.current : rawDur;
        const effectiveDur = E > 0 ? Math.max(0.01, E - S) : 0;
        const target       = effectiveDur > 0 ? S + (audio.currentTime % effectiveDur) : S;
        vid.playbackRate   = 1; // video always plays at real-time speed regardless of pitch

        if (Math.abs(vid.currentTime - target) < 0.5) {
          vid.play().catch(() => {});
        } else {
          const onSeeked = () => {
            vid.removeEventListener('seeked', onSeeked);
            if (!audio.paused) vid.play().catch(() => {});
          };
          vid.addEventListener('seeked', onSeeked);
          vid.currentTime = target;
        }
      }).catch(() => { playPendingRef.current = false; });
    }
  };



  const rewindSound = () => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    setSoundProgress(0);
    const vid = videoRef.current;
    if (vid) vid.currentTime = videoStartRef.current;
  };

  // ── Reverse playback toggle ───────────────────────────────────────────────────
  // Uses AudioContext to decode, reverse, and replay the buffer from the same
  // position.  Toggling off restores forward playback at the mirrored position.
  const toggleReverse = async () => {
    const audio = audioRef.current;
    if (!audio || !currentSoundId) return;

    // Kill any stale reverse node before doing anything (prevents double playback)
    if (reverseSrcRef.current && !isReversedRef.current) {
      try { reverseSrcRef.current.stop(); } catch {}
      reverseSrcRef.current = null;
    }

    if (!isReversedRef.current) {
      // ── Enter reverse mode — set flag + pre-decode, NO auto-play, NO video ──
      const duration = isFinite(audio.duration) ? audio.duration : 0;
      if (!duration) return;

      // Pause normal playback if running. Reverse arms but doesn't auto-play, so the
      // video must stop too — otherwise it keeps looping on its own [S,E] watcher with
      // no sound. Also kill the forward progress RAF so it doesn't linger.
      stopAudioRaf();
      const vid = videoRef.current;
      if (!audio.paused) {
        setIsPlaying(false);
        fadeOut(() => { audio.pause(); vid?.pause(); });
      } else {
        vid?.pause();
      }

      isReversedRef.current = true;
      setIsReversed(true);

      const ctx: AudioContext = fxCtxRef.current ?? reverseCtxRef.current ?? (() => {
        const c = new AudioContext(); reverseCtxRef.current = c; return c;
      })();
      reverseCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      // Decode + cache reversed buffer
      if (!reverseBufRef.current || reverseBufRef.current.id !== currentSoundId) {
        const resp = await fetch(audio.src);
        const ab   = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        for (let ch = 0; ch < decoded.numberOfChannels; ch++)
          decoded.getChannelData(ch).reverse();
        reverseBufRef.current = { id: currentSoundId, buf: decoded };
      }

      // Store starting offset (from current audio position)
      reversePauseOffset.current = Math.max(
        0, reverseBufRef.current.buf.duration - audio.currentTime
      );

    } else {
      // ── Exit reverse mode — stop node, restore position ────────────────────
      cancelAnimationFrame(reverseRafRef.current);

      const ctx     = reverseCtxRef.current;
      const elapsed = (ctx && reverseSrcRef.current)
        ? ctx.currentTime - reverseCtxStart.current : 0;
      const resumePos = Math.max(0, reverseStartPos.current - elapsed);

      try { reverseSrcRef.current?.stop(); } catch {}
      reverseSrcRef.current = null;
      isReversedRef.current = false;
      setIsReversed(false);
      setIsPlaying(false);
      videoRef.current?.pause();

      if (audio) {
        audio.currentTime = resumePos;
        const dur = isFinite(audio.duration) ? audio.duration : 1;
        setSoundProgress(resumePos / dur);
      }
    }
  };

  const downloadOriginal = () => {
    if (!currentSoundId) return;
    const a = document.createElement('a');
    a.href     = soundSrc(currentSoundId);
    a.download = `${currentSoundId}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Download — bakes the current FX chain into the file, if any effect is active ──
  // Mirrors the live graph built in initFxChain(), but rendered offline (no realtime
  // playback) so the export reflects EQ / Reverb / Pan / Delay / Flanger / Arp / Pitch
  // / Reverse exactly as currently set. With everything at its default (neutral) value,
  // downloads the original MP3 untouched.
  const downloadSound = async () => {
    if (!currentSoundId) return;

    const rate = playbackRate || 1;
    const effectsActive =
      eqLow !== 0 || eqMid !== 0 || eqHigh !== 0 ||
      reverbWet > 0 || delayWet > 0 || magicWet > 0 ||
      arpAmount > 0 || pan !== 0 || rate !== 1 || isReversed;

    if (!effectsActive) { downloadOriginal(); return; }

    try {
      const resp    = await fetch(soundSrc(currentSoundId));
      const ab      = await resp.arrayBuffer();
      const decCtx  = new AudioContext();
      const decoded = await decCtx.decodeAudioData(ab);
      decCtx.close();

      if (isReversed) {
        for (let ch = 0; ch < decoded.numberOfChannels; ch++)
          decoded.getChannelData(ch).reverse();
      }

      // + 3s tail so reverb/delay decay isn't cut off at the end of the buffer.
      const outLength = Math.ceil(decoded.duration / Math.abs(rate) * decoded.sampleRate)
        + decoded.sampleRate * 3;
      const offline = new OfflineAudioContext(decoded.numberOfChannels, outLength, decoded.sampleRate);

      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.playbackRate.value = Math.abs(rate);

      // ── EQ 3 ────────────────────────────────────────────────────────────────
      const eqL = offline.createBiquadFilter();
      eqL.type = 'lowshelf'; eqL.frequency.value = 120; eqL.gain.value = eqLow;
      const eqM = offline.createBiquadFilter();
      eqM.type = 'peaking'; eqM.frequency.value = 1000; eqM.Q.value = 0.8; eqM.gain.value = eqMid;
      const eqH = offline.createBiquadFilter();
      eqH.type = 'highshelf'; eqH.frequency.value = 8000; eqH.gain.value = eqHigh;

      // ── Reverb ──────────────────────────────────────────────────────────────
      const convolver = offline.createConvolver();
      convolver.buffer = makeSyntheticIR(offline, 2.2, 2.0);
      const revDry = offline.createGain(); revDry.gain.value = 1 - reverbWet;
      const revWet = offline.createGain(); revWet.gain.value = reverbWet;
      const revBus = offline.createGain();

      // ── Delay ───────────────────────────────────────────────────────────────
      const delay = offline.createDelay(4.0);
      delay.delayTime.value = DELAY_TIMES[delayDivIdx];
      const delFB  = offline.createGain(); delFB.gain.value = 0.32;
      const delDry = offline.createGain(); delDry.gain.value = 1 - delayWet;
      const delWet = offline.createGain(); delWet.gain.value = delayWet;
      const delBus = offline.createGain();

      // ── Flanger ─────────────────────────────────────────────────────────────
      const magDry = offline.createGain(); magDry.gain.value = 1 - magicWet;
      const magWet = offline.createGain(); magWet.gain.value = magicWet;
      const magBus = offline.createGain();
      const flangerDelay = offline.createDelay(0.02);
      flangerDelay.delayTime.value = 0.005;
      const flangerFB = offline.createGain(); flangerFB.gain.value = 0.5;
      const flangerLfo = offline.createOscillator();
      flangerLfo.type = 'sine';
      flangerLfo.frequency.value = FLANGER_RATE_MIN
        + (magicVoices - 1) / (MAGIC_MAX_V - 1) * (FLANGER_RATE_MAX - FLANGER_RATE_MIN);
      const flangerLfoGain = offline.createGain(); flangerLfoGain.gain.value = 0.004;
      flangerLfo.connect(flangerLfoGain); flangerLfoGain.connect(flangerDelay.delayTime);

      // ── Arpeggiatore ────────────────────────────────────────────────────────
      const arpAmt0   = arpAmount / 100;
      const arpDepth0 = arpAmt0 / 2;
      const arpLfo = offline.createOscillator();
      arpLfo.type = 'square';
      arpLfo.frequency.value = ARP_RATE_MIN + arpAmt0 * (ARP_RATE_MAX - ARP_RATE_MIN);
      const arpDepth = offline.createGain(); arpDepth.gain.value = arpDepth0;
      const arpGate  = offline.createGain(); arpGate.gain.value = 1 - arpDepth0;
      arpLfo.connect(arpDepth); arpDepth.connect(arpGate.gain);

      // ── Pan + limiter ───────────────────────────────────────────────────────
      const panner = offline.createStereoPanner();
      panner.pan.value = pan;
      const limiter = offline.createDynamicsCompressor();
      limiter.threshold.value = -9; limiter.knee.value = 0;
      limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.15;

      // ── Wire it all together (same topology as initFxChain) ───────────────────
      src.connect(eqL); eqL.connect(eqM); eqM.connect(eqH);

      eqH.connect(revDry); eqH.connect(convolver);
      convolver.connect(revWet);
      revDry.connect(revBus); revWet.connect(revBus);

      revBus.connect(delDry); revBus.connect(delay);
      delay.connect(delFB); delFB.connect(delay);
      delay.connect(delWet);
      delDry.connect(delBus); delWet.connect(delBus);

      delBus.connect(magDry);
      delBus.connect(flangerDelay);
      flangerDelay.connect(flangerFB); flangerFB.connect(flangerDelay);
      flangerDelay.connect(magWet);
      magDry.connect(magBus); magWet.connect(magBus);

      magBus.connect(panner);
      panner.connect(arpGate);
      arpGate.connect(limiter);
      limiter.connect(offline.destination);

      src.start();
      flangerLfo.start();
      arpLfo.start();

      const rendered = await offline.startRendering();
      const blob = audioBufferToWav(rendered);
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href     = url;
      a.download = `${currentSoundId}-fx.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[download] FX render failed, falling back to original file:', err);
      downloadOriginal();
    }
  };

  const skipForward = () => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    a.currentTime = Math.min(a.duration, a.currentTime + 10);
  };



  // ── Start reverse node from current pauseOffset (called by togglePlay) ───────
  const startReverseNode = () => {
    const ctx     = reverseCtxRef.current;
    const decoded = reverseBufRef.current?.buf;
    const audio   = audioRef.current;
    if (!ctx || !decoded || !isReversedRef.current) return;

    const offset = reversePauseOffset.current;
    const src    = ctx.createBufferSource();
    src.buffer   = decoded;
    src.playbackRate.value = Math.abs(audio?.playbackRate ?? 1);
    src.connect(eqLowRef.current ?? ctx.destination);

    reverseSrcRef.current    = src;
    reverseStartPos.current  = audio ? Math.max(0, decoded.duration - offset) : 0;
    reverseCtxStart.current  = ctx.currentTime;

    src.onended = () => {
      if (!isReversedRef.current) return;
      cancelAnimationFrame(reverseRafRef.current);
      reverseSrcRef.current = null;
      setIsPlaying(false);
      // Stay in reverse mode — reset to the end so Space replays the reverse again
      reversePauseOffset.current = 0;
      const dur = audioRef.current?.duration ?? 0;
      if (audioRef.current) audioRef.current.currentTime = dur;
      setSoundProgress(1);
      if (audioBarFillRef.current) audioBarFillRef.current.style.transform = 'scaleX(1)';
      // Stop the independently-running video too
      videoRef.current?.pause();
    };

    // Video: play forward independently (async, not synced to reverse audio)
    asyncVideoRef.current = true;
    setAsyncVideo(true);
    const vid = videoRef.current;
    if (vid && vid.paused) vid.play().catch(() => {});

    fadeIn();
    src.start(0, offset);
    setIsPlaying(true);

    const tick = () => {
      if (!isReversedRef.current || !reverseSrcRef.current) return;
      const elapsed = ctx.currentTime - reverseCtxStart.current;
      const pos     = Math.max(0, reverseStartPos.current - elapsed);
      const dur     = isFinite(decoded.duration) ? decoded.duration : 1;
      const progress = pos / dur;
      setSoundProgress(progress);
      if (audioBarFillRef.current) audioBarFillRef.current.style.transform = `scaleX(${progress})`;
      reverseRafRef.current = requestAnimationFrame(tick);
    };
    reverseRafRef.current = requestAnimationFrame(tick);
  };

  // ── Pause reverse node (records offset so playback can resume) ────────────
  const pauseReverseNode = () => {
    const ctx = reverseCtxRef.current;
    if (!ctx || !reverseSrcRef.current) return;
    const elapsed = ctx.currentTime - reverseCtxStart.current;
    // Advance the pause offset by how far we've played
    reversePauseOffset.current = Math.min(
      (reverseBufRef.current?.buf.duration ?? 0),
      reversePauseOffset.current + elapsed
    );
    cancelAnimationFrame(reverseRafRef.current);
    fadeOut(() => { try { reverseSrcRef.current?.stop(); } catch {} });
    reverseSrcRef.current = null;
    setIsPlaying(false);
    // Pause video too
    videoRef.current?.pause();
  };

  // ── Sync layoutRef after every render so permanent listeners read fresh state ─
  useEffect(() => {
    layoutRef.current = {
      mb: isMoodboard,
      ip: inPanel,
      fz: focusedZ,
      ac: isArtistCategory,
    };
  });

  // Clear fromBoard when the user manually navigates away from the library panel
  useEffect(() => {
    if (!isLibraryPanel) { setFromBoard(false); boardReturnPath.current = null; }
  }, [isLibraryPanel]);


  // ── Gesture-settle wheel scroll ───────────────────────────────────────────────
  // Strategy: one snap per physical gesture.
  // After a snap fires we block further snaps until wheel events stop arriving for
  // GESTURE_SETTLE_MS (≈150 ms). This absorbs trackpad momentum without needing a
  // fixed cooldown, and still allows rapid repeated deliberate scrolls.
  useEffect(() => {
    let accY = 0;
    let accX = 0;
    let blocked = false;          // true while momentum from the last snap is draining
    let settleTimer = 0;          // setTimeout id — reset on every wheel event
    const MB = boardVideos.length;
    const GESTURE_SETTLE_MS = 150;

    function resetSettle() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        // Events have stopped → momentum is gone, ready for next gesture
        blocked = false;
        accY = 0;
        accX = 0;
      }, GESTURE_SETTLE_MS);
    }

    function fireSnap(fn: () => void) {
      accY = 0; accX = 0;
      blocked = true;   // block until gesture settles
      playUi('click');
      fn();
    }

    const onWheel = (e: WheelEvent) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      // Idle intro: vertical scroll pages through the intro text (back & forth)
      if (focusedY === null) {
        if (absX > absY) return;
        e.preventDefault();
        resetSettle();
        if (blocked) return;
        accY += e.deltaY;
        if (Math.abs(accY) < WHEEL_THRESHOLD) return;
        const dir = accY > 0 ? 1 : -1;
        fireSnap(() => { if (dir === 1) welcomeNext(); else welcomePrev(); });
        return;
      }

      // Derive the active scroll column from navigation focus (deepest level wins)
      const { mb } = layoutRef.current;
      const col: string | null = (() => {
        if (focusedY === null) return null;
        if (mb) return focusedZ !== null ? 'MB' : null;
        if (focusedW !== null) return 'W';
        if (focusedZ !== null) return 'Z';
        if (focusedX !== null) return 'X';
        return 'Y';
      })();

      if (!col && absX <= absY) return;
      e.preventDefault();

      // Reset the settle timer on every event so we know when momentum stops
      resetSettle();

      // While blocked (momentum draining after last snap): ignore input
      if (blocked) return;

      // ── Horizontal scroll → advance / retreat navigation level ──────────────
      if (absX > absY) {
        accX += e.deltaX;
        if (Math.abs(accX) < WHEEL_THRESHOLD) return;
        const dirH: 1 | -1 = accX > 0 ? 1 : -1;

        if (dirH === 1) {
          fireSnap(() => {
            if (focusedY === null) { goY(0); return; }
            if (focusedX === null) { goX(0); return; }
            const xi = CATEGORIES[focusedY].xItems[focusedX];
            if (xi.label === 'Board') {
              if (focusedZ === null) { setFocusedZ(0); setFocusedW(0); }
              else if (focusedW !== null && focusedW % boardCols < boardCols - 1 && focusedW + 1 < MB)
                goW(focusedW + 1);
            } else if (xi.src !== undefined || (xi.wItems?.length && !xi.zItems?.length)) {
              // Artist (src) or Settings (wItems direct, no zItems)
              if (focusedW === null && xi.wItems?.length) goW(0);
            } else {
              if (focusedZ === null && xi.zItems?.length) goZ(0);
              else if (focusedZ !== null && focusedW === null && xi.zItems?.[focusedZ]?.wItems?.length)
                goW(0);
            }
          });
        } else {
          fireSnap(() => {
            if (focusedY === null) return;
            const xi2 = focusedX !== null ? CATEGORIES[focusedY].xItems[focusedX] : null;
            const isMB2 = xi2?.label === 'Board' && focusedZ !== null;
            if (isMB2) {
              if (focusedW !== null && focusedW % boardCols !== 0) goW(focusedW - 1);
              else goZ(null);
            } else if (focusedW !== null) goW(null);
            else if (focusedZ !== null)   goZ(null);
            else if (focusedX !== null)   goX(null);
            else                          goY(null);
          });
        }
        return;
      }

      // ── Vertical scroll → item navigation within focused column ─────────────
      if (!col) return;
      accY += e.deltaY;
      if (Math.abs(accY) < WHEEL_THRESHOLD) return;
      const dir: 1 | -1 = accY > 0 ? 1 : -1;

      switch (col) {
        case 'Y':
          fireSnap(() => {
            if (focusedY === null) { goY(dir === 1 ? 0 : CATEGORIES.length - 1); return; }
            goY((focusedY + dir + CATEGORIES.length) % CATEGORIES.length);
          });
          break;
        case 'X': {
          if (focusedY === null) break;
          const xLen = CATEGORIES[focusedY].xItems.length;
          fireSnap(() => {
            if (focusedX === null) { goX(dir === 1 ? 0 : xLen - 1); return; }
            goX((focusedX + dir + xLen) % xLen);
          });
          break;
        }
        case 'Z': {
          if (focusedY === null || focusedX === null) break;
          const zItems = CATEGORIES[focusedY].xItems[focusedX].zItems ?? [];
          if (!zItems.length) break;
          fireSnap(() => {
            if (focusedZ === null) { goZ(dir === 1 ? 0 : zItems.length - 1); return; }
            goZ((focusedZ + dir + zItems.length) % zItems.length);
          });
          break;
        }
        case 'W': {
          if (focusedY === null || focusedX === null) break;
          const isAC = CATEGORIES[focusedY].xItems.some(xi => xi.src);
          const isSC = CATEGORIES[focusedY].id === 'settings';
          if (!isAC && !isSC && focusedZ === null) break;
          const wItems = (isAC || isSC)
            ? CATEGORIES[focusedY].xItems[focusedX].wItems ?? []
            : CATEGORIES[focusedY].xItems[focusedX].zItems?.[focusedZ]?.wItems ?? [];
          if (!wItems.length) break;
          fireSnap(() => {
            if (focusedW === null) { goW(dir === 1 ? 0 : wItems.length - 1); return; }
            goW((focusedW + dir + wItems.length) % wItems.length);
          });
          break;
        }
        case 'MB': {
          if (focusedZ === null) { fireSnap(() => { setFocusedZ(0); setFocusedW(0); }); break; }
          if (focusedW === null) { fireSnap(() => setFocusedW(0)); break; }
          if (dir === 1) {
            const next = focusedW + boardCols;
            fireSnap(() => goW(next < MB ? next : focusedW! % boardCols));
          } else {
            if (focusedW >= boardCols) { fireSnap(() => goW(focusedW! - boardCols)); break; }
            const c = focusedW % boardCols; let last = c;
            while (last + boardCols < MB) last += boardCols;
            fireSnap(() => goW(last));
          }
          break;
        }
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [focusedY, focusedX, focusedZ, focusedW, boardCols]); // fresh closure on every nav change

  // ── Gamepad navigation ────────────────────────────────────────────────────────
  // cbRef in useGamepadNav is updated after every render, so onConfirm always
  // sees the latest isMoodboard / focusedW / setMutedVideos — no stale closure.
  useGamepadNav({
    onUp:         () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp',    bubbles: true })),
    onDown:       () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown',  bubbles: true })),
    onLeft:       () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft',  bubbles: true })),
    onRight:      () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    onStickRight: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    onConfirm: () => {
      if (cursorState.active) return;
      if (isSettingsPanel) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return;
      }
      if (isLibraryPanel && focusedW !== null) { togglePlay(); return; }
      if (isMoodboard && focusedW !== null) {
        if (lastMuteConfirmW.current === focusedW) {
          setMutedVideos(prev => {
            const next = new Set(prev);
            if (next.has(focusedW)) { next.delete(focusedW); playUi('unmute'); }
            else                    { next.add(focusedW);    playUi('mute');   }
            return next;
          });
        } else {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        }
        lastMuteConfirmW.current = focusedW;
      }
    },
    onBack: () => {
      if (isSettingsVActive) { goV(null); return; }   // exit V → back to W preview
      if (isSettingsPanel)   { goW(null); return; }   // exit W → back to X
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    },
    onLB: () => {
      // In sound player → retrigger audio; otherwise → back (ArrowLeft)
      if (isLibraryPanel && focusedW !== null) {
        asyncAudioRef.current = true; setAsyncAudio(true);
        asyncVideoRef.current = true; setAsyncVideo(true);
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0; setSoundProgress(0);
          if (audio.paused) {
            playPendingRef.current = true;
            audio.play()
              .then(() => { playPendingRef.current = false; if (!audio.paused) setIsPlaying(true); })
              .catch(() => { playPendingRef.current = false; });
          }
        }
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      }
    },
    onBDown:    () => { if (fromBoard && isLibraryPanel) setBHoldActive(true); },
    onBUp:      () => setBHoldActive(false),
    onBackHeld: () => { setBHoldActive(false); if (fromBoard) backToBoard(); },
    onSlowdown: () => {
      // LT → pitch down (tape mode, same as A key)
      if (!isLibraryPanel || focusedW === null) return;
      const nextPitch = pitchSemitones - 1;
      setPitchSemitones(nextPitch);
      const a = audioRef.current;
      if (a) {
        const r = Math.pow(2, nextPitch / 12);
        a.playbackRate = r;
        setPlaybackRate(r);
        if (isReversedRef.current && reverseSrcRef.current)
          reverseSrcRef.current.playbackRate.value = Math.abs(r);
      }
      if (nextPitch !== 0) {
        asyncVideoRef.current = true; setAsyncVideo(true);
        if (videoRef.current) videoRef.current.playbackRate = 1;
      }
    },
    onSpeedup: () => {
      // RT → pitch up (tape mode, same as W key)
      if (!isLibraryPanel || focusedW === null) return;
      const nextPitch = pitchSemitones + 1;
      setPitchSemitones(nextPitch);
      const a = audioRef.current;
      if (a) {
        const r = Math.pow(2, nextPitch / 12);
        a.playbackRate = r;
        setPlaybackRate(r);
        if (isReversedRef.current && reverseSrcRef.current)
          reverseSrcRef.current.playbackRate.value = Math.abs(r);
      }
      if (nextPitch !== 0) {
        asyncVideoRef.current = true; setAsyncVideo(true);
        if (videoRef.current) videoRef.current.playbackRate = 1;
      }
    },
    onY: () => {
      // In sound player with no video loaded → trigger upload; otherwise keep C behaviour
      if (isLibraryPanel && focusedW !== null && !videoUrl) {
        videoUploadRef.current?.click();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', bubbles: true }));
      }
    },
    onSelect:  () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', bubbles: true })),
    onRB:      () => { if (isLibraryPanel && focusedW !== null) toggleReverse(); },
  });

  return (
    <motion.div
      key="home-screen"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 480, damping: 32, mass: 0.8, delay: 0.1,
                    opacity: { duration: 0.2, ease: 'easeOut', delay: 0.1 } }}
      style={{ width: '100vw', height: '100vh', background: 'var(--ui-bg)',
               position: 'relative', fontFamily: FONT, overflow: 'hidden' }}
    >
      {/* ── Back-to-board button (top-left, appears after pill deep-link) ─── */}
      <AnimatePresence>
        {fromBoard && isLibraryPanel && (
          <motion.div
            key="back-to-board"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            whileHover={{ opacity: 0.5 }}
            onClick={backToBoard}
            style={{
              position: 'absolute', top: 14, left: 6,
              display: 'flex', alignItems: 'center', gap: 6,
              pointerEvents: 'auto', cursor: 'pointer',
            }}
          >
            {/* B icon with circular progress ring (controller mode hold) */}
            <span style={{ position: 'relative', width: 18, height: 18, display: 'inline-flex',
                           alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {/* Circular progress ring — shown while B is held */}
              <AnimatePresence>
                {bHoldActive && (
                  <motion.svg
                    key="b-ring"
                    width={18} height={18}
                    style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible',
                             transform: 'rotate(-90deg)', transformOrigin: '9px 9px' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    <motion.circle
                      cx={9} cy={9} r={10}
                      fill="none"
                      style={{ stroke: 'var(--ui-fg)' }}
                      strokeWidth={2}
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1, ease: 'linear' }}
                    />
                  </motion.svg>
                )}
              </AnimatePresence>
              {inputMode === 'controller' && (
                <Icon name="controller-B" size={FS_SMALL} color="var(--ui-complement)" style={{ opacity: 0.5 }} />
              )}
            </span>
            <span style={{ fontSize: FS_SMALL, fontFamily: FONT, color: 'var(--ui-fg)',
                           lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>
              {inputMode === 'controller' ? 'Hold B to go back to home' : 'back to'}
            </span>
            {inputMode !== 'controller' && (
              <>
                <Icon name="board" size={FS_SMALL} color="var(--ui-fg)" style={{ position: 'relative', top: -1 }} />
                <span style={{ fontSize: FS_SMALL, fontFamily: FONT, color: 'var(--ui-fg)',
                               lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>
                  Board
                </span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top-left info (ometto) — shows the explanation for the FX group on hover,
             or for the category / sub-category being browsed during navigation. ── */}
      <AnimatePresence>
        {(hoveredFxGroup !== null || navExplLabel !== null) && artistBio && (
          <motion.div
            key="top-left-info"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: 'absolute', top: TOP_INFO_TOP, left: LOGO_LEFT,
              // Full left-side width, up to the Z column / right-side panels.
              right: `calc(100% - ${Z_LEFT - 16}px)`,
              display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              pointerEvents: 'none',
            }}
          >
            {ttsEnabled && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
                <Icon name="key-t" size={FS_SMALL} color="var(--ui-fg)" style={{ opacity: 0.5 }} />
                <motion.div
                  data-magnet="strong"
                  onMouseEnter={() => { setArtistHovered(true); playUi('hover'); }}
                  onMouseLeave={() => setArtistHovered(false)}
                  onClick={toggleArtistSpeech}
                  animate={{ opacity: !artistMuted ? 1 : artistHovered ? 0.6 : 0.22 }}
                  transition={{ duration: 0.25 }}
                  style={{ cursor: 'pointer' }}
                >
                  <Icon name={talkFrame ? 'ometto-talk' : 'ometto-mute'} size={54}
                    color={(!artistMuted || artistHovered) ? 'var(--ui-complement)' : 'var(--ui-fg)'}
                    style={{ transition: 'color 0.15s ease' }} />
                </motion.div>
              </div>
            )}
            {/* Nav-explanation text is intentionally faint — a passive hint, not a focal element. */}
            <div style={{ flex: 1, opacity: (hoveredFxGroup === null && navExplLabel !== null) ? 0.45 : 1 }}>
              <FxExplanationText text={artistBio} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sound Player effects-mode hint (top-left) — shown while a sound is open
             and no FX group is hovered (so it never overlaps the FX explanation). ── */}
      <AnimatePresence>
        {isLibraryPanel && focusedW !== null && hoveredFxGroup === null && (
          <motion.div
            key="sp-effects-hint"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 0.45, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: 'absolute', top: TOP_INFO_TOP, left: LOGO_LEFT,
              // Full left-side width, up to the Z column / right-side panels.
              right: `calc(100% - ${Z_LEFT - 16}px)`,
              display: 'flex', flexDirection: 'column', gap: 6,
              pointerEvents: 'none',
              fontSize: FS_SMALL, fontFamily: FONT, color: 'var(--ui-fg)', letterSpacing: '0.04em', lineHeight: 1.3,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap', gap: 6 }}>
              {S.pressPrefix}
              <Icon name="key-enter" size={FS_SMALL} color="var(--ui-complement)" style={{ alignSelf: 'baseline' }} />
              {S.fxEnterHint}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap', gap: 6 }}>
              {S.pressPrefix}
              <Icon name="esc" size={FS_SMALL} color="var(--ui-complement)" style={{ alignSelf: 'baseline' }} />
              {S.fxEscHint}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Logo — rendered once at the App level so it persists across the
             splash → home transition (never re-mounts, never animates). ── */}

      {/* ── Y-axis ────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', left: NAV_LEFT, top: ANCHOR_TOP, pointerEvents: 'auto' }}>
        {CATEGORIES.map((cat, i) => {
          const isSelected = focusedY === i;
          const d = focusedY !== null ? i - focusedY : 0;
          let y = ANCHOR_Y, op = 0.22;
          if (focusedY === null)       { y = ANCHOR_Y + i * 24; op = 0.22; }
          else if (focusedX !== null)  { const s = lockedSlot(d); y = ANCHOR_Y + s.dy; op = s.op; }
          else                         { const s = slot(d);        y = ANCHOR_Y + s.dy; op = s.op; }

          const displayOp = isLibraryPanel ? (isSelected ? op : 0) : (hoveredYIdx === i ? 1 : op);

          return (
            <motion.div key={cat.id} animate={{ y, opacity: displayOp }} transition={NAV_SPRING}
              data-magnet="strong"
              onMouseEnter={() => { setHoveredYIdx(i); playUi('hover'); }}
              onMouseLeave={() => setHoveredYIdx(null)}
              onClick={() => { goY(i); playUi('click'); }}
              style={{ position: 'absolute', top: 0, left: 0, height: ICON_PX,
                       display: 'flex', alignItems: 'center', overflow: 'visible',
                       cursor: 'pointer',
                       pointerEvents: (isLibraryPanel && !isSelected) ? 'none' : 'auto' }}
            >
              {/* Sequential "pop" entrance on mount (after the splash transition) */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...XMB_POP, delay: XMB_ENTER_BASE + i * XMB_ENTER_STEP }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35em',
                         width: NAV_BRACKET_W, transformOrigin: 'left center' }}
              >
                <motion.span animate={{ opacity: isSelected ? 1 : 0 }} transition={{ duration: 0.15 }}
                  style={{ fontSize: FS_SMALL, lineHeight: 1, color: swColor(i), flexShrink: 0 }}>(</motion.span>
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <Icon name={cat.icon} size={FS_SMALL} color={swColor(i)} />
                </span>
                <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
                  <motion.span
                    ref={el => { yLabelRefs.current[i] = el; }}
                    animate={{ left: isSelected ? '50%' : '0%', x: isSelected ? '-50%' : '0%' }}
                    transition={NAV_SPRING}
                    style={{ position: 'absolute', top: '50%', y: '-50%',
                             fontSize: FS_SMALL, color: swColor(i),
                             whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}
                  >
                    {tLabel(cat.label, lang)}
                  </motion.span>
                </span>
                <motion.span animate={{ opacity: isSelected ? 1 : 0 }} transition={{ duration: 0.15 }}
                  style={{ fontSize: FS_SMALL, lineHeight: 1, color: swColor(i), flexShrink: 0 }}>)</motion.span>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* ── X-axis ────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {focusedY !== null && (
          <motion.div key={`x-${focusedY}-${isArtistCategory}`}
            initial={false} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <XmbCol left={X_LEFT} items={currentXItems} focused={focusedX}
              isActive={focusedX === null} isLocked={focusedZ !== null || isSettingsPanel}
              onSelect={goX} panelMode={isLibraryPanel} lang={lang}
              onHoverChange={setHoveredXIdx}
              colorFn={swagSeed != null ? (i => swagColorFor(i + 7, swagSeed)) : undefined} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Z-axis ────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {focusedX !== null && currentZItems.length > 0 && !isMoodboard && !isArtistCategory && (
          <motion.div key={`z-${focusedY}-${focusedX}`}
            initial={false} animate={{ opacity: isLibraryPanel ? 0 : 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <XmbCol left={Z_LEFT} items={currentZItems} focused={focusedZ}
              isActive={focusedZ === null} isLocked={isLibraryPanel}
              onSelect={goZ} lang={lang}
              onHoverChange={setHoveredZIdx}
              colorFn={swagSeed != null ? (i => swagColorFor(i + 23, swagSeed)) : undefined} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Library panel: "Sound player" label at Z column ───── */}
      <AnimatePresence>
        {isLibraryPanel && !isArtistCategory && (
          <motion.div
            key="sound-player-label"
            initial={{ opacity: 0 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            whileHover={{ opacity: 0.5 }}
            onClick={() => { goW(null); playUi('horizontalLeft'); }}
            style={{
              position: 'absolute', left: Z_LEFT, top: ANCHOR_TOP,
              height: ICON_PX, display: 'flex', alignItems: 'center', gap: '0.35em',
              width: NAV_BRACKET_W,
              pointerEvents: 'auto', cursor: 'pointer',
            }}
          >
            {/* Always "selected" — full double-bracket system, same as the Home Z column */}
            <span style={{ fontSize: FS_SMALL, lineHeight: 1, color: 'var(--ui-fg)', flexShrink: 0 }}>(</span>
            <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
              <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                             fontSize: FS_SMALL, fontFamily: FONT, color: 'var(--ui-fg)',
                             whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}>
                {(() => {
                  if (focusedY === null || focusedX === null) return tLabel('Sound player', lang);
                  const xi = CATEGORIES[focusedY].xItems[focusedX];
                  // Artist category: X column already shows the artist name — label this level "Sounds"
                  if (xi.src !== undefined) return tLabel('Sounds', lang);
                  // Library category: show the Z-level subcategory (e.g. "X-Axis")
                  if (focusedZ !== null) return tLabel(xi.zItems?.[focusedZ]?.label ?? xi.label, lang);
                  return tLabel(xi.label, lang);
                })()}
              </span>
            </span>
            <span style={{ fontSize: FS_SMALL, lineHeight: 1, color: 'var(--ui-fg)', flexShrink: 0 }}>)</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Library panel: search bar ─────────────────────────── */}
      <AnimatePresence>
        {isLibraryPanel && (
          <motion.div
            key="player-search"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'absolute',
              top: `calc(${ANCHOR_TOP} + 48px)`,
              left: LOGO_LEFT,
              // Same right edge as the sound list rows below (soundListLeft +
              // PREVIEW_SQUARE_SIZE-based right inset), so the divider rule
              // spans the same width as the list it sits above.
              right: `calc(6px + ${PREVIEW_SQUARE_SIZE})`,
              display: 'flex', alignItems: 'center', gap: 8,
              height: ICON_PX + 8,
              borderBottom: '1px solid var(--border)',
              pointerEvents: 'auto',
            }}
          >
            <Icon name={inputMode === 'controller' ? 'select' : 'key-f'} size={FS_SMALL} color="var(--ui-complement)" />
            <input
              ref={playerSearchInputRef}
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              onFocus={() => setPlayerSearchFocused(true)}
              onBlur={() => setPlayerSearchFocused(false)}
              onKeyDown={e => {
                if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')
                  playKeyboardSound();
              }}
              placeholder="..."
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontFamily: FONT_FAT, fontSize: FS_SMALL, lineHeight: 1,
                color: 'var(--ui-fg)', background: 'transparent',
                letterSpacing: '0.04em',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Artists: name search bar — top, aligned to the 2nd column (X_LEFT) ── */}
      <AnimatePresence>
        {isArtistCategory && focusedX !== null && focusedW === null && (
          <motion.div
            key="artist-search"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'absolute',
              top: 16,
              left: X_LEFT,
              right: `calc(100% - ${Z_LEFT - 16}px)`,
              display: 'flex', alignItems: 'center', gap: 8,
              height: ICON_PX + 8,
              borderBottom: '1px solid var(--border)',
              pointerEvents: 'auto',
            }}
          >
            <Icon name={inputMode === 'controller' ? 'select' : 'key-f'} size={FS_SMALL} color="var(--ui-complement)" style={{ opacity: 0.5 }} />
            <input
              ref={artistSearchInputRef}
              value={artistSearch}
              onChange={e => setArtistSearch(e.target.value)}
              onFocus={() => setArtistSearchFocused(true)}
              onBlur={() => setArtistSearchFocused(false)}
              onKeyDown={e => {
                if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')
                  playKeyboardSound();
              }}
              placeholder="..."
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontFamily: FONT_FAT, fontSize: FS_SMALL, lineHeight: 1,
                color: 'var(--ui-fg)', background: 'transparent',
                letterSpacing: '0.04em',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle / breadcrumb replaced by collapsed Y + X column items */}

      {/* ── Welcome / about text — visible in initial idle state ── */}
      <AnimatePresence>
        {isYIdle && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.05 } }}
            exit={{ opacity: 0, x: -10, transition: { duration: 0.18, ease: [0.4, 0, 1, 0.6] } }}
            style={{
              position:      'absolute',
              left:           PANEL_LEFT,
              // Anchor so the CURRENT page's first line sits on the central axis.
              top:            `calc(${ANCHOR_TOP} + ${ICON_PX / 2 - (FS_LARGE * 1.1) / 2}px)`,
              right:          48,
            }}
          >
            {/* Stack of revealed pages — shifts up so the latest page anchors the axis */}
            <motion.div
              animate={{ y: -welcomeShiftY }}
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ display: 'flex', flexDirection: 'column', gap: WELCOME_PAGE_GAP }}
            >
              {welcomePagesRef.current.slice(0, welcomePagesShown).map((t, i) => {
                const isCurrentPage = i === welcomePageIdx;
                return (
                  <motion.div
                    key={i}
                    ref={el => { welcomePageRefs.current[i] = el; }}
                    onClick={() => setWelcomePageIdx(i)}
                    animate={{ opacity: isCurrentPage ? 1 : 0.32 }}  // non-focused pages greyed out
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                  >
                    <WelcomePage
                      text={t}
                      active={isYIdle}
                      hasMore={isCurrentPage && welcomePageIdx < welcomePagesRef.current.length - 1}
                      onDone={() => setTypedPages(s => s.has(i) ? s : new Set(s).add(i))}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TTS talking-mouth avatar — click (or T) to speak; T hint to its left ── */}
      <AnimatePresence>
        {isYIdle && ttsEnabled && (
          <motion.div
            key="tts-t"
            initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', left: Z_LEFT - 8 - ICON_PX,
                     top: `calc(${ANCHOR_TOP} + ${ICON_PX / 2}px)`,
                     transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <Icon name="key-t" size={FS_SMALL} color="var(--ui-fg)" />
          </motion.div>
        )}
        {isYIdle && ttsEnabled && (
          <motion.div
            key="tts-avatar"
            data-magnet="strong"
            onMouseEnter={() => { setWelcomeHovered(true); playUi('hover'); }}
            onMouseLeave={() => setWelcomeHovered(false)}
            onClick={toggleWelcomeSpeech}
            initial={{ opacity: 0 }}
            animate={{ opacity: !welcomeMuted ? 1 : welcomeHovered ? 0.6 : 0.22 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', left: Z_LEFT,
                     top: `calc(${ANCHOR_TOP} + ${ICON_PX / 2}px)`,
                     transform: 'translateY(-50%)', cursor: 'pointer' }}
          >
            <Icon name={talkFrame ? 'ometto-talk' : 'ometto-mute'} size={54}
              color={(!welcomeMuted || welcomeHovered) ? 'var(--ui-complement)' : 'var(--ui-fg)'}
              style={{ transition: 'color 0.15s ease' }} />
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── Preview Space ─────────────────────────────────────── */}
      <AnimatePresence>
        {showPreview && !isMoodboard && !isOnlineUpload && (!isArtistCategory || focusedX === null) && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 0.6] } }}
            style={{
              // Preview space is ALWAYS square — side fits the available area,
              // right-aligned and vertically centred.
              position: 'absolute',
              right: 6,
              top: `calc(50% - ${PREVIEW_SQUARE_SIZE} / 2)`,
              width: PREVIEW_SQUARE_SIZE,
              height: PREVIEW_SQUARE_SIZE,
              pointerEvents: 'none',
            }}
          >
            {/* Preview shape from preview.svg — hidden when settings panel is active */}
            {!isSettingsPanel && !isOnlineInfo && (
              <svg
                viewBox="0 0 1080.25 1080.25"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                preserveAspectRatio="none"
              >
                <polygon
                  style={{ fill: 'var(--ui-preview-bg)' }}
                  points="946.37 134.27 946.37 .04 940.26 .04 811.9 .04 641.94 .04 134.47 .04 134.47 134.27 0 134.27 0 945.36 134.47 945.36 134.47 1080.17 268.35 1080.17 641.94 1080.17 940.26 1080.17 946.37 1080.17 946.37 945.36 1080.25 945.36 1080.25 134.27 946.37 134.27"
                />
              </svg>
            )}

            {currentZPreviewSrc && !isSettingsPanel ? (
              /* GIF or MP4 preview masked to the preview.svg polygon shape */
              <div style={{
                position: 'absolute', inset: 0,
                clipPath: [
                  'polygon(',
                  '87.61% 12.43%,', '87.61% 0%,',
                  '87.04% 0%,',     '75.16% 0%,',
                  '59.43% 0%,',     '12.45% 0%,',
                  '12.45% 12.43%,', '0% 12.43%,',
                  '0% 87.51%,',     '12.45% 87.51%,',
                  '12.45% 100%,',   '24.84% 100%,',
                  '59.43% 100%,',   '87.04% 100%,',
                  '87.61% 100%,',   '87.61% 87.51%,',
                  '100% 87.51%,',   '100% 12.43%',
                  ')',
                ].join(' '),
              }}>
                {currentZPreviewSrc.endsWith('.mp4') ? (
                  <video
                    key={currentZPreviewSrc}
                    src={currentZPreviewSrc}
                    autoPlay loop muted playsInline
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      objectFit: currentZPreviewFit,
                      objectPosition: 'center',
                    }}
                  />
                ) : (
                  <img
                    src={currentZPreviewSrc}
                    alt=""
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      objectFit: currentZPreviewFit,
                      objectPosition: 'center',
                    }}
                  />
                )}
              </div>
            ) : !isSettingsCategory && !isOnlineInfo ? (
              <span style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: FS_SMALL, color: 'var(--ui-fg)', opacity: 0.35, letterSpacing: '0.04em', fontFamily: FONT,
              }}>
                Preview Space
              </span>
            ) : null}

            {/* ── Account section — work in progress notice (centred on the XMB axis) ── */}
            {isAccountSection && (
              <div style={{
                position: 'absolute', left: 0, right: 0,
                top: `calc(50% + ${LOGO_TOP / 2 - 36}px)`, transform: 'translateY(-50%)',
                paddingLeft: '16%', paddingRight: '8%',
              }}>
                <AccountText lang={lang} />
              </div>
            )}

            {/* ── Online "..." — info text about the future Board (centred on the XMB axis) ── */}
            {isOnlineInfo && (
              <div style={{
                position: 'absolute', left: 0, right: 0,
                top: `calc(50% + ${LOGO_TOP / 2 - 36}px)`, transform: 'translateY(-50%)',
                paddingLeft: '16%', paddingRight: '8%',
                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4%',
              }}>
                {/* Talking-mouth avatar — same as the Artists "..." bio; T to toggle */}
                {ttsEnabled && (
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
                    <Icon name="key-t" size={FS_SMALL} color="var(--ui-fg)" style={{ opacity: 0.5 }} />
                    <motion.div
                      data-magnet="strong"
                      onMouseEnter={() => { setArtistHovered(true); playUi('hover'); }}
                      onMouseLeave={() => setArtistHovered(false)}
                      onClick={toggleArtistSpeech}
                      animate={{ opacity: !artistMuted ? 1 : artistHovered ? 0.6 : 0.22 }}
                      transition={{ duration: 0.25 }}
                      style={{ cursor: 'pointer' }}
                    >
                      <Icon name={talkFrame ? 'ometto-talk' : 'ometto-mute'} size={54}
                        color={(!artistMuted || artistHovered) ? 'var(--ui-complement)' : 'var(--ui-fg)'}
                        style={{ transition: 'color 0.15s ease' }} />
                    </motion.div>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <OnlineInfoText lang={lang} />
                </div>
              </div>
            )}

            {/* ── Sound player entry hint (library categories) ── */}
            <AnimatePresence>
              {showSoundPlayerHint && (
                <motion.div
                  key={`sound-player-hint-${inputMode}`}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0, transition: { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.05 } }}
                  exit={{ opacity: 0, x: -10, transition: { duration: 0.18, ease: [0.4, 0, 1, 0.6] } }}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center',
                    paddingLeft: '14%', paddingRight: '14%',
                    pointerEvents: 'none',
                    mixBlendMode: 'difference',
                  }}
                >
                  <SoundPlayerHintText inputMode={inputMode} lang={lang} />
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Artist bio + hint (standalone, no preview background) ── */}
      <AnimatePresence>
        {isArtistCategory && focusedX !== null && focusedY !== null && !inPanel && (
          <motion.div
            key={`artist-text-${focusedX}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.05 } }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            style={{
              position: 'absolute',
              // Sit right after the artist A–Z timeline column so the ometto + bio
              // never overlap the letters.
              left: ARTIST_TIMELINE_LEFT + ARTIST_TIMELINE_W,
              // Anchor so the bio's FIRST line (and the ometto) sit on the central axis
              top: `calc(${ANCHOR_TOP} + ${ICON_PX / 2}px)`,
              right: 0, bottom: 0,
              pointerEvents: 'none',
              display: 'flex', flexDirection: 'row',
              paddingLeft: 24, paddingRight: 48,
              gap: '4%',
              alignItems: 'flex-start',
            }}
          >
            {/* Talking-mouth avatar — centred on the axis; T to toggle */}
            {ttsEnabled && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
                            pointerEvents: 'auto', marginTop: -27 /* centre the 54px ometto on the axis */ }}>
                <Icon name="key-t" size={FS_SMALL} color="var(--ui-fg)" style={{ opacity: 0.5 }} />
                <motion.div
                  data-magnet="strong"
                  onMouseEnter={() => { setArtistHovered(true); playUi('hover'); }}
                  onMouseLeave={() => setArtistHovered(false)}
                  onClick={toggleArtistSpeech}
                  animate={{ opacity: !artistMuted ? 1 : artistHovered ? 0.6 : 0.22 }}
                  transition={{ duration: 0.25 }}
                  style={{ cursor: 'pointer' }}
                >
                  <Icon name={talkFrame ? 'ometto-talk' : 'ometto-mute'} size={54}
                    color={(!artistMuted || artistHovered) ? 'var(--ui-complement)' : 'var(--ui-fg)'}
                    style={{ transition: 'color 0.15s ease' }} />
                </motion.div>
              </div>
            )}
            {/* Bio — first line centred on the axis (takes most of the width) */}
            <div style={{ flex: 3, marginTop: -(FS_LARGE * 1.1) / 2 }}>
              <ArtistBioText bio={S.artistBios[CATEGORIES[focusedY].xItems[focusedX].label] ?? ''} onDone={() => setBioDone(true)} />
            </div>
            {/* Sound player hint — small text; blinks (fading) once the bio finishes typing */}
            {showArtistSoundHint && (
              <motion.div
                style={{ flex: 1, marginTop: -(FS_SMALL * 1.1) / 2 }}
                animate={{ opacity: bioDone ? [1, 0.18, 1] : 1 }}
                transition={bioDone
                  ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.2 }}
              >
                <SoundPlayerHintText inputMode={inputMode ?? 'keyboard'} lang={lang} color='var(--ui-complement)' fontSize={FS_SMALL} iconColor="var(--ui-complement)" iconSize={FS_SMALL} />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Settings V column (ON/OFF · Volume%) ────────────────── */}
      <AnimatePresence>
        {isSettingsPanel && settingsVItems.length > 0 && (
          <motion.div
            key="settings-v"
            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: 'absolute',
              left: SETTINGS_V_LEFT,   // names at the 4th column
              top: ANCHOR_TOP,
              pointerEvents: 'auto',
            }}
          >
            {settingsVItems.map((label, i) => {
              const isItemFocused = focusedV === i;
              let y: number, op: number;
              if (focusedV === null) {
                y  = i * 24; op = i === 0 ? 0.55 : 0.35;
              } else {
                const d = i - focusedV;
                const s = slot(d);
                y  = ANCHOR_Y + s.dy;
                op = Math.abs(d) > 3 ? 0 : s.op;
              }

              const wId = focusedW !== null ? currentWItems[focusedW]?.id : undefined;
              const handleClick = () => {
                if (isItemFocused) {
                  // Re-click focused item → activate
                  if (i === 0 && wId === 'ui-sounds') {
                    const next = !uiSoundsMuted;
                    setUiSoundsMuted(next); setUiMuted(next);
                    localStorage.setItem('isamo-ui-muted', String(next));
                  } else if (wId === 'tts') {
                    // Row 0 toggles on/off; param rows step up (click) — wrap via adjust
                    adjustTtsParam(i, 1);
                  }
                  // color item focused: no-op (already selected)
                } else {
                  goV(i);
                  if (isColorItem(wId)) setColorIdxOf(wId, i);
                }
              };

              const vColor = isColorItem(wId) ? COLOR_OPTIONS[i].hex : 'var(--ui-fg)';
              const vFocused = isItemFocused && !(settingsVValues[i] != null && wId === 'tts' && ttsValueActive);
              const valFocused = isItemFocused && ttsValueActive;
              return (
                <motion.div
                  key={`v-${i}`}
                  animate={{ y, opacity: op }}
                  transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                  onClick={handleClick}
                  onMouseEnter={() => playUi('hover')}
                  style={{
                    position: 'absolute', top: 0, left: 0, height: ICON_PX,
                    display: 'flex', alignItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {/* Label bracket group */}
                  <div style={{ display: 'flex', alignItems: 'center', width: NAV_BRACKET_W }}>
                    <motion.span animate={{ opacity: vFocused ? 1 : 0 }} transition={{ duration: 0.15 }}
                      style={{ fontSize: FS_SMALL, lineHeight: 1, color: vColor, flexShrink: 0 }}>(</motion.span>
                    <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
                      <motion.span
                        animate={{ left: vFocused ? '50%' : '0%', x: vFocused ? '-50%' : '0%' }}
                        transition={NAV_SPRING}
                        style={{ position: 'absolute', top: '50%', y: '-50%',
                                 fontSize: FS_SMALL, fontFamily: FONT, color: vColor,
                                 whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}
                      >
                        {label}
                      </motion.span>
                    </span>
                    <motion.span animate={{ opacity: vFocused ? 1 : 0 }} transition={{ duration: 0.15 }}
                      style={{ fontSize: FS_SMALL, lineHeight: 1, color: vColor, flexShrink: 0 }}>)</motion.span>
                  </div>
                  {/* Value bracket group — TTS params (5th column) */}
                  {settingsVValues[i] != null && (
                    <div style={{ position: 'absolute', left: COLUMN_GAP,
                                  display: 'flex', alignItems: 'center', height: ICON_PX, width: NAV_BRACKET_W }}>
                      <motion.span animate={{ opacity: valFocused ? 1 : 0 }} transition={{ duration: 0.15 }}
                        style={{ fontSize: FS_SMALL, lineHeight: 1, color: 'var(--ui-fg)', flexShrink: 0 }}>(</motion.span>
                      <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
                        <motion.span
                          animate={{ left: valFocused ? '50%' : '0%', x: valFocused ? '-50%' : '0%' }}
                          transition={NAV_SPRING}
                          style={{ position: 'absolute', top: '50%', y: '-50%',
                                   fontSize: FS_SMALL, fontFamily: FONT, color: 'var(--ui-fg)',
                                   whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}
                        >
                          {settingsVValues[i]}
                        </motion.span>
                      </span>
                      <motion.span animate={{ opacity: valFocused ? 1 : 0 }} transition={{ duration: 0.15 }}
                        style={{ fontSize: FS_SMALL, lineHeight: 1, color: 'var(--ui-fg)', flexShrink: 0 }}>)</motion.span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TTS settings preview avatar — speaks a sample on every change ── */}
      <AnimatePresence>
        {isSettingsPanel && focusedW !== null && currentWItems[focusedW]?.id === 'tts' && (
          <motion.div
            key="tts-settings-avatar"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', left: SETTINGS_AVATAR_LEFT,
                     top: `calc(${ANCHOR_TOP} + ${ICON_PX / 2}px)`,
                     transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <Icon name={talkFrame ? 'ometto-talk' : 'ometto-mute'} size={54} color="var(--ui-fg)" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Library panel: upload / clip space (right) ─────────── */}
      <AnimatePresence>
        {isLibraryPanel && (
          <motion.div
            key="upload-space"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ ...XMB_POP, delay: 0.04 }}
            style={{
              // Preview space is ALWAYS square — side fits the available area,
              // right-aligned and vertically centred (same as the Home preview space).
              position: 'absolute',
              right: 6,
              top: `calc(50% - ${PREVIEW_SQUARE_SIZE} / 2)`,
              width: PREVIEW_SQUARE_SIZE,
              height: PREVIEW_SQUARE_SIZE,
              pointerEvents: 'auto', transformOrigin: 'center',
            }}
            onClick={() => { if (!videoUrl) videoUploadRef.current?.click(); }}
            onDragEnter={e => {
              e.preventDefault();
              dragCounterRef.current++;
              if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
            }}
            onDragLeave={() => {
              dragCounterRef.current--;
              if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragOver(false); }
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              dragCounterRef.current = 0;
              setIsDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('video/')) handleVideoUpload(file);
            }}
          >
            {/* Hidden file input */}
            <input
              ref={videoUploadRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ''; }}
            />

            <AnimatePresence mode="wait">
            {videoUrl ? (
              /* ── Video mode ───────────────────────────────────── */
              <motion.div
                key="video-mode"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: 0, background: 'var(--ui-bg)', overflow: 'hidden' }}
              >

                {/* Video — native aspect ratio, fully contained above the bar (no crop) */}
                <div
                  onMouseEnter={() => setVideoHovered(true)}
                  onMouseLeave={() => setVideoHovered(false)}
                  style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0,
                  bottom: 38 + TRANSPORT_PROG_H + 8 + TRANSPORT_CTL_H + 10, /* top of bar + gap */
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                }}>
                  {/* Remove-clip overlay — centred on the clip, blended over the video
                      (difference), same size as the upload icon. Appears on hover; click removes. */}
                  <div
                    style={{
                      position: 'absolute', inset: 0, zIndex: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: videoHovered ? 1 : 0,
                      transition: 'opacity 0.2s ease',
                      mixBlendMode: 'difference',
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      onClick={e => { e.stopPropagation(); removeVideo(); }}
                      style={{ cursor: 'pointer', pointerEvents: videoHovered ? 'auto' : 'none', display: 'flex' }}>
                      <Icon name="trash" size="13vh" color="#fff" />
                    </span>
                  </div>
                  <video
                    ref={el => { videoRef.current = el; if (el) { el.muted = true; } }}
                    src={videoUrl}
                    playsInline
                    onLoadedMetadata={e => {
                      const v = e.currentTarget;
                      if (v.duration > 60) { removeVideo(); return; }
                      setVideoDuration(v.duration);
                      // Init end point to full duration on first load
                      if (videoEndRef.current === 0) {
                        setVideoEndTime(v.duration);
                        videoEndRef.current = v.duration;
                      }
                      v.currentTime = videoStartRef.current;
                    }}
                    style={{
                      // Fill the preview width (touch the horizontal limits); height keeps
                      // the native ratio and is capped so it never overflows under the bar.
                      width: '100%', height: 'auto', maxHeight: '100%', display: 'block',
                    }}
                  />
                </div>

                {/* ── Video transport bar — absolute at bottom:38 so its bottom edge
                    sits 44 px from the viewport (panel.bottom:6 + 38 = 44),
                    aligned with the audio bar at bottom:44.                    */}
                <div style={{
                  position: 'absolute', bottom: 38, left: 0, right: 0,
                  background: 'var(--ui-bg)',
                  pointerEvents: 'auto',
                }}>

                  {/* ── Scrubber row — in/out handles ── */}
                  <div
                    data-scrubber="video"
                    style={{
                      position: 'relative', height: TRANSPORT_PROG_H,
                      overflow: 'visible',   // handles extend beyond bar height
                      cursor: isPlaying ? 'default' : 'ew-resize',
                    }}
                    onPointerDown={e => {
                      if (isPlaying) return;
                      e.stopPropagation();
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                      const rect   = e.currentTarget.getBoundingClientRect();
                      const ratio  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const startR = videoDuration > 0 ? videoStartTime / videoDuration : 0;
                      const endR   = videoDuration > 0 ? (videoEndTime || videoDuration) / videoDuration : 1;
                      const handle = Math.abs(ratio - startR) <= Math.abs(ratio - endR) ? 'start' : 'end';
                      setVideoDragHandle(handle);
                      if (handle === 'start') setStartPoint(ratio);
                      else                    setEndPoint(ratio);
                    }}
                    onPointerMove={e => {
                      if (!videoDragHandle || isPlaying) return;
                      const rect  = e.currentTarget.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      if (videoDragHandle === 'start') setStartPoint(ratio);
                      else                             setEndPoint(ratio);
                    }}
                    onPointerUp={() => setVideoDragHandle(null)}
                    onPointerCancel={() => setVideoDragHandle(null)}
                  >
                    {/* Bar background — height of the brackets, vertically centred */}
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: BH,
                                  transform: 'translateY(-50%)',
                                  background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                      {/* Active region (start → end) — grey fill inside the brackets */}
                      {videoDuration > 0 && (
                        <div style={{
                          position: 'absolute', top: 0, bottom: 0,
                          left:  `${(videoStartTime / videoDuration) * 100}%`,
                          width: `${((( videoEndTime || videoDuration) - videoStartTime) / videoDuration) * 100}%`,
                          background: 'rgba(0,0,0,0.12)',
                          pointerEvents: 'none',
                        }} />
                      )}
                      {/* Progress fill — starts at the in-point. Outer window clips to
                          [start,end]; inner is the full timeline so the unchanged
                          absolute-progress scaleX (written by RAF) lands correctly. */}
                      {videoDuration > 0 && (() => {
                        const startR = videoStartTime / videoDuration;
                        const endR   = (videoEndTime || videoDuration) / videoDuration;
                        const frac   = Math.max(0.0001, endR - startR);
                        return (
                          <div style={{ position: 'absolute', top: 0, bottom: 0,
                                        left: `${startR * 100}%`, width: `${frac * 100}%`,
                                        overflow: 'hidden', pointerEvents: 'none' }}>
                            <div
                              ref={videoSyncHeadRef}
                              style={{
                                position: 'absolute', top: 0, bottom: 0,
                                left:  `${(-startR / frac) * 100}%`,
                                width: `${(1 / frac) * 100}%`,
                                background: 'var(--ui-complement)',
                                transformOrigin: 'left center',
                                transform: `scaleX(${videoCurrentTime / videoDuration})`,
                              }}
                            />
                          </div>
                        );
                      })()}
                    </div>

                    {/* In-point handle (start) — bracket framing the region; pulses
                        while paused to advertise that the start point is draggable. */}
                    {videoDuration > 0 && (
                      <motion.div
                        animate={{ opacity: isPlaying ? 1 : [1, 0.4, 1] }}
                        transition={isPlaying ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                        position: 'absolute', top: '50%',
                        left: `${(videoStartTime / videoDuration) * 100}%`,
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                      }}><BracketLeft color="var(--ui-fg)" /></motion.div>
                    )}

                    {/* Out-point handle (end) — bracket framing the region (pulses while paused) */}
                    {videoDuration > 0 && (
                      <motion.div
                        animate={{ opacity: isPlaying ? 1 : [1, 0.4, 1] }}
                        transition={isPlaying ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                        position: 'absolute', top: '50%',
                        left: `${((videoEndTime || videoDuration) / videoDuration) * 100}%`,
                        transform: 'translate(-100%, -50%)',
                        pointerEvents: 'none',
                      }}><BracketRight color="var(--ui-fg)" /></motion.div>
                    )}
                  </div>

                  {/* ── Label row ── */}
                  <div style={{
                    height: TRANSPORT_CTL_H,
                    marginTop: 8,
                    position: 'relative',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingLeft: 0, paddingRight: 24,
                  }}>
                    {/* Left: spacer (trash moved onto the video as a hover overlay) */}
                    <div style={{ minWidth: 48, flexShrink: 0 }} />

                    {/* Centre: Shift+Space reset hint — absolutely centred so it's immune to left/right widths */}
                    <div
                      style={{
                        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                      }}
                      onClick={() => {
                        asyncVideoRef.current = true;
                        setAsyncVideo(true);
                        const vid = videoRef.current;
                        if (vid && videoUrl) {
                          vid.currentTime = videoStartRef.current;
                          setVideoCurrentTime(videoStartRef.current);
                          if (vid.paused) vid.play().catch(() => {});
                        }
                      }}
                    >
                      <Icon name="key-shift" size={FS_SMALL} color="var(--ui-complement)" />
                      <Icon name="key-spacebar" size={FS_SMALL} color="var(--ui-complement)" />
                      <Icon name="loop" size={FS_SMALL} color="var(--ui-fg)" />
                    </div>

                    {/* Right: in-point — out-point times */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', flex: 1 }}>
                      <span style={{ fontSize: FS_SMALL, fontFamily: FONT, letterSpacing: '0.04em', opacity: 0.7 }}>
                        {formatDuration(videoStartTime)}
                      </span>
                      <span style={{ fontSize: FS_SMALL, fontFamily: FONT, opacity: 0.35 }}>—</span>
                      <span style={{ fontSize: FS_SMALL, fontFamily: FONT, letterSpacing: '0.04em', opacity: 0.7 }}>
                        {formatDuration(videoEndTime || videoDuration)}
                      </span>
                    </div>
                  </div>

                </div>
              </motion.div>
            ) : (
              /* ── Empty / prompt mode ─────────────────────────── */
              <motion.div
                key="empty-mode"
                className="no-hover-tint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onMouseEnter={() => setUploadHovered(true)}
                onMouseLeave={() => setUploadHovered(false)}
                style={{
                  position: 'absolute', inset: 0,
                  background: (isDragOver || uploadHovered) ? '#d8d8d8' : '#ededed',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  clipPath: `polygon(
                    87.61% 12.43%,
                    87.61% 0%,
                    12.45% 0%,
                    12.45% 12.43%,
                    0%     12.43%,
                    0%     87.51%,
                    12.45% 87.51%,
                    12.45% 100%,
                    87.61% 100%,
                    87.61% 87.51%,
                    100%   87.51%,
                    100%   12.43%
                  )`,
                }}
              >
                {/* Upload icon watermark — reacts to drag-over */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <Icon
                    name="upload"
                    size="64vh"
                    color="var(--ui-complement)"
                    style={{
                      opacity: (isDragOver || uploadHovered) ? 0.75 : 0.18,
                      // The glyph sits high in its em-box — nudge it down to
                      // sit visually centred in the (square) preview space.
                      transform: (isDragOver || uploadHovered) ? 'translateY(8%) scale(1.08)' : 'translateY(8%) scale(1)',
                      transition: 'opacity 0.15s ease, transform 0.15s ease',
                    }}
                  />
                </div>
                {/* Upload prompt typewriter */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: '16%', paddingRight: '8%',
                }}>
                  <UploadText inputMode={inputMode} lang={lang} />
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Online Upload — add video to Board ───────────────── */}
      <AnimatePresence>
        {isOnlineUpload && (
          <motion.div
            key="board-upload"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position: 'absolute', left: PANEL_LEFT, top: 6, right: 6, bottom: 6, pointerEvents: 'auto' }}
            onClick={() => { if (!boardUploadSuccess) boardUploadRef.current?.click(); }}
            onDragEnter={e => {
              e.preventDefault();
              boardDragCounter.current++;
              if (e.dataTransfer.types.includes('Files')) setBoardIsDragOver(true);
            }}
            onDragLeave={() => {
              boardDragCounter.current--;
              if (boardDragCounter.current <= 0) { boardDragCounter.current = 0; setBoardIsDragOver(false); }
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              boardDragCounter.current = 0;
              setBoardIsDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('video/')) handleBoardVideoUpload(file);
            }}
          >
            <input
              ref={boardUploadRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBoardVideoUpload(f); e.target.value = ''; }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: boardIsDragOver ? 'var(--ui-preview-bg)' : 'var(--ui-preview-bg)',
              opacity: boardIsDragOver ? 0.8 : 1,
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
              clipPath: `polygon(
                87.61% 12.43%,  87.61% 0%,
                12.45% 0%,      12.45% 12.43%,
                0%     12.43%,  0%     87.51%,
                12.45% 87.51%,  12.45% 100%,
                87.61% 100%,    87.61% 87.51%,
                100%   87.51%,  100%   12.43%
              )`,
            }}>
              {/* Upload icon watermark */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <Icon name="upload" size="32vh" color="var(--ui-fg)" style={{
                  opacity: boardIsDragOver ? 0.75 : boardUploadSuccess ? 0 : 0.18,
                  transform: boardIsDragOver ? 'scale(1.08)' : 'scale(1)',
                  transition: 'opacity 0.15s ease, transform 0.15s ease',
                }} />
              </div>

              {/* Text — cycles between prompt and success message */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', paddingLeft: '16%', paddingRight: '8%' }}>
                <AnimatePresence mode="wait">
                  {boardUploadSuccess ? (
                    <motion.p
                      key="success"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ margin: 0, fontSize: FS_LARGE * 2, lineHeight: 1.0,
                               color: 'var(--ui-fg)', letterSpacing: '0.04em',
                               fontFamily: FONT, whiteSpace: 'pre-line' }}
                    >
                      Added to Board.{'\n'}ISAMO is categorizing your clip.
                    </motion.p>
                  ) : (
                    <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <BoardUploadText inputMode={inputMode} lang={lang} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Board — header fisso + griglia scrollabile ────────── */}
      <AnimatePresence>
        {showPreview && isMoodboard && (
          <motion.div
            key={`moodboard-${focusedY}-${focusedX}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 0.6] } }}
            style={{
              position: 'absolute',
              left: Z_LEFT, top: 6, right: 6, bottom: 6,
              overflow: 'hidden',
            }}
          >
            {/* ── Board header ── */}
            <div style={{
              height: BOARD_HEADER_H,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0 14px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--ui-bg)',
              zIndex: 2,
            }}>
              {/* Search — hint icon + input */}
              <Icon name={inputMode === 'controller' ? 'select' : 'key-f'} size={FS_SMALL} color="var(--ui-complement)" />
              <input
                ref={searchInputRef}
                value={boardSearch}
                onChange={e => setBoardSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={e => {
                  if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')
                    playKeyboardSound();
                }}
                placeholder="..."
                style={{
                  width: 220, flexShrink: 0, border: 'none', outline: 'none',
                  fontFamily: FONT_FAT, fontSize: FS_SMALL, lineHeight: 1,
                  color: 'var(--ui-fg)', background: 'transparent',
                  letterSpacing: '0.04em',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={inputMode === 'controller' ? 'controller-Y' : 'key-c'} size={FS_SMALL} color="var(--ui-complement)" />
                <span
                  onClick={() => {
                    const idx = boardOrderBy === null ? -1 : ORDER_BY_CATS.indexOf(boardOrderBy);
                    const next = idx + 1;
                    setBoardOrderBy(next >= ORDER_BY_CATS.length ? null : ORDER_BY_CATS[next]);
                  }}
                  style={{ fontSize: FS_SMALL, fontFamily: FONT, letterSpacing: '0.04em',
                           color: boardOrderBy !== null ? 'var(--ui-complement)' : 'var(--ui-fg)',
                           lineHeight: 1, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                >
                  {(boardOrderBy ?? 'ORDER BY').toUpperCase()}
                </span>
                {/* G shortcut — toggles the sort direction */}
                <Icon name="key-G" size={FS_SMALL} color="var(--ui-complement)" />
                <button
                  onClick={() => setBoardSortAsc(a => !a)}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    opacity: boardOrderBy ? 1 : 0.35,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <Icon name={boardSortAsc ? 'sort-up' : 'sort-down'} size={FS_SMALL} color="var(--ui-fg)" />
                </button>
              </div>
              {/* Spacer — lascia respiro alle icone colonna */}
              <div style={{ flex: 1 }} />
              {/* Layout toggle — H shortcut + 2 / 4 column icons.
                  Narrow viewport → single-column only: hide the H hint and the
                  2 / 4 options, leaving just the (active) one-column indicator. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
                {/* H shortcut — toggles 2 / 4 columns (desktop only) */}
                {!isNarrow && <Icon name="key-h" size={FS_SMALL} color="var(--ui-complement)" />}
                {(isNarrow ? [1] as const : [1, 2, 4] as const).map(n => (
                  <button key={n} onClick={() => { if (!isNarrow) setBoardCols(n); }}
                    style={{ background: 'none', border: 'none', padding: 0,
                             cursor: isNarrow ? 'default' : 'pointer',
                             opacity: boardCols === n ? 1 : 0.35 }}>
                    <Icon name={n === 1 ? 'one-column' : n === 2 ? 'two-columns' : 'four-columns'} size={FS_SMALL} color="var(--ui-fg)" />
                  </button>
                ))}
              </div>
            </div>

            {/* ── Griglia scrollabile ── */}
            <div
              ref={moodboardContainerRef}
              className="no-scrollbar"
              style={{
                position: 'absolute',
                top: BOARD_HEADER_H + 1,
                left: 0, right: 0, bottom: 0,
                overflowY: 'auto', overflowX: 'hidden',
                scrollbarWidth: 'none',
                display: 'grid',
                gridTemplateColumns: `repeat(${boardCols}, 1fr)`,
                gridAutoRows: 'min-content',
                alignContent: 'start',
                columnGap: 14,
                rowGap:    boardCols === 2 ? 120 : 90,
                // Generous vertical padding so even the FIRST and LAST rows can be
                // scrolled onto the central axis (no room above/below otherwise).
                padding: '50vh 14px',
              }}>
              {sortedBoardIdx.map((idx) => {
                const v        = boardVideos[idx];
                const isSelected = focusedW === idx;
                const isHovered  = hoveredMoodboardIdx === idx;
                const active     = isSelected || isHovered;
                // Color (grayscale off): keyboard select requires focusedZ entry, hover is immediate
                const isColorful = (focusedZ !== null && isSelected) || isHovered;
                const isMuted = mutedVideos.has(idx) || generalMuted;
                const select = () => { if (focusedZ === null) setFocusedZ(0); setFocusedW(idx); };
                return (
                  <motion.div
                    key={v.id}
                    layout
                    transition={{ layout: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } }}
                    ref={el => { moodboardItemRefs.current[idx] = el as HTMLDivElement | null; }}
                    onMouseEnter={() => { setHoveredMoodboardIdx(idx); playUi('hover'); }}
                    onMouseLeave={() => setHoveredMoodboardIdx(null)}
                    onClick={e => { if (e.detail === 0) return; select(); }}
                    data-no-magnet="true"
                    style={{ display: 'flex', gap: 14,
                             alignItems: 'stretch', cursor: 'pointer' }}
                  >
                    {/* ── Metadata — LEFT of the video; title centred on the video's
                           vertical axis (always, before hover/click); date/country +
                           pills sit just below the title without moving it. ── */}
                    <div style={{ width: boardCols === 4 ? 130 : BOARD_META_W, flexShrink: 0, alignSelf: 'stretch',
                                  position: 'relative', overflow: 'visible' }}>
                      {/* Title (author) — bracket + name, vertically centred */}
                      <div style={{ position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)', overflow: 'visible' }}>
                        <BoardTitle label={v.label} active={active} cols={boardCols} hovered={isHovered} />
                      </div>
                      {/* Date + Country, then pills — just below the title's axis (active only) */}
                      <AnimatePresence>
                        {active && (
                          <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ position: 'absolute', top: '50%', left: 0, marginTop: 22,
                                     display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: FONT,
                                          color: 'var(--ui-fg)', opacity: 0.6, letterSpacing: '0.10em' }}>
                              <span>{v.year}</span>
                              {v.country && <span>{v.country}</span>}
                            </div>
                            {v.tags && v.tags.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                                {v.tags.map(tag => (
                                  <TagLabel key={tag} label={tag}
                                    onClick={findSoundPath(tag) ? () => navigateToSound(tag) : undefined} />
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* ── Video ── */}
                    <div
                      onClick={e => {
                        if (e.detail === 0) return;
                        e.stopPropagation();
                        select();
                        setMutedVideos(prev => {
                          const next = new Set(prev);
                          if (next.has(idx)) { next.delete(idx); playUi('unmute'); }
                          else               { next.add(idx);    playUi('mute');   }
                          return next;
                        });
                      }}
                      style={{ flex: 1, position: 'relative', cursor: 'pointer' }}
                    >
                      <motion.div
                        initial={false}
                        animate={{ filter: `grayscale(${isColorful ? 0 : 100}%)` }}
                        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      >
                        <MoodboardVideoItem src={v.src} isActive={isSelected} isMuted={isMuted} fullView={boardCols === 1} />
                      </motion.div>

                      {/* Mute icon overlay */}
                      <motion.div
                        animate={{
                          opacity: muteFlashSet.has(idx) ? 1
                            : (isHovered || (inputMode === 'controller' && isSelected)) ? 0.75 : 0,
                        }}
                        transition={{ duration: muteFlashSet.has(idx) ? 0.12 : 0.55, ease: 'easeOut' }}
                        style={{ position: 'absolute', inset: 0, display: 'flex',
                                 alignItems: 'center', justifyContent: 'center', mixBlendMode: 'difference' }}
                      >
                        <Icon key={isMuted ? 'muted' : 'unmuted'}
                          name={isMuted ? 'mute' : 'unmute'} size="6vh" color="#fff" />
                      </motion.div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Artist gallery ─────────────────────────────────────────────────── */}
      {/* xItems carry src + wItems directly (no Z level). Navigation up/down */}
      {/* scrolls between artists via focusedX.                               */}
      <AnimatePresence mode="wait">
        {isArtistCategory && focusedY !== null && (() => {
          // Selected image's max size = the space between the X column's "(...)" selection
          // brackets — same fixed width used by every other nav column.
          const selW    = NAV_BRACKET_W;
          const artists = CATEGORIES[focusedY!].xItems;
          const RISE    = 180;           // how far the gallery slides up when entering the sound player

          return (
            <motion.div
              key={`artist-gallery-${focusedY}`}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: isLibraryPanel ? 0 : 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                position: 'absolute',
                left: Z_LEFT, top: ANCHOR_TOP,
                width: selW,
                pointerEvents: isLibraryPanel ? 'none' : 'auto',
                overflow: 'visible',
              }}
            >
              {artists.map((artist, i) => {
                const isSelected = focusedX === i;
                // Signed d: negative = above selected, positive = below
                const d    = focusedX !== null ? i - focusedX : i;
                const absD = Math.abs(d);
                // Selected image is large; all others are small
                const itemImgW = isSelected ? selW : ARTIST_IMG_W_SMALL;
                // Image-only layout: selected image centred on ANCHOR_TOP, others stack above/below.
                // Entering the sound player (inPanel) → every item simply rises (− RISE) and
                // fades out with the container, instead of reshuffling into a locked stack.
                const gap = ARTIST_ITEM_BOTTOM_GAP;
                const previewY = focusedX === null
                  ? i * (ARTIST_IMG_W_SMALL + gap)
                  : d === 0
                    ? -selW / 2
                    : d > 0
                      ? selW / 2 + gap + (d - 1) * (ARTIST_IMG_W_SMALL + gap)
                      : -selW / 2 - Math.abs(d) * (ARTIST_IMG_W_SMALL + gap);
                const y = inPanel ? previewY - RISE : previewY;
                let op = focusedX === null ? 0.22
                  : absD === 0 ? 1.0 : absD === 1 ? 0.50 : absD === 2 ? 0.28 : absD === 3 ? 0.12 : 0;
                // Artist search: dim images that don't match the query
                const aq = artistSearch.trim().toLowerCase();
                if (aq && !artist.label.toLowerCase().includes(aq)) op = Math.min(op, 0.08);

                return (
                  <motion.div
                    key={artist.label}
                    initial={false}
                    animate={{ y, opacity: op }}
                    transition={ARTIST_IMG_TWEEN}
                    onMouseEnter={() => playUi('hover')}
                    onClick={() => { goX(i); playUi('clickCursor'); }}
                    data-magnet="strong"
                    style={{ position: 'absolute', top: 0, left: 0, cursor: 'pointer' }}
                  >
                    {/* Image only — no label in this column */}
                    {artist.src && (
                      <motion.img
                        src={artist.src}
                        alt={artist.label}
                        initial={false}
                        animate={{
                          width:  itemImgW,
                          height: itemImgW,
                          filter: `grayscale(${isSelected ? 0 : 100}%)`,
                          opacity: 1,
                        }}
                        transition={ARTIST_IMG_TWEEN}
                        style={{ display: 'block', objectFit: 'cover' }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Artist alphabetical timeline ───────────────────────────────────── */}
      {/* Sits right after the artist images. Full A–Z shown, scrolling so the */}
      {/* current artist's letter stays centred on the XMB axis. Letters with  */}
      {/* an artist use normal opacity logic; others fade to a faint gray.     */}
      <AnimatePresence>
        {isArtistCategory && focusedY !== null && focusedX !== null && focusedW === null && (() => {
          const artists  = CATEGORIES[focusedY!].xItems;
          const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
          const ROW_H    = FS_SMALL + 7; // vertical spacing between letters
          // Map first-letter → artist index for O(1) lookup
          const letterMap = new Map<string, number>();
          artists.forEach((a, i) => letterMap.set(a.label[0].toUpperCase(), i));
          // Letter the current artist starts with — kept centred on ANCHOR_TOP
          const currentLetter    = artists[focusedX!].label[0].toUpperCase();
          const currentLetterIdx = Math.max(0, ALPHABET.indexOf(currentLetter));

          return (
            <motion.div
              key={`artist-timeline-${focusedY}`}
              initial={{ opacity: 0 }} animate={{ opacity: isLibraryPanel ? 0 : 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{
                position: 'absolute',
                left: ARTIST_TIMELINE_LEFT,
                width: ARTIST_TIMELINE_W,
                top: ANCHOR_TOP,
                pointerEvents: isLibraryPanel ? 'none' : 'auto',
                overflow: 'visible',
              }}
            >
              {ALPHABET.map((letter, idx) => {
                const artistIdx  = letterMap.get(letter) ?? -1;
                const hasArtist  = artistIdx !== -1;
                const isSelected = hasArtist && focusedX === artistIdx;
                // Full A–Z always visible — same two-tier opacity as before.
                const op = isSelected ? 1.0 : hasArtist ? 0.55 : 0.2;
                // Centre the selected letter on the XMB row axis (ANCHOR_TOP + ICON_PX/2,
                // same axis the X-column's selected label sits on).
                const y = (idx - currentLetterIdx) * ROW_H - FS_SMALL / 2 + ICON_PX / 2;
                return (
                  <motion.span
                    key={letter}
                    initial={false}
                    animate={{ y, opacity: op }}
                    transition={ARTIST_IMG_TWEEN}
                    onMouseEnter={hasArtist ? () => playUi('hover') : undefined}
                    onClick={hasArtist ? () => { goX(artistIdx); playUi('clickCursor'); } : undefined}
                    style={{
                      position: 'absolute', top: 0, left: 0,
                      fontSize: FS_SMALL,
                      fontFamily: FONT_FAT,
                      color: isSelected ? 'var(--ui-complement)' : 'var(--ui-fg)',
                      lineHeight: 1,
                      letterSpacing: '0.10em',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                      cursor: hasArtist ? 'pointer' : 'default',
                      padding: '0 6px',
                    }}
                  >
                    {letter}
                  </motion.span>
                );
              })}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {showSoundList && (
          <motion.div key={`sound-${focusedY}-${focusedX}-${isArtistCategory ? focusedX : focusedZ}`}
            initial={{ opacity: 0, x: -32 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              ...(isLibraryPanel ? {
                maskImage: `linear-gradient(to bottom, transparent 0px, transparent calc(${ANCHOR_TOP} + 68px), black calc(${ANCHOR_TOP} + 76px))`,
                WebkitMaskImage: `linear-gradient(to bottom, transparent 0px, transparent calc(${ANCHOR_TOP} + 68px), black calc(${ANCHOR_TOP} + 76px))`,
              } : {}),
            }}
          >
            <motion.div
              initial={false}
              animate={{ left: soundListLeft }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                position: 'absolute',
                top: isLibraryPanel ? PLAYER_SOUND_TOP : ANCHOR_TOP,
                bottom: 0,
                // Library panel: extend flush to the (square) preview space's left
                // edge — same 6px margin the preview space itself uses on the right,
                // so the third column (download + duration) sits in the freed-up
                // space using the exact same square system as the preview.
                right: isLibraryPanel
                  ? `calc(6px + ${PREVIEW_SQUARE_SIZE})`
                  : isSettingsPanel
                    ? `calc(100% - ${PANEL_LEFT - 20}px)`
                    : 0,
                pointerEvents: 'auto',
              }}>
              {currentWItems.map((item, i) => {
                // When V is active in settings, W items lock (small) like other locked columns
                const isActive   = inPanel && !isSettingsVActive;
                const isSelected = focusedW === i;

                // Player search filter
                const matchesPlayerSearch = !playerSearch.trim() ||
                  item.title.toLowerCase().includes(playerSearch.toLowerCase()) ||
                  item.label.toLowerCase().includes(playerSearch.toLowerCase());

                let y: number, op: number, color: string;
                if (!isActive && isSettingsVActive && focusedW !== null) {
                  const d  = i - focusedW;
                  const ls = lockedSlot(d);
                  y = ANCHOR_Y + ls.dy; op = ls.op; color = 'var(--ui-fg)';
                } else if (!isActive) {
                  y  = i * 24; op = 0.22; color = 'var(--ui-fg)';
                } else {
                  const d = i - focusedW!;
                  const s = slot(d);
                  y     = ANCHOR_Y + s.dy;
                  op    = Math.abs(d) > 3 ? 0 : s.op;
                  color = 'var(--ui-fg)';
                }

                // #swag: each sound row gets its own seeded random colour
                if (swagSeed != null) color = swagColorFor(i + 41, swagSeed);

                // Hover boost is applied per-part (title vs download) so the two
                // halves of a row light up independently. Only when present (op > 0).
                const titleHover    = hoveredSound?.idx === i && hoveredSound.part === 'title';
                const downloadHover = hoveredSound?.idx === i && hoveredSound.part === 'download';
                const searchDim     = isLibraryPanel && !matchesPlayerSearch;
                const titleOp    = searchDim ? 0.08 : (op > 0 && titleHover)    ? 1 : op;
                const downloadOp = searchDim ? 0.08 : (op > 0 && downloadHover) ? 1 : op;

                // Resolved duration: from audio metadata if loaded, else static data
                const displayDuration = loadedDurations[item.id] ?? item.duration;

                return (
                  <motion.div key={item.id}
                    initial={false}
                    animate={{ y }}
                    transition={NAV_SPRING}
                    onClick={() => {
                      if (isLangItem(item.id)) { onLangChangeRef.current?.(langOf(item.id)); goW(i); playUi('clickCursor'); }
                      else if (isSelected && isActive) { togglePlay(); }
                      else { goW(i); playUi('clickCursor'); }
                    }}
                    data-magnet="strong"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ICON_PX,
                             overflow: 'visible', cursor: 'pointer' }}
                  >
                    {/* progress bar moved to standalone transport section below */}

                    {/* Sequential "pop" entrance — same cell-by-cell reveal used by every
                        other XMB column (XmbCol); Settings has no Z column, so its W-item
                        list (this one) is the "third column" and gets the same treatment. */}
                    <motion.div
                      initial={isSettingsCategory ? { scale: 0, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...XMB_POP, delay: i * XMB_ENTER_STEP }}
                      style={{ position: 'absolute', inset: 0, transformOrigin: 'left center' }}
                    >
                    {/* LEFT — category tag (if any) + bracket group with title */}
                    <motion.div
                      initial={false}
                      animate={{ opacity: titleOp }}
                      transition={NAV_SPRING}
                      onMouseEnter={() => { setHoveredSound({ idx: i, part: 'title' }); playUi('hover'); }}
                      onMouseLeave={() => setHoveredSound(h => (h?.idx === i && h.part === 'title') ? null : h)}
                      style={{ position: 'absolute', left: 0, top: 0, height: ICON_PX,
                                  display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Categorization tag — only for sounds, not settings */}
                      {!isSettingsCategory && <TagLabel label={item.label} />}

                      <div style={{ display: 'flex', alignItems: 'center', width: NAV_BRACKET_W }}>
                        <motion.span
                          initial={false}
                          animate={{ opacity: inPanel && isSelected ? 1 : 0 }}
                          transition={{ duration: 0.15 }}
                          style={{ fontSize: FS_SMALL, lineHeight: 1, color, flexShrink: 0 }}
                        >(</motion.span>
                        <span style={{ flex: 1, position: 'relative', alignSelf: 'stretch' }}>
                          <motion.span
                            initial={false}
                            animate={{ left: (inPanel && isSelected) ? '50%' : '0%', x: (inPanel && isSelected) ? '-50%' : '0%' }}
                            transition={NAV_SPRING}
                            style={{ position: 'absolute', top: '50%', y: '-50%',
                                     fontSize: FS_SMALL, fontFamily: FONT, color,
                                     whiteSpace: 'nowrap', lineHeight: 1, letterSpacing: '0.04em' }}
                          >
                            {tLabel(item.title, lang)}
                          </motion.span>
                        </span>
                        <motion.span
                          initial={false}
                          animate={{ opacity: inPanel && isSelected ? 1 : 0 }}
                          transition={{ duration: 0.15 }}
                          style={{ fontSize: FS_SMALL, lineHeight: 1, color, flexShrink: 0 }}
                        >)</motion.span>
                      </div>
                    </motion.div>

                    {/* RIGHT — download + duration (library panel only) */}
                    {isLibraryPanel && (
                      <motion.div
                        initial={false}
                        animate={{ opacity: downloadOp }}
                        transition={NAV_SPRING}
                        onMouseEnter={() => { setHoveredSound({ idx: i, part: 'download' }); playUi('hover'); }}
                        onMouseLeave={() => setHoveredSound(h => (h?.idx === i && h.part === 'download') ? null : h)}
                        style={{ position: 'absolute', right: 0, top: 0, height: ICON_PX,
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    paddingRight: 24, zIndex: 1 }}>
                        <AnimatePresence>
                          {isSelected && (
                            <motion.span
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ display: 'flex', alignItems: 'center' }}
                            >
                              <DownloadButton inputMode={inputMode} onClick={downloadSound} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                        <span style={{ color: 'var(--ui-fg)', fontSize: FS_SMALL, letterSpacing: '0.04em',
                                       whiteSpace: 'nowrap' }}>
                          {displayDuration}
                        </span>
                      </motion.div>
                    )}
                    </motion.div>
                  </motion.div>
                );
              })}

              {/* ── Transport bar: progress + controls ─────────────────────────────
                  Rendered AFTER items so it sits above them in DOM stacking order.
                  White background prevents sound rows from showing through.          */}
              {isLibraryPanel && focusedW !== null && (() => {
                const isCtrl = inputMode === 'controller';
                return (
                  <div style={{
                    position: 'absolute',
                    bottom: 44, left: 0, right: 0,
                    height: TRANSPORT_FX_H + 8 + TRANSPORT_PROG_H + 8 + TRANSPORT_CTL_H,
                    background: 'var(--ui-bg)',
                    zIndex: 10,
                    pointerEvents: 'auto',
                  }}>

                    {/* ── "FX" indicator — replaces the old "Premi…" hint text.
                         Idle: "FX" + blinking ⏎ icon (enter FX navigation mode).
                         In FX mode: "FX" + blinking Esc icon (exit FX mode).      */}
                    <div
                      onClick={() => {
                        if (fxFocus === null) { initFxChain(); setFxFocus(0); setFxParam(0); playUi('conferma'); }
                        else                  { setFxFocus(null); setFxParam(0); playUi('undo'); }
                      }}
                      style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, height: 19,
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: FS_SMALL, fontFamily: FONT_FAT,
                        color: fxFocus !== null ? 'var(--ui-complement)' : 'var(--ui-fg)',
                        letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: 'pointer',
                      }}>
                      <span>FX</span>
                      <motion.span
                        animate={{ opacity: [1, 0.15, 1] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ display: 'flex', alignItems: 'center' }}
                      >
                        {fxFocus === null
                          ? <Icon name="key-enter" size={FS_SMALL} color="var(--ui-fg)" />
                          : <Icon name="esc" size={FS_SMALL} color="var(--ui-complement)" />}
                      </motion.span>
                    </div>

                    {/* ── Effects panel — 2×3 XMB-style bracket-focus grid ──── */}
                    {(() => {
                      // First step of a drag → focus the dragged cell and flag the drag
                      // (so the trailing click is swallowed).
                      const markDrag = (g: number, p: number) => {
                        if (!fxDragMovedRef.current) { setFxFocus(g); setFxParam(p); }
                        fxDragMovedRef.current = true;
                      };
                      // value cell: brackets light up when this group/param has focus.
                      // All values render in the accent colour while FX mode is inactive,
                      // and switch to the complement colour while FX mode is active.
                      const fxValue = (group: number, param: number, content: ReactNode, dim: boolean) => {
                        const active = fxFocus === group && fxParam === param;
                        const col = fxFocus !== null ? 'var(--ui-complement)' : 'var(--ui-fg)';
                        const focusHere = () => { initFxChain(); setFxFocus(group); setFxParam(param); };
                        return (
                          <FxBracket key={param} active={active} color={col} width={FX_VALUE_W}
                            cursor="ns-resize"
                            onClick={() => {
                              // A drag already adjusted the value → swallow the trailing click.
                              if (fxDragMovedRef.current) { fxDragMovedRef.current = false; return; }
                              // First click selects; clicking the already-selected value
                              // steps it up (so toggles/cycles are fully mouse-driven).
                              if (active) adjustFxValue(group, param, 1);
                              else focusHere();
                            }}
                            onWheel={e => {
                              // Scroll over any value to adjust it directly (up = +, down = −).
                              e.preventDefault();
                              focusHere();
                              adjustFxValue(group, param, e.deltaY < 0 ? 1 : -1);
                            }}
                            onPointerDown={e => {
                              // Hold + drag up/down to adjust (like a fader).
                              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
                              fxDragRef.current = { group, param, acc: 0 };
                              fxDragMovedRef.current = false;
                            }}
                            onPointerMove={e => {
                              const d = fxDragRef.current;
                              if (!d || d.group !== group || d.param !== param) return;
                              d.acc -= e.movementY; // dragging up (movementY < 0) → increase
                              while (d.acc >= FX_DRAG_STEP_PX)  { adjustFxValue(group, param, 1);  d.acc -= FX_DRAG_STEP_PX; markDrag(group, param); }
                              while (d.acc <= -FX_DRAG_STEP_PX) { adjustFxValue(group, param, -1); d.acc += FX_DRAG_STEP_PX; markDrag(group, param); }
                            }}
                            onPointerUp={e => {
                              try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
                              fxDragRef.current = null;
                            }}>
                            <span style={{ fontSize: FS_SMALL, fontFamily: FONT, color: col,
                              letterSpacing: '0.10em', lineHeight: 1, opacity: dim ? 0.38 : 1 }}>
                              {content}
                            </span>
                          </FxBracket>
                        );
                      };
                      // group label: same fixed-width bracket slot as the XMB nav columns
                      // (NAV_BRACKET_W) for alignment, but never focusable/selectable —
                      // only the parameter values themselves can be navigated to. The
                      // brackets stay permanently inactive (opacity 0) on labels.
                      // group: index into FX_GROUP_LABELS — hovering shows the effect's
                      // explanation top-left via the shared ometto/TTS overlay.
                      const fxLabel = (label: string, group: number) => (
                        <div style={{ display: 'flex', alignItems: 'center', height: 19, cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredFxGroup(group)}
                          onMouseLeave={() => setHoveredFxGroup(g => (g === group ? null : g))}
                          onClick={() => { initFxChain(); setFxFocus(group); setFxParam(0); }}>
                          <FxBracket active={false}>
                            <span style={{ fontSize: FS_SMALL, fontFamily: FONT_FAT, color: 'var(--ui-fg)',
                              letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{tLabel(label, lang)}</span>
                          </FxBracket>
                        </div>
                      );
                      // EQ value: just the dB number (no LO/MI/HI unit suffix).
                      const eqCell = (val: number) => (val > 0 ? `+${val}` : val);
                      const cellStyle = { display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', gap: 6, minWidth: 0 };
                      const valuesRowStyle = { display: 'flex', alignItems: 'center', gap: 14, height: 19 };
                      return (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ ...XMB_POP, delay: 0 }}
                          style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0,
                            height: TRANSPORT_FX_H,
                            display: 'grid',
                            // Columns sit on the SAME vertical axes as the XMB nav columns
                            // (library / backing / ambient). The transport container's
                            // origin is soundListLeft (= LOGO_LEFT), so each XMB axis maps
                            // to (axis − LOGO_LEFT) here; with COLUMN_GAP-wide tracks the
                            // three columns land on NAV_LEFT, X_LEFT and Z_LEFT.
                            gridTemplateColumns: `${COLUMN_GAP}px ${COLUMN_GAP}px 1fr`,
                            gridTemplateRows: `${TRANSPORT_FX_ROW_H}px ${TRANSPORT_FX_ROW_H}px`,
                            rowGap: TRANSPORT_FX_GAP,
                            columnGap: 0,
                            paddingLeft: NAV_LEFT - LOGO_LEFT, // 108 — aligns col 1 with the library axis
                            paddingRight: 4,
                            transformOrigin: 'left center',
                          }}>
                          {/* EQUALIZZATORE */}
                          <div style={cellStyle}>
                            {fxLabel('Equalizer', 0)}
                            <div style={valuesRowStyle}>
                              {fxValue(0, 0, eqCell(eqLow),  eqLow  === 0)}
                              {fxValue(0, 1, eqCell(eqMid),  eqMid  === 0)}
                              {fxValue(0, 2, eqCell(eqHigh), eqHigh === 0)}
                            </div>
                          </div>

                          {/* RIVERBERO */}
                          <div style={cellStyle}>
                            {fxLabel('Reverb', 1)}
                            <div style={valuesRowStyle}>
                              {fxValue(1, 0, Math.round(reverbWet * 100), reverbWet <= 0.01)}
                            </div>
                          </div>

                          {/* SINISTRA/DESTRA (pan) */}
                          <div style={cellStyle}>
                            {fxLabel('Left/Right', 2)}
                            <div style={valuesRowStyle}>
                              <PanBar value={pan} onChange={v => setPan(v)} width={120} height={16} />
                              {fxValue(2, 0, pan === 0 ? 'C' : (pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`), pan === 0)}
                            </div>
                          </div>

                          {/* DELAY */}
                          <div style={cellStyle}>
                            {fxLabel('Delay', 3)}
                            <div style={valuesRowStyle}>
                              {fxValue(3, 0, Math.round(delayWet * 100), delayWet <= 0.01)}
                              {fxValue(3, 1, tLabel(DELAY_DIV_LABELS[delayDivIdx], lang), delayWet <= 0.01)}
                            </div>
                          </div>

                          {/* FLANGER */}
                          <div style={cellStyle}>
                            {fxLabel('Flanger', 4)}
                            <div style={valuesRowStyle}>
                              {fxValue(4, 0, Math.round(magicWet * 100), magicWet <= 0.01)}
                              {fxValue(4, 1, <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Icon name="star" size={FS_SMALL} />{magicVoices}
                              </span>, magicWet <= 0.01)}
                            </div>
                          </div>

                          {/* ARPEGGIATORE — SI/NO (on/off) + rate */}
                          <div style={cellStyle}>
                            {fxLabel('Arpeggiator', 5)}
                            <div style={valuesRowStyle}>
                              {fxValue(5, 0, tLabel(arpAmount > 0 ? 'YES' : 'NO', lang), false)}
                              {fxValue(5, 1, arpAmount, arpAmount === 0)}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })()}

                    {/* ── Thin divider between effects row and progress bar ── */}
                    <div style={{ position: 'absolute', top: TRANSPORT_FX_H, left: 0, right: 0,
                      height: 1, background: 'var(--ui-fg)', opacity: 0.08 }} />

                    {/* Progress bar — scrubber + in/out handles */}
                    <motion.div
                      data-scrubber="audio"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...XMB_POP, delay: 0.08 }}
                      style={{
                        position: 'absolute',
                        // Inset the right edge so this bar doesn't butt up against the
                        // video-preview scrubber at the panel seam (they share bottom:44).
                        top: TRANSPORT_FX_H + 8, left: 0, right: 16,
                        height: TRANSPORT_PROG_H,
                        overflow: 'visible',
                        cursor: 'crosshair',
                        pointerEvents: 'auto',
                        transformOrigin: 'left center',
                      }}
                      onPointerDown={e => {
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                        const rect  = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        // Snap to nearest handle when within 5% of its position
                        if (soundDuration > 0) {
                          const startR = soundStartTime / soundDuration;
                          const endR   = (soundEndTime || soundDuration) / soundDuration;
                          const dS = Math.abs(ratio - startR);
                          const dE = Math.abs(ratio - endR);
                          if (Math.min(dS, dE) < 0.05) {
                            const h = dS <= dE ? 'start' : 'end';
                            setSoundDragHandle(h);
                            if (h === 'start') setSoundStartPoint(ratio);
                            else               setSoundEndPoint(ratio);
                            return;
                          }
                        }
                        setSoundDragHandle('scrub');
                        seekSound(ratio);
                      }}
                      onPointerMove={e => {
                        if (!soundDragHandle) return;
                        const rect  = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        if      (soundDragHandle === 'start') setSoundStartPoint(ratio);
                        else if (soundDragHandle === 'end')   setSoundEndPoint(ratio);
                        else                                  seekSound(ratio);
                      }}
                      onPointerUp={() => setSoundDragHandle(null)}
                      onPointerCancel={() => setSoundDragHandle(null)}
                    >
                      {/* Bar background — height of the brackets, vertically centred */}
                      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: BH,
                                    transform: 'translateY(-50%)',
                                    background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        {/* Active region (in → out) — grey fill inside the brackets */}
                        {soundDuration > 0 && (
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left:  `${(soundStartTime / soundDuration) * 100}%`,
                            width: `${(((soundEndTime || soundDuration) - soundStartTime) / soundDuration) * 100}%`,
                            background: 'rgba(0,0,0,0.12)',
                            pointerEvents: 'none',
                          }} />
                        )}
                        {/* Playback head — starts at the in-point. Outer window clips to
                            [start,end]; inner spans the full timeline so the unchanged
                            absolute-progress scaleX (written by RAF) lands correctly. */}
                        {soundDuration > 0 && (() => {
                          const startR = soundStartTime / soundDuration;
                          const endR   = (soundEndTime || soundDuration) / soundDuration;
                          const frac   = Math.max(0.0001, endR - startR);
                          return (
                            <div style={{ position: 'absolute', top: 0, bottom: 0,
                                          left: `${startR * 100}%`, width: `${frac * 100}%`,
                                          overflow: 'hidden', pointerEvents: 'none' }}>
                              <div
                                ref={audioBarFillRef}
                                style={{
                                  position: 'absolute', top: 0, bottom: 0,
                                  left:  `${(-startR / frac) * 100}%`,
                                  width: `${(1 / frac) * 100}%`,
                                  background: 'var(--ui-complement)',
                                  transformOrigin: 'left center',
                                  transform: `scaleX(${soundProgress})`,
                                }}
                              />
                            </div>
                          );
                        })()}
                      </div>

                      {/* In-point handle — bracket framing the region; pulses while
                          paused to advertise that the start point is draggable. */}
                      {soundDuration > 0 && (
                        <motion.div
                          animate={{ opacity: isPlaying ? 1 : [1, 0.4, 1] }}
                          transition={isPlaying ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                          style={{
                          position: 'absolute', top: '50%',
                          left: `${(soundStartTime / soundDuration) * 100}%`,
                          transform: 'translateY(-50%)',
                          pointerEvents: 'none',
                        }}><BracketLeft color="var(--ui-fg)" /></motion.div>
                      )}
                      {/* Out-point handle — bracket framing the region (pulses while paused) */}
                      {soundDuration > 0 && (
                        <motion.div
                          animate={{ opacity: isPlaying ? 1 : [1, 0.4, 1] }}
                          transition={isPlaying ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                          style={{
                          position: 'absolute', top: '50%',
                          left: `${((soundEndTime || soundDuration) / soundDuration) * 100}%`,
                          transform: 'translate(-100%, -50%)',
                          pointerEvents: 'none',
                        }}><BracketRight color="var(--ui-fg)" /></motion.div>
                      )}
                    </motion.div>

                    {/* Controls row — 5-section layout:
                        [LT/W+A]+pitch | Z+Space+reset | [A-ctrl/Space]+play | reverse | loop */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...XMB_POP, delay: 0.16 }}
                      style={{
                      position: 'absolute',
                      top: TRANSPORT_FX_H + 8 + TRANSPORT_PROG_H + 8, left: 0, right: 0,
                      height: TRANSPORT_CTL_H,
                      display: 'flex', alignItems: 'center',
                      paddingLeft: 0, paddingRight: 0,
                      transformOrigin: 'left center',
                    }}>

                      {/* ① Pitch: LT/RT in controller, W/A in keyboard */}
                      <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 3, cursor: 'default' }}>
                        {isCtrl ? (
                          <>
                            <Icon name="LT" size={FS_SMALL} color="var(--ui-complement)" />
                            <Icon name="RT" size={FS_SMALL} color="var(--ui-complement)" />
                          </>
                        ) : (
                          <>
                            <Icon name="key-w" size={FS_SMALL} color="var(--ui-complement)" />
                            <Icon name="key-A" size={FS_SMALL} color="var(--ui-complement)" />
                          </>
                        )}
                        <span style={{
                          fontSize: FS_SMALL, fontFamily: FONT, color: 'var(--ui-fg)',
                          letterSpacing: '0.04em', lineHeight: 1,
                          opacity: pitchSemitones === 0 ? 0.45 : 1,
                          minWidth: 20, textAlign: 'left',
                        }}>
                          {pitchSemitones > 0 ? `+${pitchSemitones}` : `${pitchSemitones}`}
                        </span>
                      </div>

                      {/* ② retrigger: LB (controller) or Z+Space (keyboard) */}
                      <div
                        style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}
                        onClick={() => {
                          if (!currentSoundId) return;
                          asyncAudioRef.current = true;
                          setAsyncAudio(true);
                          asyncVideoRef.current = true;
                          setAsyncVideo(true);
                          const audio = audioRef.current;
                          if (audio) {
                            audio.currentTime = soundStartRef.current;
                            setSoundProgress(soundStartRef.current / (audio.duration || 1));
                            if (audio.paused) {
                              playPendingRef.current = true;
                              audio.play()
                                .then(() => { playPendingRef.current = false; if (!audio.paused) { fadeIn(); startAudioRaf(); setIsPlaying(true); } })
                                .catch(() => { playPendingRef.current = false; });
                            } else {
                              fadeIn(); startAudioRaf();
                            }
                          }
                        }}
                      >
                        {isCtrl ? (
                          <Icon name="LB" size={FS_SMALL} color="var(--ui-complement)" />
                        ) : (
                          <>
                            <Icon name="key-z" size={FS_SMALL} color="var(--ui-complement)" />
                            <Icon name="key-spacebar" size={FS_SMALL} color="var(--ui-complement)" />
                          </>
                        )}
                        <Icon name="loop" size={FS_SMALL} color="var(--ui-fg)" />
                      </div>

                      {/* ③ A (controller) / Spacebar (keyboard) hint + Play/Pause */}
                      <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        {isCtrl
                          ? <Icon name="controller-A" size={FS_SMALL} color="var(--ui-complement)" />
                          : <Icon name="key-spacebar" size={FS_SMALL} color="var(--ui-complement)" />
                        }
                        <span onClick={togglePlay} style={{ cursor: 'pointer', display: 'flex' }}>
                          <Icon name={isPlaying ? 'pause' : 'play'} size={FS_SMALL} color="var(--ui-fg)" />
                        </span>
                      </div>

                      {/* ④ Reverse toggle */}
                      <div
                        style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, cursor: 'pointer' }}
                        onClick={toggleReverse}
                      >
                        {isCtrl
                          ? <Icon name="RB" size={FS_SMALL} color="var(--ui-complement)" />
                          : <Icon name="key-r" size={FS_SMALL} color="var(--ui-complement)" />
                        }
                        <Icon name="reverse" size={FS_SMALL} color="var(--ui-fg)" />
                      </div>


                    </motion.div>

                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
