const NAME_TO_ISO = {
  portugal: 'pt', spain: 'es', france: 'fr', germany: 'de', poland: 'pl',
  turkey: 'tr', türkiye: 'tr', sweden: 'se', denmark: 'dk', greece: 'gr',
  'united kingdom': 'gb', england: 'gb', scotland: 'gb', wales: 'gb',
  netherlands: 'nl', belgium: 'be', italy: 'it', romania: 'ro', czechia: 'cz',
  'czech republic': 'cz', slovakia: 'sk', hungary: 'hu', austria: 'at',
  switzerland: 'ch', norway: 'no', finland: 'fi', ireland: 'ie', iceland: 'is',
  croatia: 'hr', serbia: 'rs', slovenia: 'si', bulgaria: 'bg', ukraine: 'ua',
  russia: 'ru', belarus: 'by', lithuania: 'lt', latvia: 'lv', estonia: 'ee',
  'south korea': 'kr', korea: 'kr', china: 'cn', taiwan: 'tw', japan: 'jp',
  'united states': 'us', usa: 'us', canada: 'ca', brazil: 'br', argentina: 'ar',
  chile: 'cl', mexico: 'mx', colombia: 'co', peru: 'pe', uruguay: 'uy',
  australia: 'au', 'new zealand': 'nz', vietnam: 'vn', thailand: 'th',
  philippines: 'ph', singapore: 'sg', malaysia: 'my', indonesia: 'id',
  india: 'in', egypt: 'eg', morocco: 'ma', algeria: 'dz', tunisia: 'tn',
  lebanon: 'lb', israel: 'il', 'saudi arabia': 'sa', uae: 'ae',
  'united arab emirates': 'ae', kazakhstan: 'kz', armenia: 'am', georgia: 'ge',
  bosnia: 'ba', 'bosnia and herzegovina': 'ba', macedonia: 'mk',
  'north macedonia': 'mk', albania: 'al', kosovo: 'xk', moldova: 'md',
  luxembourg: 'lu', monaco: 'mc', andorra: 'ad',
};

export function countryIso(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return '';
  if (/^[a-z]{2}$/.test(key)) return key;
  if (NAME_TO_ISO[key]) return NAME_TO_ISO[key];
  const last = key.split(',')[0].trim();
  return NAME_TO_ISO[last] || '';
}

export function countryName(code, locale = 'en') {
  const iso = countryIso(code).toUpperCase();
  if (!iso) return String(code || '');
  try {
    const label = new Intl.DisplayNames([locale], { type: 'region' }).of(iso);
    return label || iso;
  } catch {
    return iso === 'XK' ? 'Kosovo' : iso;
  }
}

export function flagUrl(name, w = 24) {
  const iso = countryIso(name);
  if (!iso) return '';
  return `https://flagcdn.com/w${w}/${iso}.png`;
}
