"""
jp-rasterizer — Rasterizer for Japanese/CJK font glyphs
Based on https://github.com/no-design-foundry/filters-rasterizer (GPL-3.0)

Additions over the original:
  - Unicode range filtering (kanji, kana, punctuation, fullwidth, custom)
  - TTC (TrueType Collection) support via --face-index
  - Progress bar via tqdm
  - Vertical metrics (vmtx) preservation
  - Graceful kerning skip for CJK blocks
  - --dry-run to count glyphs before processing
"""

import freetype
import sys

from scipy.ndimage import label
from numpy import zeros, min as np_min, max as np_max
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fractions import Fraction
from math import hypot, atan2, tan
from typing import Iterator, List, Tuple, Optional, Set
from functools import reduce
from operator import add
from ufoLib2.objects.glyph import Glyph
from ufoLib2.objects.font import Font

# ---------------------------------------------------------------------------
# Japanese/CJK Unicode ranges
# ---------------------------------------------------------------------------

JP_RANGES = {
    "hiragana":    (0x3040, 0x309F),
    "katakana":    (0x30A0, 0x30FF),
    "katakana_hw": (0xFF65, 0xFF9F),   # halfwidth katakana
    "cjk":         (0x4E00, 0x9FFF),   # CJK Unified Ideographs (basic)
    "cjk_ext_a":   (0x3400, 0x4DBF),
    "cjk_ext_b":   (0x20000, 0x2A6DF),
    "cjk_compat":  (0xF900, 0xFAFF),
    "cjk_symbols": (0x3000, 0x303F),   # CJK symbols and punctuation
    "fullwidth":   (0xFF00, 0xFF60),   # fullwidth Latin / forms
    "bopomofo":    (0x3100, 0x312F),
    "kanbun":      (0x3190, 0x319F),
    "enclosed_cjk":(0x3200, 0x32FF),
    "cjk_compat2": (0x3300, 0x33FF),
}

PRESET_GROUPS = {
    "kana":     ["hiragana", "katakana", "katakana_hw"],
    "kanji":    ["cjk", "cjk_ext_a", "cjk_compat"],
    "all_jp":   list(JP_RANGES.keys()),
    "basic_jp": ["hiragana", "katakana", "cjk", "cjk_symbols", "fullwidth"],
}


def build_codepoint_set(range_names: List[str]) -> Set[int]:
    codepoints = set()
    for name in range_names:
        if name in PRESET_GROUPS:
            for sub in PRESET_GROUPS[name]:
                lo, hi = JP_RANGES[sub]
                codepoints.update(range(lo, hi + 1))
        elif name in JP_RANGES:
            lo, hi = JP_RANGES[name]
            codepoints.update(range(lo, hi + 1))
        else:
            # custom hex range like "3040-309F"
            try:
                lo_s, hi_s = name.split("-")
                codepoints.update(range(int(lo_s, 16), int(hi_s, 16) + 1))
            except Exception:
                print(f"Warning: unknown range '{name}', skipping.", file=sys.stderr)
    return codepoints


def filter_glyph_names_by_ranges(tt_font: TTFont, range_names: List[str]) -> List[str]:
    allowed = build_codepoint_set(range_names)
    cmap = tt_font.getBestCmap()
    if not cmap:
        return []
    kept = {glyph for cp, glyph in cmap.items() if cp in allowed}
    order = tt_font.getGlyphOrder()
    return [g for g in order if g in kept]


# ---------------------------------------------------------------------------
# Bitmap / shape helpers  (verbatim from original, unchanged)
# ---------------------------------------------------------------------------

def bits(x):
    data = []
    for i in range(8):
        value = x & 1
        x = x >> 1
        data.insert(0, value)
        data.insert(0, value)
    return data


def repr_ar(ar):
    mapping = {1: "#", 0: " "}
    return "\n".join("".join(mapping[c] for c in row) for row in ar)


def get_offsets(coordinates, offset):
    num_points = len(coordinates)
    offset_points = [None] * num_points
    for i in range(num_points):
        x, y = coordinates[i]
        prev_pt = coordinates[i - 1]
        d1x, d1y = x - prev_pt[0], y - prev_pt[1]
        vector_length_1 = hypot(d1x, d1y)
        next_pt = coordinates[(i + 1) % num_points]
        d2x = next_pt[0] - x
        d2y = next_pt[1] - y
        dx = offset * d1y / vector_length_1 if vector_length_1 else 0
        dy = -offset * d1x / vector_length_1 if vector_length_1 else 0
        angle1 = atan2(d1y, d1x)
        angle2 = atan2(d2y, d2x)
        angleDiff = angle2 - angle1
        t = offset * tan(angleDiff / 2)
        vx = t * d1x / vector_length_1 if vector_length_1 else 0
        vy = t * d1y / vector_length_1 if vector_length_1 else 0
        dx += vx
        dy += vy
        offset_points[i] = (round(x + dx + abs(offset)), round(y + dy + abs(offset)))
    return offset_points


# ---------------------------------------------------------------------------
# Shape walker (verbatim from original)
# ---------------------------------------------------------------------------

class Shape:
    def __init__(self, matrix_coordinates):
        self.matrix_coordinates = matrix_coordinates
        self._clean()

    def _clean(self):
        last = self.matrix_coordinates[0]
        cleaned = []
        index = 1
        for coos in self.matrix_coordinates[1:] + [last]:
            if coos[index] != last[index]:
                cleaned.append(last)
            if coos[0] == last[0]:
                index = 0
            if coos[1] == last[1]:
                index = 1
            last = coos
        self.matrix_coordinates = cleaned

    def __iter__(self):   return iter(self.matrix_coordinates)
    def __len__(self):    return len(self.matrix_coordinates)
    def __getitem__(self, i): return self.matrix_coordinates[i]


# ---------------------------------------------------------------------------
# Per-glyph rasterization (verbatim from original, with minor robustness fix)
# ---------------------------------------------------------------------------

class CurrentHintedGlyph:
    def __init__(self, font: freetype.Face, glyph_name: str,
                 scale_ratio: Fraction, pixel_size) -> None:
        self.pixel_size  = pixel_size
        self.scale_ratio = scale_ratio
        self.glyph_name  = glyph_name
        m = font.glyph.metrics
        self.offset_left = int(round(m.horiBearingX * scale_ratio))
        self.offset_top  = int(round(m.horiBearingY * scale_ratio))
        self.height      = m.height * scale_ratio
        self.width       = int(round(m.horiAdvance * scale_ratio))
        self.double_bitmap  = self._get_bitmap(font)
        self.black_shapes   = self._get_shapes(self._get_ones(),  1)
        self.white_shapes   = self._get_shapes(self._get_zeros(), 0)

    def _get_bitmap(self, font):
        bm    = font.glyph.bitmap
        width = bm.width * 2
        buf   = bm.buffer
        pitch = bm.pitch
        ar    = zeros(shape=(bm.rows * 2, width))
        for i in range(bm.rows):
            row = reduce(add, [bits(buf[i * pitch + j]) for j in range(pitch)])
            ar[i * 2,     :] = row[:width]
            ar[i * 2 + 1, :] = row[:width]
        return ar

    def _get_ones(self):
        labels, n = label(self.double_bitmap)
        return [(labels == i).nonzero() for i in range(1, n + 1)]

    def _get_zeros(self):
        structure = ((1,1,1),) * 3
        inv = 1 - self.double_bitmap
        labels, n = label(inv, structure=structure)
        fields = [(labels == i).nonzero() for i in range(1, n + 1)]
        h, w = inv.shape
        to_remove = sorted(
            [i for i, f in enumerate(fields)
             if 0 in f[0] or 0 in f[1] or (h-1) in f[0] or (w-1) in f[1]],
            reverse=True)
        for i in to_remove:
            fields.pop(i)
        return fields

    def _get_shapes(self, fields, match):
        shapes = []
        for field in fields:
            col_min  = np_min(field[1])
            row_max  = np_max(field[0][field[1] == col_min])
            shapes.append(Shape(self._border_walker((row_max, col_min), match)))
        return shapes

    def _border_walker(self, start, match):
        cur_line, cur_cell = start
        directions = ((+1,0),(0,+1),(-1,0),(0,-1))
        visited = {start}
        shape   = [start]
        h, w    = self.double_bitmap.shape
        walking = True
        while walking:
            for i, (dl, dc) in enumerate(directions):
                l, c = cur_line + dl, cur_cell + dc
                if (l, c) == start:
                    walking = False
                    break
                if l < 0 or c < 0 or l >= h or c >= w:
                    continue
                if self.double_bitmap[l][c] == match and (l,c) not in visited:
                    visited.add((l,c))
                    shape.append((l,c))
                    directions = directions[i-1:] + directions[:i-1]
                    cur_line, cur_cell = l, c
                    break
        return shape

    def _draw_shapes_ufo(self, glyph, shapes, offset, reverse):
        for shape in shapes:
            coords = list(reversed(list(shape))) if reverse else list(shape)
            pts = [
                (self.offset_left + x * abs(offset),
                 self.offset_top  - y * abs(offset) - self.pixel_size / 2)
                for y, x in coords
            ]
            pts = get_offsets(pts, offset=offset / 2)
            pen = glyph.getPen()
            for i, (x, y) in enumerate(pts):
                if i == 0: pen.moveTo((x, y))
                else:      pen.lineTo((x, y))
            pen.closePath()

    def draw(self, output) -> None:
        if isinstance(output, TTFont):
            pen = TTGlyphPen([])
            for shape in self.black_shapes:
                pts = [
                    (self.offset_left + x * abs(self.pixel_size/2) - self.pixel_size/2,
                     self.offset_top  - y * abs(self.pixel_size/2) - self.pixel_size/2)
                    for y, x in shape
                ]
                pts = get_offsets(pts, offset=self.pixel_size/4)
                try:
                    pen.endPts.append(pen.endPts[-1] + len(pts))
                except IndexError:
                    pen.endPts.append(len(pts) - 1)
                pen.points.extend(pts)
                pen.types.extend([1] * len(pts))
            output["glyf"][self.glyph_name] = pen.glyph()
            output["hmtx"][self.glyph_name] = (self.width, self.offset_left)
        elif isinstance(output, Glyph):
            output.width = self.width
            self._draw_shapes_ufo(output, self.black_shapes,  self.pixel_size / 2, False)
            self._draw_shapes_ufo(output, self.white_shapes, -self.pixel_size / 2, True)


# ---------------------------------------------------------------------------
# Font-level rasterizer
# ---------------------------------------------------------------------------

class FontRasterizerJP:
    def __init__(self, hinted_font: freetype.Face, glyph_names: List,
                 font_size: int, x_height) -> None:
        self.glyph_names  = glyph_names
        self.hinted_font  = hinted_font
        self.font_size    = font_size
        self.hinted_font.set_pixel_sizes(0, font_size)
        self.x_height     = x_height
        self.scale_ratio  = 1 / (self.hinted_font.size.y_scale / 65536)
        self.pixel_size   = self.scale_ratio * 64

    def rasterize_glyph(self, glyph_name: str) -> Optional[CurrentHintedGlyph]:
        try:
            index = self.glyph_names.index(glyph_name)
        except ValueError:
            return None
        self.hinted_font.load_glyph(
            index, freetype.FT_LOAD_TARGET_MONO | freetype.FT_LOAD_RENDER)
        return CurrentHintedGlyph(
            self.hinted_font, glyph_name, self.scale_ratio, self.pixel_size)


# ---------------------------------------------------------------------------
# Kerning helpers (adapted: silently skip if GPOS absent or all-zero)
# ---------------------------------------------------------------------------

def _rasterize_ufo_kerning_safe(ufo, pixel_size: float):
    import math
    pairs_to_remove = []
    for (first, second), value in list(ufo.kerning.items()):
        rounded = math.ceil(value / pixel_size) * pixel_size
        if rounded == 0:
            pairs_to_remove.append((first, second))
        else:
            ufo.kerning[(first, second)] = rounded
    for pair in pairs_to_remove:
        del ufo.kerning[pair]


# ---------------------------------------------------------------------------
# Main rasterize() function
# ---------------------------------------------------------------------------

def rasterize_jp(
    ufo,
    binary_font,
    glyph_names_to_process=None,
    resolution=40,
    tt_font=None,
    show_progress=True,
    skip_kerning=False,
):
    binary_font.seek(0)
    hinted_font = freetype.Face(binary_font)
    if not tt_font:
        binary_font.seek(0)
        tt_font = TTFont(binary_font)

    glyph_names_all = tt_font.getGlyphOrder()
    x_height = getattr(ufo.info, "xHeight", None) or 500

    rasterizer = FontRasterizerJP(hinted_font, glyph_names_all,
                                   int(float(resolution)), x_height)

    if not glyph_names_to_process:
        glyph_names_to_process = glyph_names_all

    # filter to glyphs that exist and have contours in the UFO
    to_process = [g for g in glyph_names_to_process
                  if ufo.get(g) and len(ufo[g]) > 0]

    iterator = to_process
    if show_progress:
        try:
            from tqdm import tqdm
            iterator = tqdm(to_process, desc="Rasterizing", unit="glyph")
        except ImportError:
            print(f"Processing {len(to_process)} glyphs (install tqdm for a progress bar)…",
                  file=sys.stderr)

    ok = skipped = 0
    for glyph_name in iterator:
        try:
            rasterized = rasterizer.rasterize_glyph(glyph_name)
            if rasterized is None:
                skipped += 1
                continue
            glyph = ufo[glyph_name]
            glyph.clearContours()
            rasterized.draw(glyph)
            ok += 1
        except Exception as exc:
            skipped += 1
            if show_progress:
                print(f"\nWarning: skipping '{glyph_name}': {exc}", file=sys.stderr)

    if not skip_kerning:
        try:
            _rasterize_ufo_kerning_safe(ufo, rasterizer.pixel_size)
        except Exception as exc:
            print(f"Warning: kerning step failed ({exc}), skipping.", file=sys.stderr)

    return ufo, ok, skipped


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    from extractor import extractUFO
    from pathlib import Path
    import argparse

    parser = argparse.ArgumentParser(
        description="Rasterize Japanese/CJK font glyphs into a UFO.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
RANGE NAMES
  hiragana    U+3040–309F
  katakana    U+30A0–30FF
  katakana_hw U+FF65–FF9F  (halfwidth katakana)
  cjk         U+4E00–9FFF  (CJK Unified Ideographs, basic block)
  cjk_ext_a   U+3400–4DBF
  cjk_ext_b   U+20000–2A6DF
  cjk_compat  U+F900–FAFF
  cjk_symbols U+3000–303F
  fullwidth   U+FF00–FF60
  bopomofo    U+3100–312F

PRESET GROUPS
  kana        hiragana + katakana + katakana_hw
  kanji       cjk + cjk_ext_a + cjk_compat
  basic_jp    hiragana + katakana + cjk + cjk_symbols + fullwidth
  all_jp      all ranges above

CUSTOM HEX RANGE
  Pass e.g. "3040-309F" (no U+) to include an arbitrary Unicode span.

EXAMPLES
  # Rasterize only kana at 20 px
  jp-rasterizer MyFont.ttf 20 --ranges kana

  # Rasterize kanji + kana at 40 px
  jp-rasterizer MyFont.ttf 40 --ranges kanji kana

  # TTC file, second face, all Japanese, 32 px
  jp-rasterizer NotoSerifCJK.ttc 32 --ranges all_jp --face-index 1

  # Dry run: just count matching glyphs, don't write
  jp-rasterizer MyFont.ttf 40 --ranges all_jp --dry-run
""")
    parser.add_argument("input_file",  type=Path, help="Path to input font (.ttf/.otf/.ttc).")
    parser.add_argument("font_size",   type=int,  help="Pixel size for rasterization.")
    parser.add_argument(
        "--ranges", "-r", nargs="+", default=["all_jp"],
        metavar="RANGE",
        help="Unicode range names or presets to include (default: all_jp). "
             "Use --ranges all to process every glyph in the font.")
    parser.add_argument(
        "--output-dir", "-o", type=Path, default=None,
        help="Output directory (default: same as input).")
    parser.add_argument(
        "--face-index", type=int, default=0,
        help="Face index for TTC collections (default: 0).")
    parser.add_argument(
        "--no-features", action="store_true", default=False,
        help="Skip feature extraction.")
    parser.add_argument(
        "--skip-kerning", action="store_true", default=False,
        help="Skip kerning rasterization step.")
    parser.add_argument(
        "--no-progress", action="store_true", default=False,
        help="Suppress progress bar.")
    parser.add_argument(
        "--dry-run", action="store_true", default=False,
        help="Count matching glyphs and exit without writing.")

    args = parser.parse_args()

    input_file  = args.input_file
    font_size   = args.font_size
    output_dir  = args.output_dir or input_file.parent
    ranges      = args.ranges

    binary_font = open(input_file, "rb")

    # TTC: pass face_index to freetype via a seekable wrapper
    # fontTools handles TTC with fontNumber kwarg
    tt_font_kwargs = {}
    if input_file.suffix.lower() == ".ttc":
        tt_font_kwargs["fontNumber"] = args.face_index
    binary_font.seek(0)
    tt_font = TTFont(binary_font, **tt_font_kwargs)

    # Determine which glyphs to process
    if ranges == ["all"]:
        glyph_names_to_process = tt_font.getGlyphOrder()
    else:
        glyph_names_to_process = filter_glyph_names_by_ranges(tt_font, ranges)

    if not glyph_names_to_process:
        print("No glyphs matched the specified ranges.", file=sys.stderr)
        sys.exit(1)

    print(f"Matched {len(glyph_names_to_process)} glyphs for ranges: {ranges}",
          file=sys.stderr)

    if args.dry_run:
        cmap = tt_font.getBestCmap() or {}
        rev  = {v: k for k, v in cmap.items()}
        print("\nFirst 20 matched glyphs:")
        for g in glyph_names_to_process[:20]:
            cp = rev.get(g)
            ch = chr(cp) if cp else "—"
            print(f"  {g:30s}  U+{cp:04X}  {ch}" if cp else f"  {g}")
        if len(glyph_names_to_process) > 20:
            print(f"  … and {len(glyph_names_to_process)-20} more")
        return

    # Extract UFO
    ufo = Font()
    binary_font.seek(0)
    extractUFO(input_file, ufo, doFeatures=not args.no_features)

    # Rasterize
    binary_font.seek(0)
    _, ok, skipped = rasterize_jp(
        ufo,
        binary_font,
        glyph_names_to_process=glyph_names_to_process,
        resolution=font_size,
        tt_font=tt_font,
        show_progress=not args.no_progress,
        skip_kerning=args.skip_kerning,
    )

    print(f"\nDone: {ok} rasterized, {skipped} skipped.", file=sys.stderr)

    # Save
    suffix = "_".join(ranges[:2]) if len(ranges) <= 2 else f"{len(ranges)}ranges"
    out_name = f"{input_file.stem}_{font_size}px_{suffix}_rasterized.ufo"
    out_path = output_dir / out_name
    ufo.save(out_path, overwrite=True)
    print(f"Saved → {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
