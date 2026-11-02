import specification from './palettes.json';
import type { Dataset } from './types';
export type PaletteId = keyof typeof specification.palettes;
export const palettes = specification.palettes;
export const activePalette = specification.active as PaletteId;

const luminance = (colour: string) => {
  const channels = colour.slice(1).match(/../g)!.map(s => parseInt(s, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
export const contrast = (a: string, b: string) => { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
export const tileInk = (colour: string) => contrast(colour, '#000000') >= contrast(colour, '#FFFFFF') ? '#000000' : '#FFFFFF';

export function sectorColour(id: PaletteId, sectorId: string) {
  const colour = palettes[id].colours[specification.sectorIds.indexOf(sectorId)];
  if (!colour) throw new Error(`Missing palette mapping for ${sectorId}`);
  return colour;
}

export function applyPalette(data: Dataset, id: PaletteId) {
  const palette = palettes[id];
  (['paper', 'ink', 'muted', 'line', 'soft', 'accent'] as const).forEach(key => document.documentElement.style.setProperty(`--${key}`, palette[key]));
  document.documentElement.dataset.palette = id;
  document.documentElement.style.colorScheme = id === 'noche' ? 'dark' : 'light';
  return { ...data, sectors: data.sectors.map(sector => ({ ...sector, colour: sectorColour(id, sector.id) })) };
}
