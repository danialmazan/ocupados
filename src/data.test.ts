import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { changes, contribution, crossesBreak, defaults, historicalValue, insights, ordered, parseState, persons, stateSearch } from './data';
import { fmt, messages, metricValue } from './i18n';
import type { Dataset } from './types';

const data = JSON.parse(readFileSync(new URL('../public/data/employment.json', import.meta.url), 'utf-8')) as Dataset;

describe('all possible annual comparisons', () => {
  for (const [index, from] of data.years.entries()) for (const to of data.years.slice(index + 1)) {
    it(`${from}–${to} reconciles, uses national denominators, and agrees with history`, () => {
      const rows = changes(data, from, to), startTotal = data.totals[from].persons!, endTotal = data.totals[to].persons!;
      expect(rows).toHaveLength(35);
      for (const row of rows) {
        const start = data.employment[row.sector.id][from].persons!, end = data.employment[row.sector.id][to].persons!;
        expect(row.absolute).toBe(end - start);
        expect(row.relative).toBeCloseTo(end / start - 1, 12);
        expect(row.share).toBeCloseTo(100 * (end / endTotal - start / startTotal), 12);
        expect(historicalValue(data, row.sector.id, to, 'people')).toBe(end);
        expect(historicalValue(data, row.sector.id, from, 'share')).toBe(start / startTotal);
      }
      const c = contribution(rows, endTotal - startTotal)!;
      const expectedRounding = data.reconciliation[to].difference - data.reconciliation[from].difference;
      expect(c.positive - c.negative + c.roundingDifference!).toBe(endTotal - startTotal);
      expect(c.roundingDifference).toBe(expectedRounding);
      for (const metric of ['absolute', 'relative', 'share'] as const) {
        const sorted = ordered(rows, metric, 'gain', false);
        sorted.slice(1).forEach((row, i) => expect(row[metric]!).toBeLessThanOrEqual(sorted[i][metric]!));
      }
    });
  }
});

describe('source values and safeguards', () => {
  it('keeps the national and sector rounding differences', () => {
    const c = contribution(changes(data, 2018, 2025), 2893400)!;
    expect(c).toMatchObject({ positive: 3010300, negative: 116500, sectorNet: 2893800, nationalNet: 2893400, roundingDifference: -400 });
    expect(persons(data, 'it_information', 2025)).toBe(566400);
  });
  it('distinguishes growing employment from declining employment share', () => {
    const food = changes(data, 2018, 2025).find(r => r.sector.id === 'food_services')!;
    expect(food.absolute).toBeGreaterThan(0);
    expect(food.share).toBeLessThan(0);
  });
  it('never makes missing or zero-baseline percentages zero or infinity', () => {
    const broken = structuredClone(data), id = broken.sectors[0].id;
    broken.employment[id][2018].persons = 0;
    expect(changes(broken, 2018, 2025)[0].relative).toBeNull();
    broken.employment[id][2025].persons = null;
    const rows = changes(broken, 2018, 2025);
    expect(rows[0].absolute).toBeNull();
    expect(rows[0].share).toBeNull();
    expect(contribution(rows, 1)).toBeNull();
  });
  it('supports negative and zero national net change without net contribution percentages', () => {
    const rows = changes(data, 2008, 2013);
    const net = data.totals[2013].persons! - data.totals[2008].persons!;
    expect(contribution(rows, net)!.nationalNet).toBeLessThan(0);
    expect(contribution(rows, 0)!.roundingDifference).toBe(-(contribution(rows, 0)!.sectorNet));
  });
  it('marks a crossed break rather than every period beginning in 2021', () => {
    expect(crossesBreak(2020, 2025)).toBe(true);
    expect(crossesBreak(2021, 2025)).toBe(false);
  });
  it('provides translated dictionaries with identical keys', () => {
    expect(Object.keys(messages.es).sort()).toEqual(Object.keys(messages.en).sort());
    expect(fmt(123456, 'es')).toBe('123.456');
    expect(fmt(123456, 'en')).toBe('123,456');
    expect(metricValue(null, 'relative', 'en')).toBe('Unavailable');
  });
});

describe('URL state and deterministic discoveries', () => {
  it('roundtrips every persisted setting', () => {
    const state = { ...defaults(data), lang: 'en' as const, from: 2008, to: 2024, year: 2020, sector: 'it_information', metric: 'relative' as const, sort: 'magnitude' as const, view: 'all' as const, detail: 'share' as const };
    expect(parseState(stateSearch(state), data)).toEqual(state);
  });
  it('safely resets invalid years, sectors, metrics and injected strings', () => {
    const result = parseState('?from=2025&to=2010&year=9999&sector=<script>&metric=bogus&lang=xx', data);
    expect(result).toEqual(defaults(data));
    expect(parseState('?from=2018.5&to=2025', data).from).toBe(2018);
  });
  it('returns deterministic, accurate, translated insights', () => {
    const state = defaults(data), rows = changes(data, state.from, state.to);
    expect(insights(data, state, rows)).toEqual(insights(data, state, rows));
    expect(insights(data, state, rows)[0].sector).toBe('construction');
    expect(insights(data, { ...state, lang: 'en' }, rows)[0].text).toContain('308,200');
    expect(insights(data, state, rows).every(i => !i.text.includes('{'))).toBe(true);
  });
  it('does not substitute a smaller sector for an unreliable largest-gain superlative', () => {
    const state = defaults(data), rows = changes(data, state.from, state.to);
    rows.find(r => r.sector.id === 'construction')!.reliabilityConcern = true;
    expect(insights(data, state, rows)[0].sector).toBeNull();
  });
  it('does not highlight percentage growth from a tiny baseline', () => {
    const state = defaults(data), rows = changes(data, state.from, state.to);
    rows[0] = { ...rows[0], start: 100, end: 10000, relative: 99, reliabilityConcern: false };
    expect(insights(data, state, rows)[1].sector).not.toBe(rows[0].sector.id);
  });
});
