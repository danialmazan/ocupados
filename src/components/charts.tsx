import { useEffect, useMemo, useRef, useState } from 'react';
import { hierarchy, treemap, treemapResquarify, type HierarchyRectangularNode } from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';
import { select as d3select } from 'd3-selection';
import { line } from 'd3-shape';
import { easeCubicOut } from 'd3-ease';
import 'd3-transition';
import { contribution, historicalValue, national, ordered, persons, readableYearValue } from '../data';
import { compact, fmt, messages, metricValue, pct } from '../i18n';
import { useSize } from '../hooks';
import { useApp } from '../state';
import { tileInk } from '../palettes';
import { sectorFlows, flowLayout } from '../sankey';
import type { Metric, Sector, SectorChange } from '../types';
import { Tooltip, type TooltipContent } from './UI';

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
  const previousSize = useRef({ width: 0, height: 0 });
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
    const resizing = previousSize.current.width !== width || previousSize.current.height !== height;
    const duration = reducedMotion || resizing ? 0 : 600;
    previousSize.current = { width, height };
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
      const text = d3select(this).select<SVGTextElement>('text.tile-label').attr('clip-path', `url(#tile-clip-${d.data.sector!.id})`).style('font-size', `${fontSize}px`).style('fill', tileInk(d.data.sector!.colour));
      text.selectAll<SVGTSpanElement, string>('tspan').data(lines).join('tspan').attr('x', padding).attr('y', (_, i) => padding + fontSize * .8 + i * fontSize * 1.17).text(s => s);
      const showValue = w >= 120 && h >= 90 && lines.length * fontSize * 1.17 + 45 < h;
      d3select(this).selectAll<SVGTextElement, number>('text.tile-value').data(showValue ? [d.value!] : []).join('text').attr('class', 'tile-value').style('fill', tileInk(d.data.sector!.colour)).attr('x', padding).attr('y', h - 15).text(value => `${pct(value / total, state.lang)} · ${compact(value, state.lang)}`);
    });
    return () => { parent.selectAll('*').interrupt(); };
  }, [data, state.year, state.lang, state.sector, select, reducedMotion, width, height, tree, pause, t, fontsReady]);
  return <div ref={container} className="treemap-wrap" style={{ minHeight: height }}><svg className="treemap-svg" width={width || '100%'} height={height} role="group" aria-label={`${t.structureTitle} ${state.year}. ${t.structureHint}`}><g ref={ref} /></svg><Tooltip content={tooltip} /></div>;
}

export function RankingChart({ rows, metric }: { rows: SectorChange[]; metric: Metric }) {
  const { state, select, reducedMotion } = useApp(), t = messages[state.lang];
  const [container, width] = useSize();
  const ref = useRef<SVGGElement>(null), axis = useRef<SVGGElement>(null);
  const previousWidth = useRef(0);
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const visible = useMemo(() => ordered(rows, metric, state.sort, state.view === 'leaders'), [rows, metric, state.sort, state.view]);
  const mobile = width < 680, rowHeight = mobile ? 58 : 42, height = visible.length * rowHeight + 36;
  const outside = state.sector ? rows.find(row => row.sector.id === state.sector && !visible.some(v => v.sector.id === state.sector)) : undefined;
  useEffect(() => {
    if (!width || !ref.current || !axis.current) return;
    const parent = d3select(ref.current), guide = d3select(axis.current), duration = reducedMotion || previousWidth.current !== width ? 0 : 550;
    previousWidth.current = width;
    const values = rows.map(r => r[metric]).filter(v => v !== null) as number[];
    const min = Math.min(0, ...values), max = Math.max(0, ...values);
    const plotStart = mobile ? 0 : 232, plotEnd = mobile ? width - 2 : width - 100;
    const x = scaleLinear().domain(min === max ? [-1, 1] : [min, max]).range([plotStart + 2, plotEnd - 3]);
    const zero = x(0), barY = mobile ? 31 : 12, barHeight = mobile ? 15 : 18;
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
      .attr('aria-label', d => `${d.sector.name[state.lang]}. ${state.from}–${state.to}: ${metricValue(d[metric], metric, state.lang)}. ${t.select}.`)
      .classed('selected', d => d.sector.id === state.sector)
      .on('click', (_, d) => { setTooltip(null); select(d.sector.id); })
      .on('pointermove focus', function(event: PointerEvent | FocusEvent, d) { if (event instanceof PointerEvent && event.pointerType === 'touch') return; setTooltip({ ...position(event), title: d.sector.name[state.lang], value: metricValue(d[metric], metric, state.lang), sub: `${state.from} → ${state.to} · ${t[metric === 'share' ? 'shareChange' : metric === 'relative' ? 'percentChange' : 'peopleChange']}`, colour: d.sector.colour }); })
      .on('pointerleave blur', () => setTooltip(null))
      .on('keydown', function(event: KeyboardEvent, d) { keyboardActivate(event, this, () => select(d.sector.id)); });
    merged.interrupt().transition().duration(duration).ease(easeCubicOut).attr('transform', (_, i) => `translate(0,${i * rowHeight})`);
    merged.select('rect.row-hit').attr('x', 0).attr('y', 0).attr('width', width).attr('height', rowHeight - 1);
    merged.select('line.row-guide').attr('x1', plotStart).attr('x2', plotEnd).attr('y1', barY + barHeight).attr('y2', barY + barHeight);
    merged.select('rect.rank-bar').attr('y', barY).attr('height', barHeight).attr('fill', d => d.sector.colour).interrupt().transition().duration(duration).ease(easeCubicOut).attr('x', d => Math.min(zero, x(d[metric]!))).attr('width', d => Math.abs(x(d[metric]!) - zero));
    merged.each(function(d) {
      const label = d3select(this).select('text.rank-label');
      const lines = wrap(d.sector.short[state.lang], mobile ? width - 130 : 215, mobile ? 13 : 14, 2);
      label.selectAll<SVGTSpanElement, string>('tspan').data(lines).join('tspan').attr('x', 0).attr('y', (_, i) => (mobile ? 15 : lines.length === 1 ? 26 : 17) + i * 15).text(line => line);
    });
    merged.select('text.rank-value').attr('x', width - 1).attr('y', mobile ? 15 : 26).attr('text-anchor', 'end').text(d => metricValue(d[metric], metric, state.lang));
    guide.selectAll('line').data([0]).join('line').attr('class', 'zero-line').attr('x1', zero).attr('x2', zero).attr('y1', mobile ? 26 : 4).attr('y2', Math.max(20, visible.length * rowHeight));
    guide.selectAll('text').data([0]).join('text').attr('class', 'axis-label').attr('x', zero).attr('y', visible.length * rowHeight + 20).attr('text-anchor', 'middle').text('0');
    return () => { parent.selectAll('*').interrupt(); };
  }, [rows, visible, width, mobile, rowHeight, state, metric, select, reducedMotion, t]);
  return <div ref={container} className="ranking-chart"><svg width={width || '100%'} height={height} role="group" aria-label={`${t.rankingTitle} ${state.from}–${state.to}. ${t[metric === 'absolute' ? 'peopleChange' : metric === 'relative' ? 'percentChange' : 'shareChange']}`}><g ref={ref} /><g ref={axis} pointerEvents="none" /></svg>{!visible.length && <p className="empty-chart">{t.noChanges}</p>}{outside && <div className="outside-selection"><span>{t.selectedOutside}</span><button onClick={() => select(outside.sector.id)}><i style={{ background: outside.sector.colour }} />{outside.sector.name[state.lang]}<strong>{metricValue(outside[metric], metric, state.lang)}</strong></button></div>}<Tooltip content={tooltip} /></div>;
}

export function RankingDeck({ rows }: { rows: SectorChange[] }) {
  const { state, update } = useApp(), t = messages[state.lang];
  const deck = useRef<HTMLDivElement>(null), panes = useRef<(HTMLDivElement | null)[]>([]);
  const metrics: Metric[] = ['absolute', 'relative', 'share'];
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 767px)').matches);
  const latest = useRef(state.metric); latest.current = state.metric;
  const [deckHeight, setDeckHeight] = useState<number>();
  useEffect(() => {
    const media = matchMedia('(max-width: 767px)');
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (mobile && deck.current) deck.current.scrollTo({ left: panes.current[metrics.indexOf(state.metric)]?.offsetLeft ?? 0, behavior: 'instant' });
    // Scroll only this chart strip; keep the page's vertical position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.metric, mobile]);
  useEffect(() => {
    if (!mobile || !deck.current) { setDeckHeight(undefined); return; }
    const pane = panes.current[metrics.indexOf(state.metric)];
    if (!pane) return;
    const observer = new ResizeObserver(() => setDeckHeight(pane.getBoundingClientRect().height));
    observer.observe(pane); return () => observer.disconnect();
    // The selected pane's intrinsic size changes with sorting and show-all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, state.metric]);
  useEffect(() => {
    if (!mobile || !deck.current) return;
    let previous = deck.current.clientWidth;
    const observer = new ResizeObserver(() => {
      if (!deck.current || previous === deck.current.clientWidth) return;
      previous = deck.current.clientWidth;
      deck.current.scrollTo({ left: panes.current[metrics.indexOf(latest.current)]?.offsetLeft ?? 0, behavior: 'instant' });
    });
    observer.observe(deck.current); return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);
  const settle = () => {
    if (!mobile || !deck.current) return;
    const index = Math.round(deck.current.scrollLeft / deck.current.clientWidth);
    const metric = metrics[Math.max(0, Math.min(2, index))];
    if (metric !== latest.current) update({ metric });
  };
  return <div className="ranking-deck" ref={deck} onScrollEnd={settle} style={mobile && deckHeight ? { height: deckHeight } : undefined}>{(mobile ? metrics : [state.metric]).map(metric => <div key={metric} ref={el => { panes.current[metrics.indexOf(metric)] = el; }} className="ranking-pane" aria-label={t[metric === 'absolute' ? 'peopleChange' : metric === 'relative' ? 'percentChange' : 'shareChange']} inert={mobile && metric !== state.metric}><p className="metric-unit">{t[metric === 'absolute' ? 'peopleChange' : metric === 'relative' ? 'percentChange' : 'shareChange']}</p><RankingChart rows={rows} metric={metric} /></div>)}</div>;
}

export function ContributionChart({ rows }: { rows: SectorChange[] }) {
  const { data, state, select } = useApp(), t = messages[state.lang];
  const [container, width] = useSize();
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const values = contribution(rows, national(data, state.to)! - national(data, state.from)!);
  const model = sectorFlows(rows, direction), layout = flowLayout(model.flows.map(f => f.value));
  const mobile = width < 680, sourceX = 4, targetX = Math.max(mobile ? 60 : 75, width * (mobile ? .21 : .38));
  const bracketX = width - (mobile ? 94 : 136), labelWidth = bracketX - targetX - 25;
  const paths = layout.flows.map(f => {
    const a = sourceX + 9, b = targetX, c = a + (b - a) * .48, d = b - (b - a) * .48;
    const sy = layout.sourceY + f.sourceOffset, ty = f.targetY, h = f.thickness;
    return `M${a},${sy}C${c},${sy} ${d},${ty} ${b},${ty}L${b},${ty+h}C${d},${ty+h} ${c},${sy+h} ${a},${sy+h}Z`;
  });
  const groupLabel = (top: boolean) => {
    const amount = top ? model.topTotal : model.restTotal, count = top ? model.top.length : model.rest.length;
    const title = `${top ? t.topSectors : t.otherSectors} ${count}`;
    return <><span>{title} {t.sectorsLabel}</span><strong>{fmt(amount, state.lang)}</strong><span>{model.total ? pct(amount / model.total, state.lang) : '—'}</span></>;
  };
  if (!values) return <p>{t.unavailable}</p>;
  return <div className="contribution-chart"><div className="contribution-toolbar"><div className="direction-toggle" role="group" aria-label={t.contributionTitle}>{(['increase', 'decrease'] as const).map(value => <button key={value} aria-pressed={direction === value} onClick={() => { setDirection(value); setTooltip(null); }}>{value === 'increase' ? t.increaseView : t.decreaseView}</button>)}</div><div className="sankey-total"><span>{direction === 'increase' ? t.increases : t.decreases}</span><strong>{direction === 'increase' ? '+' : '−'}{fmt(model.total, state.lang)}</strong></div></div><div ref={container} className="sankey-wrap">{model.total ? <><svg className="sankey-svg" width={width || '100%'} height={layout.height} role="group" aria-label={`${direction === 'increase' ? t.increases : t.decreases}: ${fmt(model.total, state.lang)}. ${t.sankeyDescription}`}><rect className="sankey-source" x={sourceX} y={layout.sourceY} width={9} height={layout.sourceHeight} /><g>{model.flows.map((flow, i) => {
    const f = layout.flows[i], top = i < 6, lines = top ? wrap(flow.row.sector.short[state.lang], Math.max(30, labelWidth), mobile ? 12 : 14, 2) : [];
    return <g key={flow.row.sector.id} className={`sankey-flow ${state.sector === flow.row.sector.id ? 'selected' : ''}`} role="button" tabIndex={i === 0 || state.sector === flow.row.sector.id ? 0 : -1} data-sector={flow.row.sector.id} aria-pressed={state.sector === flow.row.sector.id} aria-label={`${flow.row.sector.name[state.lang]}. ${fmt(flow.value, state.lang)} ${t.peopleEmployed}, ${pct(flow.value / model.total, state.lang)} ${direction === 'increase' ? t.grossIncreaseShare : t.grossDecreaseShare}. ${t.select}.`} onClick={() => { setTooltip(null); select(flow.row.sector.id); }} onKeyDown={e => keyboardActivate(e.nativeEvent, e.currentTarget, () => select(flow.row.sector.id))} onPointerMove={e => { if (e.pointerType !== 'touch') setTooltip({ x: e.clientX, y: e.clientY, title: flow.row.sector.name[state.lang], value: fmt(flow.value, state.lang), sub: `${pct(flow.value / model.total, state.lang)} ${direction === 'increase' ? t.grossIncreaseShare : t.grossDecreaseShare}`, colour: flow.row.sector.colour }); }} onFocus={e => { const box = e.currentTarget.getBoundingClientRect(); setTooltip({ x: box.x, y: box.y, title: flow.row.sector.name[state.lang], value: fmt(flow.value, state.lang), sub: pct(flow.value / model.total, state.lang), colour: flow.row.sector.colour }); }} onPointerLeave={() => setTooltip(null)} onBlur={() => setTooltip(null)}><path className="sankey-ribbon" d={paths[i]} fill={flow.row.sector.colour} /><rect className="sankey-node" x={targetX} y={f.targetY} width={7} height={Math.max(.4, f.thickness)} fill={flow.row.sector.colour} />{top && <><rect className="sankey-hit" x={targetX} y={f.targetY + f.thickness / 2 - 27} width={Math.max(1, bracketX - targetX - 10)} height={54} fill="transparent" /><text className="sankey-name" x={targetX + 15} y={f.targetY + f.thickness / 2 - (lines.length > 1 ? 12 : 5)}>{lines.map((label, j) => <tspan x={targetX + 15} dy={j === 0 ? 0 : 14} key={j}>{label}</tspan>)}</text><text className="sankey-value" x={targetX + 15} y={f.targetY + f.thickness / 2 + 19}>{fmt(flow.value, state.lang)} · {pct(flow.value / model.total, state.lang)}</text></>}</g>;
  })}</g><path className="sankey-bracket" d={`M${bracketX-7},18h7V${layout.topEnd}h-7`} />{model.rest.length > 0 && <path className="sankey-bracket" d={`M${bracketX-7},${layout.restStart}h7V${layout.height-20}h-7`} />}</svg><div className={`sankey-group top-group ${mobile ? 'mobile-group' : ''}`} style={{ top: (18 + layout.topEnd) / 2 }}>{groupLabel(true)}</div>{model.rest.length > 0 && <div className={`sankey-group rest-group ${mobile ? 'mobile-group' : ''}`} style={{ top: (layout.restStart + layout.height - 20) / 2 }}>{groupLabel(false)}</div>}</> : <p className="empty-chart">{t.noContributions}</p>}</div><Tooltip content={tooltip} /></div>;
}

export function HistoryChart({ sector }: { sector: Sector }) {
  const { data, state, update } = useApp(), t = messages[state.lang];
  const [container, width] = useSize(), [inspectYear, setInspectYear] = useState(state.year);
  useEffect(() => setInspectYear(state.year), [state.year, sector.id]);
  const height = 190, margin = { top: 22, left: 42, right: 10, bottom: 29 };
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
