const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT = {
  bench: { x: 18, y: 48 },
  items: { x: 300, y: 48 },
  obj: { x: 300, y: 160 },
  trinket: { x: 300, y: 260 },
  skill: { x: 18, y: 200 },
  winprob: { x: 18, y: 320 },
  scout: { x: 240, y: 40 },
  tftComp: { x: 18, y: 400 },
  tftItems: { x: 72, y: 620 },
};

const PANEL_IDS = new Set(['bench', 'items', 'obj', 'trinket', 'skill', 'winprob', 'scout', 'tftComp', 'tftItems']);

function filePath() {
  return path.join(app.getPath('userData'), 'overlay-pos.json');
}

function point(raw, fallback) {
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) return { x: Math.round(x), y: Math.round(y) };
  return { ...fallback };
}

function allDefaults() {
  return {
    bench: { ...DEFAULT.bench },
    items: { ...DEFAULT.items },
    obj: { ...DEFAULT.obj },
    trinket: { ...DEFAULT.trinket },
    skill: { ...DEFAULT.skill },
    winprob: { ...DEFAULT.winprob },
    scout: { ...DEFAULT.scout },
    tftComp: { ...DEFAULT.tftComp },
    tftItems: { ...DEFAULT.tftItems },
  };
}

function loadPos() {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (raw && raw.bench == null && Number.isFinite(Number(raw.x))) {
      return {
        ...allDefaults(),
        bench: point(raw, DEFAULT.bench),
        items: { x: Number(raw.x) + 0, y: Number(raw.y) + 120 },
      };
    }
    return {
      bench: point(raw?.bench, DEFAULT.bench),
      items: point(raw?.items, DEFAULT.items),
      obj: point(raw?.obj, DEFAULT.obj),
      trinket: point(raw?.trinket, DEFAULT.trinket),
      skill: point(raw?.skill, DEFAULT.skill),
      winprob: point(raw?.winprob, DEFAULT.winprob),
      scout: point(raw?.scout, DEFAULT.scout),
      tftComp: point(raw?.tftComp, DEFAULT.tftComp),
      tftItems: point(raw?.tftItems, DEFAULT.tftItems),
    };
  } catch { /* first run */ }
  return allDefaults();
}

function savePos(pos) {
  const next = {
    bench: point(pos?.bench, DEFAULT.bench),
    items: point(pos?.items, DEFAULT.items),
    obj: point(pos?.obj, DEFAULT.obj),
    trinket: point(pos?.trinket, DEFAULT.trinket),
    skill: point(pos?.skill, DEFAULT.skill),
    winprob: point(pos?.winprob, DEFAULT.winprob),
    scout: point(pos?.scout, DEFAULT.scout),
    tftComp: point(pos?.tftComp, DEFAULT.tftComp),
    tftItems: point(pos?.tftItems, DEFAULT.tftItems),
  };
  try { fs.writeFileSync(filePath(), JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

function savePanel(id, pointIn) {
  const cur = loadPos();
  if (!PANEL_IDS.has(id)) return cur;
  cur[id] = point(pointIn, DEFAULT[id]);
  return savePos(cur);
}

module.exports = { DEFAULT, loadPos, savePos, savePanel };
