import { useEffect, useId, useRef, useState } from 'react';
import { national } from '../data';
import { fmt, messages, signed } from '../i18n';
import { useAnimatedNumber, useTouchTap } from '../hooks';
import { useApp } from '../state';
import { Brand, BreakNote, Icon } from './UI';

export function LanguageSwitch() {
  const { state, update, pause } = useApp(), t = messages[state.lang];
  return <div className="language-switch" role="group" aria-label={t.languageLabel}>{(['es', 'en'] as const).map(lang => <button key={lang} lang={lang} aria-pressed={state.lang === lang} onClick={() => { pause(); update({ lang }); }}>{lang.toUpperCase()}</button>)}</div>;
}

export function Header() {
  const { state } = useApp(), t = messages[state.lang];
  const masthead = useRef<HTMLElement>(null), [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!masthead.current) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting));
    observer.observe(masthead.current); return () => observer.disconnect();
  }, []);
  return <>
    <a className="skip-link" href="#explore">{t.skip}</a>
    <header data-background ref={masthead} className="masthead">
      <div className="identity"><h1 className="brand-heading"><Brand /></h1><p>{t.subtitle}</p></div>
      <nav className="header-actions" aria-label={t.navigationLabel}><PeriodControls active={!compact} /><LanguageSwitch /></nav>
    </header>
    <div data-background className={`period-bar ${compact ? 'is-stuck' : ''}`}><div className="period-inner" aria-hidden={!compact}>
      <div className="sticky-brand"><Brand compact /></div><PeriodControls active={compact} /><div className="sticky-language"><LanguageSwitch /></div>
    </div></div>
  </>;
}

export function PeriodControls({ active = true }: { active?: boolean }) {
  const { data, state, compare } = useApp(), t = messages[state.lang];
  const [open, setOpen] = useState(false), [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(state.from), [to, setTo] = useState(state.to);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), uid = useId();
  const optionsId = `period-options-${uid}`, customId = `custom-period-${uid}`;
  const starts = [2018, 2008, 2020].filter(y => data.years.includes(y)), last = data.years.at(-1)!;
  useEffect(() => { setFrom(state.from); setTo(state.to); }, [state.from, state.to]);
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  return <div ref={root} className="period-picker" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
    <button ref={trigger} className="period-trigger" aria-label={`${t.period}: ${state.from}–${state.to}`} aria-expanded={open} aria-controls={optionsId} onClick={() => { setOpen(!open); setCustom(false); }}><span>{state.from}–{state.to}</span><Icon name="chevron" size={15} /></button>
    {open && <div id={optionsId} className="period-dropdown"><div className="preset-options" role="group" aria-label={t.period}>{starts.map(start => <button key={start} aria-pressed={state.from === start && state.to === last} onClick={() => { compare(start, last); close(); }}>{start}–{last}<span aria-hidden="true">{state.from === start && state.to === last ? '✓' : ''}</span></button>)}<button aria-expanded={custom} aria-controls={customId} onClick={() => setCustom(!custom)}>{t.custom}<Icon name="plus" size={15} /></button></div>
      {custom && <form className="custom-period" id={customId} onSubmit={e => { e.preventDefault(); if (from < to) { compare(from, to); close(); } }}><label>{t.from}<select value={from} onChange={e => setFrom(Number(e.target.value))}>{data.years.map(year => <option key={year}>{year}</option>)}</select></label><label>{t.to}<select value={to} onChange={e => setTo(Number(e.target.value))}>{data.years.map(year => <option key={year}>{year}</option>)}</select></label><button className="dark-button" type="submit" disabled={from >= to}>{t.apply}</button>{from >= to && <p role="status">{t.invalidPeriod}</p>}</form>}
    </div>}
  </div>;
}

export function NationalSummary() {
  const { data, state, reducedMotion } = useApp(), t = messages[state.lang];
  const first = national(data, state.from)!, last = national(data, state.year)!;
  const animated = useAnimatedNumber(last, reducedMotion, 100), delta = useAnimatedNumber(last - first, reducedMotion, 100);
  return <section className="national-summary" aria-label={`${t.nationalLabel} · ${state.year}`}>
    <div className="summary-total"><p className="eyebrow">{t.nationalLabel}</p><div className="total-line"><strong>{fmt(animated / 1e6, state.lang, 1)} <span>{t.million}</span></strong></div><p className="summary-definition">{t.peopleEmployed} · {state.year} · {t.annualAverage}</p></div>
    <div className="summary-change"><p><strong>{signed(delta / 1e6, state.lang, 1)} <span>{t.million}</span></strong> <span className="summary-relative">({signed((last / first - 1) * 100, state.lang, 1)}%)</span> <span className="summary-since">{t.since} {state.from}</span></p><BreakNote compact to={state.year} /></div>
  </section>;
}

export function Timeline() {
  const { data, state, playing, reducedMotion, update, pause, step, togglePlayback } = useApp(), t = messages[state.lang];
  const years = data.years.filter(y => y >= state.from && y <= state.to), tap = useTouchTap();
  const [draft, setDraft] = useState(state.year);
  const draftRef = useRef(state.year), dragging = useRef(false), blockedTouch = useRef(false);
  useEffect(() => { if (!dragging.current) { setDraft(state.year); draftRef.current = state.year; } }, [state.year]);
  const commit = () => { if (blockedTouch.current) return; dragging.current = false; update({ year: draftRef.current }); };
  const cancel = () => { dragging.current = false; draftRef.current = state.year; setDraft(state.year); };
  return <div className="timeline"><div className="playback-controls"><button className="play-button" onClick={togglePlayback} disabled={reducedMotion && state.year === state.to} aria-label={reducedMotion ? t.nextYear : playing ? t.pause : t.play}><span className="play-icon"><Icon name={reducedMotion ? 'arrow' : playing ? 'pause' : 'play'} size={16} /></span><span>{reducedMotion ? t.nextYear : playing ? t.pause : t.play}</span></button><div className="year-steppers"><button className="icon-button" aria-label={t.previousYear} disabled={state.year === state.from} onClick={() => step(-1)}>←</button><button className="icon-button" aria-label={t.nextYear} disabled={state.year === state.to} onClick={() => step(1)}>→</button></div></div>
    <div className="timeline-track"><label className="sr-only" htmlFor="year-scrubber">{t.year}</label><input id="year-scrubber" type="range" min={0} max={years.length - 1} step={1} value={Math.max(0, years.indexOf(draft))} aria-valuetext={String(draft)} onPointerDown={e => { blockedTouch.current = e.pointerType === 'touch'; if (blockedTouch.current) { e.preventDefault(); return; } pause(); dragging.current = true; }} onChange={e => { if (blockedTouch.current) return; pause(); const y = years[Number(e.target.value)]; setDraft(y); draftRef.current = y; if (!dragging.current) update({ year: y }); }} onPointerUp={commit} onPointerCancel={cancel} onKeyDown={() => { blockedTouch.current = false; }} onKeyUp={commit} onBlur={cancel} />
      <div className="year-ticks">{years.map((year, i) => <button className={year === state.year ? 'active' : ''} key={year} aria-label={`${t.year} ${year}`} aria-current={year === state.year ? 'date' : undefined} onPointerDown={tap.start} onPointerMove={tap.move} onPointerUp={e => { tap.end(e); }} onPointerCancel={tap.cancel} onClick={e => { if (!tap.allowClick(e.detail)) return; pause(); update({ year }); }}><span className="tick-dot" />{years.length <= 9 || i === 0 || i === years.length - 1 || year === state.year || (year % 5 === 0 && years.length <= 18) ? <span>{year}</span> : <span className="sr-only">{year}</span>}</button>)}</div>
    </div>
  </div>;
}

export function SectorPicker() {
  const { data, state, select } = useApp(), t = messages[state.lang];
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null), search = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const fit = () => {
      // Follow the visible viewport when a phone keyboard or browser chrome resizes it.
      const top = (viewport?.offsetTop ?? 0) + 12;
      search.current?.style.setProperty('--search-top', `${top}px`);
      search.current?.style.setProperty('--search-height', `${(viewport?.height ?? window.innerHeight) - 24}px`);
    };
    fit();
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    return () => { viewport?.removeEventListener('resize', fit); viewport?.removeEventListener('scroll', fit); window.removeEventListener('resize', fit); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onOutside); return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);
  const normalise = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = data.sectors.filter(s => normalise(`${s.name[state.lang]} ${s.description[state.lang]}`).includes(normalise(query)));
  return <div ref={root} className="sector-picker" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); document.getElementById('sector-picker')?.focus(); } }}><button id="sector-picker" className="sector-picker-trigger" aria-expanded={open} aria-controls="sector-search" onClick={() => setOpen(!open)}><Icon name="search" size={16} />{t.selectSector}<Icon name="chevron" size={14} /></button>{open && <div ref={search} id="sector-search" className="sector-search"><div className="sector-search-heading"><label className="sr-only" htmlFor="sector-query">{t.searchSector}</label><input id="sector-query" type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t.searchPlaceholder} /><button className="icon-button" aria-label={t.close} onClick={() => { setOpen(false); document.getElementById('sector-picker')?.focus(); }}><Icon name="close" size={17} /></button></div><div className="sector-results">{filtered.map(s => <button key={s.id} aria-pressed={state.sector === s.id} onClick={() => { select(s.id); setOpen(false); }}><i style={{ background: s.colour }} />{s.name[state.lang]}<Icon name="arrow" size={14} /></button>)}{!filtered.length && <p>{t.noSectors}</p>}</div></div>}</div>;
}
