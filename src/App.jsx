import React from 'react';
import { Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { SessionProvider } from './state/SessionContext';
import { LocaleProvider } from './i18n/LocaleContext';
import { PremiumProvider } from './state/PremiumContext';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ApiNotice from './components/ApiNotice';
import UpdateBanner from './components/UpdateBanner';
import PremiumGate from './components/PremiumGate';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import LiveStatus from './pages/LiveStatus';
import LinkAccount from './pages/LinkAccount';
import Login from './pages/Login';
import Champions from './pages/Champions';
import History from './pages/History';
import Compare from './pages/Compare';
import Collections from './pages/Collections';
import Draft from './pages/Draft';
import Spectate from './pages/Spectate';
import Pros from './pages/Pros';
import Studio from './pages/Studio';
import Lens from './pages/Lens';
import Premium from './pages/Premium';
import Overlays from './pages/Overlays';
import OverlayHud from './pages/OverlayHud';

export default function App() {
  return (
    <LocaleProvider>
      <PremiumProvider>
        <SessionProvider>
        <Routes>
          <Route path="/overlay" element={<OverlayHud />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/live" element={<LiveStatus />} />
            <Route path="/champions" element={<Champions />} />
            <Route path="/history" element={<History />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/replays" element={<Navigate to="/" replace />} />
            <Route path="/tierlist" element={<Navigate to="/" replace />} />
            <Route path="/draft" element={<Draft />} />
            <Route path="/spectate" element={<Spectate />} />
            <Route path="/pros" element={<Pros />} />
            <Route path="/studio" element={<PremiumGate><Studio /></PremiumGate>} />
            <Route path="/lens" element={<PremiumGate><Lens /></PremiumGate>} />
            <Route path="/premium" element={<Premium />} />
            <Route path="/overlays" element={<Overlays />} />
            <Route path="/link-account" element={<LinkAccount />} />
            <Route path="/login" element={<Login />} />
          </Route>
        </Routes>
        </SessionProvider>
      </PremiumProvider>
    </LocaleProvider>
  );
}

function AppShell() {
  return (
    <div className="rift-shell">
      <TitleBar />
      <UpdateBanner />
      <ApiNotice />
      <div className="rift-shell__body">
        <Sidebar />
        <main className="rift-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
