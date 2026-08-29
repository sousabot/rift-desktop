const listeners = new Set();

export function subscribeApiNotice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitApiNotice(kind, message) {
  listeners.forEach((fn) => fn({ kind, message, at: Date.now() }));
}

export function apiUserMessage(err) {
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('must run as the desktop app')) {
    return 'Open Rift.lol as the desktop app to load live Riot data.';
  }
  if (lower.includes('no handler registered')) {
    return 'This feature needs a full restart. Close Rift.lol from the tray, then open it again.';
  }
  if (msg.includes('429') || lower.includes('rate limit')) {
    return 'Rate limit hit. Wait 2 minutes, then try again.';
  }
  if (msg.startsWith('Proxy 401') || msg.includes('Unauthorized')) {
    return 'This build is not authorized for the Rift.lol API. Set the same RIFT_APP_TOKEN on the server and in client.env, then rebuild Setup.';
  }
  if (msg.includes('401') || msg.includes('403')) {
    return 'Request blocked (401/403). Wait 2 minutes, then try again.';
  }
  return '';
}

export function isNotFound(err) {
  return /(?:Proxy |Riot API )?404\b/i.test(String(err?.message || err || ''));
}

export function noticeFromError(err) {
  const message = apiUserMessage(err);
  if (!message) return;
  const kind = message.startsWith('Rate')
    ? 'rate'
    : (message.includes('authorized') || message.includes('401') || message.includes('403') ? 'auth' : 'error');
  emitApiNotice(kind, message);
}
