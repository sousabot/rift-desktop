const path = require('path');
const fs = require('fs');
const asar = require('@electron/asar');

const REQUIRED_ASAR_FILES = [
  'server/tierlist.js',
  'server/tft-comps.js',
  'server/premium.js',
  'server/gift-store.js',
];

function assertAsarHasServerModules(context) {
  const asarPath = path.join(context.appOutDir, 'resources', 'app.asar');
  if (!fs.existsSync(asarPath)) {
    throw new Error(`[afterPack] missing ${asarPath}`);
  }
  const listed = asar.listPackage(asarPath).map((file) => String(file).replace(/\\/g, '/'));
  const missing = REQUIRED_ASAR_FILES.filter((rel) => !listed.some((file) => file === rel || file.endsWith(`/${rel}`)));
  if (missing.length) {
    throw new Error(`[afterPack] app.asar missing ${missing.join(', ')}`);
  }
  console.log('[afterPack] server modules packed');
}

// Stamp the unpacked app exe only. Never touch the portable NSIS wrapper —
// rcedit corrupts that SFX and triggers "Installer integrity check has failed".
module.exports = async function afterPack(context) {
  assertAsarHasServerModules(context);
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(context.packager.projectDir, 'build', 'icon.ico');
  if (!fs.existsSync(exe) || !fs.existsSync(icon)) return;
  const { rcedit } = await import('rcedit');
  await rcedit(exe, { icon });
  console.log('[afterPack] icon stamped', path.basename(exe));
};
