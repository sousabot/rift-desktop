import React, { useEffect, useState } from 'react';
import { ChampionIcon, ItemIcon } from '../components/GameIcons';
import { champDdragonId, champPassiveImgUrl, champSpellImgUrl, getDdragonVersion } from '../services/ddragon';
import RoleIcon from '../components/RoleIcon';
import DraftBuildCard from './DraftBuildCard';
import TrendChart from '../components/TrendChart';
import ChampionMatchups from '../components/ChampionMatchups';
import './TierListDetail.css';

function fmtGames(n) {
  return Number(n || 0).toLocaleString();
}

function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function tierClass(tier) {
  const t = String(tier || '?');
  if (t === 'S+') return 'Sp';
  if (t === 'S') return 'S';
  if (t === 'S-') return 'Sm';
  if (t === 'A+') return 'Ap';
  if (t === 'A') return 'A';
  if (t === 'A-') return 'Am';
  if (t.startsWith('B')) return 'B';
  if (t.startsWith('C')) return 'C';
  if (t.startsWith('D')) return 'D';
  return 'na';
}

function wrTone(wr, avg = 50) {
  const v = Number(wr) || 0;
  if (v >= avg + 1.5) return 'is-up';
  if (v <= avg - 1.5) return 'is-down';
  return '';
}

function useChampionKit(name) {
  const [kit, setKit] = useState(null);
  useEffect(() => {
    if (!name) {
      setKit(null);
      return undefined;
    }
    let alive = true;
    const id = champDdragonId(name);
    getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion/${id}.json`))
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const c = data.data?.[id];
        setKit(c ? { version: data.version, passive: c.passive, spells: c.spells || [] } : null);
      })
      .catch(() => { if (alive) setKit(null); });
    return () => { alive = false; };
  }, [name]);
  return kit;
}

function useChampionDetail(champion, role, rank, platform) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  useEffect(() => {
    if (!champion || !window.metaBuildsAPI?.detail) {
      setData(null);
      setStatus('idle');
      return undefined;
    }
    let alive = true;
    setStatus('loading');
    window.metaBuildsAPI.detail({ champion, role, rank, platform })
      .then((res) => {
        if (!alive) return;
        setData(res?.ok ? res : null);
        setStatus(res?.ok ? 'ready' : 'error');
      })
      .catch(() => {
        if (alive) {
          setData(null);
          setStatus('error');
        }
      });
    return () => { alive = false; };
  }, [champion, role, rank, platform]);
  return { data, status };
}

function ItemPathRow({ opt, top, avgWr }) {
  const ids = (opt.ids || [opt.id]).filter(Boolean);
  if (!ids.length) return null;
  return (
    <div className={`tld-ip-row${top ? ' is-top' : ''}`}>
      <div className="tld-ip-items">
        {ids.map((id, j) => (
          <React.Fragment key={`${id}-${j}`}>
            {j ? <i aria-hidden="true">›</i> : null}
            <ItemIcon id={id} size={22} />
          </React.Fragment>
        ))}
      </div>
      <div className="tld-ip-meta">
        <strong className={wrTone(opt.wr, avgWr)}>{fmtPct(opt.wr)}</strong>
        <em>{fmtGames(opt.games)}</em>
        {opt.pickPct != null ? <span className="tld-ip-pick">{fmtPct(opt.pickPct)}</span> : null}
      </div>
    </div>
  );
}

function ItemPathColumn({ label, options, avgWr }) {
  if (!options?.length) return null;
  return (
    <section className="tld-ip-col">
      <h4>{label}</h4>
      <div className="tld-ip-stack">
        {options.map((opt, i) => (
          <ItemPathRow key={`${label}-${i}`} opt={opt} top={i === 0} avgWr={avgWr} />
        ))}
      </div>
    </section>
  );
}

function ItemPaths({ items, avgWr, t }) {
  const columns = [
    { label: t('tierList.detailStarters'), options: items.starters },
    { label: t('tierList.detailBoots'), options: items.boots },
    { label: t('tierList.detailItem1'), options: items.slot1 },
    { label: t('tierList.detailItem2'), options: items.slot2 },
    { label: t('tierList.detailItem3'), options: items.slot3 },
    { label: t('tierList.detailItem4'), options: items.slot4 },
    { label: t('tierList.detailItem5'), options: items.slot5 },
  ].filter((col) => col.options?.length);

  if (!columns.length) return null;

  return (
    <section className="tld-ip-panel">
      <h3>{t('tierList.detailItems')}</h3>
      <div className="tld-ip-flow">
        {columns.map((col, i) => (
          <React.Fragment key={col.label}>
            {i ? <div className="tld-ip-arrow" aria-hidden="true">›</div> : null}
            <ItemPathColumn label={col.label} options={col.options} avgWr={avgWr} />
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function AbilityRow({ kit }) {
  if (!kit) return null;
  const spells = [
    { key: 'P', img: kit.passive?.image?.full, name: kit.passive?.name },
    ...['Q', 'W', 'E', 'R'].map((key, i) => ({
      key,
      img: kit.spells?.[i]?.image?.full,
      name: kit.spells?.[i]?.name,
    })),
  ];
  return (
    <div className="tld-spells">
      {spells.map((spell) => (
        spell.img ? (
          <span key={spell.key} className="tld-spell" title={spell.name}>
            <img
              src={spell.key === 'P'
                ? champPassiveImgUrl(spell.img, kit.version)
                : champSpellImgUrl(spell.img, kit.version)}
              alt={spell.name || spell.key}
            />
            <em>{spell.key}</em>
          </span>
        ) : null
      ))}
    </div>
  );
}

const ROLE_KEYS = [
  { id: 'Top', key: 'top', labelKey: 'tierList.roleTop' },
  { id: 'Jungle', key: 'jungle', labelKey: 'tierList.roleJungle' },
  { id: 'Mid', key: 'middle', labelKey: 'tierList.roleMid' },
  { id: 'ADC', key: 'bottom', labelKey: 'tierList.roleBot' },
  { id: 'Support', key: 'support', labelKey: 'tierList.roleSupport' },
];

export default function TierListDetail({
  row,
  rank,
  platform,
  patch,
  roleTotal,
  onRoleChange,
  switching = false,
  t,
}) {
  const kit = useChampionKit(row?.champion);
  const { data: detail, status: detailStatus } = useChampionDetail(
    row?.champion,
    row?.role,
    rank,
    platform,
  );

  if (!row) return null;

  const lanes = detail?.stats?.lanes || {};
  const stats = detail?.stats || {};
  const displayRow = {
    ...row,
    winrate: row.games ? row.winrate : (Number(stats.winrate) || row.winrate),
    pickrate: row.games ? row.pickrate : (Number(stats.pickrate) || row.pickrate),
    banrate: row.games ? row.banrate : (Number(stats.banrate) || row.banrate),
  };

  return (
    <div className={`tld-panel${switching ? ' is-switching' : ''}`}>
      <header className="tld-head">
        <div className="tld-identity">
          <ChampionIcon name={row.champion} size={72} />
          <div className="tld-identity-copy">
            <div className="tld-title-row">
              <h2>{row.champion}</h2>
              <span className="tld-role">
                <RoleIcon role={row.role} size={14} />
                {row.role}
              </span>
            </div>
            <AbilityRow kit={kit} />
            <div className="tld-role-pills" role="tablist" aria-label={t('tierList.detailLanes')}>
              {ROLE_KEYS.map(({ id, key, labelKey }) => {
                const pct = lanes[key];
                const hasPct = pct != null && pct > 0;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={id === row.role}
                    className={`tld-role-pill${id === row.role ? ' is-on' : ''}`}
                    onClick={() => onRoleChange?.(id)}
                    title={t(labelKey)}
                  >
                    <RoleIcon role={id} size={14} />
                    <strong>{hasPct ? `${Number(pct).toFixed(1)}%` : '—'}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <div className="tld-statbar">
        <div className="tld-stat">
          <strong className={`tl-tier is-${tierClass(displayRow.tier)}`}>{displayRow.tier}</strong>
          <span>{t('tierList.colTier')}</span>
        </div>
        <div className="tld-stat">
          <strong>{displayRow.roleRank || displayRow.rank}{roleTotal ? ` / ${roleTotal}` : ''}</strong>
          <span>{t('tierList.colRank')}</span>
        </div>
        <div className="tld-stat">
          <strong className={displayRow.delta >= 0 ? 'is-up' : 'is-down'}>{fmtPct(displayRow.winrate)}</strong>
          <span>{t('tierList.colWr')}</span>
        </div>
        <div className="tld-stat">
          <strong>{fmtPct(displayRow.pickrate)}</strong>
          <span>{t('tierList.colPick')}</span>
        </div>
        <div className="tld-stat">
          <strong className="is-ban">{fmtPct(displayRow.banrate)}</strong>
          <span>{t('tierList.colBan')}</span>
        </div>
        <div className="tld-stat">
          <strong>{fmtGames(displayRow.games)}</strong>
          <span>{t('tierList.colGames')}</span>
        </div>
      </div>

      {detail?.trends?.points?.length ? (
        <section className="tld-trends">
          <TrendChart
            title={t('tierList.detailWrTrend', { champion: row.champion })}
            values={detail.trends.winrate}
            dates={detail.trends.dates}
          />
          <TrendChart
            title={t('tierList.detailPickTrend', { champion: row.champion })}
            values={detail.trends.pickrate}
            dates={detail.trends.dates}
          />
          <TrendChart
            title={t('tierList.detailBanTrend', { champion: row.champion })}
            values={detail.trends.banrate}
            dates={detail.trends.dates}
          />
        </section>
      ) : null}

      <section className="tld-build" key={`${row.champion}-${row.role}`}>
        <DraftBuildCard champion={row.champion} role={row.role} kit={kit} />
      </section>

      {detail?.matchups ? (
        <ChampionMatchups
          champion={row.champion}
          role={row.role}
          rank={rank}
          platform={platform}
          patch={patch}
          matchups={detail.matchups}
          t={t}
        />
      ) : null}

      {detailStatus === 'loading' ? (
        <div className="tld-loading">{t('tierList.detailLoading')}</div>
      ) : null}

      {detail?.items ? (
        <div className="tld-lower" key={`lower-${row.role}`}>
          <ItemPaths items={detail.items} avgWr={stats.avgWr || 50} t={t} />
        </div>
      ) : null}
    </div>
  );
}
