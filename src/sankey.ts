import type { SectorChange } from './types';

export function sectorFlows(rows: SectorChange[], direction: 'increase' | 'decrease') {
  const sign = direction === 'increase' ? 1 : -1;
  const flows = rows.filter(row => row.absolute !== null && row.absolute * sign > 0)
    .map(row => ({ row, value: Math.abs(row.absolute!) }))
    .sort((a, b) => b.value - a.value || a.row.sector.id.localeCompare(b.row.sector.id));
  const total = flows.reduce((sum, flow) => sum + flow.value, 0);
  const top = flows.slice(0, 6), rest = flows.slice(6);
  return { flows, total, top, rest, topTotal: top.reduce((sum, f) => sum + f.value, 0), restTotal: rest.reduce((sum, f) => sum + f.value, 0) };
}

export function flowLayout(values: number[], totalPixels = 238, topSlot: number | number[] = 58) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return { flows: [], height: 120, sourceY: 0, sourceHeight: 0, topEnd: 0, restStart: 0 };
  const scale = totalPixels / total;
  let y = 18, sourceOffset = 0, topEnd = 0, restStart = 0;
  const flows = values.map((value, index) => {
    if (index === 6) { y += 28; restStart = y; }
    const thickness = value * scale;
    const minimum = typeof topSlot === 'number' ? topSlot : topSlot[index] ?? 34;
    const slot = index < 6 ? Math.max(minimum, thickness + (Array.isArray(topSlot) ? 6 : 12)) : thickness + 3;
    const flow = { value, thickness, slot, targetY: y + (slot - thickness) / 2, sourceOffset };
    sourceOffset += thickness; y += slot;
    if (index === Math.min(5, values.length - 1)) topEnd = y;
    return flow;
  });
  return { flows, height: y + 20, sourceY: (y + 20 - totalPixels) / 2, sourceHeight: totalPixels, topEnd, restStart };
}
