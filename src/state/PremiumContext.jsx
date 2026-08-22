import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  getDeviceId,
  readPremiumState,
  writePremiumState,
} from '../lib/premium';

const PremiumContext = createContext(null);

export function PremiumProvider({ children }) {
  const [state, setState] = useState(readPremiumState);

  const persist = useCallback((next) => {
    writePremiumState(next);
    setState(next);
  }, []);

  const activate = useCallback((patch = {}) => {
    persist({
      active: true,
      plan: patch.plan || 'six',
      source: patch.source || 'demo',
      license: patch.license || null,
      sessionId: patch.sessionId || null,
      unlockedAt: Date.now(),
    });
  }, [persist]);

  const deactivate = useCallback(() => {
    persist({
      active: false,
      plan: null,
      source: null,
      license: null,
      sessionId: null,
      unlockedAt: null,
    });
  }, [persist]);

  const setPremium = useCallback((on) => {
    if (on) activate({ plan: 'six', source: 'tester' });
    else deactivate();
  }, [activate, deactivate]);

  const value = useMemo(() => ({
    isPremium: state.active,
    plan: state.plan,
    source: state.source,
    license: state.license,
    deviceId: getDeviceId(),
    activate,
    deactivate,
    setPremium,
  }), [state, activate, deactivate, setPremium]);

  return (
    <PremiumContext.Provider value={value}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside <PremiumProvider>');
  return ctx;
}
