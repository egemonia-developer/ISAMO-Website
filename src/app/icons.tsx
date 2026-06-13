import type { CSSProperties } from 'react';

// ── Font icons ────────────────────────────────────────────────────────────────
// The ISAMO Sans Display font carries the whole icon set as glyphs, cmapped to
// Private-Use codepoints (U+E000…) so they render as text. `Icon` draws one in
// the icon font, inheriting size/colour like text (no SVG mask/filter needed).

const ICON_CP = {
  LB: 0xe000, LT: 0xe001, RB: 0xe002, RT: 0xe003,
  artists: 0xe004, backing: 0xe005, board: 0xe006,
  'controller-A': 0xe007, 'controller-B': 0xe008, 'controller-X': 0xe009, 'controller-Y': 0xe00a,
  cursor: 0xe00b, download: 0xe00c, effects: 0xe00d, 'four-columns': 0xe00e,
  'key-A': 0xe00f, 'key-G': 0xe010, 'key-back': 0xe011, 'key-c': 0xe012, 'key-down': 0xe013,
  'key-enter': 0xe014, 'key-f': 0xe015, 'key-h': 0xe016, 'key-l': 0xe017, 'key-left': 0xe018,
  'key-m': 0xe019, 'key-r': 0xe01a, 'key-right': 0xe01b, 'key-s': 0xe01c, 'key-shift': 0xe01d,
  'key-spacebar': 0xe01e, 'key-t': 0xe01f, 'key-u': 0xe020, 'key-up': 0xe021, 'key-w': 0xe022, 'key-z': 0xe023,
  library: 0xe024, loop: 0xe025, mascot: 0xe026, movement: 0xe027, mute: 0xe028,
  'ometto-mute': 0xe029, 'ometto-talk': 0xe02a, 'one-column': 0xe02b, online: 0xe02c,
  pause: 0xe02d, play: 0xe02e, reverse: 0xe02f, select: 0xe030, settings: 0xe031, skip: 0xe032,
  'sort-down': 0xe033, 'sort-up': 0xe034, star: 0xe035, start: 0xe036, trash: 0xe037,
  'two-columns': 0xe038, unmute: 0xe039, upload: 0xe03a, esc: 0xe03b,
  'croce-down': 0xe03c, 'croce-left': 0xe03d, 'croce-right': 0xe03e, 'croce-up': 0xe03f,
  'left-stick': 0xe040,
  camera: 0x1f4f7, heart: 0x2665, circle: 0x25cb,
} as const;

export type IconName = keyof typeof ICON_CP;

export const iconChar = (name: IconName): string => String.fromCodePoint(ICON_CP[name]);

// The icon font (same family used for UI text; PUA glyphs live only here).
const ICON_FONT = "'Isamo Rasterize', sans-serif";

export function Icon({ name, size = 16, color = 'var(--ui-fg)', style, className }: {
  name: IconName;
  size?: number | string;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        fontFamily: ICON_FONT,
        fontSize: size,
        lineHeight: 1,
        color,
        display: 'inline-block',
        flexShrink: 0,
        userSelect: 'none',
        ...style,
      }}
    >
      {iconChar(name)}
    </span>
  );
}

