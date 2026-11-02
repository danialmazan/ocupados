export interface TouchGesture {
  pointerId: number; startX: number; startY: number; startedAt: number;
  maxDistance: number; cancelled: boolean; accepted: boolean;
}
export const beginTouch = (pointerId: number, x: number, y: number, time: number): TouchGesture => ({ pointerId, startX: x, startY: y, startedAt: time, maxDistance: 0, cancelled: false, accepted: false });
export function moveTouch(gesture: TouchGesture, pointerId: number, x: number, y: number) {
  if (gesture.pointerId !== pointerId) { gesture.cancelled = true; return; }
  gesture.maxDistance = Math.max(gesture.maxDistance, Math.hypot(x - gesture.startX, y - gesture.startY));
}
export function finishTouch(gesture: TouchGesture, pointerId: number, x: number, y: number, time: number) {
  moveTouch(gesture, pointerId, x, y);
  gesture.accepted = !gesture.cancelled && time >= gesture.startedAt && time - gesture.startedAt <= 600 && gesture.maxDistance <= 7;
  return gesture.accepted;
}
export const clickAllowed = (gesture: TouchGesture | null, detail: number) => detail === 0 || gesture === null || gesture.accepted;
