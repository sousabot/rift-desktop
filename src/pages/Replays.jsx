import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Replays.css';
import { useI18n } from '../i18n/LocaleContext';
import { champIconUrl, useDdragonVersion } from '../services/ddragon';

const api = typeof window !== 'undefined' ? window.replaysAPI : null;
const NO_SEGS = [];
const transcodeCache = new Map();

function fmtTime(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function dayKey(ms) {
  const d = new Date(ms || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key, t) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const same = date.toDateString() === today.toDateString();
  if (same) return t('replays.today');
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (date.toDateString() === yest.toDateString()) return t('replays.yesterday');
  return date.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

function cardStamp(ms, duration) {
  const when = ms
    ? new Date(ms).toLocaleDateString([], { month: 'long', day: 'numeric' })
    : '';
  const dur = fmtTime(duration);
  return when ? `${when} | ${dur}` : dur;
}

function normChamp(name = '') {
  return String(name).replace(/[^a-zA-Z0-9]/g, '').replace(/^./, (c) => c.toUpperCase());
}

function isTftMatch(match) {
  const mode = String(match?.gameMode || '');
  const src = String(match?.source || match?.sourceName || '');
  const champ = String(match?.champion || '');
  return (
    /^TFT$/i.test(mode)
    || /TEAMFIGHT/i.test(mode)
    || /^TFT\b/i.test(src.trim())
    || /Teamfight Tactics/i.test(src)
    || /^TFT$/i.test(champ)
  );
}

function modeLabel(matchOrMode) {
  if (matchOrMode && typeof matchOrMode === 'object') {
    if (isTftMatch(matchOrMode)) return 'TFT';
    const mode = String(matchOrMode.gameMode || '').toUpperCase();
    if (mode === 'CLASSIC') return 'League';
    if (mode === 'PRACTICETOOL') return 'Practice tool';
    if (mode === 'ARAM') return 'ARAM';
    if (mode === 'CHERRY' || mode === 'ARENA') return 'Arena';
    if (/League of Legends/i.test(matchOrMode.source || '')) return 'League';
    return mode || 'League';
  }
  const key = String(matchOrMode || '').toUpperCase();
  if (key === 'TFT' || /TEAMFIGHT/.test(key)) return 'TFT';
  if (key === 'CLASSIC') return 'League';
  if (key === 'PRACTICETOOL') return 'Practice tool';
  if (key === 'ARAM') return 'ARAM';
  if (key === 'CHERRY' || key === 'ARENA') return 'Arena';
  return matchOrMode || 'League';
}

function displayTitle(match) {
  if (isTftMatch(match)) return 'TFT';
  return match?.champion || 'League';
}

function champIcon(name, match, version) {
  if (isTftMatch(match) || /^TFT$/i.test(name || '')) return '';
  if (!name) return '';
  return champIconUrl(name, version);
}

function splashImg(name, match) {
  if (isTftMatch(match) || /^TFT$/i.test(name || '')) return '';
  const id = normChamp(name);
  if (!id) return '';
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
}

function buildMarkers(match) {
  const timeline = Array.isArray(match?.timeline) ? match.timeline : [];
  if (timeline.length) {
    return timeline
      .map((row) => ({
        at: Number(row.at) || 0,
        type: String(row.type || 'event'),
        label: String(row.label || 'Event'),
      }))
      .filter((m) => m.at >= 0)
      .sort((a, b) => a.at - b.at);
  }
  return (match?.clips || [])
    .map((c) => ({
      at: Number(c.start) || 0,
      type: 'kill',
      label: String(c.label || 'Kill'),
    }))
    .filter((m) => m.at >= 0);
}

function markClass(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'assist') return 'is-assist';
  if (t === 'death') return 'is-death';
  if (t === 'tower') return 'is-tower';
  if (t === 'dragon' || t === 'baron' || t === 'herald' || t === 'grub') return 'is-obj';
  if (t === 'multikill' || t === 'firstblood') return 'is-multi';
  return 'is-kill';
}

function MarkIcon({ type }) {
  const t = String(type || '').toLowerCase();
  if (t === 'assist') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8.2 11.2c1.5 0 2.7-1.3 2.7-2.8S9.7 5.6 8.2 5.6 5.5 6.9 5.5 8.4s1.2 2.8 2.7 2.8Zm7.6 0c1.5 0 2.7-1.3 2.7-2.8s-1.2-2.8-2.7-2.8-2.7 1.3-2.7 2.8 1.2 2.8 2.7 2.8ZM4.4 18.4c0-2.1 2.2-3.6 3.8-3.6.6 0 1.3.2 1.9.5 1-.8 2.3-1.2 3.9-1.2s2.9.4 3.9 1.2c.6-.3 1.3-.5 1.9-.5 1.6 0 3.8 1.5 3.8 3.6v.8H4.4v-.8Z" />
      </svg>
    );
  }
  if (t === 'death') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 3.2c-3.8 0-6.8 2.7-6.8 6.2 0 2.2 1.2 4.1 3 5.2v2.1c0 .7.5 1.2 1.2 1.2h1.1v1.6c0 .5.4.9.9.9h1.2c.5 0 .9-.4.9-.9v-1.6h1.1c.7 0 1.2-.5 1.2-1.2v-2.1c1.8-1.1 3-3 3-5.2 0-3.5-3-6.2-6.8-6.2Zm-2.2 5.4a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm4.4 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm-3.4 3.6h2.4c.3 0 .5.3.4.6-.2.8-.9 1.3-1.6 1.3s-1.4-.5-1.6-1.3c-.1-.3.1-.6.4-.6Z" />
      </svg>
    );
  }
  if (t === 'tower') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M11.2 3.2h1.6l.8 1.6h1.8v1.5l1.2.8v2.1h-1.1v8.4H16v1.8H8v-1.8h.5V9.2H7.4V7.1l1.2-.8V4.8h1.8l.8-1.6Zm.8 4.2c-.9 0-1.6.7-1.6 1.6S11.1 10.6 12 10.6s1.6-.7 1.6-1.6S12.9 7.4 12 7.4Zm-2.1 4.4h4.2v5.8h-4.2v-5.8Z" />
      </svg>
    );
  }
  if (t === 'dragon' || t === 'baron' || t === 'herald' || t === 'grub') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 3.5 4.8 7.2v4.8c0 4.4 3 8.4 7.2 9.5 4.2-1.1 7.2-5.1 7.2-9.5V7.2L12 3.5Zm0 2.2 5.4 2.8v3.5c0 3.1-2 5.9-5.4 7-3.4-1.1-5.4-3.9-5.4-7V8.5L12 5.7Z" />
      </svg>
    );
  }
  // kill / multikill / firstblood — crossed swords
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M6.2 3.4 12 9.2l1.4-1.4L7.6 2l-1.4 1.4Zm11.6 0L16.4 2l-5.8 5.8L12 9.2l5.8-5.8ZM4.8 14.6l3.2-3.2 1.4 1.4-2 2 2.2 2.2-1.4 1.4-2.2-2.2-1.6 1.6-1.4-1.4 1.6-1.6-1.8-2.2Zm14.4 0-1.8 2.2 1.6 1.6-1.4 1.4-1.6-1.6-2.2 2.2-1.4-1.4 2.2-2.2-2-2 1.4-1.4 3.2 3.2Z" />
    </svg>
  );
}

function TimelineMarks({ markers, len, onSeek, variant = 'seek' }) {
  return markers.map((mark, i) => {
    const at = typeof mark === 'object' ? Number(mark.at) || 0 : Number(mark) || 0;
    const type = typeof mark === 'object' ? mark.type : 'kill';
    const tip = typeof mark === 'object' ? (mark.label || type) : 'Event';
    const left = Math.min(100, Math.max(0, (at / Math.max(len, 0.1)) * 100));
    const cls = `rp-mark ${markClass(type)}${variant === 'strip' ? ' is-strip' : ''}${variant === 'card' ? ' is-card' : ''}`;
    if (variant === 'strip' || variant === 'card') {
      return (
        <span
          key={`${type}-${at}-${i}`}
          className={cls}
          style={{ left: `${left}%` }}
          title={`${tip} · ${fmtTime(at)}`}
        >
          <MarkIcon type={type} />
        </span>
      );
    }
    return (
      <button
        key={`${type}-${at}-${i}`}
        type="button"
        className={cls}
        style={{ left: `${left}%` }}
        title={`${tip} · ${fmtTime(at)}`}
        aria-label={tip}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSeek?.(at);
        }}
      >
        <MarkIcon type={type} />
      </button>
    );
  });
}

function minuteTicks(len) {
  if (len < 120) return [];
  const step = len >= 1800 ? 300 : len >= 600 ? 120 : 60;
  const ticks = [];
  for (let t = 0; t <= len + 0.01; t += step) ticks.push(t);
  return ticks;
}

function fmtBytes(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} KB`;
  if (v < 1024 ** 3) return `${(v / (1024 ** 2)).toFixed(v >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${(v / (1024 ** 3)).toFixed(1)} GB`;
}

function estimateBytes(totalBytes, totalDur, sliceDur) {
  const bytes = Number(totalBytes) || 0;
  const full = Math.max(0.1, Number(totalDur) || 0);
  const slice = Math.max(0, Number(sliceDur) || 0);
  if (!bytes) return 0;
  return Math.round(bytes * (slice / full));
}

function favStoreKey() {
  return 'rift.clips.favorites';
}

function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(favStoreKey()) || '[]');
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(set) {
  try {
    localStorage.setItem(favStoreKey(), JSON.stringify([...set]));
  } catch { /* ignore */ }
}

function flattenClips(matches) {
  const items = [];
  for (const match of matches) {
    if (match.matchFile) {
      items.push({
        id: `${match.id}:match`,
        match,
        clip: { file: match.matchFile, duration: match.duration, label: 'Full match' },
        champion: match.champion,
        label: 'Full match',
        duration: match.duration || 0,
        at: match.startedAt,
        gameTime: 0,
        startAt: 0,
        full: true,
      });
    }
    for (const clip of match.clips || []) {
      items.push({
        id: `${match.id}:${clip.id}`,
        match,
        clip,
        champion: match.champion,
        label: clip.label || 'Kill',
        duration: clip.duration || 12,
        at: match.startedAt,
        gameTime: clip.gameTime,
        startAt: clip.start || 0,
      });
    }
  }
  return items;
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8.5 6.8v10.4L18 12 8.5 6.8Z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 6h3.2v12H7V6Zm6.8 0H17v12h-3.2V6Z" />
    </svg>
  );
}
function IconFs() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M8 5H5v3M16 5h3v3M8 19H5v-3M16 19h3v-3" />
    </svg>
  );
}
function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="2" d="M15 6 9 12l6 6" />
    </svg>
  );
}
function IconScissors() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M6 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8.2 8.2 20 18M8.2 15.8 20 6" />
    </svg>
  );
}
function IconMore() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}
function IconStar({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        d="m12 3.6 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18.5l.9-5.4-3.9-3.8 5.4-.8L12 3.6Z"
      />
    </svg>
  );
}

function pickSegment(segments, t) {
  if (!segments?.length) return null;
  let found = segments[0];
  for (const seg of segments) {
    if (t >= (Number(seg.start) || 0) - 0.05) found = seg;
    else break;
  }
  return found;
}

function ReplayPlayer({
  src,
  durationHint,
  label,
  startAt = 0,
  segments = [],
  markers = [],
  bytes = 0,
  onClose,
  onExport,
  exporting = false,
}) {
  const videoRef = useRef(null);
  const volumeRef = useRef(1);
  const segStartRef = useRef(Number(segments[0]?.start) || 0);
  const blobTried = useRef(false);
  const blobUrl = useRef(null);
  const srcRef = useRef(src);
  const stripRef = useRef(null);
  const [localSrc, setLocalSrc] = useState(segments[0]?.url || src);
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(Number(durationHint) || 0);
  const [volume, setVolume] = useState(1);
  const [fs, setFs] = useState(false);
  const [scrub, setScrub] = useState(null);
  const [inAt, setInAt] = useState(0);
  const [outAt, setOutAt] = useState(Math.max(1, Number(durationHint) || 1));
  const [stripFrames, setStripFrames] = useState([]);

  const len = Math.max(duration, Number(durationHint) || 0, 0.1);
  const shown = scrub != null ? scrub : time;
  const pct = Math.min(100, (shown / len) * 100);
  const segKey = (segments || []).map((s) => s.url || s.file).join('|');
  const hasSegs = segments.length > 1;
  const selLen = Math.max(0.1, outAt - inAt);
  const selBytes = estimateBytes(bytes, len, selLen);
  const inPct = Math.min(100, Math.max(0, (inAt / len) * 100));
  const outPct = Math.min(100, Math.max(0, (outAt / len) * 100));

  useEffect(() => {
    const first = segments[0]?.url || src;
    blobTried.current = false;
    srcRef.current = src;
    if (blobUrl.current) {
      URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    }
    setLocalSrc(first);
    segStartRef.current = Number(segments[0]?.start) || 0;
    setTime(0);
    setScrub(null);
    setPaused(true);
    const nextLen = Math.max(Number(durationHint) || 0, 0.1);
    setDuration(nextLen);
    setInAt(0);
    setOutAt(nextLen);
  }, [src, durationHint, startAt, segKey]);

  useEffect(() => () => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (fs) setFs(false);
        else onClose?.();
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'i' || e.key === 'I') setInAt(Math.min(shown, outAt - 0.1));
      if (e.key === 'o' || e.key === 'O') setOutAt(Math.max(shown, inAt + 0.1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fs, onClose, paused, shown, inAt, outAt]);

  useEffect(() => {
    let cancelled = false;
    const el = document.createElement('video');
    el.preload = 'auto';
    el.muted = true;
    el.src = localSrc;
    const grab = async () => {
      try {
        await el.play().catch(() => {});
        el.pause();
        const frames = [];
        const count = 12;
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < count; i += 1) {
          const t = (len * i) / Math.max(1, count - 1);
          await new Promise((resolve) => {
            const onSeek = () => {
              el.removeEventListener('seeked', onSeek);
              try {
                ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
                frames.push(canvas.toDataURL('image/jpeg', 0.7));
              } catch {
                frames.push('');
              }
              resolve();
            };
            el.addEventListener('seeked', onSeek);
            try { el.currentTime = Math.min(len - 0.05, t); } catch { resolve(); }
          });
          if (cancelled) return;
        }
        if (!cancelled) setStripFrames(frames);
      } catch {
        if (!cancelled) setStripFrames([]);
      }
    };
    grab();
    return () => {
      cancelled = true;
      el.removeAttribute('src');
      el.load();
    };
  }, [localSrc, len]);

  async function loadSeekableBlob() {
    const original = srcRef.current;
    if (blobTried.current || !String(original).startsWith('gdreplay:')) return false;
    blobTried.current = true;
    try {
      const res = await fetch(original);
      const blob = await res.blob();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = URL.createObjectURL(blob);
      setLocalSrc(blobUrl.current);
      return true;
    } catch {
      return false;
    }
  }

  async function onLoaded() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = volumeRef.current <= 0;
    el.volume = volumeRef.current;
    el.playbackRate = 1;
    const play = () => el.play().then(() => setPaused(false)).catch(() => setPaused(true));
    const base = Number(startAt) || 0;
    if (Number.isFinite(el.duration) && el.duration > 0.4 && el.duration < 36000) {
      setDuration(el.duration);
      setOutAt((prev) => (prev <= 1 ? el.duration : Math.min(prev, el.duration)));
    }
    const seekEnd = el.seekable?.length ? el.seekable.end(el.seekable.length - 1) : 0;
    const unseekable = !Number.isFinite(el.duration) || el.duration === Infinity || seekEnd < 0.5;
    if (unseekable && String(localSrc).startsWith('gdreplay:')) {
      if (await loadSeekableBlob()) return;
    }
    if (base > 0.05) {
      el.addEventListener('seeked', play, { once: true });
      try { el.currentTime = base; } catch { play(); }
      return;
    }
    play();
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.muted = volumeRef.current <= 0;
      el.playbackRate = 1;
      el.play().then(() => setPaused(false)).catch(() => {});
    } else {
      el.pause();
      setPaused(true);
    }
  }

  function clipTime(el) {
    const abs = hasSegs
      ? (segStartRef.current + (el.currentTime || 0))
      : (el.currentTime || 0);
    return Math.max(0, abs - (Number(startAt) || 0));
  }

  function seekTo(raw, { end } = {}) {
    const el = videoRef.current;
    const t = Math.max(0, Math.min(len, Number(raw)));
    if (end) {
      setScrub(null);
      setTime(t);
    } else {
      setScrub(t);
    }
    if (!el) return;
    const abs = (Number(startAt) || 0) + t;
    if (hasSegs) {
      const seg = pickSegment(segments, abs);
      if (!seg?.url) return;
      segStartRef.current = Number(seg.start) || 0;
      if (seg.url !== localSrc) {
        setLocalSrc(seg.url);
        return;
      }
      try { el.currentTime = Math.max(0, abs - segStartRef.current); } catch { /* ignore */ }
      return;
    }
    try { el.currentTime = abs; } catch { /* ignore */ }
    const want = abs;
    window.setTimeout(() => {
      const node = videoRef.current;
      if (!node || blobTried.current) return;
      if (Math.abs((node.currentTime || 0) - want) > 1.25) loadSeekableBlob();
    }, 280);
  }

  function playSelection() {
    seekTo(inAt, { end: true });
    const el = videoRef.current;
    if (!el) return;
    el.play().then(() => setPaused(false)).catch(() => {});
  }

  return (
    <div className={`rp-player${fs ? ' is-fs' : ''}`}>
      <div className="rp-stage" onDoubleClick={() => setFs((v) => !v)}>
        {label ? <span className="rp-badge">{label}</span> : null}
        <video
          ref={videoRef}
          key={localSrc}
          src={localSrc}
          preload="auto"
          onLoadedMetadata={onLoaded}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(e) => {
            if (scrub != null) return;
            const node = e.currentTarget;
            const mediaLen = Number.isFinite(node.duration) && node.duration > 0.4 && node.duration < 36000
              ? node.duration
              : 0;
            if (mediaLen && mediaLen < len) setDuration(mediaLen);
            const rel = clipTime(node);
            if (node.ended) {
              setPaused(true);
              setTime(mediaLen || rel);
              return;
            }
            if (rel >= outAt - 0.05 && rel > inAt + 0.2) {
              node.pause();
              setPaused(true);
              setTime(outAt);
              return;
            }
            setTime(rel);
          }}
          onClick={togglePlay}
        />
        {paused ? (
          <button type="button" className="rp-play-big" onClick={togglePlay} aria-label="Play">
            <IconPlay />
          </button>
        ) : null}
      </div>
      <div className="rp-controls">
        <button type="button" className="rp-icon-btn" onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>
        <button type="button" className="rp-icon-btn" onClick={() => seekTo(shown - 5, { end: true })} aria-label="Back 5s">«</button>
        <button type="button" className="rp-icon-btn" onClick={() => seekTo(shown + 5, { end: true })} aria-label="Forward 5s">»</button>
        <span className="rp-time">{fmtTime(shown)} / {fmtTime(len)}</span>
        <div className="rp-seek-wrap">
          <div className="rp-seek-rail" aria-hidden="true">
            {minuteTicks(len).map((t) => (
              <span
                key={t}
                className={`rp-tick${t % 300 === 0 || t === 0 ? ' is-major' : ''}`}
                style={{ left: `${Math.min(100, (t / len) * 100)}%` }}
              >
                {(t % 300 === 0 || t === 0) ? <em>{Math.round(t / 60)}m</em> : null}
              </span>
            ))}
          </div>
          <div className="rp-seek-fill" style={{ width: `${pct}%` }} />
          <div className="rp-marks">
            <TimelineMarks markers={markers} len={len} onSeek={(at) => seekTo(at, { end: true })} />
          </div>
          <input
            className="rp-seek"
            type="range"
            min="0"
            max={len}
            step="0.1"
            value={Math.min(shown, len)}
            onInput={(e) => seekTo(e.currentTarget.value)}
            onChange={(e) => seekTo(e.currentTarget.value)}
            onPointerUp={(e) => seekTo(e.currentTarget.value, { end: true })}
            onMouseUp={(e) => seekTo(e.currentTarget.value, { end: true })}
            onKeyUp={(e) => seekTo(e.currentTarget.value, { end: true })}
          />
        </div>
        <input
          className="rp-vol"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            volumeRef.current = v;
            if (videoRef.current) {
              videoRef.current.muted = v <= 0;
              videoRef.current.volume = v;
            }
          }}
          aria-label="Volume"
        />
        <button type="button" className="rp-icon-btn" onClick={() => setFs((v) => !v)} aria-label="Fullscreen">
          <IconFs />
        </button>
      </div>

      <div className="rp-trim">
        <div
          className="rp-strip"
          ref={stripRef}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            seekTo(ratio * len, { end: true });
          }}
        >
          <div className="rp-strip-frames">
            {(stripFrames.length ? stripFrames : Array.from({ length: 12 }, () => '')).map((srcFrame, i) => (
              <div key={i} className="rp-strip-frame">
                {srcFrame ? <img src={srcFrame} alt="" /> : null}
              </div>
            ))}
          </div>
          {markers.map((mark, i) => {
            const at = Number(mark.at) || 0;
            const left = Math.min(100, Math.max(0, (at / len) * 100));
            return (
              <span
                key={`s-${i}`}
                className={`rp-mark is-strip ${markClass(mark.type)}`}
                style={{ left: `${left}%` }}
                title={mark.label || mark.type}
              >
                <MarkIcon type={mark.type} />
              </span>
            );
          })}
          <div className="rp-strip-sel" style={{ left: `${inPct}%`, width: `${Math.max(1, outPct - inPct)}%` }}>
            <span className="rp-strip-handle is-in" />
            <span className="rp-strip-handle is-out" />
          </div>
          <input
            className="rp-strip-range is-in"
            type="range"
            min="0"
            max={len}
            step="0.1"
            value={inAt}
            onChange={(e) => {
              const v = Math.min(Number(e.target.value), outAt - 0.1);
              setInAt(Math.max(0, v));
            }}
          />
          <input
            className="rp-strip-range is-out"
            type="range"
            min="0"
            max={len}
            step="0.1"
            value={outAt}
            onChange={(e) => {
              const v = Math.max(Number(e.target.value), inAt + 0.1);
              setOutAt(Math.min(len, v));
            }}
          />
        </div>
        <div className="rp-trim-bar">
          <button type="button" className="rp-btn rp-btn-ghost" onClick={playSelection}>Play selection</button>
          <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setInAt(Math.min(shown, outAt - 0.1))}>Set in [I]</button>
          <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setOutAt(Math.max(shown, inAt + 0.1))}>Set out [O]</button>
          <button type="button" className="rp-btn rp-btn-ghost" onClick={() => { setInAt(0); setOutAt(len); }}>Reset</button>
          <span className="rp-trim-meta">
            In {fmtTime(inAt)} · Out {fmtTime(outAt)} · Length {fmtTime(selLen)} · Size ~ {fmtBytes(selBytes)}
          </span>
          <button
            type="button"
            className="rp-btn rp-btn-export"
            disabled={exporting || selLen < 0.5}
            onClick={() => onExport?.({ start: inAt, duration: selLen, bytes: selBytes })}
          >
            <IconScissors /> Export excerpt
          </button>
        </div>
        {markers.length ? (
          <div className="rp-events">
            {markers.map((mark, i) => (
              <button
                key={`ev-${i}`}
                type="button"
                className={`rp-event ${markClass(mark.type)}`}
                onClick={() => seekTo(mark.at, { end: true })}
              >
                <MarkIcon type={mark.type} />
                <span>{mark.label || mark.type}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Replays() {
  const { t } = useI18n();
  const version = useDdragonVersion();
  const [status, setStatus] = useState(null);
  const [matches, setMatches] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [champFilter, setChampFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [keepFilter, setKeepFilter] = useState('any');
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => loadFavorites());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [preparing, setPreparing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [disk, setDisk] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const items = useMemo(() => flattenClips(matches).map((item) => (
    item.full ? { ...item, label: t('replays.fullMatch'), clip: { ...item.clip, label: t('replays.fullMatch') } } : item
  )), [matches, t]);
  const champs = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const title = displayTitle(item.match);
      if (!title) continue;
      map.set(title, (map.get(title) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  const days = useMemo(() => [...new Set(items.map((i) => dayKey(i.at)))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const title = displayTitle(item.match);
      const kind = modeLabel(item.match);
      if (champFilter !== 'all' && title !== champFilter) return false;
      if (dayFilter !== 'all' && dayKey(item.at) !== dayFilter) return false;
      if (keepFilter === 'full' && !item.full) return false;
      if (keepFilter === 'kills' && item.full) return false;
      if (favOnly && !favorites.has(item.id)) return false;
      if (q && !`${item.label} ${title} ${kind}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, champFilter, dayFilter, keepFilter, favOnly, favorites]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      const key = dayKey(item.at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()];
  }, [filtered]);

  const selectedBytes = useMemo(() => {
    let sum = 0;
    for (const item of filtered) {
      if (!selected.has(item.id)) continue;
      sum += Number(item.match?.bytes || 0) || estimateBytes(item.match?.bytes, item.match?.duration, item.duration);
    }
    return sum;
  }, [filtered, selected]);

  async function refreshList() {
    if (!api) return;
    const list = await api.list();
    setMatches(Array.isArray(list) ? list : []);
  }

  async function refreshDisk() {
    if (!api?.diskInfo) return;
    try {
      const info = await api.diskInfo();
      setDisk(info);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!api) return undefined;
    let off = () => {};
    (async () => {
      const st = await api.getStatus();
      setStatus(st);
      await refreshList();
      await refreshDisk();
    })();
    off = api.onStatus((next) => {
      setStatus(next);
      refreshList();
      refreshDisk();
    });
    const tick = setInterval(() => {
      refreshList();
      refreshDisk();
    }, 4000);
    return () => {
      off();
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  async function playItem(item) {
    if (!api) return;
    const ownClip = !item.full && /^clips\//i.test(String(item.clip?.file || '').replace(/\\/g, '/'));
    const rel = ownClip
      ? item.clip.file
      : (item.match.matchFile || item.clip?.file || item.match.segments?.[0]?.file);
    if (!rel) return;
    setPreparing(true);
    setMenuId(null);
    try {
      const duration = item.full ? (item.match.duration || item.duration || 0) : (item.duration || 12);
      const prepared = api.prepare
        ? await api.prepare({ id: item.match.id, rel, duration: item.match.duration || duration })
        : { url: await api.fileUrl(item.match.id, rel), duration };
      const url = prepared.seekableUrl || prepared.url;
      setPlaying({
        matchId: item.match.id,
        url,
        label: item.label,
        rel: prepared.seekableUrl ? 'seekable.mp4' : rel,
        duration: prepared.duration || duration,
        startAt: ownClip || item.full ? 0 : (item.clip?.start || item.startAt || 0),
        segments: NO_SEGS,
        markers: item.full ? buildMarkers(item.match) : [],
        bytes: item.match?.bytes || 0,
        item,
      });
    } finally {
      setPreparing(false);
    }
  }

  function toggleFavorite(id, e) {
    e?.stopPropagation?.();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }

  function toggleSelectMode() {
    setSelecting((on) => {
      if (on) setSelected(new Set());
      return !on;
    });
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((item) => item.id)));
  }

  function onCardClick(item) {
    if (selecting) toggleSelected(item.id);
    else playItem(item);
  }

  async function exportExcerpt({ start, duration }) {
    if (!api?.exportExcerpt || !playing) return;
    setExporting(true);
    try {
      const champ = displayTitle(playing.item?.match) || 'clip';
      await api.exportExcerpt({
        id: playing.matchId,
        rel: playing.rel,
        start: (playing.startAt || 0) + start,
        duration,
        suggestName: `rift-${champ}-${fmtTime(start).replace(':', '-')}.mp4`,
      });
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!api || !pendingDelete) return;
    setBusy(true);
    if (pendingDelete.type === 'items') {
      const payload = pendingDelete.items.map((item) => ({
        matchId: item.match.id,
        clipId: item.clip?.id,
        full: !!item.full,
      }));
      await api.deleteItems(payload);
      const gone = new Set(pendingDelete.items.map((item) => item.id));
      if (playing && gone.has(playing.item?.id)) setPlaying(null);
      if (playing && pendingDelete.items.some((item) => item.match.id === playing.matchId && item.full)) {
        setPlaying(null);
      }
    } else {
      await api.deleteMatch(pendingDelete.id);
      if (playing?.matchId === pendingDelete.id) setPlaying(null);
    }
    setPendingDelete(null);
    setSelecting(false);
    setSelected(new Set());
    await refreshList();
    await refreshDisk();
    setBusy(false);
  }

  function askDeleteSelected() {
    const picked = filtered.filter((item) => selected.has(item.id));
    if (!picked.length) return;
    setPendingDelete({ type: 'items', items: picked });
  }

  if (!api) {
    return (
      <div className="rp-page">
        <div className="rp-empty">
          <h2>{t('replays.needAppTitle')}</h2>
          <p>{t('replays.needApp')}</p>
        </div>
      </div>
    );
  }

  const recording = !!status?.recording;
  const pausedRec = !!status?.paused || String(status?.warning || '').startsWith('Paused');
  const finalizing = !!status?.finalizing || String(status?.warning || '').includes('Finalizing');
  const inGame = !!status?.inGame;
  const diskPct = disk?.total ? Math.min(100, (disk.used / disk.total) * 100) : 0;

  return (
    <div className="rp-page">
      <div className="rp-toprow">
        <div className={`rp-live${finalizing ? ' is-live' : recording ? ' is-rec' : inGame ? ' is-live' : ''}`}>
          <span className="rp-dot" />
          {finalizing
            ? t('replays.finalizeNote')
            : recording
              ? (pausedRec
                ? t('replays.recPaused')
                : t('replays.recLive', { champ: status.champion || '', time: fmtTime(status.gameTime) }))
              : inGame ? t('replays.inGame') : t('replays.waiting')}
        </div>
        <button
          type="button"
          className="rp-save-hotkey"
          disabled={!recording || busy}
          onClick={async () => {
            if (!api?.saveMoment) return;
            setBusy(true);
            try {
              await api.saveMoment();
              await refreshList();
            } finally {
              setBusy(false);
            }
          }}
          title="Save a clip around now"
        >
          Save <kbd>F10</kbd>
        </button>
        <div className="rp-toprow-spacer" />
        {disk ? (
          <div className="rp-disk" title={disk.root}>
            <div className="rp-disk-bar"><span style={{ width: `${diskPct}%` }} /></div>
            <span>{fmtBytes(disk.used)} / {fmtBytes(disk.total)} disk</span>
          </div>
        ) : null}
        <button type="button" className="rp-btn rp-btn-folder" onClick={() => api.openFolder()}>{t('replays.openFolder')}</button>
        {recording ? (
          <button
            type="button"
            className="rp-btn rp-btn-stop"
            onClick={async () => {
              setBusy(true);
              try {
                await api.stop();
                await refreshList();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || finalizing}
          >
            {finalizing ? t('replays.finalizing') : t('replays.stop')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`rp-btn rp-btn-ghost${status?.autoRecord ? ' is-on' : ''}`}
              onClick={async () => {
                if (!api?.setSettings) return;
                const next = await api.setSettings({ autoRecord: !status?.autoRecord });
                setStatus((prev) => ({ ...(prev || {}), autoRecord: !!next?.autoRecord }));
              }}
            >
              {status?.autoRecord ? t('replays.autoOn') : t('replays.autoOff')}
            </button>
            <button
              type="button"
              className="rp-btn rp-btn-ghost"
              onClick={async () => {
                setBusy(true);
                try {
                  await api.start();
                  await refreshList();
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {t('replays.recordNow')}
            </button>
          </>
        )}
      </div>

      <header className="rp-head">
        <div className="rp-head-main">
          <h1>
            {t('replays.title')}{' '}
            <span className="rp-count">{t('replays.beta', { n: items.length, clips: items.length === 1 ? t('replays.clip') : t('replays.clips') })}</span>
          </h1>
        </div>
        <div className="rp-head-actions">
          {selecting ? (
            <>
              <span className="rp-sel-meta">{selected.size} selected · {fmtBytes(selectedBytes)}</span>
              <button type="button" className="rp-btn rp-btn-ghost" onClick={selectAllFiltered} disabled={!filtered.length}>{t('replays.selectAll')}</button>
              <button
                type="button"
                className="rp-btn rp-btn-stop"
                onClick={askDeleteSelected}
                disabled={busy || !selected.size}
              >
                {t('replays.delete')}
              </button>
              <button type="button" className="rp-btn rp-btn-ghost" onClick={toggleSelectMode}>{t('replays.cancel')}</button>
            </>
          ) : (
            <button type="button" className="rp-btn rp-btn-ghost" onClick={toggleSelectMode} disabled={!items.length}>{t('replays.select')}</button>
          )}
        </div>
      </header>

      {status?.error ? <div className="rp-banner is-err">{status.error}</div> : null}
      {status?.warning && !status?.error ? <div className="rp-banner">{status.warning}</div> : null}
      {preparing ? <div className="rp-banner">{t('replays.preparing')}</div> : null}

      <div className="rp-filters">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('replays.search')}
        />
        <select value={champFilter} onChange={(e) => setChampFilter(e.target.value)}>
          <option value="all">{t('replays.allChamps')}</option>
          {champs.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <button
          type="button"
          className={`rp-btn rp-btn-ghost rp-fav-btn${favOnly ? ' is-on' : ''}`}
          onClick={() => setFavOnly((v) => !v)}
        >
          <IconStar filled={favOnly} /> {t('replays.favorites')}
        </button>
        <select value={keepFilter} onChange={(e) => setKeepFilter(e.target.value)}>
          <option value="any">{t('replays.anyMoment')}</option>
          <option value="full">{t('replays.keepFull')}</option>
          <option value="kills">{t('replays.keepKills')}</option>
        </select>
        <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="rp-filter-grow">
          <option value="all">{t('replays.byDay')}</option>
          {days.map((d) => <option key={d} value={d}>{dayLabel(d, t)}</option>)}
        </select>
      </div>

      {playing ? (
        <div className="rp-watch">
          <div className="rp-watch-head">
            <button type="button" className="rp-icon-btn" onClick={() => setPlaying(null)} aria-label="Back">
              <IconBack />
            </button>
            {champIcon(playing.item?.champion, playing.item?.match, version) ? (
              <img src={champIcon(playing.item?.champion, playing.item?.match, version)} alt="" />
            ) : (
              <span className={`rp-kind-badge${isTftMatch(playing.item?.match) ? ' is-tft' : ''}`}>
                {isTftMatch(playing.item?.match) ? 'TFT' : 'LoL'}
              </span>
            )}
            <div className="rp-watch-title">
              <strong>{displayTitle(playing.item?.match)}</strong>
              <span>
                {modeLabel(playing.item?.match)} · {fmtTime(playing.duration)} · {fmtBytes(playing.bytes)}
              </span>
            </div>
            <button
              type="button"
              className="rp-btn rp-btn-ghost"
              onClick={() => toggleFavorite(playing.item?.id)}
            >
              <IconStar filled={favorites.has(playing.item?.id)} />
            </button>
            <button
              type="button"
              className="rp-btn rp-btn-ghost"
              onClick={() => setPendingDelete({ type: 'items', items: [playing.item] })}
            >
              {t('replays.delete')}
            </button>
          </div>
          <ReplayPlayer
            src={playing.url}
            durationHint={playing.duration}
            label={playing.label}
            startAt={playing.startAt || 0}
            segments={playing.segments || NO_SEGS}
            markers={playing.markers || []}
            bytes={playing.bytes || 0}
            exporting={exporting}
            onExport={exportExcerpt}
            onClose={() => setPlaying(null)}
          />
        </div>
      ) : null}

      {!items.length ? (
        <div className="rp-empty">
          <h2>{t('replays.emptyTitle')}</h2>
          <p>{t('replays.empty')}</p>
        </div>
      ) : !filtered.length ? (
        <div className="rp-empty">
          <h2>{t('replays.noMatchTitle')}</h2>
          <p>{t('replays.noMatch')}</p>
        </div>
      ) : (
        groups.map(([key, group]) => (
          <section key={key} className="rp-group">
            <h2>{dayLabel(key, t)} <span>{group.length} {group.length === 1 ? t('replays.clip') : t('replays.clips')}</span></h2>
            <div className="rp-grid">
              {group.map((item) => {
                const marks = item.full ? buildMarkers(item.match) : [];
                const hovered = hoverId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`rp-card${playing?.item?.id === item.id ? ' is-on' : ''}${selecting && selected.has(item.id) ? ' is-pick' : ''}${selecting ? ' is-selecting' : ''}${hovered ? ' is-hover' : ''}`}
                    onMouseEnter={() => setHoverId(item.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <button type="button" className="rp-card-hit" onClick={() => onCardClick(item)}>
                      <div className={`rp-card-art${isTftMatch(item.match) ? ' is-tft' : ''}`}>
                        {splashImg(item.champion, item.match) ? (
                          <img src={splashImg(item.champion, item.match)} alt="" />
                        ) : (
                          <div className="rp-card-fallback" aria-hidden="true">
                            <span>{isTftMatch(item.match) ? 'TFT' : 'LoL'}</span>
                          </div>
                        )}
                        {selecting ? (
                          <span className={`rp-card-check${selected.has(item.id) ? ' is-on' : ''}`} aria-hidden="true" />
                        ) : null}
                        {hovered && marks.length ? (
                          <div className="rp-card-marks">
                            {marks.map((m, i) => (
                              <span
                                key={i}
                                className={`rp-mark is-card ${markClass(m.type)}`}
                                style={{ left: `${Math.min(100, Math.max(0, (m.at / Math.max(item.duration || 1, 1)) * 100))}%` }}
                                title={m.label || m.type}
                              >
                                <MarkIcon type={m.type} />
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {hovered ? <div className="rp-card-scrub"><span /></div> : null}
                        <span className="rp-card-stamp">{cardStamp(item.at, item.duration)}</span>
                      </div>
                      <div className="rp-card-meta">
                        {champIcon(item.champion, item.match, version) ? (
                          <img src={champIcon(item.champion, item.match, version)} alt="" />
                        ) : (
                          <span className={`rp-kind-badge${isTftMatch(item.match) ? ' is-tft' : ''}`}>
                            {isTftMatch(item.match) ? 'TFT' : 'LoL'}
                          </span>
                        )}
                        <div>
                          <strong>{displayTitle(item.match)}</strong>
                          <span>{item.match.error || modeLabel(item.match)}</span>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`rp-card-fav${favorites.has(item.id) ? ' is-on' : ''}`}
                      onClick={(e) => toggleFavorite(item.id, e)}
                      aria-label="Favorite"
                    >
                      <IconStar filled={favorites.has(item.id)} />
                    </button>
                    <div className="rp-card-more-wrap">
                      <button
                        type="button"
                        className="rp-card-more"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((id) => (id === item.id ? null : item.id));
                        }}
                        aria-label="More"
                      >
                        <IconMore />
                      </button>
                      {menuId === item.id ? (
                        <div className="rp-card-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => playItem(item)}>Trim</button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuId(null);
                              api.openFile?.(item.match.id, item.clip?.file || item.match.matchFile);
                            }}
                          >
                            Export
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => {
                              setMenuId(null);
                              setPendingDelete({ type: 'items', items: [item] });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {pendingDelete ? (
        <div className="rp-modal" role="dialog">
          <div className="rp-modal-card">
            <h3>
              {pendingDelete.type === 'items'
                ? `Delete ${pendingDelete.items.length} clip${pendingDelete.items.length === 1 ? '' : 's'}?`
                : 'Delete this recording and its clips?'}
            </h3>
            <p>This can't be undone.</p>
            <div className="rp-modal-actions">
              <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button type="button" className="rp-btn rp-btn-stop" onClick={confirmDelete} disabled={busy}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
