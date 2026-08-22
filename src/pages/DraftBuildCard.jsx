import React, { useEffect, useState } from 'react';
import { ItemIcon, RuneIcon, SpellIcon } from '../components/GameIcons';
import { champSpellImgUrl } from '../services/ddragon';
import './DraftBuildCard.css';

function fmtN(n) {
  return Number(n || 0).toLocaleString();
}

function fmtWr(n) {
  const wr = Number(n);
  if (!Number.isFinite(wr) || wr <= 0) return null;
  return `${Math.round(wr)}%`;
}

export function useMetaBuilds(champion, role, spells) {
  const [data, setData] = useState({ ok: false, builds: [], status: 'idle' });
  useEffect(() => {
    if (!champion || !window.metaBuildsAPI?.get) {
      setData({ ok: false, builds: [], status: champion ? 'error' : 'idle' });
      return undefined;
    }
    let alive = true;
    setData((prev) => ({ ...prev, status: 'loading' }));
    window.metaBuildsAPI.get({ champion, role, spells }).then((res) => {
      if (!alive) return;
      setData({
        ok: !!res?.ok,
        builds: res?.builds || [],
        status: res?.ok && res.builds?.length ? 'ready' : 'empty',
        error: res?.error || '',
        source: res?.source || '',
      });
    }).catch(() => {
      if (alive) setData({ ok: false, builds: [], status: 'error' });
    });
    return () => { alive = false; };
  }, [champion, role, (spells || []).join(',')]);
  return data;
}

export function SkillPriority({ kit, skills, size = 32 }) {
  const order = skills?.order || [];
  if (!order.length || !kit?.spells?.length) return null;
  const byLetter = { Q: kit.spells[0], W: kit.spells[1], E: kit.spells[2] };
  const wr = fmtWr(skills.wr);
  return (
    <div className="dr-skill-prio">
      {order.map((letter, i) => {
        const spell = byLetter[letter];
        if (!spell) return null;
        return (
          <React.Fragment key={`${letter}-${i}`}>
            {i ? <i>›</i> : null}
            <span className="dr-meta-skill" title={spell.name} style={{ width: size, height: size }}>
              <img
                src={champSpellImgUrl(spell.image?.full, kit.version)}
                alt={spell.name}
                style={{ width: size, height: size }}
              />
              <em>{letter}</em>
            </span>
          </React.Fragment>
        );
      })}
      {wr ? <b>{wr}</b> : null}
    </div>
  );
}

export default function DraftBuildCard({
  champion,
  role,
  spells,
  kit,
}) {
  const meta = useMetaBuilds(champion, role, spells);
  const [tab, setTab] = useState('most');
  useEffect(() => { setTab('most'); }, [champion, role]);
  const builds = meta.builds || [];
  const build = builds.find((b) => b.id === tab) || builds[0];
  if (!champion) return null;
  if (meta.status === 'loading' && !builds.length) {
    return <div className="dr-meta is-wait">Loading ranked builds…</div>;
  }
  if (!build) return null;

  const runes = build.runes;
  const perkIds = (runes?.selectedPerkIds || []).map(Number).filter((id) => id > 0).slice(0, 9);
  const primary = perkIds.slice(1, 4);
  const secondary = perkIds.slice(4, 6);
  const shards = perkIds.slice(6, 9);
  const loadoutSpells = (runes?.spells || spells || []).slice(0, 2);
  const jungle = role === 'Jungle';
  const starters = (build.starters || []).map(Number).filter((id) => id > 0);

  return (
    <section className="dr-meta">
      <header className="dr-meta-head">
        <div className="dr-meta-tabs">
          {builds.map((row) => {
            const on = (build.id === row.id);
            const rowWr = fmtWr(row.wr);
            const rowSpells = (row.runes?.spells || spells || []).slice(0, 2);
            const keystone = row.runes?.selectedPerkIds?.[0];
            return (
              <button
                key={row.id}
                type="button"
                className={`dr-meta-tab${on ? ' is-on' : ''}`}
                onClick={() => setTab(row.id)}
              >
                <span className="dr-meta-tab-items">
                  {keystone ? <RuneIcon id={keystone} size={22} /> : null}
                  {rowSpells.map((id) => (
                    <SpellIcon key={`${row.id}-sp-${id}`} id={id} size={22} />
                  ))}
                </span>
                <span className="dr-meta-tab-copy">
                  <strong>{row.label}</strong>
                  <em>{fmtN(row.games)} games</em>
                </span>
                {rowWr ? <b className={`dr-meta-wr${row.wr >= 52 ? ' is-up' : ''}`}>{rowWr}</b> : null}
              </button>
            );
          })}
        </div>
      </header>

      <div className="dr-meta-body" key={build.id}>
        <div className="dr-meta-top">
          <div className="dr-meta-runes">
            {perkIds[0] ? <RuneIcon id={perkIds[0]} size={36} /> : null}
            <div className="dr-meta-rune-col">
              {primary.map((id, i) => <RuneIcon key={`${build.id}-p-${i}`} id={id} size={22} />)}
            </div>
            <div className="dr-meta-rune-col">
              {secondary.map((id, i) => <RuneIcon key={`${build.id}-s-${i}`} id={id} size={22} />)}
            </div>
            <div className="dr-meta-rune-col is-shard">
              {shards.map((id, i) => <RuneIcon key={`${build.id}-m-${i}`} id={id} size={18} />)}
            </div>
          </div>

          <div className="dr-meta-col">
            <span>Summoners</span>
            <div className="dr-meta-icons">
              {loadoutSpells.map((id) => (
                <SpellIcon key={`sp-${id}`} id={id} size={32} />
              ))}
            </div>
          </div>

          {jungle && build.pet?.id ? (
            <div className="dr-meta-col">
              <span>Jungle pet</span>
              <div className="dr-meta-icons">
                <ItemIcon id={build.pet.id} size={32} />
              </div>
            </div>
          ) : build.boots ? (
            <div className="dr-meta-col">
              <span>Boots</span>
              <div className="dr-meta-icons">
                <ItemIcon id={build.boots} size={32} />
              </div>
            </div>
          ) : null}

          {build.skills?.order?.length ? (
            <div className="dr-meta-col">
              <span>Skill priority</span>
              <SkillPriority kit={kit} skills={build.skills} size={32} />
            </div>
          ) : null}
        </div>

        <div className="dr-meta-path">
          {starters.map((id, i) => (
            <React.Fragment key={`start-${id}-${i}`}>
              <ItemIcon id={id} size={32} />
              <i>›</i>
            </React.Fragment>
          ))}
          {jungle && build.boots ? (
            <>
              <ItemIcon id={build.boots} size={32} />
              <i>›</i>
            </>
          ) : null}
          {(build.core || []).map((id, i) => (
            <React.Fragment key={`core-${id}-${i}`}>
              {i ? <i>›</i> : null}
              <ItemIcon id={id} size={36} />
            </React.Fragment>
          ))}
          {build.extra?.length ? (
            <>
              <i>›</i>
              <div className="dr-meta-extra">
                {build.extra.map((row) => (
                  <ItemIcon key={`x-${row.id}`} id={row.id} size={28} title={`${Math.round(row.wr)}% · ${fmtN(row.games)} games`} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <p className="dr-meta-note">
        {build.source} ranked sample — games and winrate from that source, not a guess.
      </p>
    </section>
  );
}
