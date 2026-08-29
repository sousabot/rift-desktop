import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChampionIcon, ItemIcon, RuneIcon, SpellIcon } from '../components/GameIcons';
import RoleIcon from '../components/RoleIcon';
import { getChampionIndex, useChampionIndex } from '../services/ddragon';
import { useI18n } from '../i18n/LocaleContext';
import './Matchups.css';

const api = typeof window !== 'undefined' ? window.matchupsAPI : null;

const ROLES = [
  { id: '', labelKey: 'matchups.roleAll' },
  { id: 'top', label: 'Top', icon: 'Top' },
  { id: 'jungle', label: 'Jungle', icon: 'Jungle' },
  { id: 'mid', label: 'Mid', icon: 'Mid' },
  { id: 'bot', label: 'Bot', icon: 'ADC' },
  { id: 'support', label: 'Support', icon: 'Support' },
];

function twitchEmbed(video) {
  if (!video?.id) return '';
  const parents = new Set(['localhost', '127.0.0.1']);
  try {
    const host = window.location.hostname;
    if (host) parents.add(host);
  } catch { /* ignore */ }
  const parentQs = [...parents].map((p) => `parent=${encodeURIComponent(p)}`).join('&');
  const time = video.offsetLabel || '0h0m0s';
  return `https://player.twitch.tv/?video=${video.id}&${parentQs}&autoplay=true&time=${time}`;
}

function champListFromIndex(index) {
  const names = Object.values(index?.byKey || {});
  if (names.length) return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  return [];
}

function ChampPicker({ label, value, onChange, champions, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return champions.filter((id) => !q || id.toLowerCase().includes(q)).slice(0, 48);
  }, [champions, query]);

  return (
    <div className={`muv-pick${open ? ' is-open' : ''}`}>
      <span className="muv-pick-label">{label}</span>
      <button type="button" className="muv-pick-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {value ? (
          <>
            <ChampionIcon name={value} size={56} />
            <strong>{value}</strong>
          </>
        ) : (
          <span className="muv-pick-empty">?</span>
        )}
      </button>
      {open ? (
        <div className="muv-pick-menu">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
          <div className="muv-pick-grid">
            {filtered.map((id) => (
              <button
                key={id}
                type="button"
                className={id === value ? 'is-on' : ''}
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <ChampionIcon name={id} size={36} />
                <span>{id}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchRow({ row, active, onSelect, t }) {
  return (
    <button
      type="button"
      className={`muv-row${active ? ' is-active' : ''}${row.win ? ' is-win' : ' is-loss'}`}
      onClick={() => onSelect(row)}
    >
      <div className="muv-row-meta">
        <strong>{row.age}</strong>
        <span>{row.patch}</span>
        <span className="muv-region">{row.platform}</span>
      </div>
      <div className="muv-row-champs">
        <ChampionIcon name={row.champion} size={34} />
        <span>VS</span>
        <ChampionIcon name={row.opponent} size={34} />
        {row.lane ? <RoleIcon role={row.lane === 'Bot' ? 'ADC' : row.lane} size={14} /> : null}
      </div>
      <div className="muv-row-streamer">
        <span className="muv-twitch">Twitch</span>
        <strong>{row.streamer?.displayName || row.streamer?.twitch}</strong>
      </div>
      <div className="muv-row-loadout">
        <SpellIcon id={row.summoner1Id} size={22} />
        <SpellIcon id={row.summoner2Id} size={22} />
        {row.primaryRuneId ? <RuneIcon id={row.primaryRuneId} size={22} /> : null}
      </div>
      <div className="muv-row-items">
        {(row.items || []).slice(0, 6).map((id, i) => (
          <ItemIcon key={`${row.matchId}-${id}-${i}`} id={id} size={22} />
        ))}
      </div>
      <span className="muv-kda">
        <em className="is-k">{row.kills}</em>
        <span>/</span>
        <em className="is-d">{row.deaths}</em>
        <span>/</span>
        <em className="is-a">{row.assists}</em>
      </span>
      <span className="muv-open">{row.video ? t('matchups.watch') : t('matchups.noVod')}</span>
    </button>
  );
}

export default function Matchups() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const index = useChampionIndex();
  const champions = useMemo(() => champListFromIndex(index), [index]);

  const [champion, setChampion] = useState(params.get('champion') || '');
  const [opponent, setOpponent] = useState(params.get('opponent') || '');
  const [role, setRole] = useState(params.get('role') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [streamerCount, setStreamerCount] = useState(0);

  useEffect(() => {
    getChampionIndex().catch(() => {});
    api?.streamers?.().then((res) => setStreamerCount(res?.count || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    const c = params.get('champion') || '';
    const o = params.get('opponent') || '';
    const r = params.get('role') || '';
    if (c) setChampion(c);
    if (o) setOpponent(o);
    if (r) setRole(r);
    if (c) runSearch({ champion: c, opponent: o, role: r });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncParams(next) {
    const q = new URLSearchParams();
    if (next.champion) q.set('champion', next.champion);
    if (next.opponent) q.set('opponent', next.opponent);
    if (next.role) q.set('role', next.role);
    setParams(q, { replace: true });
  }

  async function runSearch(override) {
    const next = {
      champion: override?.champion ?? champion,
      opponent: override?.opponent ?? opponent,
      role: override?.role ?? role,
    };
    if (!next.champion) {
      setError(t('matchups.needChampion'));
      return;
    }
    if (!api?.search) {
      setError(t('matchups.needApp'));
      return;
    }
    setLoading(true);
    setError('');
    setPayload(null);
    setSelectedId('');
    syncParams(next);
    try {
      const res = await api.search({
        champion: next.champion,
        opponent: next.opponent,
        role: next.role,
        limit: 16,
      });
      setPayload(res);
      const first = res?.matches?.find((row) => row.video) || res?.matches?.[0];
      setSelectedId(first?.matchId || '');
      if (res?.error && !res?.matches?.length) setError(res.error);
      else if (!res?.matches?.length && !(res?.meta?.streamers)) setError(t('matchups.noStreamers'));
      else if (!res?.matches?.length) setError(t('matchups.empty'));
    } catch (err) {
      setError(err?.message || t('matchups.failed'));
    } finally {
      setLoading(false);
    }
  }

  const selected = useMemo(
    () => (payload?.matches || []).find((row) => row.matchId === selectedId) || payload?.matches?.[0] || null,
    [payload, selectedId]
  );

  return (
    <div className="muv-page">
      <header className="muv-head">
        <div>
          <h1>{t('matchups.title')}</h1>
          <p>{t('matchups.blurb', { count: streamerCount || '—' })}</p>
        </div>
      </header>

      <section className="muv-hero">
        <ChampPicker
          label={t('matchups.youPlay')}
          value={champion}
          onChange={setChampion}
          champions={champions}
          placeholder={t('matchups.searchChamp')}
        />
        <button
          type="button"
          className="muv-swap"
          onClick={() => {
            setChampion(opponent);
            setOpponent(champion);
          }}
          aria-label={t('matchups.swap')}
        >
          ⚔
        </button>
        <ChampPicker
          label={t('matchups.vs')}
          value={opponent}
          onChange={setOpponent}
          champions={champions}
          placeholder={t('matchups.searchChamp')}
        />
        <button
          type="button"
          className="muv-search"
          disabled={loading || !champion}
          onClick={() => runSearch()}
        >
          {loading ? t('matchups.searching') : t('matchups.findVods')}
        </button>
      </section>

      <div className="muv-roles" role="group" aria-label={t('matchups.roleFilter')}>
        {ROLES.map((row) => (
          <button
            key={row.id || 'all'}
            type="button"
            className={role === row.id ? 'is-on' : ''}
            onClick={() => setRole(row.id)}
          >
            {row.id ? <RoleIcon role={row.icon} size={14} /> : null}
            <span>{row.labelKey ? t(row.labelKey) : row.label}</span>
          </button>
        ))}
      </div>

      {loading ? <div className="muv-note is-muted">{t('matchups.searchingHint')}</div> : null}
      {error ? <div className="muv-note">{error}</div> : null}
      {payload?.broadened && payload?.matches?.length ? (
        <div className="muv-note">{t('matchups.broadened', { champion: payload.champion })}</div>
      ) : null}

      {selected?.video ? (
        <section className="muv-player">
          <div className="muv-player-top">
            <div>
              <strong>
                {selected.champion} vs {selected.opponent || '—'}
              </strong>
              <span>
                {selected.streamer?.displayName}
                {' · '}
                {selected.age}
                {' · '}
                {selected.platform}
                {' · '}
                {selected.patch}
              </span>
            </div>
            <a href={selected.video.url} target="_blank" rel="noreferrer" className="muv-ext">
              {t('matchups.openTwitch')}
            </a>
          </div>
          <div className="muv-embed">
            <iframe
              title="Twitch VOD"
              src={twitchEmbed(selected.video)}
              allowFullScreen
              scrolling="no"
              frameBorder="0"
            />
          </div>
        </section>
      ) : selected ? (
        <section className="muv-player">
          <div className="muv-player-top">
            <div>
              <strong>
                {selected.champion} vs {selected.opponent || '—'}
              </strong>
              <span>{t('matchups.noVodHint')}</span>
            </div>
            <a href={selected.channelUrl} target="_blank" rel="noreferrer" className="muv-ext">
              {t('matchups.openTwitch')}
            </a>
          </div>
        </section>
      ) : null}

      {payload?.matches?.length ? (
        <section className="muv-list">
          <div className="muv-list-head">
            <h2>{t('matchups.clickGame')}</h2>
            <span>
              {t('matchups.resultMeta', {
                n: payload.matches.length,
                scanned: payload.meta?.scanned || payload.meta?.streamers || 0,
              })}
            </span>
          </div>
          <div className="muv-rows">
            {payload.matches.map((row) => (
              <MatchRow
                key={row.matchId}
                row={row}
                active={row.matchId === (selected?.matchId || '')}
                onSelect={(next) => setSelectedId(next.matchId)}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
