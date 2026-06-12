import { useState, useEffect, useRef, type CSSProperties, type Ref } from 'react';
import { useLowConnection } from './hooks/useLowConnection';

/** `/refs/foo.mp4` → `/refs-lq/foo.mp4` — the heavily compressed, audio-less variant. */
export function toLowQuality(src: string): string {
  return src.replace('/refs/', '/refs-lq/');
}

/** Safari renders `preload="metadata"` videos as a blank frame until a frame is
 *  actually decoded. Nudging `currentTime` forward slightly off the target forces
 *  a decode so the poster frame appears without requiring playback. */
export function nudgeVideoFrame(video: HTMLVideoElement, target = 0) {
  video.currentTime = target === 0 ? 0.01 : target;
}

interface VideoTileProps {
  src: string;
  style?: CSSProperties;
  /** Defer loading until the tile nears the viewport. Ignored on a low connection
   *  (where every tile loads its compressed variant up front). */
  lazy?: boolean;
  videoRef?: Ref<HTMLVideoElement>;
}

/**
 * Shared `<video>` tile: on a slow connection (or data-saver mode) every tile
 * loads the heavily compressed `/refs-lq/` variant instead of lazy-loading the
 * full-quality source. If the source fails to load — on any connection — the
 * tile falls back to a plain accent-coloured square instead of staying blank.
 */
export function VideoTile({ src, style, lazy = false, videoRef }: VideoTileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(!lazy);
  const [failed, setFailed] = useState(false);
  const lowConnection = useLowConnection();

  useEffect(() => {
    if (inView || lowConnection) return;
    const v = ref.current;
    if (!v) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { rootMargin: '50% 0px' });
    obs.observe(v);
    return () => obs.disconnect();
  }, [inView, lowConnection]);

  if (failed) {
    return <div style={{ ...style, background: 'var(--ui-complement)' }} />;
  }

  const load = inView || lowConnection;
  const resolvedSrc = lowConnection ? toLowQuality(src) : src;

  return (
    <video
      ref={el => { ref.current = el; if (typeof videoRef === 'function') videoRef(el); else if (videoRef) (videoRef as { current: HTMLVideoElement | null }).current = el; }}
      src={load ? resolvedSrc : undefined}
      muted loop playsInline
      preload={load ? 'metadata' : 'none'}
      onLoadedMetadata={e => nudgeVideoFrame(e.currentTarget)}
      onError={() => setFailed(true)}
      style={style}
    />
  );
}
