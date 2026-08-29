/** Strip Cloudflare HTML / oversized scraper dumps from public API errors. */

function publicError(err, fallback = 'Request failed. Try again in a moment.') {
  const raw = String(err?.message || err || '');
  if (!raw.trim()) return fallback;
  if (/<!doctype|<html|just a moment|cloudflare|cf-chl|cf_chl|403\s*-/i.test(raw)) return fallback;
  if (raw.length > 180) return fallback;
  return raw;
}

function blockedError(label) {
  const err = new Error(`${label} is temporarily unavailable.`);
  err.status = 403;
  return err;
}

module.exports = { publicError, blockedError };
