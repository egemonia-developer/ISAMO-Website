import { useState, type CSSProperties, type Ref } from 'react';
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
  videoRef?: Ref<HTMLVideoElement>;
}

/**
 * Shared `<video>` tile: loads immediately (the loading screen prefetches every
 * tile's source so playback starts instantly). On a slow connection (or
 * data-saver mode) it loads the heavily compressed `/refs-lq/` variant instead.
 * If the source fails to load — on any connection — the tile falls back to a
 * plain accent-coloured square instead of staying blank.
 */
export function VideoTile({ src, style, videoRef }: VideoTileProps) {
  const [failed, setFailed] = useState(false);
  const lowConnection = useLowConnection();

  if (failed) {
    return <div style={{ ...style, background: 'var(--ui-complement)' }} />;
  }

  const resolvedSrc = lowConnection ? toLowQuality(src) : src;

  return (
    <video
      ref={videoRef}
      src={resolvedSrc}
      muted loop playsInline
      preload="metadata"
      onLoadedMetadata={e => nudgeVideoFrame(e.currentTarget)}
      onError={() => setFailed(true)}
      style={style}
    />
  );
}
