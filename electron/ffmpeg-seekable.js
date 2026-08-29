const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function ffmpegBin() {
  try {
    let bin = require('ffmpeg-static');
    if (typeof bin === 'string' && bin.includes('app.asar')) {
      bin = bin.replace('app.asar', 'app.asar.unpacked');
    }
    if (bin && fs.existsSync(bin)) return bin;
  } catch { /* ignore */ }
  return 'ffmpeg';
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), args, { windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => { err += String(d); });
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error((err || `ffmpeg exited ${code}`).slice(-500)));
    });
  });
}

const ENCODE = [
  '-map', '0:v:0', '-map', '0:a:0?',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
  '-pix_fmt', 'yuv420p',
  '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
  '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart',
];

function isFresh(outPath, sources = []) {
  if (!outPath || !fs.existsSync(outPath) || fs.statSync(outPath).size < 80000) return false;
  const outStat = fs.statSync(outPath);
  return sources.every((src) => {
    if (!src || !fs.existsSync(src)) return true;
    const st = fs.statSync(src);
    if (st.mtimeMs >= outStat.mtimeMs) return false;
    if (st.size > 80_000 && outStat.size < st.size * 0.2) return false;
    return true;
  });
}

const PROBE = ['-fflags', '+genpts+igndts', '-analyzeduration', '200M', '-probesize', '200M'];

async function remuxFaststart(inputPath, outputPath) {
  const tmp = `${outputPath}.tmp.mp4`;
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  await runFfmpeg(['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, outputPath);
  return outputPath;
}

async function encodeFile(inputPath, outputPath) {
  const tmp = `${outputPath}.tmp.mp4`;
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  await runFfmpeg(['-y', ...PROBE, '-i', inputPath, ...ENCODE, tmp]);
  fs.renameSync(tmp, outputPath);
  return outputPath;
}

async function encodeConcat(files, outputPath) {
  const dir = path.dirname(outputPath);
  const listPath = path.join(dir, 'concat.txt');
  const body = files.map((file) => `file '${String(file).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, body);
  const tmp = `${outputPath}.tmp.mp4`;
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  try {
    await runFfmpeg(['-y', ...PROBE, '-f', 'concat', '-safe', '0', '-i', listPath, ...ENCODE, tmp]);
    fs.renameSync(tmp, outputPath);
    return outputPath;
  } finally {
    try { fs.rmSync(listPath, { force: true }); } catch { /* ignore */ }
  }
}

async function makeSeekableMp4(dir, { matchFile, segments } = {}) {
  const outPath = path.join(dir, 'seekable.mp4');
  const rawName = matchFile && !/seekable\.mp4$/i.test(matchFile) ? matchFile : null;
  const matchPath = rawName ? path.join(dir, rawName) : null;
  const segPaths = (segments || [])
    .map((s) => (s?.file ? path.join(dir, s.file) : null))
    .filter((p) => p && fs.existsSync(p) && fs.statSync(p).size > 20000);

  const sources = [matchPath, ...segPaths].filter((p) => p && fs.existsSync(p));
  if (isFresh(outPath, sources) && segPaths.length <= 1) return outPath;

  if (segPaths.length > 1) {
    await encodeConcat(segPaths, outPath);
    return outPath;
  }
  if (matchPath && fs.existsSync(matchPath) && fs.statSync(matchPath).size > 20000) {
    if (/\.mp4$/i.test(matchPath)) {
      try {
        await remuxFaststart(matchPath, outPath);
        return outPath;
      } catch { /* fall through to re-encode */ }
    }
    await encodeFile(matchPath, outPath);
    return outPath;
  }
  if (segPaths.length === 1) {
    await encodeFile(segPaths[0], outPath);
    return outPath;
  }
  return fs.existsSync(outPath) ? outPath : null;
}

function probeDurationSec(filePath) {
  return new Promise((resolve) => {
    if (!filePath || !fs.existsSync(filePath)) {
      resolve(0);
      return;
    }
    const proc = spawn(ffmpegBin(), ['-i', filePath], { windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => { err += String(d); });
    proc.on('error', () => resolve(0));
    proc.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) {
        resolve(0);
        return;
      }
      resolve((Number(m[1]) * 3600) + (Number(m[2]) * 60) + Number(m[3]));
    });
  });
}

async function cutClip(inputPath, outputPath, start, duration) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmp = `${outputPath}.tmp.mp4`;
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  const ss = Math.max(0, Number(start) || 0);
  const t = Math.max(1, Number(duration) || 12);
  try {
    await runFfmpeg([
      '-y', '-ss', String(ss), '-i', inputPath, '-t', String(t),
      '-c', 'copy', '-movflags', '+faststart', tmp,
    ]);
  } catch {
    await runFfmpeg([
      '-y', '-ss', String(ss), '-i', inputPath, '-t', String(t),
      ...ENCODE, tmp,
    ]);
  }
  fs.renameSync(tmp, outputPath);
  return outputPath;
}

module.exports = {
  makeSeekableMp4,
  probeDurationSec,
  ffmpegBin,
  startWindowGrab,
  startDesktopRegionGrab,
  stopDesktopGrab,
  cutClip,
};

function encodeArgs(outPath) {
  return [
    '-an',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-g', '30',
    '-movflags', '+frag_keyframe+empty_moov',
    outPath,
  ];
}

function startWindowGrab({ outPath, title = 'League of Legends (TM) Client' }) {
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'gdigrab',
    '-framerate', '30',
    '-draw_mouse', '0',
    '-i', `title=${title}`,
    ...encodeArgs(outPath),
  ];
  return spawn(ffmpegBin(), args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
}

/** Capture composited desktop pixels in a window rect — needed for Unreal/TFT (title= gdigrab is pink/corrupt). */
function startDesktopRegionGrab({ outPath, x = 0, y = 0, width = 1920, height = 1080 }) {
  const w = Math.max(2, Math.floor(Number(width) / 2) * 2);
  const h = Math.max(2, Math.floor(Number(height) / 2) * 2);
  const ox = Math.round(Number(x) || 0);
  const oy = Math.round(Number(y) || 0);
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'gdigrab',
    '-framerate', '30',
    '-offset_x', String(ox),
    '-offset_y', String(oy),
    '-video_size', `${w}x${h}`,
    '-draw_mouse', '0',
    '-i', 'desktop',
    ...encodeArgs(outPath),
  ];
  return spawn(ffmpegBin(), args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
}

function stopDesktopGrab(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode != null) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve();
    }, 8000);
    proc.once('close', () => {
      clearTimeout(t);
      resolve();
    });
    try {
      proc.stdin.write('q');
    } catch {
      try { proc.kill(); } catch { /* ignore */ }
    }
  });
}
