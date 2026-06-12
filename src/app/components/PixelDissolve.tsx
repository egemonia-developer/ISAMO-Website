import { useEffect, useRef } from 'react';

// ── PixelDissolve ─────────────────────────────────────────────────────────────
// Renders a full-screen canvas overlay that pixelates in (covering) or out
// (revealing) using a shuffled sequential wave — each block fades over
// `fadeDuration` ms, blocks start in a random order spread across `waveDuration` ms.
// Uses requestAnimationFrame + Canvas 2D (no React re-renders per frame).

interface Props {
  phase: 'covering' | 'revealing';
  pixelSize?:    number; // px side-length of each "pixel" block (default 64)
  waveDuration?: number; // ms to spread the wave across all blocks (default 500)
  fadeDuration?: number; // ms for each block's individual opacity transition (default 80)
  color?:        string; // fill colour — matches app background (default '#ffffff')
  onComplete?:   () => void;
}

export function PixelDissolve({
  phase,
  pixelSize    = 64,
  waveDuration = 500,
  fadeDuration = 80,
  color        = '#ffffff',
  onComplete,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  // Always keep onCompleteRef current — called asynchronously inside RAF loop
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W     = canvas.width;
    const H     = canvas.height;
    const cols  = Math.ceil(W / pixelSize);
    const rows  = Math.ceil(H / pixelSize);
    const total = cols * rows;

    // ── Fisher-Yates shuffle → random appearance order ────────────────────────
    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    ctx.fillStyle = color;
    let rafId: number;
    const start = performance.now();

    function frame(now: number) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;

      let stillAnimating = false;

      for (let k = 0; k < total; k++) {
        // When does this block start its transition?
        const blockStart   = (k / total) * waveDuration;
        const blockElapsed = elapsed - blockStart;

        let alpha: number;

        if (phase === 'covering') {
          // 0 → 1
          if (blockElapsed < 0)         { stillAnimating = true; continue; }
          alpha = Math.min(1, blockElapsed / fadeDuration);
          if (alpha < 1) stillAnimating = true;

        } else {
          // Revealing: all blocks start opaque, fade to 0 in sequence
          if (blockElapsed < 0)         { alpha = 1; stillAnimating = true; }
          else {
            alpha = Math.max(0, 1 - blockElapsed / fadeDuration);
            if (alpha > 0) stillAnimating = true;
          }
        }

        if (alpha <= 0) continue;

        const idx = order[k];
        const col = idx % cols;
        const row = Math.floor(idx / cols);

        ctx.globalAlpha = alpha;
        // +1px avoids sub-pixel gaps between adjacent blocks
        ctx.fillRect(col * pixelSize, row * pixelSize, pixelSize + 1, pixelSize + 1);
      }

      if (stillAnimating) {
        rafId = requestAnimationFrame(frame);
      } else {
        // Animation complete — reset alpha and notify caller
        ctx.globalAlpha = 1;
        onCompleteRef.current?.();
      }
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      ctx.globalAlpha = 1;
    };
  // Re-run when phase changes (covering → revealing)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        50000,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  );
}
