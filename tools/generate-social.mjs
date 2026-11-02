import { readFileSync } from 'node:fs';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import sharp from 'sharp';

const data = JSON.parse(readFileSync(new URL('../public/data/employment.json', import.meta.url), 'utf8'));
const specification = JSON.parse(readFileSync(new URL('../src/palettes.json', import.meta.url), 'utf8'));
const palette = specification.palettes[specification.active];
data.sectors.forEach(sector => { sector.colour = palette.colours[specification.sectorIds.indexOf(sector.id)]; });
const year = data.years.at(-1);
const root = hierarchy({ children: data.sectors.map(s => ({ ...s, value: data.employment[s.id][year].persons })) }).sum(d => d.value ?? 0).sort((a,b)=>b.value-a.value);
treemap().tile(treemapSquarify).size([1104,310]).paddingInner(3).round(true)(root);
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const tileInk = colour => { const c = colour.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722 > .1791 ? '#000000' : '#FFFFFF'; };
const tiles = root.leaves().map(d => {
  const capacity = Math.floor((d.x1-d.x0-22)/9);
  const name = d.data.short.es.length > capacity ? d.data.short.es.slice(0,capacity-1)+'…' : d.data.short.es;
  return `<rect x="${48+d.x0}" y="${250+d.y0}" width="${d.x1-d.x0}" height="${d.y1-d.y0}" fill="${d.data.colour}"/>${d.x1-d.x0>135 && d.y1-d.y0>48 ? `<text x="${59+d.x0}" y="${278+d.y0}" font-size="16" font-weight="600" fill="${tileInk(d.data.colour)}">${escape(name)}</text>`:''}`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="white"/><g fill="#172d43" font-family="sans-serif"><text x="48" y="91" font-size="61" font-weight="900" letter-spacing="-3">OCUPADOS</text><g transform="translate(402,47) scale(1.6)" fill="${palette.accent}"><path d="M0 0h11v16H0zM14 0h14v9H14zM14 12h14v16H14zM0 19h11v9H0z"/></g><text x="1152" y="78" font-size="17" text-anchor="end">danielalmazan.com</text><path d="M48 121h1104" stroke="#dce3e8"/><text x="48" y="174" font-size="30" font-family="Georgia,serif">¿En qué trabaja España?</text><text x="48" y="211" font-size="17" fill="#526477">35 sectores · ${data.years[0]}–${year} · Datos oficiales de la EPA</text><text x="1152" y="211" font-size="17" text-anchor="end">${year} · media anual</text>${tiles}<text x="48" y="600" font-size="15" fill="#526477">Explora. Compara. Descubre.</text><text x="1152" y="600" font-size="14" text-anchor="end" fill="#526477">Fuente: INE · CNAE-2009</text></g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(new URL('../public/social.png', import.meta.url).pathname);
console.log(`Generated social preview from ${data.releaseId}`);
