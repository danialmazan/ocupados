import { StrictMode, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from './state';
import type { Dataset } from './types';
import { messages } from './i18n';
import { App } from './App';
import './styles.css';

if (import.meta.env.DEV && new URLSearchParams(location.search).has('audit')) {
  void import('./devAudit').then(module => module.installAudit());
}

function Loader() {
  const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'es';
  const t = messages[lang];
  const [data, setData] = useState<Dataset | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(`${import.meta.env.BASE_URL}data/employment.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('Data unavailable'); return response.json(); }).then((loaded: Dataset) => {
      if (loaded.schemaVersion !== 1 || loaded.sectors.length !== 35 || !loaded.years.length || loaded.classification !== 'CNAE-2009') throw new Error('Incompatible data release');
      setData(loaded);
    }).catch(e => { if (e.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <main className="loading-page" lang={lang}><span className="wordmark">OCUPADOS.</span><h1>{t.loadError}</h1><button className="dark-button" onClick={() => setAttempt(a => a + 1)}>{t.retry}</button><a href={`${import.meta.env.BASE_URL}data/employment.csv`}>{t.downloadCsv}</a></main>;
  if (!data) return <main className="loading-page" aria-busy="true" lang={lang}><span className="wordmark">OCUPADOS.</span><p>{t.loading}</p><span className="loading-line" /></main>;
  return <AppProvider data={data}><App /></AppProvider>;
}

const appRoot = (import.meta.hot?.data.root as Root | undefined) ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = appRoot;
appRoot.render(<StrictMode><Loader /></StrictMode>);
