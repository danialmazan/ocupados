import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageFromUrl, pagePath, pageUrl, shareMetadata as localizedMetadata } from './share';
import { parseState, stateSearch } from './data';
import type { Dataset } from './types';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shareMetadata = localizedMetadata.es;
const meta = (key: string) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`))?.[1];

describe('public link preview', () => {
  it('provides the requested title and text before JavaScript runs', () => {
    expect(shareMetadata.title).toBe('Ocupados - ¿En qué trabaja España?');
    expect(shareMetadata.text).toBe('Explora en qué trabajamos y cómo ha cambiado el empleo en los últimos años');
    expect(html).toContain(`<title>${shareMetadata.title}</title>`);
    expect(meta('og:title')).toBe(shareMetadata.title);
    expect(meta('og:description')).toBe(shareMetadata.text);
    expect(meta('description')).toBe(shareMetadata.text);
  });
  it('keeps all preview providers on the same image and copy', () => {
    expect(meta('twitter:title')).toBe(shareMetadata.title);
    expect(meta('twitter:description')).toBe(shareMetadata.text);
    expect(meta('og:image')).toBe(shareMetadata.image);
    expect(meta('og:image:secure_url')).toBe(shareMetadata.image);
    expect(meta('twitter:image')).toBe(shareMetadata.image);
    expect(meta('og:image:alt')).toBeTruthy();
  });
  it('ships a new, valid 1200 × 630 PNG at the metadata URL', () => {
    const url = new URL(shareMetadata.image);
    expect(url.protocol).toBe('https:');
    expect(url.pathname).not.toBe('/ocupados/social.png');
    const png = readFileSync(new URL(`../public/${url.pathname.split('/').at(-1)}`, import.meta.url));
    expect(png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(meta('og:image:width')).toBe('1200');
    expect(meta('og:image:height')).toBe('630');
    expect(meta('og:image:type')).toBe('image/png');
  });
});

describe('English preview without JavaScript', () => {
  const english = readFileSync(new URL('../en/index.html', import.meta.url), 'utf8');
  const enMeta = (key: string) => english.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`))?.[1];
  const metadata = localizedMetadata.en;
  it('ships English title, text, locale and canonical URL in raw HTML', () => {
    expect(metadata.title).toBe('Ocupados - What does Spain do for work?');
    expect(metadata.text).toBe('Explore what we do for work and how employment has changed in recent years');
    expect(english).toContain('<html lang="en">');
    expect(english).toContain(`<title>${metadata.title}</title>`);
    expect(enMeta('og:title')).toBe(metadata.title);
    expect(enMeta('og:description')).toBe(metadata.text);
    expect(enMeta('description')).toBe(metadata.text);
    expect(enMeta('og:locale')).toBe(metadata.locale);
    expect(enMeta('og:url')).toBe(pageUrl('en'));
    expect(english).toContain(`<link rel="canonical" href="${pageUrl('en')}"`);
  });
  it('uses matching English metadata and a separate image for all preview providers', () => {
    expect(enMeta('twitter:title')).toBe(metadata.title);
    expect(enMeta('twitter:description')).toBe(metadata.text);
    expect(enMeta('og:image')).toBe(metadata.image);
    expect(enMeta('og:image:secure_url')).toBe(metadata.image);
    expect(enMeta('twitter:image')).toBe(metadata.image);
    expect(enMeta('og:image:alt')).toBe(metadata.imageAlt);
    expect(enMeta('twitter:image:alt')).toBe(metadata.imageAlt);
    expect(metadata.image).not.toBe(shareMetadata.image);
    expect(english).toContain('hreflang="es" href="https://danielalmazan.com/ocupados/"');
    expect(html).toContain('hreflang="en" href="https://danielalmazan.com/ocupados/en/"');
  });
  it('ships an English 1200 × 630 PNG', () => {
    const png = readFileSync(new URL('../public/social-en-v1.png', import.meta.url));
    expect(png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(enMeta('og:image:width')).toBe('1200');
    expect(enMeta('og:image:height')).toBe('630');
  });
});

describe('language routes and legacy links', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data/employment.json', import.meta.url), 'utf8')) as Dataset;
  for (const [path, search, expected] of [
    ['/ocupados/', '', 'es'], ['/ocupados/en/', '', 'en'],
    ['/ocupados/', '?lang=en', 'en'], ['/ocupados/en/', '?lang=es', 'es'],
    ['/ocupados/en/', '?lang=unknown', 'en'], ['/ocupados/', '?lang=unknown', 'es'],
  ] as const) it(`${path}${search} restores ${expected} and preserves exploration settings`, () => {
    const query = new URLSearchParams(search);
    for (const [key, value] of Object.entries({ from: '2008', to: '2025', year: '2020', sector: 'retail', metric: 'share', sort: 'magnitude', view: 'all', detail: 'share' })) query.set(key, value);
    const state = parseState(query.toString(), data, languageFromUrl(path, query.toString()));
    expect(state).toMatchObject({ lang: expected, from: 2008, to: 2025, year: 2020, sector: 'retail', metric: 'share', sort: 'magnitude', view: 'all', detail: 'share' });
    const shared = new URL(`${pagePath(state.lang)}${stateSearch(state)}#structure`, 'https://danielalmazan.com');
    expect(shared.pathname).toBe(expected === 'en' ? '/ocupados/en/' : '/ocupados/');
    expect(parseState(shared.search, data, languageFromUrl(shared.pathname, shared.search))).toEqual(state);
    expect(shared.hash).toBe('#structure');
  });
});
