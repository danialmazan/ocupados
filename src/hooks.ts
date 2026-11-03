import { useEffect, useRef, useState } from 'react';
import { beginTouch, moveTouch, finishTouch, clickAllowed, type TouchGesture } from './gestures';
interface TouchPointer { pointerType: string; pointerId: number; clientX: number; clientY: number; timeStamp: number; isPrimary?: boolean }

export function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function useMobileLayout() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const changed = () => setMobile(query.matches);
    changed();
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return mobile;
}

export function useAnimatedNumber(value: number, reducedMotion: boolean, precision = 1) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (reducedMotion) { current.current = value; setDisplay(value); return; }
    const start = performance.now(), first = current.current;
    let handle = 0;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / 600));
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress === 1 ? value : Math.round((first + (value - first) * eased) / precision) * precision;
      current.current = next; setDisplay(next);
      if (progress < 1) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [value, reducedMotion, precision]);
  return display;
}

export function useTouchTap() {
  const gesture = useRef<TouchGesture | null>(null);
  const start = (event: TouchPointer) => {
    gesture.current = event.pointerType === 'touch' ? beginTouch(event.pointerId, event.clientX, event.clientY, event.timeStamp) : null;
    if (event.isPrimary === false && gesture.current) gesture.current.cancelled = true;
  };
  const move = (event: TouchPointer) => { if (event.pointerType === 'touch' && gesture.current) moveTouch(gesture.current, event.pointerId, event.clientX, event.clientY); };
  const cancel = () => { if (gesture.current) { gesture.current.cancelled = true; gesture.current.accepted = false; } };
  const end = (event: TouchPointer) => event.pointerType === 'touch' && gesture.current !== null && finishTouch(gesture.current, event.pointerId, event.clientX, event.clientY, event.timeStamp);
  return { start, move, cancel, end, allowClick: (detail: number) => clickAllowed(gesture.current, detail) };
}
