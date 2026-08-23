#!/usr/bin/env node
/** Post a release announcement to DISCORD_WEBHOOK_URL (.env). */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;
const tag = version.startsWith('v') ? version : `v${version}`;
const notesPath = process.argv[3];
const defaultNotes = [
  '• **Tier list** — browse tiers by role, rank, and region',
  '• **Champion detail** — WR / pick / ban trends, builds, matchups, item paths',
  '• **Matchups panel** — good vs bad by enemy role, full list view',
  '• **Build fixes** — Doran\'s Bow starters, Emerald+ ranked sample',
].join('\n');
const notes = notesPath && fs.existsSync(notesPath)
  ? fs.readFileSync(notesPath, 'utf8').trim()
  : (process.env.RELEASE_NOTES || defaultNotes);

const webhook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
if (!webhook) {
  console.error('DISCORD_WEBHOOK_URL is not set in .env');
  process.exit(1);
}

const repo = String(pkg.repository || 'sousabot/rift-desktop').replace(/^https:\/\/github.com\//, '');
const download = `https://github.com/${repo}/releases/latest`;

async function main() {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Rift.lol',
      embeds: [{
        title: `Rift.lol Desktop ${tag} is out`,
        description: [
          notes,
          '',
          `[Download latest](${download}) · Existing installs auto-update when the release is published.`,
        ].join('\n'),
        color: 0x7c5cff,
        footer: { text: 'Rift.lol Desktop' },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Discord webhook failed (${res.status}): ${body.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`Posted ${tag} announcement to Discord.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
