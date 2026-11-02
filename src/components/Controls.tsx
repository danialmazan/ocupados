import { useEffect, useRef, useState } from 'react';
import { national } from '../data';
import { fmt, messages, signed } from '../i18n';
import { useAnimatedNumber } from '../hooks';
import { useApp } from '../state';
import { Brand, BreakNote, Icon } from './UI';

export function LanguageSwitch() {
  const { state, update, pause } = useApp(), t = messages[state.lang];
  return <div className="language-switch" role="group" aria-label={t.languageLabel}>{(['es', 'en'] as const).map(lang => <button key={lang} lang={lang} aria-pressed={state.lang === lang} onClick={() => { pause(); update({ lang }); }}>{lang.toUpperCase()}</button>)}</div>;
}

export function Header() {
  const { state } = useApp(), t = messages[state.lang];
  return <><a className="skip-link" href="#explore">{t.skip}</a><header className="masthead"><div className="identity"><h1 className="brand-heading"><Brand /></h1><p>{t.subtitle}</p></div><nav className="header-actions" aria-label={t.navigationLabel}><LanguageSwitch /></nav></header></>;
}

export function PeriodControls() {
  const { data, state, compare } = useApp(), t = messages[state.lang];
  const [open, setOpen] = useState(false), [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(state.from), [to, setTo] = useState(state.to), [compact, setCompact] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const starts = [2018, 2008, 2020].filter(y => data.years.includes(y)), last = data.years.at(-1)!;
  useEffect(() => { setFrom(state.from); setTo(state.to); }, [state.from, state.to]);
  useEffect(() => {
    const masthead = document.querySelector('.masthead');
    if (!masthead) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting));
    observer.observe(masthead); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div data-background className={`period-bar ${compact ? 'is-stuck' : ''}`}><div className="period-inner"><div className="sticky-brand" aria-hidden={!compact}><Brand compact /></div><div ref={root} className="period-picker" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}><button ref={trigger} className="period-trigger" aria-label={`${t.period}: ${state.from}–${state.to}`} aria-expanded={open} aria-controls="period-options" onClick={() => { setOpen(!open); setCustom(false); }}><span>{state.from}–{state.to}</span><Icon name="chevron" size={15} /></button>{open && <div id="period-options" className="period-dropdown"><div className="preset-options" role="group" aria-label={t.period}>{starts.map(start => <button key={start} aria-pressed={state.from === start && state.to === last} onClick={() => { compare(start, last); close(); }}>{start}–{last}<span aria-hidden="true">{state.from === start && state.to === last ? '✓' : ''}</span></button>)}<button aria-expanded={custom} aria-controls="custom-period" onClick={() => setCustom(!custom)}>{t.custom}<Icon name="plus" size={15} /></button></div>{custom && <form className="custom-period" id="custom-period" onSubmit={e => { e.preventDefault(); if (from < to) { compare(from, to); close(); } }}><label>{t.from}<select value={from} onChange={e => setFrom(Number(e.target.value))}>{data.years.map(year => <option key={year}>{year}</option>)}</select></label><label>{t.to}<select value={to} onChange={e => setTo(Number(e.target.value))}>{data.years.map(year => <option key={year}>{year}</option>)}</select></label><button className="dark-button" type="submit" disabled={from >= to}>{t.apply}</button>{from >= to && <p role="status">{t.invalidPeriod}</p>}</form>}</div>}</div><div className="sticky-language" aria-hidden={!compact}><LanguageSwitch /></div></div></div>;
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
  const draftRef = useRef(state.year), dragging = useRef(false);
  useEffect(() => { if (!dragging.current) { setDraft(state.year); draftRef.current = state.year; } }, [state.year]);
  const commit = () => { dragging.current = false; update({ year: draftRef.current }); };
  return <div className="timeline"><div className="playback-controls"><button className="play-button" onClick={togglePlayback} disabled={reducedMotion && state.year === state.to} aria-label={reducedMotion ? t.nextYear : playing ? t.pause : t.play}><span className="play-icon"><Icon name={reducedMotion ? 'arrow' : playing ? 'pause' : 'play'} size={16} /></span><span>{reducedMotion ? t.nextYear : playing ? t.pause : t.play}</span></button><div className="year-steppers"><button className="icon-button" aria-label={t.previousYear} disabled={state.year === state.from} onClick={() => step(-1)}>←</button><button className="icon-button" aria-label={t.nextYear} disabled={state.year === state.to} onClick={() => step(1)}>→</button></div></div><div className="timeline-track"><label className="sr-only" htmlFor="year-scrubber">{t.year}</label><input id="year-scrubber" type="range" min={0} max={years.length - 1} step={1} value={Math.max(0, years.indexOf(draft))} aria-valuetext={String(draft)} onPointerDown={() => { pause(); dragging.current = true; }} onChange={e => { pause(); const y = years[Number(e.target.value)]; setDraft(y); draftRef.current = y; if (!dragging.current) update({ year: y }); }} onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit} /><div className="year-ticks">{years.map((year, i) => <button className={year === state.year ? 'active' : ''} key={year} aria-label={`${t.year} ${year}`} aria-current={year === state.year ? 'date' : undefined} onClick={() => { pause(); update({ year }); }}><span className="tick-dot" />{years.length <= 9 || i === 0 || i === years.length - 1 || year === state.year || (year % 5 === 0 && years.length <= 18) ? <span>{year}</span> : <span className="sr-only">{year}</span>}</button>)}</div></div></div>;
}

export function SectorPicker() {
  const { data, state, select } = useApp(), t = messages[state.lang];
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onOutside); return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);
  const normalise = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = data.sectors.filter(s => normalise(`${s.name[state.lang]} ${s.description[state.lang]}`).includes(normalise(query)));
  return <div ref={root} className="sector-picker" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); document.getElementById('sector-picker')?.focus(); } }}><button id="sector-picker" className="text-button" aria-expanded={open} aria-controls="sector-search" onClick={() => setOpen(!open)}><Icon name="search" size={16} />{t.selectSector}<Icon name="chevron" size={14} /></button>{open && <div id="sector-search" className="sector-search"><div className="sector-search-heading"><label className="sr-only" htmlFor="sector-query">{t.searchSector}</label><input id="sector-query" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t.searchPlaceholder} /><button className="icon-button" aria-label={t.close} onClick={() => { setOpen(false); document.getElementById('sector-picker')?.focus(); }}><Icon name="close" size={17} /></button></div><div className="sector-results">{filtered.map(s => <button key={s.id} aria-pressed={state.sector === s.id} onClick={() => { select(s.id); setOpen(false); }}><i style={{ background: s.colour }} />{s.name[state.lang]}<Icon name="arrow" size={14} /></button>)}{!filtered.length && <p>{t.noSectors}</p>}</div></div>}</div>;
}
