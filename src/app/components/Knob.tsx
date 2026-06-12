import { motion } from 'motion/react';
import { useRef, useState } from 'react';

interface KnobProps {
  value: number; // 0–100
  onChange: (value: number) => void;
  onToggle?: () => void; // called on click (no significant drag)
  size?: number;
  enabled?: boolean;
}

export const Knob = ({ value, onChange, onToggle, size = 48, enabled = true }: KnobProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);

  const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)));

  // — Pointer capture drag (works reliably in all environments) ——
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = { startY: e.clientY, startValue: value };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - e.clientY;
    onChange(clamp(dragRef.current.startValue + delta * 0.6));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const moved = dragRef.current ? Math.abs(e.clientY - dragRef.current.startY) : 99;
    dragRef.current = null;
    setIsDragging(false);
    if (moved < 5) onToggle?.();
  };

  // — Scroll wheel for fine control ————————————————————————————
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(clamp(value + (e.deltaY < 0 ? 2 : -2)));
  };

  // — Visual ——————————————————————————————————————————————————
  // –135° at 0, +135° at 100 (270° total sweep, like Ableton knobs)
  const rotation = -135 + (value / 100) * 270;

  const r = 40;
  const circumference = 2 * Math.PI * r;
  const trackArc = (270 / 360) * circumference;
  const filled = (value / 100) * trackArc;

  const cursor = isDragging ? 'grabbing' : 'grab';

  return (
    <div
      style={{ width: size, height: size, position: 'relative', flexShrink: 0, cursor, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(e) => { dragRef.current = null; setIsDragging(false); }}
      onWheel={handleWheel}
    >
      {/* Arc track + fill */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox="0 0 100 100"
      >
        {/* Background track: starts at 135° (≈7 o'clock), sweeps 270° CW to ≈5 o'clock */}
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={enabled ? '#000' : '#d1d5db'}
          strokeWidth="5"
          opacity="0.12"
          strokeDasharray={`${trackArc} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(135 50 50)"
        />
        {/* Filled portion */}
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={enabled ? '#000' : '#d1d5db'}
          strokeWidth="5"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(135 50 50)"
        />
      </svg>

      {/* Indicator needle — rotates around knob center */}
      <motion.div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 2,
          height: size * 0.36,
          marginLeft: -1,
          marginTop: -(size * 0.36),
          borderRadius: 1,
          background: enabled ? '#000' : '#d1d5db',
          transformOrigin: '50% 100%',
          pointerEvents: 'none',
          opacity: enabled ? 1 : 0.4,
        }}
        animate={{ rotate: rotation }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      />

      {/* Value label — shown only on larger knobs */}
      {size >= 44 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: size * 0.22, fontWeight: 300, color: enabled ? '#000' : '#9ca3af' }}>
            {value}
          </span>
        </div>
      )}
    </div>
  );
};
