/** Fetch processed synergy tables for the bundled fallback. */

const fs = require('fs');
const path = require('path');
const { getSynergy, DUO_TYPES } = require('../server/synergy');

const OUT = path.join(__dirname, '..', 'server', 'synergy-fallback.json');
const TYPES = Object.keys(DUO_TYPES);
const JOBS = [
  ...['master', 'master_plus', 'diamond_plus', 'emerald_plus'].flatMap((rank) => (
    TYPES.map((duoType) => ({ platform: 'euw1', rank, duoType }))
  )),
  ...['na1', 'kr', 'eun1'].flatMap((platform) => (
    TYPES.map((duoType) => ({ platform, rank: 'master', duoType }))
  )),
];

async function main() {
  const payloads = {};
  for (const job of JOBS) {
    const data = await getSynergy({
      ...job,
      timeframe: '30days',
    });
    const key = `${job.duoType}|${job.platform}|${job.rank}|30days`;
    if (!data?.ok || !data.rows?.length) {
      console.log('skip', key, data?.error || 'empty');
      continue;
    }
    payloads[key] = {
      ok: true,
      duoType: data.duoType,
      role1: data.role1,
      role2: data.role2,
      platform: data.platform,
      rank: data.rank,
      timeframe: data.timeframe,
      minGames: data.minGames,
      total: data.total,
      analysed: data.analysed,
      patch: data.patch,
      rows: data.rows,
      pairings: data.pairings,
    };
    console.log('ok', key, data.rows.length);
  }
  const out = { at: Date.now(), payloads };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, 'bytes', fs.statSync(OUT).size, 'keys', Object.keys(payloads).length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
