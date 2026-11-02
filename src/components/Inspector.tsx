import { useEffect, useRef } from 'react';
import { changes, historicalValue, persons, qualityKeys } from '../data';
import { fmt, messages, metricValue, pct, type MessageKey } from '../i18n';
import { useApp } from '../state';
import { HistoryChart } from './charts';
import { sectorDescription } from '../sectorCopy';
import { Icon } from './UI';

export function Inspector() {
  const { data, state, select } = useApp(), t = messages[state.lang];
  const sector = data.sectors.find(s => s.id === state.sector);
  const panel = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = () => {
    select(null);
    requestAnimationFrame(() => (returnFocus.current?.isConnected ? returnFocus.current : document.getElementById('sector-picker'))?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    if (!sector) return;
    if (!panel.current?.contains(document.activeElement)) returnFocus.current = document.activeElement as HTMLElement;
    const backgrounds = Array.from(document.querySelectorAll<HTMLElement>('[data-background]'));
    const before = backgrounds.map(el => ({ inert: el.inert, hidden: el.getAttribute('aria-hidden') }));
    backgrounds.forEach(el => { el.inert = true; el.setAttribute('aria-hidden', 'true'); });
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    heading.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select,input,summary,[tabindex="0"]')).filter(el => el.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      backgrounds.forEach((el, i) => { el.inert = before[i].inert; if (before[i].hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', before[i].hidden!); });
      document.body.style.overflow = originalOverflow;
    };
    // Capture the opener once for each sector, retaining it during chart-mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector?.id, select]);
  if (!sector) return null;
  const row = changes(data, state.from, state.to).find(r => r.sector.id === sector.id)!;
  const notes = qualityKeys(data, sector.id, state.from, state.to);
  const current = persons(data, sector.id, state.year), share = historicalValue(data, sector.id, state.year, 'share');
  const rank = current === null ? null : 1 + data.sectors.filter(s => (persons(data, s.id, state.year) ?? -1) > current).length;
  return <div className="inspector-overlay"><div className="inspector-backdrop" onClick={close} aria-hidden="true" /><aside id="sector-inspector" ref={panel} className="sector-inspector" role="dialog" aria-modal="true" aria-labelledby="sector-detail-name">
    <div className="inspector-header"><span className="eyebrow">{t.inspectorLabel} · {state.year}</span><button className="icon-button inspector-close" aria-label={t.close} onClick={close}><Icon name="close" /></button></div>
    <div className="sector-heading-row"><div className="inspector-title"><i style={{ background: sector.colour }} /><h2 id="sector-detail-name" ref={heading} tabIndex={-1}>{sector.name[state.lang]}</h2></div>
      <dl className="sector-current"><div><dd>{current === null ? t.unavailable : fmt(current, state.lang)}</dd><dt>{t.peopleEmployed}</dt></div><div><dd>{share === null ? '—' : pct(share, state.lang)}</dd><dt>{t.nationalShare}</dt></div><div><dd><strong>{rank ?? '—'}</strong><span>/{data.sectors.length}</span></dd><dt>{t.rank}</dt></div></dl>
    </div>
    <div id="inspector-body" className="inspector-body"><p className="sector-description">{sectorDescription(sector, state.lang)}</p>
      <table className="sector-comparison"><thead><tr><th scope="col"><span className="sr-only">{t.period}</span></th><th scope="col" aria-label={t.peopleChange}><span className="comparison-label-full">{t.peopleChange}</span><span className="comparison-label-short" aria-hidden="true">{t.people}</span></th><th scope="col" aria-label={t.percentChange}><span className="comparison-label-full">{t.percentChange}</span><span className="comparison-label-short" aria-hidden="true">{t.relative}</span></th><th scope="col" aria-label={t.shareChange}><span className="comparison-label-full">{t.shareChange}</span><span className="comparison-label-short" aria-hidden="true">{t.comparisonPP}</span></th></tr></thead><tbody><tr><th scope="row">{state.from}–{state.to}</th><td>{metricValue(row.absolute, 'absolute', state.lang)}</td><td>{metricValue(row.relative, 'relative', state.lang)}</td><td>{metricValue(row.share, 'share', state.lang)}</td></tr></tbody></table>
      <HistoryChart sector={sector} /><details className="sector-codes"><summary>{t.codes} · CNAE-2009</summary><p>{sector.divisionCodes.join(', ')}</p><p>{t.industryNote}</p></details>{notes.length > 0 && <details className="sector-quality"><summary>{t.quality}</summary>{notes.map((key: MessageKey) => <p key={key}>{t[key]}</p>)}<p>{t.sampleWarning}</p></details>}<button className="text-button return-overall" onClick={close}>{t.overall}<Icon name="arrow" size={16} /></button></div>
  </aside></div>;
}
