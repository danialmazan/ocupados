import { useEffect, useMemo, useState } from 'react';
import { announceComparison, changes, national } from './data';
import { fmt, messages } from './i18n';
import { useApp } from './state';
import { Header, NationalSummary, SectorPicker, Timeline } from './components/Controls';
import { TreemapChart, RankingDeck, ContributionChart } from './components/charts';
import { Inspector } from './components/Inspector';
import { AccessibleTable, Methodology } from './components/Methodology';
import { applyShareMetadata } from './share';
import { BreakNote, Icon, SectionHeading } from './components/UI';

export function App() {
  const { data, state, update, reducedMotion } = useApp(), t = messages[state.lang];
  const [flowDirection, setFlowDirection] = useState<'increase' | 'decrease'>('increase');
  const rows = useMemo(() => changes(data, state.from, state.to), [data, state.from, state.to]);
  useEffect(() => {
    applyShareMetadata(state.lang);
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
  }, [state.lang, t.subtitle, reducedMotion]);
  useEffect(() => {
    const revealHash = () => {
      const id = location.hash.slice(1);
      if (!id) return;
      if (id === 'methodology-breaks') document.querySelectorAll<HTMLDetailsElement>('#methodology-panel, #methodology-breaks').forEach(el => { el.open = true; });
      void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => { if (location.hash.slice(1) === id) document.getElementById(id)?.scrollIntoView({ block: 'start' }); })));
    };
    revealHash(); window.addEventListener('hashchange', revealHash);
    return () => window.removeEventListener('hashchange', revealHash);
  }, []);
  const toggleRanking = () => {
    const collapsing = state.view === 'all';
    update({ view: collapsing ? 'leaders' : 'all' });
    if (collapsing && matchMedia('(max-width: 767px)').matches) requestAnimationFrame(() => requestAnimationFrame(() => {
      const ranking = document.getElementById('ranking');
      if (!ranking) return;
      const headerHeight = document.querySelector('.period-inner')?.getBoundingClientRect().height ?? 56;
      window.scrollTo({ top: scrollY + ranking.getBoundingClientRect().top - headerHeight - 16, behavior: reducedMotion ? 'instant' : 'smooth' });
    }));
  };
  return <div className={`page-shell ${state.sector ? 'has-selection' : ''}`}><Header /><div data-background><NationalSummary /></div><main id="explore" tabIndex={-1}><div className="workspace"><div className="chart-column" data-background><section className="chart-section structure-section" id="structure" aria-labelledby="structure-title"><SectionHeading number={t.structureEyebrow} title={t.structureTitle} id="structure-title"><div className="displayed-year"><span>{t.showing}</span><strong>{state.year}</strong></div></SectionHeading><div className="structure-description"><p>{t.structureHint}</p><span className="displayed-total">{t.total}: {fmt(national(data, state.year)!, state.lang)} <span>{t.peopleEmployed}</span></span></div><TreemapChart /><Timeline /><div className="under-chart"><p>{t.industryNote}</p><SectorPicker /></div></section>
    <section className="chart-section ranking-section" id="ranking" aria-labelledby="ranking-title"><SectionHeading number={t.rankingEyebrow} title={t.rankingTitle} id="ranking-title"><span className="period-tag">{state.from} → {state.to}</span></SectionHeading><p className="section-description">{t.rankingHint}</p><div className="ranking-controls"><div className="metric-tabs" role="group" aria-label={t.peopleChange}>{(['absolute', 'relative', 'share'] as const).map(metric => <button key={metric} aria-pressed={state.metric === metric} onClick={() => update({ metric })}>{t[metric === 'share' ? 'shareMetric' : metric]}</button>)}</div><div className="sort-toggle" role="group" aria-label={t.order}>{(['gain', 'loss', 'magnitude'] as const).map(sort => <button key={sort} aria-pressed={state.sort === sort} onClick={() => update({ sort })}>{t[sort === 'gain' ? 'gains' : sort === 'loss' ? 'losses' : 'magnitude']}</button>)}</div></div><RankingDeck rows={rows} /><div className="ranking-bottom"><button className="text-button" aria-expanded={state.view === 'all'} onClick={toggleRanking}>{state.view === 'all' ? t.showLeaders : t.showAll}<Icon name="chevron" size={14} /></button><BreakNote compact /></div></section>
    <section className="chart-section contributions-section" id="contributions" aria-labelledby="contributions-title"><SectionHeading number={t.contributionEyebrow} title={t.contributionTitle} id="contributions-title"><span className="period-tag">{state.from} → {state.to}</span></SectionHeading><p className="section-description">{flowDirection === 'increase' ? t.contributionIncreaseHint : t.contributionDecreaseHint}</p><ContributionChart rows={rows} direction={flowDirection} onDirectionChange={setFlowDirection} /></section><AccessibleTable /></div><Inspector /></div></main><Methodology /><div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announceComparison(data, state)}</div></div>;
}
