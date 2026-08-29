const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SETTINGS_REV = 3;

const DEFAULT_SETTINGS = {
  autoRecord: true,
  clipKills: true,
  preSeconds: 8,
  postSeconds: 4,
};

function rootDir() {
  const base = (() => {
    try {
      const videos = app.getPath('videos');
      if (videos) {
        const next = path.join(videos, 'Rift.lol', 'replays');
        const prev = path.join(videos, 'GD Esports', 'replays');
        const prevLive = fs.existsSync(path.join(prev, 'index.json'));
        const nextLive = fs.existsSync(path.join(next, 'index.json'));
        const base = (!nextLive && prevLive) ? prev : next;
        fs.mkdirSync(base, { recursive: true });
        return base;
      }
    } catch { /* ignore */ }
    return path.join(app.getPath('userData'), 'replays');
  })();
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function settingsPath() {
  return path.join(rootDir(), 'settings.json');
}

function indexPath() {
  return path.join(rootDir(), 'index.json');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizeSettings(raw = {}) {
  const migrated = Number(raw.rev) >= SETTINGS_REV;
  return {
    rev: SETTINGS_REV,
    // Rev 3+: auto-record on by default (detect League/TFT and capture while the app is open).
    autoRecord: migrated ? !!raw.autoRecord : true,
    clipKills: raw.clipKills !== false,
    preSeconds: Number(raw.preSeconds) > 0 ? Number(raw.preSeconds) : DEFAULT_SETTINGS.preSeconds,
    postSeconds: Number(raw.postSeconds) > 0 ? Number(raw.postSeconds) : DEFAULT_SETTINGS.postSeconds,
  };
}

function getSettings() {
  return normalizeSettings(readJson(settingsPath(), {}));
}

function setSettings(patch) {
  const next = normalizeSettings({ ...getSettings(), ...patch });
  writeJson(settingsPath(), next);
  return next;
}

function getIndex() {
  const data = readJson(indexPath(), { matches: [] });
  if (!Array.isArray(data.matches)) data.matches = [];
  return data;
}

function saveIndex(data) {
  writeJson(indexPath(), data);
}

function upsertMatch(entry) {
  const data = getIndex();
  const i = data.matches.findIndex((m) => m.id === entry.id);
  if (i >= 0) data.matches[i] = { ...data.matches[i], ...entry };
  else data.matches.unshift(entry);
  saveIndex(data);
  return data.matches[i >= 0 ? i : 0];
}

function removeMatch(id) {
  const data = getIndex();
  data.matches = data.matches.filter((m) => m.id !== id);
  saveIndex(data);
  const dir = path.join(rootDir(), id);
  fs.rmSync(dir, { recursive: true, force: true });
}

function removeClips(matchId, clipIds) {
  const ids = new Set((clipIds || []).filter(Boolean));
  if (!ids.size) return;
  const data = getIndex();
  const match = data.matches.find((m) => m.id === matchId);
  if (!match) return;
  const removed = (match.clips || []).filter((c) => ids.has(c.id));
  match.clips = (match.clips || []).filter((c) => !ids.has(c.id));
  const keep = new Set(
    [match.matchFile, ...(match.clips || []).map((c) => c.file), ...(match.segments || []).map((s) => s.file)]
      .filter(Boolean),
  );
  for (const clip of removed) {
    if (!clip.file || keep.has(clip.file)) continue;
    try {
      const full = safeJoin(matchId, clip.file);
      if (fs.existsSync(full)) fs.rmSync(full, { force: true });
    } catch { /* ignore */ }
  }
  if (!match.clips.length) {
    saveIndex(data);
    removeMatch(matchId);
    return;
  }
  saveIndex(data);
}

function matchDir(id) {
  const dir = path.join(rootDir(), String(id || ''));
  const root = rootDir();
  const resolved = path.resolve(dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Invalid replay path');
  }
  return resolved;
}

function safeJoin(id, rel) {
  const dir = matchDir(id);
  const full = path.resolve(dir, String(rel || '').replace(/^[/\\]+/, ''));
  if (full !== dir && !full.startsWith(dir + path.sep)) {
    throw new Error('Invalid replay file');
  }
  return full;
}

module.exports = {
  DEFAULT_SETTINGS,
  rootDir,
  getSettings,
  setSettings,
  getIndex,
  upsertMatch,
  removeMatch,
  removeClips,
  matchDir,
  safeJoin,
};
