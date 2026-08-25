import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { linkAccount } from '../api';
import { useSession } from '../session';
import { REGIONS, parseRiotIdInput, platformShort, profileIconUrl, ddragonVersion } from '../lib';

export default function Profile() {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [gameName, setGameName] = useState(() => searchParams.get('name') || session?.gameName || '');
  const [tagLine, setTagLine] = useState(() => (searchParams.get('tag') || session?.tagLine || '').toUpperCase());
  const [regionIdx, setRegionIdx] = useState(() => {
    const i = REGIONS.findIndex((r) => r.platform === session?.platform);
    return i >= 0 ? i : 0;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [version, setVersion] = useState('16.16.1');

  useEffect(() => {
    ddragonVersion().then(setVersion);
  }, []);

  useEffect(() => {
    const name = searchParams.get('name');
    const tag = searchParams.get('tag');
    if (name) setGameName(name);
    if (tag) setTagLine(tag.toUpperCase());
  }, [searchParams]);

  const onNameChange = (value) => {
    if (value.includes('#')) {
      const parsed = parseRiotIdInput(value, tagLine);
      setGameName(parsed.gameName);
      if (parsed.tagLine) setTagLine(parsed.tagLine);
      return;
    }
    setGameName(value);
  };

  const unlink = () => {
    setSession(null);
    setOk('Profile unlinked on this browser.');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const parsed = parseRiotIdInput(gameName, tagLine);
    if (!parsed.gameName || !parsed.tagLine) {
      setError('Enter both Name and TAG (for example Name#EUW).');
      setOk('');
      return;
    }
    const region = REGIONS[regionIdx];
    setBusy(true);
    setError('');
    setOk('');
    try {
      const profile = await linkAccount({
        gameName: parsed.gameName,
        tagLine: parsed.tagLine,
        platform: region.platform,
        region: region.region,
      });
      setSession(profile);
      setGameName(profile.gameName);
      setTagLine(profile.tagLine);
      const idx = REGIONS.findIndex((r) => r.platform === profile.platform);
      if (idx >= 0) setRegionIdx(idx);
      setOk(`Linked ${profile.gameName}#${profile.tagLine} · ${platformShort(profile.platform)}`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Could not link that Riot ID.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>Your profile</h1>
        <p>
          Link a Riot ID to personalize region defaults on the website.
          Ownership checks via the League client stay in the desktop app.
        </p>
      </header>

      {session ? (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
          {session.profileIconId ? (
            <img
              src={profileIconUrl(session.profileIconId, version)}
              alt=""
              width={56}
              height={56}
              style={{ borderRadius: 12 }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: 'rgba(124,92,255,0.18)', display: 'grid', placeItems: 'center',
              fontFamily: 'var(--display)', fontWeight: 700,
            }}>
              {(session.gameName || '?')[0]}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700 }}>
              {session.gameName}
              <span className="muted">#{session.tagLine}</span>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {platformShort(session.platform)}
              {session.ranked?.tier
                ? ` · ${session.ranked.tier} ${session.ranked.rank} · ${session.ranked.leaguePoints} LP`
                : ' · Unranked Solo/Duo'}
              {session.summonerLevel ? ` · Level ${session.summonerLevel}` : ''}
            </div>
          </div>
          <Link className="btn btn-violet btn-sm" to="/dashboard">Open dashboard</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={unlink}>Unlink</button>
        </div>
      ) : null}

      <form className="card" onSubmit={submit} style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label>Riot ID</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={gameName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Game name"
              autoComplete="off"
              style={{ flex: 1 }}
            />
            <span className="muted">#</span>
            <input
              value={tagLine}
              onChange={(e) => setTagLine(e.target.value.toUpperCase())}
              placeholder="TAG"
              autoComplete="off"
              style={{ width: 110 }}
            />
          </div>
        </div>
        <div className="field">
          <label>Region</label>
          <select value={regionIdx} onChange={(e) => setRegionIdx(Number(e.target.value))}>
            {REGIONS.map((row, i) => (
              <option key={row.platform} value={i}>{row.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-violet" type="submit" disabled={busy}>
          {busy ? 'Linking…' : 'Link profile'}
        </button>
        {error ? <div className="note is-error">{error}</div> : null}
        {ok ? <div className="note is-ok">{ok}</div> : null}
      </form>
    </div>
  );
}
