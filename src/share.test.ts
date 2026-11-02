import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { shareMetadata } from './share';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
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
