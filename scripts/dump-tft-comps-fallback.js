/** Fetch current MetaTFT comps for the bundled desktop fallback. */

const fs = require('fs');
const path = require('path');
const { getTftComps } = require('../server/tft-comps');

const OUT = path.join(__dirname, '..', 'server', 'tft-comps-fallback.json');

async function main() {
  const data = await getTftComps({ force: true });
  if (!data?.comps?.length) {
    throw new Error(data?.error || 'MetaTFT returned no comps');
  }
  const out = {
    builtAt: Date.now(),
    clusterId: data.clusterId || null,
    tftSet: data.tftSet || '',
    source: 'snapshot',
    comps: data.comps,
    units: Array.isArray(data.units) ? data.units : [],
    unitsVersion: data.unitsVersion || 4,
    error: null,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, 'bytes', fs.statSync(OUT).size, 'comps', out.comps.length, 'units', out.units.length, 'set', out.tftSet);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
