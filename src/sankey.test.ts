import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { changes } from './data';
import { flowLayout, sectorFlows } from './sankey';
import { contrast, palettes, sectorColour, tileInk } from './palettes';
import type { Dataset } from './types';
const data = JSON.parse(readFileSync(new URL('../public/data/employment.json', import.meta.url), 'utf8')) as Dataset;

describe('Sankey changes, denominators and geometry', () => {
  for (const [index, from] of data.years.entries()) for (const to of data.years.slice(index + 1)) {
    it(`${from}–${to} accounts for each increase and decrease exactly once`, () => {
      const rows = changes(data, from, to);
      for (const direction of ['increase', 'decrease'] as const) {
        const model = sectorFlows(rows, direction), layout = flowLayout(model.flows.map(f => f.value));
        const expected = rows.reduce((sum, r) => sum + Math.max(0, direction === 'increase' ? r.absolute! : -r.absolute!), 0);
        expect(model.total).toBe(expected);
        expect(model.topTotal + model.restTotal).toBe(expected);
        expect(model.top).toHaveLength(Math.min(6, model.flows.length));
        expect(new Set(model.flows.map(f => f.row.sector.id)).size).toBe(model.flows.length);
        expect(layout.flows.reduce((sum, f) => sum + f.thickness, 0)).toBeCloseTo(layout.sourceHeight, 8);
        layout.flows.forEach((f, i) => {
          expect(f.thickness).toBeGreaterThan(0);
          expect(f.targetY + f.thickness).toBeLessThanOrEqual(layout.height);
          expect(f.sourceOffset + f.thickness).toBeLessThanOrEqual(layout.sourceHeight + 1e-8);
          if (i > 0) expect(f.targetY).toBeGreaterThan(layout.flows[i - 1].targetY + layout.flows[i - 1].thickness);
        });
      }
    });
  }
  it('uses the sum of increases, including periods where national employment falls', () => {
    const model = sectorFlows(changes(data, 2018, 2025), 'increase');
    expect(model).toMatchObject({ total: 3010300, topTotal: 1426100, restTotal: 1584200 });
    expect(model.rest).toHaveLength(26);
    expect(sectorFlows(changes(data, 2018, 2025), 'decrease')).toMatchObject({ total: 116500, topTotal: 116500, restTotal: 0 });
    expect(sectorFlows(changes(data, 2008, 2013), 'increase').total).toBeGreaterThan(0);
  });
  it('compacts mobile top-six spacing without changing flow widths or allowing overlaps', () => {
    for (const [index, from] of data.years.entries()) for (const to of data.years.slice(index + 1)) for (const direction of ['increase', 'decrease'] as const) {
      const values = sectorFlows(changes(data, from, to), direction).flows.map(f => f.value);
      const desktop = flowLayout(values), mobile = flowLayout(values, 238, 50);
      expect(mobile.height).toBeLessThanOrEqual(desktop.height);
      expect(mobile.flows.map(f => f.thickness)).toEqual(desktop.flows.map(f => f.thickness));
      mobile.flows.forEach((f, i) => { if (i > 0) expect(f.targetY).toBeGreaterThan(mobile.flows[i - 1].targetY + mobile.flows[i - 1].thickness); });
    }
  });
  it('handles no changes and fewer than six sectors', () => {
    expect(flowLayout([])).toMatchObject({ flows: [], sourceHeight: 0 });
    const rows = changes(data, 2018, 2025).map(r => ({ ...r, absolute: 0 }));
    expect(sectorFlows(rows, 'decrease').flows).toHaveLength(0);
    rows[0].absolute = -100;
    expect(sectorFlows(rows, 'decrease')).toMatchObject({ total: 100, restTotal: 0 });
  });
});

describe('palette legibility', () => {
  for (const [id, palette] of Object.entries(palettes)) it(`${id} has 35 distinct sector colours and AA text contrast`, () => {
    expect(palette.colours).toHaveLength(35);
    expect(new Set(data.sectors.map(s => sectorColour(id as keyof typeof palettes, s.id))).size).toBe(35);
    expect(new Set(palette.colours).size).toBe(35);
    expect(contrast(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.muted, palette.paper)).toBeGreaterThanOrEqual(4.5);
    palette.colours.forEach(colour => expect(contrast(colour, tileInk(colour))).toBeGreaterThanOrEqual(4.5));
  });
});
