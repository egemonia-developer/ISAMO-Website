import type { CSSProperties } from 'react';

export function IsamoBrandIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={{ shapeRendering: 'crispEdges', ...style }} viewBox="0 0 152.26 126.72" fill="currentColor">
      <polygon points="51.74 55.44 59.66 55.44 59.66 79.2 67.58 79.2 67.58 95.04 83.42 95.04 83.42 79.2 91.35 79.2 91.35 55.44 99.27 55.44 99.27 31.68 51.74 31.68 51.74 55.44"/>
      <polygon points="91.97 0 60.29 0 60.29 7.91 44.45 7.91 44.45 31.68 107.82 31.68 107.82 7.91 91.97 7.91 91.97 0"/>
      <polygon points="82.8 102.96 66.96 102.96 66.96 110.88 59.04 110.88 59.04 118.8 66.96 118.8 66.96 126.72 82.8 126.72 82.8 118.8 90.73 118.8 90.73 110.88 82.8 110.88 82.8 102.96"/>
      <polygon points="15.84 15.74 0 15.74 0 110.88 15.84 110.88 15.84 15.84 31.68 15.84 31.68 0 15.84 0 15.84 15.74"/>
      <rect x="15.77" y="110.95" width="15.77" height="15.77"/>
      <polygon points="136.42 15.74 136.42 0 120.58 0 120.58 15.84 136.42 15.84 136.42 110.88 152.26 110.88 152.26 15.74 136.42 15.74"/>
      <rect x="120.06" y="110.95" width="15.77" height="15.77"/>
    </svg>
  );
}
