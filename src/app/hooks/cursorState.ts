/**
 * Module-level cursor state shared between App (cursor movement) and child
 * screens (onConfirm routing). Avoids prop-drilling a ref across the tree.
 */
export const cursorState = {
  /** True when the cursor has moved recently (right stick, not idle). */
  active: false,
  x: 0,
  y: 0,
};
