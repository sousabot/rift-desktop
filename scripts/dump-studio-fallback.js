/** Fetch DPM studio icons + rank distribution for the bundled fallback. */

const fs = require('fs');
const path = require('path');
const cloudscraper = require('cloudscraper');

const PLATFORMS = [
  'euw1', 'eun1', 'na1', 'br1', 'kr', 'jp1', 'la1', 'la2', 'oc1', 'tr1', 'ru', 'me1',
];
const QUEUES = ['soloq', 'flex'];
const OUT = path.join(__dirname, '..', 'server', 'studio-fallback.json');

async function fetchJson(url) {
  const body = await cloudscraper.get({
    uri: url,
    headers: {
      Accept: 'application/json',
      Origin: 'https://dpm.lol',
      Referer: 'https://dpm.lol/studio',
    },
  });
  const text = String(body || '');
  if (text.trimStart().startsWith('<')) throw new Error(`blocked ${url}`);
  return JSON.parse(text);
}

async function main() {
  const icons = await fetchJson('https://dpm.lol/v1/studio/profileicons');
  const rankDist = {};
  for (const platform of PLATFORMS) {
    rankDist[platform] = {};
    for (const queue of QUEUES) {
      const url = `https://dpm.lol/v1/studio/ranks/distribution?platform=${platform}&queue=${queue}`;
      try {
        rankDist[platform][queue] = await fetchJson(url);
        process.stdout.write(`ok ${platform} ${queue}\n`);
      } catch (err) {
        process.stdout.write(`skip ${platform} ${queue}: ${err.message}\n`);
      }
    }
  }
  const payload = {
    at: Date.now(),
    icons: Array.isArray(icons) ? icons : (icons.rows || []),
    rankDist,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.log('wrote', OUT, 'bytes', fs.statSync(OUT).size);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
