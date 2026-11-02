import { useEffect, useRef, useState } from 'react';
import { national, stateSearch } from '../data';
import { fmt, messages, signed } from '../i18n';
import { useAnimatedNumber } from '../hooks';
import { useApp } from '../state';
import { BreakNote, Icon } from './UI';

export function Header() {
  const { state, update, pause } = useApp(), t = messages[state.lang];
  const [shareStatus, setShareStatus] = useState('');
  const [fallback, setFallback] = useState('');
  const shareTimer = useRef<number>(0);
  useEffect(() => () => clearTimeout(shareTimer.current), []);
  const share = async () => {
    pause();
    const url = `${location.origin}${location.pathname}${stateSearch(state)}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Ocupados', text: t.subtitle, url }); return; }
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setShareStatus(t.copied);
      clearTimeout(shareTimer.current);
      shareTimer.current = window.setTimeout(() => setShareStatus(''), 2500);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFallback(url);
    }
  };
  return <>
    <a className="skip-link" href="#explore">{t.skip}</a>
    <header className="masthead"><div className="identity"><h1 className="brand-heading"><a className="wordmark" href={import.meta.env.BASE_URL} aria-label="Ocupados">OCUPADOS<span className="brand-dot" aria-hidden="true">.</span></a></h1><p>{t.subtitle}</p></div><nav className="header-actions" aria-label={t.navigationLabel}><div className="language-switch" role="group" aria-label={t.languageLabel}>{(['es', 'en'] as const).map(lang => <button key={lang} lang={lang} aria-pressed={state.lang === lang} onClick={() => { pause(); update({ lang }); }}>{lang.toUpperCase()}</button>)}</div><button className="share-button" aria-label={shareStatus || t.share} onClick={share}><Icon name="share" /><span>{shareStatus || t.share}</span></button></nav></header>
    <span className="sr-only" role="status">{shareStatus}</span>
    {fallback && <div className="copy-fallback"><label htmlFor="share-link">{t.copyFailed}</label><input id="share-link" value={fallback} readOnly onFocus={e => e.target.select()} /><button className="icon-button" aria-label={t.close} onClick={() => setFallback('')}><Icon name="close" /></button></div>}
  </>;
}

export function PeriodControls() {
  const { data, state, compare } = useApp(), t = messages[state.lang];
  const [custom, setCustom] = useState(false), [from, setFrom] = useState(state.from), [to, setTo] = useState(state.to);
  const [compactBar, setCompactBar] = useState(false), [expandedOptions, setExpandedOptions] = useState(false);
  const starts = [2018, 2008, 2019, 2020].filter(y => data.years.includes(y));
  const last = data.years.at(-1)!;
  const isPreset = state.to === last && starts.includes(state.from);
  useEffect(() => { setFrom(state.from); setTo(state.to); }, [state.from, state.to]);
  useEffect(() => {
    const masthead = document.querySelector('.masthead');
    if (!masthead) return;
    const observer = new IntersectionObserver(([entry]) => setCompactBar(!entry.isIntersecting));
    observer.observe(masthead);
    return () => observer.disconnect();
  }, []);
  return <div data-background className={`period-bar ${compactBar ? 'compact-mobile' : ''} ${expandedOptions ? 'options-expanded' : ''}`}><button className="compact-period-control" aria-expanded={expandedOptions} aria-label={t.period} onClick={() => { setExpandedOptions(v => !v); setCustom(false); }}><span>{t.compare}</span><strong>{state.from} → {state.to}</strong><Icon name="chevron" size={15} /></button><div className="period-inner"><span className="control-label">{t.period}</span><div className="period-options" role="group" aria-label={t.period}>{starts.map(start => <button key={start} className="period-button" aria-pressed={state.from === start && state.to === last && !custom} onClick={() => { setCustom(false); setExpandedOptions(false); compare(start, last); }}>{start}<span aria-hidden="true">—</span>{last}</button>)}<button className="period-button custom-button" aria-pressed={!isPreset || custom} aria-expanded={custom} aria-controls="custom-period" onClick={() => setCustom(v => !v)}>{!isPreset ? `${state.from}–${state.to}` : t.custom}<Icon name="chevron" size={14} /></button></div></div>
    {custom && <form className="custom-period" id="custom-period" onSubmit={e => { e.preventDefault(); if (from < to) { compare(from, to); setCustom(false); setExpandedOptions(false); } }}><label>{t.from}<select value={from} onChange={e => setFrom(Number(e.target.value))}>{data.years.map(year => <option key={year}>{year}</option>)}</select></label><span aria-hidden="true">→</span><label>{t.to}<select value={to} onChange={e => setTo(Number(e.target.value))}>{data.years.map(year => <option key={year}>{year}</option>)}</select></label><button className="dark-button" type="submit" disabled={from >= to}>{t.apply}</button>{from >= to && <p role="status">{t.invalidPeriod}</p>}</form>}
  </div>;
}

export function NationalSummary() {
  const { data, state, reducedMotion } = useApp(), t = messages[state.lang];
  const first = national(data, state.from)!, last = national(data, state.to)!;
  const animated = useAnimatedNumber(last, reducedMotion, 100), delta = useAnimatedNumber(last - first, reducedMotion, 100);
  return <section className="national-summary" aria-label={t.nationalLabel}><div className="summary-total"><p className="eyebrow">{t.nationalLabel} <span className="summary-period">{state.from}—{state.to}</span></p><div className="total-line"><span className="start-total">{fmt(first / 1e6, state.lang, 1)}</span><span className="total-arrow" aria-hidden="true">→</span><strong>{fmt(animated / 1e6, state.lang, 1)} <span>{t.million}</span></strong></div><p className="summary-definition">{t.peopleEmployed} · {t.annualAverage}</p></div><div className="summary-change"><strong>{signed(delta, state.lang)}</strong><span>{signed((last / first - 1) * 100, state.lang, 1)}% <span className="subtle">{t.changeSince} {state.from}</span></span><BreakNote compact /></div></section>;
}

export function Timeline() {
  const { data, state, playing, reducedMotion, update, pause, step, togglePlayback } = useApp(), t = messages[state.lang];
  const years = data.years.filter(y => y >= state.from && y <= state.to);
  const [draft, setDraft] = useState(state.year);
  const draftRef = useRef(state.year);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) { setDraft(state.year); draftRef.current = state.year; } }, [state.year]);
  const commit = () => { dragging.current = false; update({ year: draftRef.current }); };
  return <div className="timeline"><div className="playback-controls"><button className="play-button" onClick={togglePlayback} disabled={reducedMotion && state.year === state.to} aria-label={reducedMotion ? t.nextYear : playing ? t.pause : t.play}><span className="play-icon"><Icon name={reducedMotion ? 'arrow' : playing ? 'pause' : 'play'} size={16} /></span><span>{reducedMotion ? t.nextYear : playing ? t.pause : t.play}</span></button><div className="year-steppers"><button className="icon-button" aria-label={t.previousYear} disabled={state.year === state.from} onClick={() => step(-1)}>←</button><button className="icon-button" aria-label={t.nextYear} disabled={state.year === state.to} onClick={() => step(1)}>→</button></div></div><div className="timeline-track"><label className="sr-only" htmlFor="year-scrubber">{t.year}</label><input id="year-scrubber" type="range" min={0} max={years.length - 1} step={1} value={Math.max(0, years.indexOf(draft))} aria-valuetext={String(draft)} style={{ '--progress': `${100 * years.indexOf(draft) / (years.length - 1)}%` } as React.CSSProperties} onPointerDown={() => { pause(); dragging.current = true; }} onChange={e => { pause(); const y = years[Number(e.target.value)]; setDraft(y); draftRef.current = y; if (!dragging.current) update({ year: y }); }} onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit} /><div className="year-ticks">{years.map((year, i) => <button className={year === state.year ? 'active' : ''} key={year} aria-label={`${t.year} ${year}`} aria-current={year === state.year ? 'date' : undefined} onClick={() => { pause(); update({ year }); }}><span className="tick-dot" />{years.length <= 9 || i === 0 || i === years.length - 1 || year === state.year || (year % 5 === 0 && years.length <= 18) ? <span>{year}</span> : <span className="sr-only">{year}</span>}</button>)}</div></div><p className="timeline-note">{t.playbackNote}</p></div>;
}

export function SectorPicker() {
  const { data, state, select } = useApp(), t = messages[state.lang];
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);
  const normalise = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = data.sectors.filter(s => normalise(`${s.name[state.lang]} ${s.description[state.lang]}`).includes(normalise(query)));
  return <div ref={root} className="sector-picker" onKeyDown={e => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); document.getElementById('sector-picker')?.focus(); }
  }}>
    <button id="sector-picker" className="text-button" aria-expanded={open} aria-controls="sector-search" onClick={() => setOpen(!open)}>
      <Icon name="search" size={16} />{t.selectSector}<Icon name="chevron" size={14} />
    </button>
    {open && <div id="sector-search" className="sector-search">
      <div className="sector-search-heading">
        <label className="sr-only" htmlFor="sector-query">{t.searchSector}</label>
        <input id="sector-query" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t.searchPlaceholder} />
        <button className="icon-button" aria-label={t.close} onClick={() => { setOpen(false); document.getElementById('sector-picker')?.focus(); }}><Icon name="close" size={17} /></button>
      </div>
      <div className="sector-results">
        {filtered.map(s => <button key={s.id} aria-pressed={state.sector === s.id} onClick={() => { select(s.id); setOpen(false); }}><i style={{ background: s.colour }} />{s.name[state.lang]}<Icon name="arrow" size={14} /></button>)}
        {!filtered.length && <p>{t.noSectors}</p>}
      </div>
    </div>}
  </div>;
}
