export const PREMIUM_KEY = 'rift-premium';
export const DEVICE_KEY = 'rift-device-id';

export const PLANS = [
  { id: 'month', popular: false, priceKey: 'premium.priceMonth', perKey: 'premium.perMonth', notes: ['premium.noteMonth1', 'premium.noteMonth2', 'premium.noteAll'] },
  { id: 'six', popular: true, priceKey: 'premium.priceSix', perKey: 'premium.perSix', notes: ['premium.noteSix1', 'premium.noteSix2', 'premium.noteAll'] },
  { id: 'year', popular: false, priceKey: 'premium.priceYear', perKey: 'premium.perYear', notes: ['premium.noteYear1', 'premium.noteYear2', 'premium.noteAll'] },
];

export const GATED_PATHS = [
  '/studio',
  '/lens',
];

const EMPTY = {
  active: false,
  plan: null,
  source: null,
  license: null,
  sessionId: null,
  unlockedAt: null,
};

export function isGatedPath(pathname) {
  const path = String(pathname || '');
  return GATED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `rift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

export function readPremiumState() {
  try {
    const raw = localStorage.getItem(PREMIUM_KEY);
    if (!raw) return { ...EMPTY };
    if (raw === '1') {
      return {
        active: true,
        plan: 'six',
        source: 'tester',
        license: null,
        sessionId: null,
        unlockedAt: null,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY,
      ...parsed,
      active: Boolean(parsed?.active),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writePremiumState(state) {
  try {
    if (!state?.active) {
      localStorage.removeItem(PREMIUM_KEY);
      return;
    }
    localStorage.setItem(PREMIUM_KEY, JSON.stringify({
      active: true,
      plan: state.plan || null,
      source: state.source || null,
      license: state.license || null,
      sessionId: state.sessionId || null,
      unlockedAt: state.unlockedAt || Date.now(),
    }));
  } catch { /* quota */ }
}

/** @deprecated use readPremiumState */
export function readPremiumFlag() {
  return readPremiumState().active;
}

/** @deprecated use writePremiumState */
export function writePremiumFlag(on) {
  if (on) {
    writePremiumState({
      active: true,
      plan: 'six',
      source: 'tester',
      license: null,
      sessionId: null,
      unlockedAt: Date.now(),
    });
  } else {
    writePremiumState({ ...EMPTY });
  }
}
