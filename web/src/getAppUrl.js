/** In-app Get App / download landing (same Rift.lol website). */

export function getAppUrl(section = 'premium') {
  const id = String(section || 'premium').replace(/^#/, '');
  return `/get-app?section=${encodeURIComponent(id)}`;
}

/** Other docs pages (privacy, terms) — still on the static site. */
export function sitePageUrl(file) {
  const name = String(file || '').replace(/^\.\//, '').replace(/^\//, '');
  if (import.meta.env.DEV) return `/site/${name}`;
  return `../${name}`;
}
