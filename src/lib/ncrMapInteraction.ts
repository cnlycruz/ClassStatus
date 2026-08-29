export const MIN_NCR_MAP_SCALE = 0.7;
export const MAX_NCR_MAP_SCALE = 4;
export const NCR_MAP_DRAG_THRESHOLD = 8;

export type MapPoint = { x: number; y: number };
export type NcrMapView = { scale: number; pan: MapPoint };

export function initialNcrMapView(): NcrMapView {
  return { scale: 1, pan: { x: 0, y: 0 } };
}

export function clampNcrMapScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_NCR_MAP_SCALE), MAX_NCR_MAP_SCALE);
}

export function ncrLabelCompensation(scale: number): number {
  return 1 / Math.sqrt(clampNcrMapScale(scale));
}

export function ncrLabelEffectiveScale(scale: number): number {
  const clampedScale = clampNcrMapScale(scale);
  return clampedScale * ncrLabelCompensation(clampedScale);
}

export function ncrLabelAnchorTransform(anchor: MapPoint, scale: number): string {
  const compensation = ncrLabelCompensation(scale);
  return `translate(${anchor.x} ${anchor.y}) scale(${compensation}) translate(${-anchor.x} ${-anchor.y})`;
}

export function scalePointAroundAnchor(point: MapPoint, anchor: MapPoint, scale: number): MapPoint {
  return {
    x: anchor.x + (point.x - anchor.x) * scale,
    y: anchor.y + (point.y - anchor.y) * scale,
  };
}

export function ncrMapTransform(view: NcrMapView): string {
  return `translate3d(${view.pan.x}px, ${view.pan.y}px, 0) scale(${view.scale})`;
}

export function hasNcrMapGestureMoved(start: MapPoint, current: MapPoint): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > NCR_MAP_DRAG_THRESHOLD;
}

export function shouldActivateNcrMapTarget(gesture: { hasMoved: boolean; hasPinched: boolean }): boolean {
  return !gesture.hasMoved && !gesture.hasPinched;
}

export function ncrPinchView(input: {
  startView: NcrMapView;
  startMidpoint: MapPoint;
  currentMidpoint: MapPoint;
  viewportCenter: MapPoint;
  nextScale: number;
}): NcrMapView {
  const scale = clampNcrMapScale(input.nextScale);
  const ratio = scale / input.startView.scale;
  return {
    scale,
    pan: {
      x:
        input.currentMidpoint.x -
        input.viewportCenter.x -
        ratio * (input.startMidpoint.x - input.viewportCenter.x - input.startView.pan.x),
      y:
        input.currentMidpoint.y -
        input.viewportCenter.y -
        ratio * (input.startMidpoint.y - input.viewportCenter.y - input.startView.pan.y),
    },
  };
}
