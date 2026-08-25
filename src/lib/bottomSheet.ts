export const SHEET_SNAP_RATIOS = {
  compact: 0.5,
  normal: 0.8,
  expanded: 0.92,
} as const;

export type SheetSnap = keyof typeof SHEET_SNAP_RATIOS;

export const DISMISS_DISTANCE_MIN = 160;
export const DISMISS_DISTANCE_VIEWPORT_RATIO = 0.2;
export const DISMISS_VELOCITY = 0.85;
export const VELOCITY_DISMISS_DISTANCE_MIN = 96;

export function getSheetSnapHeights(viewportHeight: number) {
  return Object.fromEntries(
    Object.entries(SHEET_SNAP_RATIOS).map(([snap, ratio]) => [snap, Math.round(viewportHeight * ratio)]),
  ) as Record<SheetSnap, number>;
}

export function getNearestSheetSnap(height: number, viewportHeight: number): SheetSnap {
  const heights = getSheetSnapHeights(viewportHeight);
  return (Object.keys(heights) as SheetSnap[]).reduce((nearest, snap) =>
    Math.abs(heights[snap] - height) < Math.abs(heights[nearest] - height) ? snap : nearest,
  "normal");
}

export function shouldDismissSheet({
  dragDistance,
  velocity,
  viewportHeight,
}: {
  dragDistance: number;
  velocity: number;
  viewportHeight: number;
}) {
  const downwardDistance = Math.max(0, dragDistance);
  return (
    downwardDistance >= Math.max(DISMISS_DISTANCE_MIN, viewportHeight * DISMISS_DISTANCE_VIEWPORT_RATIO) ||
    (downwardDistance >= VELOCITY_DISMISS_DISTANCE_MIN && velocity >= DISMISS_VELOCITY)
  );
}
