import type { Dataset, Exploration, Metric, SectorChange, Sort } from './types';
import { fmt, interpolate, messages, pct, signed, type MessageKey } from './i18n';

export function defaults(data: Dataset): Exploration {
  return { lang: 'es', from: data.years.includes(2018) ? 2018 : data.years[0], to: data.years.at(-1)!, year: data.years.at(-1)!, sector: null, metric: 'absolute', sort: 'gain', view: 'leaders', detail: 'people' };
}

export function parseState(search: string, data: Dataset): Exploration {
  const params = new URLSearchParams(search), fallback = defaults(data);
  const readYear = (key: string, defaultYear: number) => {
    const raw = params.get(key);
    return raw !== null && /^\d{4}$/.test(raw) ? Number(raw) : defaultYear;
  };
  let from = readYear('from', fallback.from), to = readYear('to', fallback.to);
  if (!data.years.includes(from) || !data.years.includes(to) || from >= to) { from = fallback.from; to = fallback.to; }
  const year = readYear('year', to), sector = params.get('sector');
  return { lang: params.get('lang') === 'en' ? 'en' : 'es', from, to, year: data.years.includes(year) && year >= from && year <= to ? year : to,
    sector: data.sectors.some(s => s.id === sector) ? sector : null,
    metric: (['absolute', 'relative', 'share'].includes(params.get('metric') ?? '') ? params.get('metric') : 'absolute') as Metric,
    sort: (['gain', 'loss', 'magnitude'].includes(params.get('sort') ?? '') ? params.get('sort') : 'gain') as Sort,
    view: params.get('view') === 'all' ? 'all' : 'leaders', detail: params.get('detail') === 'share' ? 'share' : 'people' };
}

export function stateSearch(state: Exploration): string {
  const p = new URLSearchParams({ lang: state.lang, from: String(state.from), to: String(state.to), year: String(state.year), metric: state.metric });
  if (state.sector) p.set('sector', state.sector);
  if (state.sort !== 'gain') p.set('sort', state.sort);
  if (state.view !== 'leaders') p.set('view', state.view);
  if (state.detail !== 'people') p.set('detail', state.detail);
  return `?${p}`;
}

export const crossesBreak = (from: number, to: number) => from < 2021 && to >= 2021;
export const persons = (data: Dataset, id: string, year: number): number | null => data.employment[id]?.[year]?.persons ?? null;
export const national = (data: Dataset, year: number): number | null => data.totals[year]?.persons ?? null;

export function changes(data: Dataset, from: number, to: number): SectorChange[] {
  const firstTotal = national(data, from), lastTotal = national(data, to);
  const lowIds = new Set(data.qualityNotes.filter(q => q.kind === 'reliability').map(q => q.id));
  return data.sectors.map(sector => {
    const start = persons(data, sector.id, from), end = persons(data, sector.id, to);
    const startShare = start !== null && firstTotal !== null && firstTotal > 0 ? start / firstTotal : null;
    const endShare = end !== null && lastTotal !== null && lastTotal > 0 ? end / lastTotal : null;
    const reliabilityConcern = [from, to].some(y => data.employment[sector.id]?.[y]?.qualityRefs.some(id => lowIds.has(id)));
    return { sector, start, end, startShare, endShare, absolute: start !== null && end !== null ? end - start : null,
      relative: start !== null && end !== null && start > 0 ? end / start - 1 : null,
      share: startShare !== null && endShare !== null ? 100 * (endShare - startShare) : null, reliabilityConcern };
  });
}

export function ordered(rows: SectorChange[], metric: Metric, sort: Sort, leaders: boolean): SectorChange[] {
  let filtered = rows.filter(row => row[metric] !== null);
  if (leaders && sort !== 'magnitude') filtered = filtered.filter(row => sort === 'gain' ? row[metric]! > 0 : row[metric]! < 0);
  filtered.sort((a, b) => (sort === 'magnitude' ? Math.abs(b[metric]!) - Math.abs(a[metric]!) : sort === 'gain' ? b[metric]! - a[metric]! : a[metric]! - b[metric]!) || a.sector.id.localeCompare(b.sector.id));
  return leaders ? filtered.slice(0, 6) : filtered;
}

export function contribution(rows: SectorChange[], totalChange: number | null) {
  if (rows.some(r => r.absolute === null)) return null;
  const positive = rows.reduce((sum, r) => sum + Math.max(0, r.absolute!), 0);
  const negative = rows.reduce((sum, r) => sum + Math.max(0, -r.absolute!), 0);
  return { positive, negative, sectorNet: positive - negative, nationalNet: totalChange, roundingDifference: totalChange === null ? null : totalChange - (positive - negative) };
}

export interface Insight { text: string; sector: string | null }
export function insights(data: Dataset, state: Exploration, rows: SectorChange[]): Insight[] {
  const t = messages[state.lang], lang = state.lang;
  const eligible = rows.filter(r => r.start !== null && r.end !== null && !r.reliabilityConcern);
  const largestGain = ordered(rows, 'absolute', 'gain', true)[0];
  // Never call the next eligible sector "the largest" when the actual leader is excluded.
  const gain = largestGain && !largestGain.reliabilityConcern ? largestGain : undefined;
  const relative = ordered(eligible.filter(r => r.start! >= 50000 && r.end! >= 50000), 'relative', 'gain', true)[0];
  const counts = { up: rows.filter(r => r.absolute !== null && r.absolute > 0).length, down: rows.filter(r => r.absolute !== null && r.absolute < 0).length, same: rows.filter(r => r.absolute === 0).length };
  const positive = rows.reduce((s, r) => s + Math.max(0, r.absolute ?? 0), 0);
  const first = gain && gain.absolute! >= 10000 ? { text: interpolate(t.insightLargestGain, { sector: gain.sector.name[lang], value: signed(gain.absolute!, lang) }), sector: gain.sector.id } : { text: t.insightNeutral, sector: null };
  const second = relative && relative.relative! >= .01 ? { text: interpolate(t.insightRelative, { sector: relative.sector.name[lang], value: pct(relative.relative!, lang), from: state.from, to: state.to }), sector: relative.sector.id } : { text: interpolate(t.insightCounts, counts), sector: null };
  const third = gain && positive > 0 ? { text: interpolate(t.insightGross, { sector: gain.sector.name[lang], value: pct(gain.absolute! / positive, lang) }), sector: gain.sector.id } : { text: interpolate(t.insightCounts, counts), sector: null };
  if (state.sector) {
    const selected = rows.find(r => r.sector.id === state.sector);
    if (selected?.endShare !== null && selected?.endShare !== undefined) {
      first.text = `${selected.sector.name[lang]} · ${pct(selected.endShare, lang)} ${t.shareOfEmployment} (${state.to}).`;
      first.sector = selected.sector.id;
    }
  }
  // The data argument is intentional: insights are calculated from the same release as charts.
  if (!data.years.includes(state.from) || !data.years.includes(state.to)) return [];
  return [first, second, third];
}

export function qualityKeys(data: Dataset, sector: string, from: number, to: number): MessageKey[] {
  const keys: MessageKey[] = [];
  if (crossesBreak(from, to)) keys.push('baseBreak', 'methodBreak');
  const refs = [from, to].flatMap(y => data.employment[sector]?.[y]?.qualityRefs ?? []);
  if (data.qualityNotes.some(q => q.kind === 'reliability' && refs.includes(q.id))) keys.push('componentReliability');
  if (sector === 'households') keys.push('householdsNote');
  return keys;
}

export function announceComparison(data: Dataset, state: Exploration): string {
  const start = national(data, state.from), end = national(data, state.to);
  return `${messages[state.lang].compare} ${state.from}–${state.to}. ${start !== null && end !== null ? signed(end - start, state.lang) : messages[state.lang].unavailable} ${messages[state.lang].peopleEmployed}. ${state.sector ? data.sectors.find(s => s.id === state.sector)?.name[state.lang] : ''}`;
}

export function historicalValue(data: Dataset, sector: string, year: number, mode: 'people' | 'share'): number | null {
  const value = persons(data, sector, year), total = national(data, year);
  return value === null ? null : mode === 'people' ? value : total !== null && total > 0 ? value / total : null;
}

export const readableYearValue = (value: number | null, mode: 'people' | 'share', lang: Exploration['lang']) => value === null ? messages[lang].unavailable : mode === 'people' ? fmt(value, lang) : pct(value, lang);
