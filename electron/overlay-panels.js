const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT = {
  bench: true,
  items: true,
  obj: true,
  trinket: true,
  skill: true,
  winprob: true,
  scout: true,
  tftComp: true,
};

const PANEL_IDS = new Set(Object.keys(DEFAULT));

function filePath() {
  return path.join(app.getPath('userData'), 'overlay-panels.json');
}

function normalize(raw) {
  const next = { ...DEFAULT };
  if (raw && typeof raw === 'object') {
    for (const id of PANEL_IDS) {
      if (typeof raw[id] === 'boolean') next[id] = raw[id];
    }
  }
  return next;
}

function load() {
  try {
    return normalize(JSON.parse(fs.readFileSync(filePath(), 'utf8')));
  } catch { /* first run */ }
  return { ...DEFAULT };
}

function save(next) {
  const out = normalize(next);
  try { fs.writeFileSync(filePath(), JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

function setPanel(id, enabled) {
  if (!PANEL_IDS.has(id)) return load();
  const cur = load();
  cur[id] = !!enabled;
  return save(cur);
}

module.exports = { DEFAULT, PANEL_IDS, load, save, setPanel };
