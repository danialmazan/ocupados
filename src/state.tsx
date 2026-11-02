import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { defaults, parseState, stateSearch } from './data';
import type { Dataset, Exploration } from './types';

type UpdateMode = 'push' | 'replace' | 'none';
interface AppContextValue {
  data: Dataset; state: Exploration; playing: boolean; reducedMotion: boolean;
  update: (patch: Partial<Exploration>, mode?: UpdateMode) => void;
  compare: (from: number, to: number) => void;
  select: (id: string | null) => void;
  step: (direction: number) => void;
  togglePlayback: () => void;
  pause: () => void;
}
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ data, children }: { data: Dataset; children: ReactNode }) {
  const [state, dispatch] = useReducer((_: Exploration, next: Exploration) => next, data, d => parseState(window.location.search, d));
  const ref = useRef(state);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const update = useCallback((patch: Partial<Exploration>, mode: UpdateMode = 'push') => {
    const next = { ...ref.current, ...patch };
    if (stateSearch(next) === stateSearch(ref.current)) return;
    ref.current = next;
    if (mode !== 'none') window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', `${window.location.pathname}${stateSearch(next)}${window.location.hash}`);
    dispatch(next);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const compare = useCallback((from: number, to: number) => { setPlaying(false); update({ from, to, year: to }); }, [update]);
  const select = useCallback((sector: string | null) => { setPlaying(false); update({ sector }); }, [update]);
  const step = useCallback((direction: number) => {
    setPlaying(false);
    const current = ref.current;
    const years = data.years.filter(y => y >= current.from && y <= current.to);
    const next = Math.max(0, Math.min(years.length - 1, years.indexOf(current.year) + direction));
    update({ year: years[next] });
  }, [data.years, update]);
  const togglePlayback = useCallback(() => {
    if (reducedMotion) { step(1); return; }
    if (playing) { setPlaying(false); return; }
    const nextYear = ref.current.year >= ref.current.to ? ref.current.from : ref.current.year;
    // Keep side effects outside state updaters (also safe under React StrictMode).
    window.history.pushState(null, '', `${window.location.pathname}${stateSearch({ ...ref.current, year: nextYear })}${window.location.hash}`);
    update({ year: nextYear }, 'replace');
    setPlaying(true);
  }, [reducedMotion, step, update, playing]);
  useEffect(() => {
    const onPop = () => { const restored = parseState(window.location.search, data); ref.current = restored; dispatch(restored); setPlaying(false); };
    window.addEventListener('popstate', onPop);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => { setReducedMotion(media.matches); if (media.matches) setPlaying(false); };
    media.addEventListener('change', onMotion);
    const onVisibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onVisibility);
    // Remove invalid/unknown query parameters without adding an entry.
    const debugParams = new URLSearchParams(location.search);
    const debugQuery = import.meta.env.DEV ? ['audit', 'palette'].filter(key => debugParams.has(key)).map(key => `&${key}=${encodeURIComponent(debugParams.get(key)!)}`).join('') : '';
    window.history.replaceState(null, '', `${window.location.pathname}${stateSearch(ref.current)}${debugQuery}${window.location.hash}`);
    return () => { window.removeEventListener('popstate', onPop); media.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', onVisibility); };
  }, [data]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const current = ref.current;
      const next = data.years.find(y => y > current.year && y <= current.to);
      if (next === undefined) { setPlaying(false); return; }
      update({ year: next }, 'replace');
      if (next === current.to) setPlaying(false);
    }, 1200);
    return () => clearInterval(timer);
  }, [playing, data.years, update]);
  return <AppContext value={{ data, state, playing, reducedMotion, update, compare, select, step, togglePlayback, pause }}>{children}</AppContext>;
}
export function useApp() { const context = useContext(AppContext); if (!context) throw new Error('Missing application provider'); return context; }
export { defaults };
