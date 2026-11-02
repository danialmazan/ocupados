import type { Lang, Localised, Sector } from './types';
const descriptions: Record<string, Localised> = {
  hq_consultancy: { es: 'Actividades de sedes centrales y consultoría de gestión empresarial.', en: 'Head offices and management consultancy.' },
  publishing_media: { es: 'Edición de libros, prensa y programas informáticos; cine, vídeo, música, radio y televisión.', en: 'Book, press and software publishing; film, video, music, radio and television.' },
  energy_water_mining: { es: 'Industrias extractivas, electricidad, gas, agua, saneamiento, residuos y descontaminación.', en: 'Mining, electricity, gas, water, sewerage, waste and remediation.' },
  households: { es: 'Hogares empleadores de personal doméstico y actividades de los hogares para uso propio.', en: 'Households employing domestic personnel and household activities for own use.' },
  it_information: { es: 'Programación, consultoría informática y servicios de información.', en: 'Programming, IT consultancy and information services.' },
};
export const sectorDescription = (sector: Sector, lang: Lang) => (descriptions[sector.id] ?? sector.description)[lang];
