import { describe, expect, it } from 'vitest';
import { beginTouch, moveTouch, finishTouch, clickAllowed } from './gestures';

describe('touch intent, separate from vertical scrolling', () => {
  it('accepts a short deliberate tap only after release', () => {
    const gesture = beginTouch(1, 100, 200, 1000);
    expect(clickAllowed(gesture, 1)).toBe(false);
    expect(finishTouch(gesture, 1, 102, 201, 1120)).toBe(true);
    expect(clickAllowed(gesture, 1)).toBe(true);
  });
  for (const [name, x, y] of [['vertical scroll', 100, 240], ['horizontal drag', 140, 200], ['diagonal drag', 108, 208]] as const) it(`rejects a ${name}`, () => {
    const gesture = beginTouch(1, 100, 200, 1000);
    moveTouch(gesture, 1, x, y);
    expect(finishTouch(gesture, 1, x, y, 1200)).toBe(false);
    expect(clickAllowed(gesture, 1)).toBe(false);
  });
  it('does not mistake a drag returning to its start for a tap', () => {
    const gesture = beginTouch(1, 100, 200, 1000);
    moveTouch(gesture, 1, 100, 250);
    expect(finishTouch(gesture, 1, 100, 200, 1300)).toBe(false);
  });
  it('rejects browser-cancelled touch gestures and their compatibility clicks', () => {
    const gesture = beginTouch(1, 100, 200, 1000);
    gesture.cancelled = true;
    expect(finishTouch(gesture, 1, 101, 201, 1100)).toBe(false);
    expect(clickAllowed(gesture, 1)).toBe(false);
  });
  it('rejects multi-touch and another pointer completing the gesture', () => {
    const gesture = beginTouch(1, 100, 200, 1000);
    expect(finishTouch(gesture, 2, 100, 200, 1100)).toBe(false);
  });
  it('does not interpret a long press as a change of year', () => {
    const gesture = beginTouch(1, 100, 200, 1000);
    expect(finishTouch(gesture, 1, 100, 200, 1800)).toBe(false);
  });
  it('keeps keyboard and assistive activation available after a cancelled touch', () => {
    const gesture = beginTouch(1, 100, 200, 1000);
    gesture.cancelled = true;
    expect(clickAllowed(gesture, 0)).toBe(true);
    expect(clickAllowed(null, 1)).toBe(true);
  });
});
