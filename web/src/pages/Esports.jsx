import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import RoleIcon from '../components/RoleIcon';
import { countryName, flagUrl } from '../countryFlag';
import { profileIconUrl, rankColor, rankImg, ddragonVersion } from '../lib';
import { peekPros, hydrateProsFromSnapshot, refreshPros, getProPlayer, prefetchDashboard } from '../api';
import { t } from '../esportsStrings';
import './Esports.css';

const LANES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const COUNTRY_KEY = 'rift-pros-country';
const APEX = /MASTER|GRANDMASTER|CHALLENGER/i;

function useDdragonVersion() {
  const [version, setVersion] = useState('16.16.1');
  useEffect(() => {
    let cancelled = false;
    ddragonVersion().then((v) => { if (!cancelled) setVersion(v); });
    return () => { cancelled = true; };
  }, []);
  return version;
}

function parseRiotId(raw, fallbackTag = '') {
  const text = String(raw || '').trim();
  if (!text) return null;
  const hash = text.lastIndexOf('#');
  if (hash === -1) {
    if (!fallbackTag) return null;
    return { gameName: text, tagLine: fallbackTag };
  }
  const gameName = text.slice(0, hash).trim();
  const tagLine = text.slice(hash + 1).trim() || fallbackTag;
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

function playerSearchPath(riotId, fallbackTag = '', extra = {}) {
  const parsed = parseRiotId(riotId, fallbackTag);
  if (!parsed) return '/dashboard';
  const params = new URLSearchParams({
    name: parsed.gameName,
    tag: parsed.tagLine,
  });
  if (extra.platform) params.set('platform', extra.platform);
  if (extra.player) params.set('pro', extra.player);
  if (extra.country) params.set('cc', extra.country);
  if (extra.team) params.set('org', extra.team);
  if (extra.short) params.set('ot', extra.short);
  if (extra.league) params.set('lg', extra.league);
  if (extra.lane) params.set('ln', extra.lane);
  return `/dashboard?${params.toString()}`;
}

function prefetchPlayerDashboard(riotId, platform = 'euw1') {
  const parsed = parseRiotId(riotId);
  if (!parsed?.gameName || !parsed?.tagLine) return;
  prefetchDashboard({
    gameName: parsed.gameName,
    tagLine: parsed.tagLine,
    platform,
    mode: 'Solo',
    count: 8,
    light: true,
  });
}


function Flag({ country, size = 16 }) {
  const src = flagUrl(country, size >= 24 ? 40 : 20);
  if (!src) return <span className="pr-flag-empty" />;
  return <img className="pr-flag" src={src} alt="" width={size} height={Math.round(size * 0.75)} />;
}

function localeOf(locale) {
  return locale === 'pt' ? 'pt' : locale === 'pl' ? 'pl' : 'en';
}

function rateOf(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatRank(entry) {
  if (!entry?.tier) return '';
  const div = APEX.test(entry.tier) || !entry.division ? '' : ` ${entry.division}`;
  const lp = Number.isFinite(Number(entry.leaguePoints)) ? ` ${entry.leaguePoints} LP` : '';
  return `${String(entry.tier).replace(/_/g, ' ')}${div}${lp}`;
}

function formatRecord(entry, gamesLabel) {
  if (!entry) return '';
  const wr = rateOf(entry.winrate);
  const games = rateOf(entry.games);
  const wins = rateOf(entry.wins);
  const losses = rateOf(entry.losses);
  const n = games ?? (wins != null && losses != null ? wins + losses : null);
  if (wr != null && n != null) return `${wr}% · ${n} ${gamesLabel}`;
  if (wr != null) return `${wr}%`;
  if (wins != null && losses != null) return `${wins}W / ${losses}L`;
  return '';
}

function socialHref(kind, value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:/i.test(v)) return v;
  if (kind === 'twitter') return `https://twitter.com/${v.replace(/^@/, '')}`;
  if (kind === 'twitch') return `https://twitch.tv/${v.replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')}`;
  if (kind === 'instagram') return `https://instagram.com/${v.replace(/^@/, '')}`;
  if (kind === 'facebook') return `https://facebook.com/${v.replace(/^@/, '')}`;
  if (kind === 'leaguepedia') return `https://lol.fandom.com/wiki/${encodeURIComponent(v)}`;
  return v;
}

function RankCard({ label, entry, hint, gamesLabel }) {
  const color = rankColor(entry?.tier);
  return (
    <div className="pr-rank-card" style={{ '--rc': color }}>
      {entry?.tier && rankImg(entry.tier) ? <img src={rankImg(entry.tier)} alt="" /> : null}
      <div>
        <em>{label}</em>
        <strong>{formatRank(entry) || '—'}</strong>
        {formatRecord(entry, gamesLabel) ? <span>{formatRecord(entry, gamesLabel)}</span> : null}
        {hint ? <span className="pr-hint">{hint}</span> : null}
      </div>
    </div>
  );
}

function PlayerSheet({ player, locale, t, onOpen, onClose }) {
  const version = useDdragonVersion();
  const loc = localeOf(locale);
  const icon = player.iconId ? profileIconUrl(player.iconId, version) : '';
  const socials = [
    ['twitter', player.twitter, 'Twitter'],
    ['twitch', player.twitch, 'Twitch'],
    ['instagram', player.instagram, 'Instagram'],
    ['facebook', player.facebook, 'Facebook'],
  ].filter((row) => socialHref(row[0], row[1]));

  return (
    <aside className="pr-detail">
      <button type="button" className="pr-close" onClick={onClose} aria-label="Close">×</button>
      <div className="pr-hero">
        {player.logo ? <img className="pr-hero-mark" src={player.logo} alt="" /> : null}
        <div className="pr-id">
          {icon ? <img className="pr-avatar" src={icon} alt="" /> : (
            <span className="pr-avatar pr-avatar-empty">{(player.player || '?').slice(0, 1)}</span>
          )}
          <div>
            <h2>{player.player}</h2>
            <p>
              <Flag country={player.country} size={18} />
              {player.otherCountries?.map((code) => <Flag key={code} country={code} size={14} />)}
              {countryName(player.country, loc) || '—'}
              {player.lane ? (
                <span className="pr-hero-role">
                  <RoleIcon role={player.lane} size={12} />
                  {player.lane}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="pr-org">
          {player.logo ? <img src={player.logo} alt="" /> : null}
          <div>
            <strong>{player.team || '—'}</strong>
            {player.league || player.leagueName ? (
              <em>
                {player.leagueLogo ? <img src={player.leagueLogo} alt="" /> : null}
                {player.league || player.leagueName}
              </em>
            ) : null}
          </div>
        </div>
        <div className="pr-links">
          {socials.map(([kind, value, label]) => (
            <a key={kind} href={socialHref(kind, value)} target="_blank" rel="noreferrer">{label}</a>
          ))}
          {player.discord ? <span className="pr-discord">Discord {player.discord}</span> : null}
          {player.leaguepedia ? (
            <a href={socialHref('leaguepedia', player.leaguepedia)} target="_blank" rel="noreferrer">Wiki</a>
          ) : null}
        </div>
        {player.riotId ? (
          <Link
            className="pr-open"
            to={playerSearchPath(player.riotId, '', {
              platform: player.accounts?.[0]?.platform || '',
              player: player.player,
              country: player.country,
              team: player.team,
              short: player.short,
              league: player.league,
              lane: player.lane,
            })}
            onMouseEnter={() => prefetchPlayerDashboard(
              player.riotId,
              player.accounts?.[0]?.platform || 'euw1',
            )}
            onFocus={() => prefetchPlayerDashboard(
              player.riotId,
              player.accounts?.[0]?.platform || 'euw1',
            )}
          >
            {t('pros.openProfile')}
          </Link>
        ) : null}
      </div>

      <div className="pr-body">
        <section>
          <h3>{t('pros.rank')}</h3>
          {player.rank?.tier ? (
            <div className="pr-ranks">
              <RankCard
                label={t('pros.current')}
                entry={player.rank}
                hint={player.rank.at || ''}
                gamesLabel={t('pros.games')}
              />
              {player.peak?.tier ? (
                <RankCard
                  label={t('pros.peak')}
                  entry={player.peak}
                  hint={player.peak.at || t('pros.peakSrc')}
                  gamesLabel={t('pros.games')}
                />
              ) : null}
            </div>
          ) : (
            <p className="pr-muted">{t('pros.noRank')}</p>
          )}
        </section>

        {player.accounts?.length ? (
          <section>
            <h3>{t('pros.accounts')}</h3>
            <ul className="pr-accounts">
              {player.accounts.map((acc, i) => (
                <li key={acc.riotId}>
                  <Link
                    className="pr-acc"
                    to={playerSearchPath(acc.riotId, '', {
                      platform: acc.platform || '',
                      player: player.player,
                      country: player.country,
                      team: player.team,
                      short: player.short,
                      league: player.league,
                      lane: player.lane,
                    })}
                    onMouseEnter={() => prefetchPlayerDashboard(acc.riotId, acc.platform || 'euw1')}
                    onFocus={() => prefetchPlayerDashboard(acc.riotId, acc.platform || 'euw1')}
                  >
                    {acc.rank?.tier && rankImg(acc.rank.tier) ? (
                      <img src={rankImg(acc.rank.tier)} alt="" />
                    ) : <span className="pr-acc-gap" />}
                    <div>
                      <strong>{acc.riotId}</strong>
                      <span>
                        {[
                          acc.region,
                          i === 0 ? t('pros.main') : '',
                          acc.rank?.tier ? formatRank(acc.rank) : '',
                          formatRecord(acc.rank, t('pros.games')),
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {player.names?.length ? (
          <section>
            <h3>{t('pros.names')}</h3>
            <ul className="pr-names">
              {player.names.map((row) => (
                <li key={`${row.name}-${row.at}`}>
                  <span>{row.name}</span>
                  {row.at ? <em>{row.at}</em> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {player.seasons?.length ? (
          <section>
            <h3>{t('pros.seasons')}</h3>
            <ul className="pr-seasons">
              {player.seasons.map((row) => (
                <li key={row.id || row.label}>
                  <strong>{row.label}</strong>
                  {row.peak?.tier ? (
                    <span>{t('pros.peakRecorded')} · {formatRank(row.peak)}</span>
                  ) : null}
                  {row.end?.tier ? (
                    <span>{row.latest ? t('pros.latest') : t('pros.endSeason')} · {formatRank(row.end)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {player.teammates?.length ? (
          <section>
            <h3>{t('pros.teammates')}</h3>
            <div className="pr-mates">
              {player.teammates.map((row) => (
                <button type="button" key={row.slug} className="pr-mate" onClick={() => onOpen(row.slug)}>
                  <Flag country={row.country} />
                  {row.lane ? <RoleIcon role={row.lane} size={12} /> : null}
                  {row.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {player.history?.length ? (
          <section>
            <h3>{t('pros.history')}</h3>
            <ul className="pr-history">
              {player.history.map((row, i) => (
                <li key={`${row.team}-${i}`}>
                  {row.logo ? <img src={row.logo} alt="" /> : <span className="pr-acc-gap" />}
                  <div>
                    <strong>{row.team}</strong>
                    <span>
                      {[row.role, row.start, row.end || t('pros.present')].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="pr-note">{t('pros.note')}</p>
      </div>
    </aside>
  );
}

function readSavedCountry() {
  try {
    return String(localStorage.getItem(COUNTRY_KEY) || '').toUpperCase();
  } catch {
    return '';
  }
}

export default function Esports() {
  const locale = 'en';
  const [params, setParams] = useSearchParams();
  const savedCountry = readSavedCountry();
  const [payload, setPayload] = useState(() => {
    const hit = peekPros({ country: savedCountry, lane: '', league: '', query: '' });
    if (hit) {
      return {
        players: hit.players || [],
        countries: hit.countries || [],
        leagues: hit.leagues || [],
        truncated: Boolean(hit.truncated),
        status: 'ready',
        error: '',
      };
    }
    return { players: [], countries: [], leagues: [], status: 'idle' };
  });
  const [country, setCountry] = useState(savedCountry);
  const [lane, setLane] = useState('');
  const [league, setLeague] = useState('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [detail, setDetail] = useState(null);
  const selected = params.get('p') || '';

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    try {
      if (country) localStorage.setItem(COUNTRY_KEY, country);
      else localStorage.removeItem(COUNTRY_KEY);
    } catch { /* ignore */ }
  }, [country]);

  useEffect(() => {
    let alive = true;
    const args = {
      country,
      lane,
      league,
      query: debounced.length >= 3 ? debounced : '',
    };
    (async () => {
      let cached = peekPros(args);
      if (!cached && !args.country && !args.lane && !args.league && !args.query) {
        cached = await hydrateProsFromSnapshot(args);
      }
      if (!alive) return;
      if (cached) {
        setPayload({
          players: cached.players || [],
          countries: cached.countries || [],
          leagues: cached.leagues || [],
          truncated: Boolean(cached.truncated),
          status: 'ready',
          error: '',
        });
      } else {
        setPayload((prev) => ({
          ...prev,
          status: 'loading',
          error: '',
        }));
      }
      try {
        const res = await refreshPros(args);
        if (!alive) return;
        setPayload((prev) => ({
          players: res?.players || [],
          countries: res?.countries?.length ? res.countries : prev.countries,
          leagues: res?.leagues?.length ? res.leagues : prev.leagues,
          truncated: Boolean(res?.truncated),
          status: res?.ok === false ? 'error' : 'ready',
          error: res?.error || '',
        }));
      } catch (err) {
        if (!alive) return;
        setPayload((prev) => ({
          ...prev,
          status: prev.players?.length ? 'ready' : 'error',
          error: err.message,
        }));
      }
    })();
    return () => { alive = false; };
  }, [country, lane, league, debounced]);

  const countries = useMemo(() => (
    (payload.countries || [])
      .map((code) => ({
        code,
        name: countryName(code, locale === 'pt' ? 'pt' : locale === 'pl' ? 'pl' : 'en'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale))
  ), [payload.countries, locale]);

  const leagues = payload.leagues || [];

  const rows = useMemo(() => {
    const q = debounced.length >= 3 ? '' : query.trim().toLowerCase();
    return payload.players.filter((row) => {
      if (!q) return true;
      return `${row.player} ${row.team} ${row.short} ${row.country} ${row.league}`.toLowerCase().includes(q);
    });
  }, [payload.players, query, debounced]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return undefined;
    }
    let alive = true;
    setDetail({ status: 'loading' });
    getProPlayer(selected).then((res) => {
      if (!alive) return;
      if (!res?.ok) {
        setDetail({ status: 'error', error: res?.error || '' });
        return;
      }
      setDetail({ status: 'ready', player: res.player });
    }).catch((err) => {
      if (alive) setDetail({ status: 'error', error: err.message });
    });
    return () => { alive = false; };
  }, [selected]);

  const open = (slug) => {
    const next = new URLSearchParams(params);
    if (slug) next.set('p', slug);
    else next.delete('p');
    setParams(next, { replace: true });
  };

  const player = detail?.player;

  return (
    <div className="pr-page">
      <header className="pr-head">
        <div>
          <h1>{t('pros.title')}</h1>
          <p className="pr-sub">{t('pros.blurb')}</p>
        </div>
      </header>

      {payload.status === 'loading' && !payload.countries.length ? (
        <p className="pr-empty">{t('pros.loading')}</p>
      ) : null}
      {payload.status === 'error' && !payload.countries.length ? (
        <p className="pr-empty">{payload.error || t('pros.fail')}</p>
      ) : null}

      {(!payload.countries.length && payload.status !== 'ready') ? null : (
        <div className={`pr-layout${selected ? ' has-detail' : ''}`}>
          <aside className="pr-countries">
            <h2>{t('pros.countries')}</h2>
            <button
              type="button"
              className={`pr-country${!country ? ' is-on' : ''}`}
              onClick={() => setCountry('')}
            >
              <span>{t('pros.allCountries')}</span>
            </button>
            {countries.map((row) => (
              <button
                key={row.code}
                type="button"
                className={`pr-country${country === row.code ? ' is-on' : ''}`}
                onClick={() => setCountry(row.code === country ? '' : row.code)}
              >
                <Flag country={row.code} />
                <span>{row.name}</span>
              </button>
            ))}
          </aside>

          <div className="pr-main">
            <div className="pr-tools">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('pros.search')}
              />
              <div className="pr-roles">
                {LANES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={lane === role ? 'is-on' : ''}
                    title={role}
                    onClick={() => setLane(lane === role ? '' : role)}
                  >
                    <RoleIcon role={role} size={16} />
                  </button>
                ))}
              </div>
              <select value={league} onChange={(e) => setLeague(e.target.value)}>
                <option value="">{t('pros.allLeagues')}</option>
                {leagues.map((row) => (
                  <option key={row.slug} value={row.slug}>
                    {row.short || row.name}
                  </option>
                ))}
              </select>
            </div>

            {payload.status === 'error' ? (
              <p className="pr-empty">{payload.error || t('pros.fail')}</p>
            ) : null}
            {payload.truncated && !debounced ? (
              <p className="pr-muted pr-trim">{t('pros.topOnly')}</p>
            ) : null}

            {payload.status === 'loading' && !rows.length ? (
              <p className="pr-empty">{t('pros.loading')}</p>
            ) : !rows.length ? (
              <p className="pr-empty">{t('pros.empty')}</p>
            ) : (
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('pros.player')}</th>
                    <th>{t('pros.role')}</th>
                    <th>{t('pros.team')}</th>
                    <th>{t('pros.rank')}</th>
                    <th>{t('pros.winrate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.slug || row.player}
                      className={selected === row.slug ? 'is-on' : ''}
                      onClick={() => open(row.slug)}
                    >
                      <td>{i + 1}</td>
                      <td>
                        <span className="pr-name">
                          <Flag country={row.country} />
                          <strong>{row.player}</strong>
                        </span>
                      </td>
                      <td>
                        {row.lane ? (
                          <span className="pr-role">
                            <RoleIcon role={row.lane} size={14} />
                            {row.lane}
                          </span>
                        ) : (row.role || '—')}
                      </td>
                      <td>
                        <span className="pr-team">
                          {row.logo ? <img src={row.logo} alt="" /> : null}
                          {row.short || row.team || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="pr-solo">
                          {row.rank?.tier && rankImg(row.rank.tier) ? (
                            <img src={rankImg(row.rank.tier)} alt="" />
                          ) : null}
                          {formatRank(row.rank) ? (
                            <>
                              <span className="pr-solo-tier">{String(row.rank.tier).replace(/_/g, ' ')}</span>
                              {Number.isFinite(Number(row.rank.leaguePoints)) ? (
                                <span className="pr-solo-lp">{row.rank.leaguePoints} LP</span>
                              ) : null}
                            </>
                          ) : '—'}
                        </span>
                      </td>
                      <td>
                        {rateOf(row.rank?.winrate) != null ? `${row.rank.winrate}%` : '—'}
                        {rateOf(row.rank?.games) != null ? (
                          <em className="pr-games"> · {row.rank.games}</em>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selected ? (
            detail?.status === 'ready' && player ? (
              <PlayerSheet
                player={player}
                locale={locale}
                t={t}
                onOpen={open}
                onClose={() => open('')}
              />
            ) : (
              <aside className="pr-detail">
                <button type="button" className="pr-close" onClick={() => open('')}>×</button>
                <p className="pr-empty">
                  {detail?.status === 'error' ? (detail.error || t('pros.fail')) : t('pros.loading')}
                </p>
              </aside>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
