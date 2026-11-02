import { useEffect, useRef, useState } from 'react';
import { changes, qualityKeys } from '../data';
import { messages, metricValue, type MessageKey } from '../i18n';
import { useApp } from '../state';
import { HistoryChart } from './charts';
import { Icon } from './UI';

export function Inspector() {
  const { data, state, select } = useApp(), t = messages[state.lang];
  const sector = data.sectors.find(s => s.id === state.sector);
  const [expanded, setExpanded] = useState(false);
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 1200px)').matches);
  const panel = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), expandButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = () => {
    select(null); setExpanded(false);
    requestAnimationFrame(() => (returnFocus.current?.isConnected ? returnFocus.current : document.getElementById('sector-picker'))?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    const media = matchMedia('(min-width: 1200px)');
    const onChange = () => { setDesktop(media.matches); setExpanded(false); };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (!sector) return;
    if (!panel.current?.contains(document.activeElement)) returnFocus.current = document.activeElement as HTMLElement;
    setExpanded(false);
    if (desktop) heading.current?.focus({ preventScroll: true });
  }, [sector?.id, desktop]);
  useEffect(() => {
    if (!sector) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !expanded || desktop || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select,input,summary,[tabindex="0"]')).filter(el => el.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // close operates on the current selected sector and captured return target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector?.id, expanded, desktop, select]);
  useEffect(() => {
    if (!expanded || desktop) return;
    const backgrounds = Array.from(document.querySelectorAll<HTMLElement>('[data-background]'));
    const before = backgrounds.map(el => ({ inert: el.inert, hidden: el.getAttribute('aria-hidden') }));
    backgrounds.forEach(el => { el.inert = true; el.setAttribute('aria-hidden', 'true'); });
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    heading.current?.focus({ preventScroll: true });
    return () => { backgrounds.forEach((el, i) => { el.inert = before[i].inert; if (before[i].hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', before[i].hidden!); }); document.body.style.overflow = originalOverflow; };
  }, [expanded, desktop]);
  if (!sector) return null;
  const row = changes(data, state.from, state.to).find(r => r.sector.id === sector.id)!;
  const notes = qualityKeys(data, sector.id, state.from, state.to);
  const collapse = () => { setExpanded(false); requestAnimationFrame(() => expandButton.current?.focus()); };
  return <>
    {expanded && !desktop && <div className="inspector-backdrop" onClick={collapse} aria-hidden="true" />}
    <aside id="sector-inspector" ref={panel} className={`sector-inspector ${expanded ? 'expanded' : ''}`} role={expanded && !desktop ? 'dialog' : 'region'} aria-modal={expanded && !desktop ? true : undefined} aria-labelledby="sector-detail-name">
      <div className="inspector-header"><span className="eyebrow">{t.inspectorLabel}</span><button className="icon-button inspector-close" aria-label={t.overall} onClick={close}><Icon name="close" /></button></div>
      <div className="inspector-title"><i style={{ background: sector.colour }} /><h2 id="sector-detail-name" ref={heading} tabIndex={-1}>{sector.name[state.lang]}</h2></div>
      <button ref={expandButton} className="inspector-expand text-button" onClick={() => expanded ? collapse() : setExpanded(true)} aria-expanded={expanded} aria-controls="inspector-body">{expanded ? t.collapse : t.expand}<Icon name="chevron" size={15} /></button>
      <div id="inspector-body" className="inspector-body"><p className="sector-description">{sector.description[state.lang]}</p><div className="inspector-period"><span>{t.compare}</span><strong>{state.from} → {state.to}</strong></div><dl className="sector-statistics"><div><dt>{t.peopleChange}</dt><dd>{metricValue(row.absolute, 'absolute', state.lang)}</dd></div><div><dt>{t.percentChange}</dt><dd>{metricValue(row.relative, 'relative', state.lang)}</dd></div><div><dt>{t.shareChange}</dt><dd>{metricValue(row.share, 'share', state.lang)}</dd></div></dl><h3>{t.historical}</h3><HistoryChart sector={sector} /><details className="sector-codes"><summary>{t.codes} · CNAE-2009</summary><p>{sector.divisionCodes.join(', ')}</p><p>{t.industryNote}</p></details>{notes.length > 0 && <div className="sector-quality"><h4><Icon name="info" size={15} />{t.quality}</h4>{notes.map((key: MessageKey) => <p key={key}>{t[key]}</p>)}</div>}<p className="chart-footnote">{t.sampleWarning}</p><button className="text-button return-overall" onClick={close}>{t.overall}<Icon name="arrow" size={16} /></button></div>
    </aside>
  </>;
}
