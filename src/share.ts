import type { Lang } from './types';

export const shareMetadata = {
  es: {
    title: 'Ocupados - ¿En qué trabaja España?',
    text: 'Explora en qué trabajamos y cómo ha cambiado el empleo en los últimos años',
    image: 'https://danielalmazan.com/ocupados/social-v2.png',
    imageAlt: 'Ocupados: ¿En qué trabaja España? Un mosaico de los 35 sectores del empleo con datos de la EPA.',
    locale: 'es_ES',
  },
  en: {
    title: 'Ocupados - What does Spain do for work?',
    text: 'Explore what we do for work and how employment has changed in recent years',
    image: 'https://danielalmazan.com/ocupados/social-en-v1.png',
    imageAlt: 'Ocupados: What does Spain do for work? A mosaic of 35 employment sectors using official Labour Force Survey data.',
    locale: 'en_GB',
  },
};

export const pagePath = (lang: Lang) => lang === 'en' ? '/ocupados/en/' : '/ocupados/';
export const pageUrl = (lang: Lang) => `https://danielalmazan.com${pagePath(lang)}`;
export function languageFromUrl(pathname: string, search: string): Lang {
  const explicit = new URLSearchParams(search).get('lang');
  return explicit === 'es' || explicit === 'en' ? explicit : /^\/ocupados\/en(?:\/|$)/.test(pathname) ? 'en' : 'es';
}

export function applyShareMetadata(lang: Lang) {
  const metadata = shareMetadata[lang];
  document.documentElement.lang = lang;
  document.title = metadata.title;
  const values = {
    description: metadata.text,
    'og:title': metadata.title, 'og:description': metadata.text,
    'og:url': pageUrl(lang), 'og:locale': metadata.locale,
    'og:locale:alternate': shareMetadata[lang === 'en' ? 'es' : 'en'].locale,
    'og:image': metadata.image, 'og:image:secure_url': metadata.image, 'og:image:alt': metadata.imageAlt,
    'twitter:title': metadata.title, 'twitter:description': metadata.text,
    'twitter:image': metadata.image, 'twitter:image:alt': metadata.imageAlt,
  };
  Object.entries(values).forEach(([key, value]) => document.querySelector<HTMLMetaElement>(`meta[name="${key}"],meta[property="${key}"]`)?.setAttribute('content', value));
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', pageUrl(lang));
}
