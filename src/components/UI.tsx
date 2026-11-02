import type { ReactNode } from 'react';
import { useApp } from '../state';
import { crossesBreak, type Insight } from '../data';
import { messages } from '../i18n';

export function Icon({ name, size = 18 }: { name: 'arrow' | 'play' | 'pause' | 'share' | 'close' | 'search' | 'chevron' | 'info' | 'plus' | 'minus'; size?: number }) {
  const paths = {
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    play: <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>,
    share: <><path d="M12 15V3m-4 4 4-4 4 4M7 11H4v10h16V11h-3" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function SectionHeading({ number, title, children, id }: { number: string; title: string; children?: ReactNode; id?: string }) {
  return <div className="section-heading"><div><span className="eyebrow">{number}</span><h2 id={id}>{title}</h2></div>{children}</div>;
}

export function BreakNote({ compact = false }: { compact?: boolean }) {
  const { state } = useApp(), t = messages[state.lang];
  return crossesBreak(state.from, state.to) ? <a className={`break-note ${compact ? 'is-compact' : ''}`} href="#methodology-breaks"><Icon name="info" size={14} /><span>{compact ? t.breakBadge : t.breakShort}</span></a> : null;
}

export function InsightLine({ insight }: { insight: Insight | undefined }) {
  const { state, select } = useApp();
  if (!insight) return null;
  const inner = <><span className="insight-marker" aria-hidden="true">↗</span><span>{insight.text}</span>{insight.sector && <Icon name="arrow" size={17} />}</>;
  return <div className="insight-line"><span className="sr-only">{messages[state.lang].estimates}. </span>{insight.sector ? <button onClick={() => select(insight.sector)}>{inner}</button> : <p>{inner}</p>}</div>;
}

export interface TooltipContent { x: number; y: number; title: string; value: string; sub: string; colour?: string }
export function Tooltip({ content }: { content: TooltipContent | null }) {
  if (!content) return null;
  const left = Math.min(Math.max(12, content.x + 14), window.innerWidth - 284);
  const top = Math.min(Math.max(12, content.y + 16), window.innerHeight - 148);
  return <div className="chart-tooltip" style={{ left, top }} role="tooltip"><span className="tooltip-title">{content.colour && <i style={{ background: content.colour }} />}{content.title}</span><strong>{content.value}</strong><span>{content.sub}</span></div>;
}
