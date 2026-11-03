import { readFileSync } from 'node:fs';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import * as fontkit from 'fontkit';
import wawoff2 from 'wawoff2';
import sharp from 'sharp';

const data = JSON.parse(readFileSync(new URL('../public/data/employment.json', import.meta.url), 'utf8'));
const specification = JSON.parse(readFileSync(new URL('../src/palettes.json', import.meta.url), 'utf8'));
const palette = specification.palettes[specification.active];
data.sectors.forEach(sector => { sector.colour = palette.colours[specification.sectorIds.indexOf(sector.id)]; });
const loadFont = async file => fontkit.create(Buffer.from(await wawoff2.decompress(readFileSync(new URL(file, import.meta.url)))));
const archivo = await loadFont('../node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2');
const serif = await loadFont('../node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2');
const display = archivo.getVariation({ wght: 850 }), body = archivo.getVariation({ wght: 500 }), title = serif.getVariation({ wght: 550 });
const widthOf = (text, font, size, tracking = 0) => font.layout(text).positions.reduce((sum, p) => sum + p.xAdvance, 0) * size / font.unitsPerEm + Math.max(0, text.length - 1) * tracking;
// Convert the exact self-hosted fonts to outlines: identical fonts on every build host.
function textPath(text, x, y, font, size, fill = palette.ink, align = 'start', tracking = 0) {
  const run = font.layout(text), scale = size / font.unitsPerEm;
  if (align === 'end') x -= widthOf(text, font, size, tracking);
  let cursor = 0;
  const paths = run.glyphs.map((glyph, i) => {
    const p = run.positions[i], path = `<path transform="translate(${cursor + p.xOffset},${p.yOffset})" d="${glyph.path.toSVG()}"/>`;
    cursor += p.xAdvance + tracking / scale;
    return path;
  }).join('');
  return `<g fill="${fill}" transform="translate(${x},${y}) scale(${scale},${-scale})">${paths}</g>`;
}
const year = data.years.at(-1);
const root = hierarchy({ children: data.sectors.map(s => ({ ...s, value: data.employment[s.id][year].persons })) }).sum(d => d.value ?? 0).sort((a,b)=>b.value-a.value);
treemap().tile(treemapSquarify).size([1088,267]).paddingInner(3).round(true)(root);
const tileInk = colour => { const c = colour.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722 > .1791 ? '#000000' : '#FFFFFF'; };
for (const lang of ['es', 'en']) {
const copy = lang === 'es' ? {
  heading: '¿En qué trabaja España?', source: 'Datos oficiales de la EPA', annual: 'media anual',
  credits: 'Datos: EPA / INE · Contraste: Eurostat', action: 'Explora el empleo en España', file: 'social-v2.png',
} : {
  heading: 'What does Spain do for work?', source: 'Official Labour Force Survey data', annual: 'annual average',
  credits: 'Data: EPA / INE · Cross-check: Eurostat', action: 'Explore employment in Spain', file: 'social-en-v1.png',
};
const tiles = root.leaves().map(d => {
  const x = 56 + d.x0, y = 286 + d.y0, w = d.x1 - d.x0, h = d.y1 - d.y0;
  let labels = '';
  if (w > 126 && h > 64) {
    const words = d.data.short[lang].split(' '), lines = [''];
    for (const word of words) {
      const candidate = `${lines.at(-1)} ${word}`.trim();
      if (widthOf(candidate, body, 17) <= w - 22) lines[lines.length - 1] = candidate;
      else lines.push(word);
    }
    if (lines.length <= 2 && lines.every(line => widthOf(line, body, 17) <= w - 22)) labels = lines.map((label, i) => textPath(label, x + 11, y + 27 + i * 21, body, 17, tileInk(d.data.colour))).join('');
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${d.data.colour}"/>${labels}`;
}).join('');
const brandWidth = widthOf('OCUPADOS', display, 76, -3);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${palette.paper}"/>
${textPath('OCUPADOS', 56, 107, display, 76, palette.ink, 'start', -3)}<g transform="translate(${56 + brandWidth + 20},54) scale(1.85)" fill="${palette.accent}"><path d="M0 0h11v16H0zM14 0h14v9H14zM14 12h14v16H14zM0 19h11v9H0z"/></g>
${textPath('danielalmazan.com',1144,89,body,18,palette.muted,'end')}<path d="M56 145h1088" stroke="${palette.line}"/>
${textPath(copy.heading,56,216,title,46)}
${textPath(`35 ${lang === 'es' ? 'sectores' : 'sectors'} · ${data.years[0]}–${year} · ${copy.source}`,56,253,body,18,palette.muted)}
${textPath(`${year} · ${copy.annual}`,1144,253,body,17,palette.muted,'end')}${tiles}
${textPath(copy.credits,56,603,body,15,palette.muted)}
${textPath(copy.action,1144,603,body,15,palette.muted,'end')}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(new URL(`../public/${copy.file}`, import.meta.url).pathname);
console.log(`Generated ${copy.file} with self-hosted font outlines from ${data.releaseId}`);
}
