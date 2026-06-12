import { useEffect, useRef } from 'react';

// ── Xbox button indices (standard mapping) ─────────────────────────────────────
const BTN_A      = 0;
const BTN_B      = 1;
const BTN_X      = 2;
const BTN_Y      = 3;
const BTN_SELECT = 8;  // Select / Back / Share
const BTN_LB     = 4;
const BTN_RB     = 5;
const BTN_LT     = 6;  // Left trigger  → slowdown ÷2
const BTN_RT     = 7;  // Right trigger → speedup  ×2
const BTN_START  = 9;  // Menu / ≡ button (Xbox "Start")
const BTN_DPAD_U = 12;
const BTN_DPAD_D = 13;
const BTN_DPAD_L = 14;
const BTN_DPAD_R = 15;

// ── Auto-repeat timing ─────────────────────────────────────────────────────────
const REPEAT_DELAY_MS = 380; // ms before auto-repeat kicks in
const REPEAT_RATE_MS  = 120; // ms between repeated fires

// ── Stick deadzone ─────────────────────────────────────────────────────────────
const DEADZONE = 0.35;

// ── Cursor ────────────────────────────────────────────────────────────────────
const CURSOR_SPEED = 12; // px per frame at full deflection (60fps → 720px/s max)

// ── Types ──────────────────────────────────────────────────────────────────────
export interface GamepadCallbacks {
  onUp?:          () => void;
  onDown?:        () => void;
  onLeft?:        () => void;
  onRight?:       () => void;       // D-pad right only
  onStickRight?:  () => void;       // left-stick right only (kept separate so Splash can ignore it)
  onConfirm?:     () => void;       // A only
  onADown?:       () => void;       // A pressed   (rising  edge — for drag-start)
  onAUp?:         () => void;       // A released  (falling edge — for drag-end)
  onSlowdown?:    () => void;       // LT → playback rate ÷2
  onSpeedup?:     () => void;       // RT → playback rate ×2
  onBack?:        () => void;       // B quick release (< 1 s)
  onLB?:          () => void;       // LB (left bumper) — context-sensitive
  onBackHeld?:    () => void;       // B held ≥ 1 s (long press)
  onBDown?:       () => void;       // B pressed down (rising edge, for progress ring)
  onBUp?:         () => void;       // B released (falling edge, for progress ring reset)
  onX?:           () => void;       // X button
  onY?:           () => void;       // Y button
  onRB?:          () => void;       // RB (right bumper) — reverse toggle
  onSelect?:      () => void;       // Select / Back button
  onStart?:       () => void;       // Menu / Start (≡) button
  onAnyInput?:    () => void;       // fires on every input (for inputMode switching)
  onCursorDelta?: (dx: number, dy: number) => void; // right stick
}

// ── Hook ───────────────────────────────────────────────────────────────────────
/**
 * Polls the Gamepad API every animation frame and fires directional / action
 * callbacks with rising-edge detection and auto-repeat for held directions.
 *
 * @param callbacks  Object of handlers — stale-closure safe (uses cbRef pattern)
 * @param enabled    Set to false to pause all input (e.g. while splash is spinning)
 */
export function useGamepadNav(
  callbacks: GamepadCallbacks,
  enabled = true,
) {
  // Always-fresh callback ref — avoids stale closures in the RAF loop
  const cbRef = useRef<GamepadCallbacks>(callbacks);
  useEffect(() => { cbRef.current = callbacks; });

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; });

  useEffect(() => {
    // ── State for edge detection ──────────────────────────────────────────────
    let prevButtons: boolean[] = [];
    let prevStickDir: 'up' | 'down' | 'left' | 'right' | null = null;

    // ── Auto-repeat state ─────────────────────────────────────────────────────
    // Maps a logical direction key → { heldSince, lastFired }
    type RepeatState = { heldSince: number; lastFired: number };
    const repeatState = new Map<string, RepeatState>();

    // ── B-button hold state ───────────────────────────────────────────────────
    const B_HOLD_MS = 1000; // ms before onBackHeld fires (≈ 1 second)
    let bHeldSince: number | null = null;
    let bHoldFired = false;

    let rafId = 0;

    function getStickDir(axes: readonly number[]): typeof prevStickDir {
      const x = axes[0] ?? 0;
      const y = axes[1] ?? 0;
      if (Math.abs(x) < DEADZONE && Math.abs(y) < DEADZONE) return null;
      return Math.abs(x) >= Math.abs(y)
        ? x > 0 ? 'right' : 'left'
        : y > 0 ? 'down'  : 'up';
    }

    function fireDir(dir: 'up' | 'down' | 'left' | 'right', now: number, isRepeat: boolean) {
      if (!enabledRef.current) return;
      const cb = cbRef.current;
      if (!isRepeat) cb.onAnyInput?.();
      switch (dir) {
        case 'up':    cb.onUp?.();    break;
        case 'down':  cb.onDown?.();  break;
        case 'left':  cb.onLeft?.();  break;
        case 'right': cb.onRight?.(); break;
      }
    }

    function tick(now: number) {
      rafId = requestAnimationFrame(tick);

      const gamepads = navigator.getGamepads();
      let gp: Gamepad | null = null;
      for (const g of gamepads) { if (g) { gp = g; break; } }
      if (!gp) {
        prevButtons = [];
        prevStickDir = null;
        repeatState.clear();
        return;
      }

      const cb = cbRef.current;
      const en = enabledRef.current;

      // ── Button edge detection ──────────────────────────────────────────────
      const btns = gp.buttons;

      function pressed(idx: number): boolean {
        const b = btns[idx];
        return b ? b.pressed || b.value > 0.5 : false;
      }
      function rising(idx: number): boolean {
        return pressed(idx) && !prevButtons[idx];
      }

      // Directional buttons (D-pad) with auto-repeat
      const dpadDirs: Array<['up'|'down'|'left'|'right', number]> = [
        ['up',    BTN_DPAD_U],
        ['down',  BTN_DPAD_D],
        ['left',  BTN_DPAD_L],
        ['right', BTN_DPAD_R],
      ];

      for (const [dir, idx] of dpadDirs) {
        if (pressed(idx)) {
          const key = `dpad_${dir}`;
          if (!repeatState.has(key)) {
            // Rising edge
            repeatState.set(key, { heldSince: now, lastFired: now });
            fireDir(dir, now, false);
          } else {
            const rs = repeatState.get(key)!;
            const heldFor = now - rs.heldSince;
            if (heldFor >= REPEAT_DELAY_MS && now - rs.lastFired >= REPEAT_RATE_MS) {
              rs.lastFired = now;
              if (en) fireDir(dir, now, true);
            }
          }
        } else {
          repeatState.delete(`dpad_${dir}`);
        }
      }

      // Action buttons (rising edge only, no repeat)
      if (en) {
        if (rising(BTN_A)) {
          cb.onAnyInput?.();
          cb.onConfirm?.();
          cb.onADown?.();
        }
        // A falling edge
        if (!pressed(BTN_A) && prevButtons[BTN_A]) {
          cb.onAUp?.();
        }
        if (rising(BTN_LT)) {
          cb.onAnyInput?.();
          cb.onSlowdown?.();
        }
        if (rising(BTN_RT)) {
          cb.onAnyInput?.();
          cb.onSpeedup?.();
        }
        // B: rising edge → onBDown (start progress ring); hold ≥ 1 s → onBackHeld;
        //    falling edge without hold → onBack (short press); always onBUp on release.
        if (pressed(BTN_B)) {
          if (bHeldSince === null) {
            // Rising edge
            bHeldSince = now; bHoldFired = false;
            cb.onAnyInput?.(); cb.onBDown?.();
          } else if (!bHoldFired && now - bHeldSince >= B_HOLD_MS) {
            // Hold threshold reached
            bHoldFired = true;
            cb.onAnyInput?.(); cb.onBackHeld?.(); cb.onBUp?.();
          }
        } else {
          if (bHeldSince !== null) {
            // Falling edge
            if (!bHoldFired) {
              // Quick press — treat as normal back
              cb.onAnyInput?.(); cb.onBack?.();
            }
            cb.onBUp?.();
          }
          bHeldSince = null; bHoldFired = false;
        }
        if (rising(BTN_LB)) {
          cb.onAnyInput?.();
          cb.onLB ? cb.onLB() : cb.onBack?.();
        }
        if (rising(BTN_RB)) {
          cb.onAnyInput?.();
          cb.onRB?.();
        }
        if (rising(BTN_X)) {
          cb.onAnyInput?.();
          cb.onX?.();
        }
        if (rising(BTN_Y)) {
          cb.onAnyInput?.();
          cb.onY?.();
        }
        if (rising(BTN_SELECT)) {
          cb.onAnyInput?.();
          cb.onSelect?.();
        }
        if (rising(BTN_START)) {
          cb.onAnyInput?.();
          cb.onStart?.();
        }
      }

      // Snapshot button states for next frame
      prevButtons = Array.from(btns).map(b => b ? b.pressed || b.value > 0.5 : false);

      // ── Left stick ────────────────────────────────────────────────────────
      // Right is routed to onStickRight (not onRight) so SplashScreen can ignore it
      // while Home (XMB) can handle it independently of D-pad right.
      const stickDir = getStickDir(gp.axes);

      if (stickDir) {
        const key = `stick_${stickDir}`;
        if (!repeatState.has(key) || prevStickDir !== stickDir) {
          repeatState.delete(`stick_${prevStickDir ?? ''}`);
          if (!repeatState.has(key)) {
            repeatState.set(key, { heldSince: now, lastFired: now });
            if (stickDir === 'right') {
              if (en) { cb.onAnyInput?.(); cb.onStickRight?.(); }
            } else {
              fireDir(stickDir, now, false);
            }
          }
        } else {
          const rs = repeatState.get(key)!;
          const heldFor = now - rs.heldSince;
          if (heldFor >= REPEAT_DELAY_MS && now - rs.lastFired >= REPEAT_RATE_MS) {
            rs.lastFired = now;
            if (en) {
              if (stickDir === 'right') cb.onStickRight?.();
              else fireDir(stickDir, now, true);
            }
          }
        }
      } else {
        if (prevStickDir) repeatState.delete(`stick_${prevStickDir}`);
      }
      prevStickDir = stickDir;

      // ── Right stick → cursor delta ────────────────────────────────────────
      const rx = gp.axes[2] ?? 0;
      const ry = gp.axes[3] ?? 0;
      const cdx = Math.abs(rx) > DEADZONE ? rx * CURSOR_SPEED : 0;
      const cdy = Math.abs(ry) > DEADZONE ? ry * CURSOR_SPEED : 0;
      if (cdx !== 0 || cdy !== 0) cb.onCursorDelta?.(cdx, cdy);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []); // mount-only — stale closures handled by cbRef / enabledRef
}
