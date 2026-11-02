export type Lang = 'es' | 'en';
export type Metric = 'absolute' | 'relative' | 'share';
export type Sort = 'gain' | 'loss' | 'magnitude';
export type Localised = Record<Lang, string>;
export interface Observation { persons: number | null; status: 'published' | 'unavailable'; qualityRefs: string[] }
export interface Sector {
  id: string; name: Localised; short: Localised; description: Localised;
  divisionCodes: string[]; sourceTerms: string[]; sourceSeries: string[];
  parentId: string; colour: string;
}
export interface QualityNote {
  id: string; kind: 'break' | 'definition' | 'missing' | 'reliability';
  sourceId: string; year?: number; messageKey: string; scope: string; code?: string; codes?: string[];
}
export interface Dataset {
  schemaVersion: 1; releaseId: string; years: number[]; retrievedAt: string;
  geography: 'ES'; frequency: 'A'; unit: 'persons'; classification: 'CNAE-2009'; populationDefinition: string;
  parents: Record<string, Localised & { colour: string }>;
  sources: { id: string; url: string; sha256: string; sourceUpdatedAt: string | null }[];
  sectors: Sector[]; totals: Record<string, Observation>;
  employment: Record<string, Record<string, Observation>>;
  qualityNotes: QualityNote[];
  reconciliation: Record<string, {sectorTotal: number; nationalTotal: number; difference: number; roundingBound: number}>;
}
export interface Exploration {
  lang: Lang; from: number; to: number; year: number; sector: string | null;
  metric: Metric; sort: Sort; view: 'leaders' | 'all'; detail: 'people' | 'share';
}
export interface SectorChange {
  sector: Sector; start: number | null; end: number | null;
  absolute: number | null; relative: number | null; share: number | null;
  startShare: number | null; endShare: number | null;
  reliabilityConcern: boolean;
}
