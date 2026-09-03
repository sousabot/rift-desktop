import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import {
  hydrateLeaderboardFromSnapshot,
  hydrateProsFromSnapshot,
  hydrateTierListFromSnapshot,
  prefetchDashboard,
  prefetchLeaderboard,
  prefetchPros,
  prefetchTierList,
} from './api';
import './styles.css';

try {
  const session = JSON.parse(localStorage.getItem('rift-web-session') || 'null');
  const platform = session?.platform || 'euw1';
  const lbPlatform = ['euw1', 'kr', 'na1'].includes(platform) ? platform : 'euw1';
  hydrateTierListFromSnapshot({ platform, rank: 'master' })
    .finally(() => prefetchTierList({ platform, rank: 'master' }));
  hydrateLeaderboardFromSnapshot({ tier: 'challenger', platform: 'euw1', mode: 'soloq' })
    .finally(() => prefetchLeaderboard({
      tier: 'challenger',
      platform: lbPlatform,
      mode: 'soloq',
      limit: 5,
    }));
  hydrateProsFromSnapshot({})
    .finally(() => prefetchPros({}));
  if (session?.gameName && session?.tagLine) {
    prefetchDashboard({
      gameName: session.gameName,
      tagLine: session.tagLine,
      platform,
      region: session.region,
      mode: 'Solo',
      count: 5,
      light: true,
    });
  }
} catch {
  hydrateTierListFromSnapshot({ platform: 'euw1', rank: 'master' })
    .finally(() => prefetchTierList({ platform: 'euw1', rank: 'master' }));
  hydrateLeaderboardFromSnapshot({ tier: 'challenger', platform: 'euw1', mode: 'soloq' })
    .finally(() => prefetchLeaderboard({
      tier: 'challenger',
      platform: 'euw1',
      mode: 'soloq',
      limit: 5,
    }));
  hydrateProsFromSnapshot({})
    .finally(() => prefetchPros({}));
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
