#!/usr/bin/env node
/**
 * Mint free Premium gift codes.
 *
 *   node scripts/gift-premium.js
 *   node scripts/gift-premium.js --plan year --days 365 --note friend
 *   node scripts/gift-premium.js --plan six --days 0
 *
 * Requires PREMIUM_LICENSE_SECRET or STRIPE_SECRET_KEY in .env
 * (must match the secret on the PCs that redeem the code).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createGiftCode, PLAN_IDS } = require('../server/premium');

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  return args[i + 1] ?? fallback;
}

const plan = String(flag('plan', 'six')).toLowerCase();
const days = Number(flag('days', '365'));
const note = String(flag('note', ''));

if (!PLAN_IDS.has(plan)) {
  console.error(`Unknown plan "${plan}". Use: month | six | year`);
  process.exit(1);
}

try {
  const gift = createGiftCode({ plan, days: Number.isFinite(days) ? days : 365, note });
  console.log('Gift code (send this to them):');
  console.log(gift.code);
  console.log('');
  console.log(`Plan: ${gift.plan} · max uses: ${gift.maxUses}`);
  console.log(gift.exp ? `Expires: ${new Date(gift.exp).toISOString()}` : 'Expires: never');
  console.log('They must link a Riot ID, then redeem on Premium → Gift code.');
  console.log('Each code is tracked so another account cannot reuse it.');
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
