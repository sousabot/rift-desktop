import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { hydrateTierListFromSnapshot, prefetchDashboard, prefetchTierList } from './api';
import './styles.css';

try {
  const session = JSON.parse(localStorage.getItem('rift-web-session') || 'null');
  const platform = session?.platform || 'euw1';
  hydrateTierListFromSnapshot({ platform, rank: 'master' })
    .finally(() => prefetchTierList({ platform, rank: 'master' }));
  if (session?.gameName && session?.tagLine) {
    prefetchDashboard({
      gameName: session.gameName,
      tagLine: session.tagLine,
      platform,
      region: session.region,
      mode: 'Solo',
      count: 5,
    });
  }
} catch {
  hydrateTierListFromSnapshot({ platform: 'euw1', rank: 'master' })
    .finally(() => prefetchTierList({ platform: 'euw1', rank: 'master' }));
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
