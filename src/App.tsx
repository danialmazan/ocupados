import { useEffect, useMemo } from 'react';
import { announceComparison, changes, insights, national } from './data';
import { fmt, messages } from './i18n';
import { useApp } from './state';
import { Header, NationalSummary, PeriodControls, SectorPicker, Timeline } from './components/Controls';
import { TreemapChart, RankingChart, ContributionChart } from './components/charts';
import { Inspector } from './components/Inspector';
import { AccessibleTable, Methodology } from './components/Methodology';
import { BreakNote, Icon, InsightLine, SectionHeading } from './components/UI';

export function App() {
  const { data, state, update, reducedMotion } = useApp(), t = messages[state.lang];
  const rows = useMemo(() => changes(data, state.from, state.to), [data, state.from, state.to]);
  const discoveries = useMemo(() => insights(data, state, rows), [data, state, rows]);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.title = `Ocupados · ${t.subtitle}`;
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
  }, [state.lang, t.subtitle, reducedMotion]);
  return <div className={`page-shell ${state.sector ? 'has-selection' : ''}`}><div data-background><Header /></div><PeriodControls /><div data-background><NationalSummary /><InsightLine insight={discoveries[0]} /></div><main id="explore" tabIndex={-1}><div className="workspace"><div className="chart-column" data-background><section className="chart-section structure-section" id="structure" aria-labelledby="structure-title"><SectionHeading number={t.structureEyebrow} title={t.structureTitle} id="structure-title"><div className="displayed-year"><span>{t.showing}</span><strong>{state.year}</strong></div></SectionHeading><div className="structure-description"><p>{t.structureHint}</p><span className="displayed-total">{fmt(national(data, state.year)!, state.lang)} <span>{t.peopleEmployed}</span></span></div><TreemapChart /><Timeline /><div className="under-chart"><p>{t.industryNote}</p><SectorPicker /></div></section>
    <section className="chart-section ranking-section" id="ranking" aria-labelledby="ranking-title"><SectionHeading number={t.rankingEyebrow} title={t.rankingTitle} id="ranking-title"><span className="period-tag">{state.from} → {state.to}</span></SectionHeading><p className="section-description">{t.rankingHint}</p><div className="ranking-controls"><div className="metric-tabs" role="group" aria-label={t.peopleChange}>{(['absolute', 'relative', 'share'] as const).map(metric => <button key={metric} aria-pressed={state.metric === metric} onClick={() => update({ metric })}>{t[metric === 'share' ? 'shareMetric' : metric]}</button>)}</div><label className="sort-control"><span className="sr-only">{t.order}</span><select aria-label={t.order} value={state.sort} onChange={e => update({ sort: e.target.value as typeof state.sort })}><option value="gain">{t.gains}</option><option value="loss">{t.losses}</option><option value="magnitude">{t.magnitude}</option></select></label></div><p className="metric-unit">{t[state.metric === 'absolute' ? 'peopleChange' : state.metric === 'relative' ? 'percentChange' : 'shareChange']}</p><RankingChart rows={rows} /><div className="ranking-bottom"><button className="text-button" aria-expanded={state.view === 'all'} onClick={() => update({ view: state.view === 'all' ? 'leaders' : 'all' })}>{state.view === 'all' ? t.showLeaders : t.showAll}<Icon name="chevron" size={14} /></button><BreakNote compact /></div><InsightLine insight={discoveries[1]} /></section>
    <section className="chart-section contributions-section" id="contributions" aria-labelledby="contributions-title"><SectionHeading number={t.contributionEyebrow} title={t.contributionTitle} id="contributions-title"><span className="period-tag">{state.from} → {state.to}</span></SectionHeading><p className="section-description">{t.contributionHint}</p><ContributionChart rows={rows} /><InsightLine insight={discoveries[2]} /></section><AccessibleTable /></div><Inspector /></div></main><Methodology /><div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announceComparison(data, state)}</div></div>;
}
