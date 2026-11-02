import { useEffect, useRef, useState } from 'react';

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
