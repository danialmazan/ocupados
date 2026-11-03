import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hierarchy, treemap, treemapResquarify } from 'd3-hierarchy';
import { readingTreemap } from './readingTreemap';
import type { Dataset, Sector } from './types';

const data = JSON.parse(readFileSync(new URL('../public/data/employment.json', import.meta.url), 'utf8')) as Dataset;
type Datum = { sector?: Sector; mean?: number; children?: Datum[] };
function root() {
  return hierarchy<Datum>({ children: data.sectors.map(sector => ({ sector, mean: data.years.reduce((sum, year) => sum + data.employment[sector.id][year].persons!, 0) / data.years.length })) })
    .sum(d => d.mean ?? 0).sort((a, b) => b.value! - a.value!);
}
const words = (d: Datum) => d.sector!.short.es.split(' ').map(word => word.length * 7);

describe('mobile treemap readability and truthful areas', () => {
  for (const width of [288, 343, 719]) it(`preserves areas, coverage and neighbours across all years at ${width}px`, () => {
    const height = Math.max(480, Math.min(590, width * 1.5)), tree = root();
    const layout = treemap<Datum>().tile(readingTreemap(words)).size([width, height]);
    const reference = layout(tree).leaves();
    const neighbours = reference.slice(1).map((tile, i) => tile.y0 === reference[i].y0);
    for (const year of data.years) {
      tree.sum(d => d.sector ? data.employment[d.sector.id][year].persons! : 0);
      const tiles = layout(tree).leaves();
      expect(tiles).toHaveLength(35);
      expect(tiles.slice(1).map((tile, i) => tile.y0 === tiles[i].y0)).toEqual(neighbours);
      let area = 0;
      tiles.forEach((tile, i) => {
        const size = (tile.x1 - tile.x0) * (tile.y1 - tile.y0);
        expect(size / (width * height)).toBeCloseTo(tile.value! / tree.value!, 10);
        expect(tile.x0).toBeGreaterThanOrEqual(0); expect(tile.y0).toBeGreaterThanOrEqual(0);
        expect(tile.x1).toBeLessThanOrEqual(width + 1e-8); expect(tile.y1).toBeLessThanOrEqual(height + 1e-8);
        tiles.slice(i + 1).forEach(other => {
          const overlap = Math.max(0, Math.min(tile.x1, other.x1) - Math.max(tile.x0, other.x0)) * Math.max(0, Math.min(tile.y1, other.y1) - Math.max(tile.y0, other.y0));
          expect(overlap).toBeCloseTo(0, 8);
        });
        area += size;
      });
      expect(area).toBeCloseTo(width * height, 8);
    }
  });
  for (const width of [343, 719]) it(`reduces narrow cells versus the original layout at ${width}px`, () => {
    const height = Math.max(480, Math.min(590, width * 1.5));
    const original = treemap<Datum>().tile(treemapResquarify).size([width, height])(root()).leaves();
    const updated = treemap<Datum>().tile(readingTreemap(words)).size([width, height])(root()).leaves();
    expect(updated.filter(tile => tile.x1 - tile.x0 < 58).length).toBeLessThan(original.filter(tile => tile.x1 - tile.x0 < 58).length);
    expect(updated.filter(tile => tile.x1 - tile.x0 >= tile.y1 - tile.y0).length).toBeGreaterThan(20);
  });
});
