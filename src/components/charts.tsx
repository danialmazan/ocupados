import { useEffect, useMemo, useRef, useState } from 'react';
import { hierarchy, treemap, treemapResquarify, type HierarchyRectangularNode } from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';
import { select as d3select } from 'd3-selection';
import { line } from 'd3-shape';
import { easeCubicOut } from 'd3-ease';
import 'd3-transition';
import { contribution, historicalValue, national, ordered, persons, readableYearValue } from '../data';
import { compact, fmt, messages, metricValue, pct, signed } from '../i18n';
import { useSize } from '../hooks';
import { useApp } from '../state';
import type { Sector, SectorChange } from '../types';
import { Icon, Tooltip, type TooltipContent } from './UI';

type TreeDatum = { sector?: Sector; mean?: number; children?: TreeDatum[] };
type Tile = HierarchyRectangularNode<TreeDatum>;

let measureContext: CanvasRenderingContext2D | null = null;
function wrap(text: string, width: number, fontSize: number, maxLines: number): string[] {
  if (maxLines < 1 || width < 10) return [];
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (measureContext) measureContext.font = `580 ${fontSize}px "Archivo Variable"`;
  const measure = (s: string) => measureContext ? measureContext.measureText(s).width : s.length * fontSize * .55;
  const fit = (s: string, ellipsis = false) => {
    let value = s;
    while (value && measure(value + (ellipsis ? '…' : '')) > width) value = value.slice(0, -1);
    return value.trimEnd() + (ellipsis ? '…' : '');
  };
  const words = text.split(' '), result: string[] = [];
  let current = '';
  for (const word of words) {
    if (measure(`${current} ${word}`.trim()) <= width || !current) current = `${current} ${word}`.trim();
    else { result.push(current); current = word; }
  }
  if (current) result.push(current);
  const overflow = result.length > maxLines;
  result.length = Math.min(result.length, maxLines);
  return result.map((value, i) => fit(value, measure(value) > width || (overflow && i === result.length - 1)));
}

function keyboardActivate(event: KeyboardEvent, node: SVGGElement, activate: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); return; }
  const nodes = Array.from(node.parentElement?.querySelectorAll<SVGGElement>('[role="button"]') ?? []);
  let index = nodes.indexOf(node);
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = Math.min(nodes.length - 1, index + 1);
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = Math.max(0, index - 1);
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = nodes.length - 1;
  else return;
  event.preventDefault();
  nodes.forEach(n => n.setAttribute('tabindex', '-1'));
  nodes[index]?.setAttribute('tabindex', '0'); nodes[index]?.focus();
}

function position(event: PointerEvent | FocusEvent): { x: number; y: number } {
  const box = (event.currentTarget as Element).getBoundingClientRect();
  return event instanceof PointerEvent ? { x: event.clientX, y: event.clientY } : { x: box.left + box.width / 2, y: box.top + Math.min(30, box.height / 2) };
}

export function TreemapChart() {
  const { data, state, select, reducedMotion, pause } = useApp(), t = messages[state.lang];
  const [container, width] = useSize();
  const ref = useRef<SVGGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { void document.fonts.ready.then(() => setFontsReady(true)); }, []);
  const mobile = width > 0 && width < 680;
  const height = mobile ? Math.max(480, Math.min(590, width * 1.5)) : 440;
  const ready = width > 0;
  const tree = useMemo(() => {
    const root = hierarchy<TreeDatum>({ children: data.sectors.map(sector => ({ sector, mean: data.years.reduce((sum, year) => sum + (persons(data, sector.id, year) ?? 0), 0) / data.years.length })) })
      .sum(d => d.mean ?? 0).sort((a, b) => (b.value! - a.value!) || (a.data.sector?.id ?? '').localeCompare(b.data.sector?.id ?? ''));
    const layout = treemap<TreeDatum>().tile(treemapResquarify).size([width || 1000, height]).paddingInner(2).round(true);
    layout(root); // Cache topology from all-year means, before displaying an individual year.
    return { root, layout };
    // Width changes within a breakpoint reuse the cached topology.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mobile, ready]);
  useEffect(() => {
    if (!ref.current || !width) return;
    const parent = d3select(ref.current);
    const root = tree.root.sum(d => d.sector ? (persons(data, d.sector.id, state.year) ?? 0) : 0);
    const tiles = tree.layout.size([width, height])(root).leaves();
    const duration = reducedMotion ? 0 : 600;
    const total = national(data, state.year)!;
    const groups = parent.selectAll<SVGGElement, Tile>('g.treemap-cell').data(tiles, d => d.data.sector!.id);
    groups.exit().interrupt().remove();
    const entering = groups.enter().append('g').attr('class', 'treemap-cell').attr('transform', d => `translate(${d.x0},${d.y0})`).attr('role', 'button');
    entering.append('rect').attr('class', 'tile-shape').attr('width', d => d.x1 - d.x0).attr('height', d => d.y1 - d.y0);
    entering.append('clipPath').attr('id', d => `tile-clip-${d.data.sector!.id}`).append('rect');
    entering.append('text').attr('class', 'tile-label');
    const merged = entering.merge(groups);
    merged.attr('data-sector', d => d.data.sector!.id).attr('aria-pressed', d => String(d.data.sector!.id === state.sector))
      .attr('tabindex', (d, i) => d.data.sector!.id === state.sector || (!state.sector && i === 0) ? 0 : -1)
      .attr('aria-label', d => `${d.data.sector!.name[state.lang]}. ${state.year}: ${fmt(d.value!, state.lang)} ${t.peopleEmployed}, ${pct(d.value! / total, state.lang)} ${t.shareOfEmployment}. ${t.select}.`)
      .classed('selected', d => d.data.sector!.id === state.sector)
      .on('pointermove', function(event: PointerEvent, d) { if (event.pointerType === 'touch') return; setTooltip({ ...position(event), title: d.data.sector!.name[state.lang], value: fmt(d.value!, state.lang), sub: `${state.year} · ${pct(d.value! / total, state.lang)} ${t.shareOfEmployment}`, colour: d.data.sector!.colour }); })
      .on('pointerleave blur', () => setTooltip(null))
      .on('focus', function(event: FocusEvent, d) { pause(); setTooltip({ ...position(event), title: d.data.sector!.name[state.lang], value: fmt(d.value!, state.lang), sub: `${state.year} · ${pct(d.value! / total, state.lang)} ${t.shareOfEmployment}`, colour: d.data.sector!.colour }); })
      .on('click', (_, d) => { setTooltip(null); select(d.data.sector!.id); })
      .on('keydown', function(event: KeyboardEvent, d) { keyboardActivate(event, this, () => { setTooltip(null); select(d.data.sector!.id); }); });
    merged.interrupt().transition().duration(duration).ease(easeCubicOut).attr('transform', d => `translate(${d.x0},${d.y0})`);
    merged.select<SVGRectElement>('rect.tile-shape').attr('fill', d => d.data.sector!.colour).interrupt().transition().duration(duration).ease(easeCubicOut).attr('width', d => Math.max(0, d.x1 - d.x0)).attr('height', d => Math.max(0, d.y1 - d.y0));
    merged.select<SVGRectElement>('clipPath rect').attr('x', 5).attr('y', 4).attr('width', d => Math.max(0, d.x1 - d.x0 - 10)).attr('height', d => Math.max(0, d.y1 - d.y0 - 8));
    merged.each(function(d) {
      const w = d.x1 - d.x0, h = d.y1 - d.y0;
      const fontSize = w > 200 && h > 100 ? 19 : w > 125 && h > 70 ? 16 : 13;
      const padding = w > 100 ? 12 : 7;
      const lines = w >= 58 && h >= 31 ? wrap(d.data.sector!.short[state.lang], w - padding * 2, fontSize, Math.min(3, Math.floor((h - 12) / (fontSize * 1.16)))) : [];
      const text = d3select(this).select<SVGTextElement>('text.tile-label').attr('clip-path', `url(#tile-clip-${d.data.sector!.id})`).style('font-size', `${fontSize}px`);
      text.selectAll<SVGTSpanElement, string>('tspan').data(lines).join('tspan').attr('x', padding).attr('y', (_, i) => padding + fontSize * .8 + i * fontSize * 1.17).text(s => s);
      const showValue = w >= 120 && h >= 90 && lines.length * fontSize * 1.17 + 45 < h;
      d3select(this).selectAll<SVGTextElement, number>('text.tile-value').data(showValue ? [d.value!] : []).join('text').attr('class', 'tile-value').attr('x', padding).attr('y', h - 15).text(value => `${pct(value / total, state.lang)} · ${compact(value, state.lang)}`);
    });
    return () => { parent.selectAll('*').interrupt(); };
  }, [data, state.year, state.lang, state.sector, select, reducedMotion, width, height, tree, pause, t, fontsReady]);
  return <div ref={container} className="treemap-wrap" style={{ minHeight: height }}><svg className="treemap-svg" width={width || '100%'} height={height} role="group" aria-label={`${t.structureTitle} ${state.year}. ${t.structureHint}`}><g ref={ref} /></svg><Tooltip content={tooltip} /></div>;
}

export function RankingChart({ rows }: { rows: SectorChange[] }) {
  const { state, select, reducedMotion } = useApp(), t = messages[state.lang];
  const [container, width] = useSize();
  const ref = useRef<SVGGElement>(null), axis = useRef<SVGGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const visible = useMemo(() => ordered(rows, state.metric, state.sort, state.view === 'leaders'), [rows, state.metric, state.sort, state.view]);
  const mobile = width < 680, rowHeight = mobile ? 72 : 54, height = visible.length * rowHeight + 36;
  const outside = state.sector ? rows.find(row => row.sector.id === state.sector && !visible.some(v => v.sector.id === state.sector)) : undefined;
  useEffect(() => {
    if (!width || !ref.current || !axis.current) return;
    const parent = d3select(ref.current), guide = d3select(axis.current), duration = reducedMotion ? 0 : 550;
    const values = rows.map(r => r[state.metric]).filter(v => v !== null) as number[];
    const min = Math.min(0, ...values), max = Math.max(0, ...values);
    const plotStart = mobile ? 0 : 232, plotEnd = mobile ? width - 2 : width - 100;
    const x = scaleLinear().domain(min === max ? [-1, 1] : [min, max]).range([plotStart + 2, plotEnd - 3]);
    const zero = x(0), barY = mobile ? 40 : 16, barHeight = mobile ? 17 : 22;
    const groups = parent.selectAll<SVGGElement, SectorChange>('g.rank-row').data(visible, d => d.sector.id);
    groups.exit().interrupt().remove();
    const entering = groups.enter().append('g').attr('class', 'rank-row').attr('role', 'button').attr('transform', (_, i) => `translate(0,${i * rowHeight})`);
    entering.append('rect').attr('class', 'row-hit').attr('fill', 'transparent');
    entering.append('line').attr('class', 'row-guide');
    entering.append('rect').attr('class', 'rank-bar').attr('x', zero).attr('width', 0);
    entering.append('text').attr('class', 'rank-label');
    entering.append('text').attr('class', 'rank-value');
    const merged = entering.merge(groups);
    merged.attr('tabindex', (d, i) => d.sector.id === state.sector || (!state.sector && i === 0) ? 0 : -1)
      .attr('data-sector', d => d.sector.id).attr('aria-pressed', d => String(d.sector.id === state.sector))
      .attr('aria-label', d => `${d.sector.name[state.lang]}. ${state.from}–${state.to}: ${metricValue(d[state.metric], state.metric, state.lang)}. ${t.select}.`)
      .classed('selected', d => d.sector.id === state.sector)
      .on('click', (_, d) => { setTooltip(null); select(d.sector.id); })
      .on('pointermove focus', function(event: PointerEvent | FocusEvent, d) { if (event instanceof PointerEvent && event.pointerType === 'touch') return; setTooltip({ ...position(event), title: d.sector.name[state.lang], value: metricValue(d[state.metric], state.metric, state.lang), sub: `${state.from} → ${state.to} · ${t[state.metric === 'share' ? 'shareChange' : state.metric === 'relative' ? 'percentChange' : 'peopleChange']}`, colour: d.sector.colour }); })
      .on('pointerleave blur', () => setTooltip(null))
      .on('keydown', function(event: KeyboardEvent, d) { keyboardActivate(event, this, () => select(d.sector.id)); });
    merged.interrupt().transition().duration(duration).ease(easeCubicOut).attr('transform', (_, i) => `translate(0,${i * rowHeight})`);
    merged.select('rect.row-hit').attr('x', 0).attr('y', 0).attr('width', width).attr('height', rowHeight - 1);
    merged.select('line.row-guide').attr('x1', plotStart).attr('x2', plotEnd).attr('y1', barY + barHeight).attr('y2', barY + barHeight);
    merged.select('rect.rank-bar').attr('y', barY).attr('height', barHeight).attr('fill', d => d.sector.colour).interrupt().transition().duration(duration).ease(easeCubicOut).attr('x', d => Math.min(zero, x(d[state.metric]!))).attr('width', d => Math.abs(x(d[state.metric]!) - zero));
    merged.each(function(d) {
      const label = d3select(this).select('text.rank-label');
      const lines = wrap(d.sector.short[state.lang], mobile ? width - 130 : 215, mobile ? 13 : 14, 2);
      label.selectAll<SVGTSpanElement, string>('tspan').data(lines).join('tspan').attr('x', 0).attr('y', (_, i) => (mobile ? 14 : lines.length === 1 ? 31 : 22) + i * 15).text(line => line);
    });
    merged.select('text.rank-value').attr('x', width - 1).attr('y', mobile ? 15 : 31).attr('text-anchor', 'end').text(d => metricValue(d[state.metric], state.metric, state.lang));
    guide.selectAll('line').data([0]).join('line').attr('class', 'zero-line').attr('x1', zero).attr('x2', zero).attr('y1', mobile ? 35 : 4).attr('y2', Math.max(20, visible.length * rowHeight));
    guide.selectAll('text').data([0]).join('text').attr('class', 'axis-label').attr('x', zero).attr('y', visible.length * rowHeight + 20).attr('text-anchor', 'middle').text('0');
    return () => { parent.selectAll('*').interrupt(); };
  }, [rows, visible, width, mobile, rowHeight, state, select, reducedMotion, t]);
  return <div ref={container} className="ranking-chart"><svg width={width || '100%'} height={height} role="group" aria-label={`${t.rankingTitle} ${state.from}–${state.to}. ${t[state.metric === 'absolute' ? 'peopleChange' : state.metric === 'relative' ? 'percentChange' : 'shareChange']}`}><g ref={ref} /><g ref={axis} pointerEvents="none" /></svg>{!visible.length && <p className="empty-chart">{t.noChanges}</p>}{outside && <div className="outside-selection"><span>{t.selectedOutside}</span><button onClick={() => select(outside.sector.id)}><i style={{ background: outside.sector.colour }} />{outside.sector.name[state.lang]}<strong>{metricValue(outside[state.metric], state.metric, state.lang)}</strong></button></div>}<Tooltip content={tooltip} /></div>;
}

type ContributionSegment = { row: SectorChange; x: number; width: number; sign: number };
export function ContributionChart({ rows }: { rows: SectorChange[] }) {
  const { data, state, select, reducedMotion } = useApp(), t = messages[state.lang];
  const [container, width] = useSize(), ref = useRef<SVGGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null), [all, setAll] = useState(false);
  const start = national(data, state.from), end = national(data, state.to);
  const values = contribution(rows, start !== null && end !== null ? end - start : null);
  const positive = ordered(rows, 'absolute', 'gain', true).filter(r => r.absolute! > 0);
  const negative = ordered(rows, 'absolute', 'loss', true).filter(r => r.absolute! < 0);
  const list = all ? ordered(rows, 'absolute', 'magnitude', false) : [...positive.slice(0, 4), ...negative.slice(0, 3)];
  const zero = values ? width * values.negative / (values.positive + values.negative || 1) : 0;
  useEffect(() => {
    if (!ref.current || !width || !values) return;
    const parent = d3select(ref.current), total = values.positive + values.negative;
    const x = scaleLinear().domain(total ? [-values.negative, values.positive] : [-1, 1]).range([1, width - 1]);
    let p = 0, n = 0;
    const segments: ContributionSegment[] = ordered(rows, 'absolute', 'magnitude', false).filter(r => r.absolute !== 0).map(row => {
      const amount = row.absolute!;
      if (amount > 0) { const segment = { row, x: x(p), width: x(p + amount) - x(p), sign: 1 }; p += amount; return segment; }
      const segment = { row, x: x(n + amount), width: x(n) - x(n + amount), sign: -1 }; n += amount; return segment;
    });
    const groups = parent.selectAll<SVGGElement, ContributionSegment>('g.contribution-segment').data(segments, d => d.row.sector.id);
    groups.exit().interrupt().remove();
    const entering = groups.enter().append('g').attr('class', 'contribution-segment').attr('role', 'button');
    entering.append('rect').attr('class', 'segment-shape').attr('x', x(0)).attr('width', 0).attr('y', 10).attr('height', 74);
    const merged = entering.merge(groups);
    merged.attr('tabindex', (d, i) => d.row.sector.id === state.sector || (!state.sector && i === 0) ? 0 : -1).classed('selected', d => d.row.sector.id === state.sector)
      .attr('data-sector', d => d.row.sector.id).attr('aria-pressed', d => String(d.row.sector.id === state.sector))
      .attr('aria-label', d => `${d.row.sector.name[state.lang]}. ${signed(d.row.absolute!, state.lang)} ${t.peopleEmployed}. ${t.select}.`)
      .on('click', (_, d) => { select(d.row.sector.id); setTooltip(null); })
      .on('pointermove focus', function(event: PointerEvent | FocusEvent, d) {
        if (event instanceof PointerEvent && event.pointerType === 'touch') return;
        const denominator = d.sign > 0 ? values.positive : values.negative;
        setTooltip({ ...position(event), title: d.row.sector.name[state.lang], value: signed(d.row.absolute!, state.lang), sub: `${denominator > 0 ? pct(Math.abs(d.row.absolute!) / denominator, state.lang) : '—'} ${d.sign > 0 ? t.grossIncreaseShare : t.grossDecreaseShare}`, colour: d.row.sector.colour });
      }).on('pointerleave blur', () => setTooltip(null))
      .on('keydown', function(event: KeyboardEvent, d) { keyboardActivate(event, this, () => select(d.row.sector.id)); });
    merged.select('rect.segment-shape').attr('fill', d => d.row.sector.colour).interrupt().transition().duration(reducedMotion ? 0 : 600).ease(easeCubicOut).attr('x', d => d.x).attr('width', d => Math.max(0, d.width));
    return () => { parent.selectAll('*').interrupt(); };
  }, [rows, values?.positive, values?.negative, width, state, select, reducedMotion, t]);
  if (!values) return <p>{t.unavailable}</p>;
  return <div className="contribution-chart"><div className="contribution-equation"><div><span>{t.increases}</span><strong>+{fmt(values.positive, state.lang)}</strong></div><span className="equation-symbol" aria-hidden="true">−</span><div><span>{t.decreases}</span><strong>{fmt(values.negative, state.lang)}</strong></div><span className="equation-symbol" aria-hidden="true">≈</span><div className="net-total"><span>{t.net}</span><strong>{values.nationalNet === null ? t.unavailable : signed(values.nationalNet, state.lang)}</strong></div></div><div ref={container} className="contribution-band"><svg width={width || '100%'} height={112} role="group" aria-label={`${t.increases}: ${fmt(values.positive, state.lang)}. ${t.decreases}: ${fmt(values.negative, state.lang)}.`}><g ref={ref} /><line className="zero-line" x1={zero} x2={zero} y1={2} y2={96} /><text className="axis-label" x={Math.max(6, Math.min(width - 6, zero))} y={110} textAnchor="middle">0</text></svg></div><div className="contribution-leaders">{list.map(row => <button key={row.sector.id} className={row.sector.id === state.sector ? 'selected' : ''} aria-pressed={row.sector.id === state.sector} onClick={() => select(row.sector.id)}><i style={{ background: row.sector.colour }} /><span>{row.sector.short[state.lang]}</span><strong>{signed(row.absolute ?? 0, state.lang)}</strong></button>)}</div><button className="text-button contribution-expand" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t.fewerContributions : t.contributionList}<Icon name="chevron" size={14} /></button><p className="chart-footnote">{t.contributionNote}</p><details className="rounding-detail"><summary>{t.rounding}: {values.roundingDifference === null ? t.unavailable : signed(values.roundingDifference, state.lang)}</summary><p>{t.roundingNote}</p><p>{fmt(values.positive, state.lang)} − {fmt(values.negative, state.lang)} {values.roundingDifference !== null ? signed(values.roundingDifference, state.lang) : ''} = {values.nationalNet !== null ? fmt(values.nationalNet, state.lang) : '—'}</p></details><Tooltip content={tooltip} /></div>;
}

export function HistoryChart({ sector }: { sector: Sector }) {
  const { data, state, update } = useApp(), t = messages[state.lang];
  const [container, width] = useSize(), [inspectYear, setInspectYear] = useState(state.year);
  useEffect(() => setInspectYear(state.year), [state.year, sector.id]);
  const height = 236, margin = { top: 22, left: 42, right: 10, bottom: 29 };
  const points = data.years.map(year => ({ year, value: historicalValue(data, sector.id, year, state.detail) }));
  const max = Math.max(1e-8, ...points.map(p => p.value ?? 0)) * 1.1;
  const x = scaleLinear().domain([data.years[0], data.years.at(-1)!]).range([margin.left, Math.max(margin.left + 1, width - margin.right)]);
  const y = scaleLinear().domain([0, max]).nice(3).range([height - margin.bottom, margin.top]);
  const makeLine = line<(typeof points)[number]>().defined(d => d.value !== null).x(d => x(d.year)).y(d => y(d.value!));
  const before = points.filter(p => p.year < 2021), after = points.filter(p => p.year >= 2021);
  const lastBefore = before.at(-1), firstAfter = after[0];
  const selectedPoint = points.find(p => p.year === inspectYear);
  const inspected = selectedPoint?.value ?? null;
  const clipId = `history-period-${sector.id}`;
  return <div className="history-chart"><div className="history-mode" role="group" aria-label={t.historical}>{(['people', 'share'] as const).map(mode => <button key={mode} aria-pressed={state.detail === mode} onClick={() => update({ detail: mode })}>{mode === 'people' ? t.people : t.shareToggle}</button>)}</div><div className="history-readout"><strong>{readableYearValue(inspected, state.detail, state.lang)}</strong><span>{inspectYear} · {t.annualAverage}</span></div><div ref={container}><svg width={width || '100%'} height={height} role="img" aria-label={`${sector.name[state.lang]}, ${data.years[0]}–${data.years.at(-1)}. ${t.historicalHint}`} onPointerMove={event => { if (!width) return; const left = event.currentTarget.getBoundingClientRect().left; const year = Math.round(x.invert(event.clientX - left)); setInspectYear(Math.max(data.years[0], Math.min(data.years.at(-1)!, year))); }} onPointerLeave={() => setInspectYear(state.year)}>
      <defs><clipPath id={clipId}><rect className="history-window" x={x(state.from) - .5} y={0} width={Math.max(1, x(state.to) - x(state.from) + 1)} height={height} /></clipPath></defs>
      {y.ticks(3).map(value => <g key={value}><line className="history-grid" x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} /><text className="axis-label" x={margin.left - 7} y={y(value) + 4} textAnchor="end">{state.detail === 'people' ? compact(value, state.lang) : pct(value, state.lang, 0)}</text></g>)}
      {[data.years[0], 2012, 2016, 2021, data.years.at(-1)!].filter((v, i, a) => a.indexOf(v) === i && data.years.includes(v)).map(year => <text key={year} className="axis-label" x={x(year)} y={height - 5} textAnchor={year === data.years[0] ? 'start' : year === data.years.at(-1) ? 'end' : 'middle'}>{year}</text>)}
      <rect className="history-period-shade" x={x(state.from)} y={margin.top} width={Math.max(0, x(state.to) - x(state.from))} height={height - margin.bottom - margin.top} />
      {[before, after].map((segment, i) => <path key={`context-${i}`} d={makeLine(segment) ?? ''} className="history-context" />)}
      {[before, after].map((segment, i) => <path key={`highlight-${i}`} d={makeLine(segment) ?? ''} className="history-highlight" clipPath={`url(#${clipId})`} />)}
      {lastBefore?.value !== null && firstAfter?.value !== null && lastBefore && firstAfter && <path d={`M${x(lastBefore.year)},${y(lastBefore.value!)}L${x(firstAfter.year)},${y(firstAfter.value!)}`} className="history-break-connection" />}
      <line className="history-break-marker" x1={x(2021)} x2={x(2021)} y1={margin.top} y2={height - margin.bottom} />
      {points.filter(p => p.value !== null && (p.year === state.from || p.year === state.to)).map(p => <circle key={p.year} cx={x(p.year)} cy={y(p.value!)} r={4} className="history-endpoint" />)}
      {inspected !== null && <g className="history-cursor"><line x1={x(inspectYear)} x2={x(inspectYear)} y1={margin.top} y2={height - margin.bottom} /><circle cx={x(inspectYear)} cy={y(inspected)} r={5} /></g>}
    </svg></div><label className="history-year-selector">{t.year}<select value={inspectYear} onChange={e => setInspectYear(Number(e.target.value))}>{data.years.map(year => <option key={year}>{year}</option>)}</select><span>{t.historicalHint}</span></label></div>;
}
