import React, { useEffect, useMemo, useState } from 'react';
import { championIconUrl, getChampionIndex, getSkinsMeta, skinImageUrls, uniqueChampions } from '../lib/skinArt';
import {
  LEGACY_ICON,
  RARITY_TIERS,
  RP_ICON,
  rarityClassName,
  rarityFromRaw,
  rarityGem,
} from '../lib/skinRarity';
import { profileIconUrl, useDdragonVersion } from '../services/ddragon';
import { useI18n } from '../i18n/LocaleContext';
import './Collections.css';

const CHROMA_ONLY = /^(Jade|Ruby|Sapphire|Emerald|Obsidian|Pearl|Catseye|Tanzanite|Turquoise|Amethyst)$/i;

function fmtCount(n) {
  return Number(n || 0).toLocaleString();
}

function SkinCard({ skin, meta, champIndex, earnedLabel }) {
  const urls = useMemo(() => skinImageUrls(skin, meta, champIndex), [skin, meta, champIndex]);
  const [urlIndex, setUrlIndex] = useState(0);
  const src = urls[urlIndex];
  const rarity = rarityFromRaw(skin.rarity);
  const gem = rarityGem(rarity);

  useEffect(() => {
    setUrlIndex(0);
  }, [skin.id, urls[0]]);

  return (
    <article className={`cl-card ${rarityClassName(rarity)}`} title={`${skin.name} · ${rarity}`}>
      {src ? (
        <img className="cl-card-art" src={src} alt="" onError={() => setUrlIndex((i) => i + 1)} />
      ) : (
        <div className="cl-card-ph" />
      )}
      <img className="cl-card-gem" src={gem} alt={rarity} title={rarity} />
      {skin.isLegacy ? (
        <img className="cl-card-legacy" src={LEGACY_ICON} alt="Legacy" title="Legacy" />
      ) : null}
      <div className="cl-card-foot">
        {skin.rp > 0 ? (
          <>
            <span>{fmtCount(skin.rp)}</span>
            <img src={RP_ICON} alt="" />
          </>
        ) : (
          <em>{earnedLabel}</em>
        )}
      </div>
    </article>
  );
}

function ChampCard({ champ, champIndex }) {
  const [src, setSrc] = useState(() => championIconUrl(champ, champIndex));
  const fallback = champIndex?.byKey?.get(Number(champ.id));
  const png = fallback?.version
    ? `https://ddragon.leagueoflegends.com/cdn/${fallback.version}/img/champion/${fallback.id}.png`
    : '';

  useEffect(() => {
    setSrc(championIconUrl(champ, champIndex));
  }, [champ.id, champIndex]);

  return (
    <article className={`cl-champ${champ.owned ? '' : ' is-locked'}`}>
      {src ? (
        <img
          src={src}
          alt=""
          onError={() => {
            if (png && src !== png) setSrc(png);
            else setSrc('');
          }}
        />
      ) : (
        <div className="cl-champ-ph" />
      )}
      <div>
        <strong>{champ.name}</strong>
        <span>{champ.owned ? `${champ.skinsOwned} / ${champ.skinsTotal}` : 'Not owned'}</span>
      </div>
    </article>
  );
}

export default function Collections() {
  const { t } = useI18n();
  const ddVersion = useDdragonVersion();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState({ byId: new Map(), total: 0 });
  const [champIndex, setChampIndex] = useState({ version: '', byKey: new Map() });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('skins');
  const [rarityFilter, setRarityFilter] = useState('all');
  const hasApi = typeof window !== 'undefined' && !!window.lcuAPI;

  const load = async (force = false) => {
    if (!window.lcuAPI) {
      setLoading(false);
      setData({ connected: false, reason: 'no-api' });
      return;
    }
    setLoading(true);
    try {
      const next = await window.lcuAPI.getCollections(force);
      setData(next);
    } catch {
      setData({ connected: false, reason: 'inventory-failed' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getSkinsMeta().then(setMeta);
    getChampionIndex().then(setChampIndex);
    load(false);
    const id = setInterval(() => load(false), 20000);
    return () => clearInterval(id);
  }, []);

  const q = query.trim().toLowerCase();
  const champs = useMemo(
    () => uniqueChampions(data?.champions || [], champIndex),
    [data, champIndex],
  );

  const catalogSkins = useMemo(() => {
    const rows = [];
    for (const champ of champs) {
      for (const skin of champ.skins || []) {
        const info = meta.byId.get(Number(skin.id));
        if (info && !info.collectible) continue;
        if (!info && (skin.isBase || skin.isChroma || /^classic\b/i.test(skin.name || ''))) continue;
        if (CHROMA_ONLY.test(skin.name || '')) continue;
        rows.push({
          ...skin,
          champion: champ.name,
          alias: champ.alias,
          champId: champ.id,
          rarity: info?.rarity || rarityFromRaw(skin.rarity),
          isLegacy: info?.isLegacy || !!skin.isLegacy,
        });
      }
    }
    const byId = new Map();
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      const prev = byId.get(id);
      if (!prev || (row.rp || 0) > (prev.rp || 0)) byId.set(id, row);
    }
    return [...byId.values()];
  }, [champs, meta]);

  const ownedSkins = useMemo(
    () => catalogSkins.filter((s) => s.owned),
    [catalogSkins],
  );

  const rarityTotals = useMemo(() => {
    const all = {};
    const owned = {};
    let legacyAll = 0;
    let legacyOwned = 0;
    for (const info of meta.byId.values()) {
      if (!info.collectible) continue;
      const key = info.rarity || 'Regular';
      all[key] = (all[key] || 0) + 1;
      if (info.isLegacy) legacyAll += 1;
    }
    for (const skin of ownedSkins) {
      const key = skin.rarity || 'Regular';
      owned[key] = (owned[key] || 0) + 1;
      if (skin.isLegacy) legacyOwned += 1;
    }
    return { all, owned, legacyAll, legacyOwned };
  }, [meta, ownedSkins]);

  const filteredSkins = useMemo(() => {
    let rows = ownedSkins;
    if (rarityFilter === 'legacy') rows = rows.filter((s) => s.isLegacy);
    else if (rarityFilter !== 'all') rows = rows.filter((s) => s.rarity === rarityFilter);
    if (q) rows = rows.filter((s) => `${s.name} ${s.champion}`.toLowerCase().includes(q));
    const copy = [...rows];
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }, [ownedSkins, rarityFilter, q]);

  const filteredChamps = useMemo(() => {
    if (!q) return champs;
    return champs.filter((c) => String(c.name).toLowerCase().includes(q));
  }, [champs, q]);

  const waiting = !data?.connected;
  const reason = data?.reason || 'client-closed';
  const waitText = {
    'no-api': t('collections.clientClosed'),
    'not-logged-in': t('collections.clientClosed'),
    'inventory-failed': t('collections.invFail'),
    'client-closed': t('collections.clientClosed'),
  }[reason] || t('collections.clientClosed');

  const skinsOwned = ownedSkins.length;
  const skinsTotal = meta.total || data?.skinsTotal || 0;
  const rpValue = ownedSkins.reduce((n, s) => n + (s.rp || 0), 0);
  const iconId = data?.summoner?.profileIconId || 29;

  return (
    <div className="cl-page">
      <header className="cl-head">
        <div className="cl-head-copy">
          <h1>{t('collections.title')}</h1>
          <p>
            {data?.connected
              ? t('collections.fromClient', { name: data.summoner?.displayName || data.summoner?.gameName || 'logged in' })
              : t('collections.blurb')}
          </p>
        </div>
        {data?.connected ? (
          <img
            className="cl-head-avatar"
            src={profileIconUrl(iconId, ddVersion)}
            alt=""
            onError={(e) => {
              const el = e.currentTarget;
              if (el.dataset.fb) { el.style.visibility = 'hidden'; return; }
              el.dataset.fb = '1';
              el.src = profileIconUrl(29, ddVersion);
            }}
          />
        ) : null}
        <div className="cl-tabs">
          <button type="button" className={tab === 'skins' ? 'is-on' : ''} onClick={() => setTab('skins')}>
            {t('collections.tabSkins')}
          </button>
          <button type="button" className={tab === 'champs' ? 'is-on' : ''} onClick={() => setTab('champs')}>
            {t('collections.tabChamps')}
          </button>
        </div>
      </header>

      {waiting ? (
        <div className="cl-empty">
          <h2>{loading ? t('collections.checkingTitle') : t('collections.disconnected')}</h2>
          <p>{loading ? t('collections.checking') : waitText}</p>
          <button type="button" className="cl-refresh" onClick={() => load(true)} disabled={loading || !hasApi}>
            {loading ? t('collections.loading') : t('collections.refresh')}
          </button>
        </div>
      ) : (
        <>
          <section className="cl-stats">
            <div className="cl-stat-big">
              <strong>
                {fmtCount(skinsOwned)}
                <span> / {fmtCount(skinsTotal)}</span>
              </strong>
              <em>{t('collections.totalSkins')}</em>
            </div>
            <div className="cl-stat-big">
              <strong>
                {fmtCount(rpValue)}
                <img src={RP_ICON} alt="" />
              </strong>
              <em>{t('collections.totalPrice')}</em>
            </div>
            <i className="cl-stats-split" />
            <div className="cl-rarities">
              {RARITY_TIERS.map((tier) => {
                const have = rarityTotals.owned[tier.id] || 0;
                const total = rarityTotals.all[tier.id] || 0;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    className={`cl-rarity${rarityFilter === tier.id ? ' is-on' : ''}`}
                    title={t(`collections.${tier.id.toLowerCase()}`)}
                    onClick={() => setRarityFilter((cur) => (cur === tier.id ? 'all' : tier.id))}
                  >
                    <span className="cl-rarity-count">
                      {fmtCount(have)}
                      <span> / {fmtCount(total)}</span>
                    </span>
                    <img src={tier.gem} alt="" />
                  </button>
                );
              })}
              <button
                type="button"
                className={`cl-rarity${rarityFilter === 'legacy' ? ' is-on' : ''}`}
                title={t('collections.legacy')}
                onClick={() => setRarityFilter((cur) => (cur === 'legacy' ? 'all' : 'legacy'))}
              >
                <span className="cl-rarity-count">
                  {fmtCount(rarityTotals.legacyOwned)}
                  <span> / {fmtCount(rarityTotals.legacyAll)}</span>
                </span>
                <img src={LEGACY_ICON} alt="" />
              </button>
            </div>
          </section>

          <div className="cl-body">
            <aside className="cl-side">
              <label className="cl-search">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('collections.search')}
                />
              </label>
              <button type="button" className="cl-refresh" onClick={() => load(true)} disabled={loading || !hasApi}>
                {loading ? t('collections.loading') : t('collections.refresh')}
              </button>
            </aside>

            {tab === 'skins' ? (
              <div className="cl-grid">
                {filteredSkins.map((skin) => (
                  <SkinCard key={skin.id} skin={skin} meta={meta} champIndex={champIndex} earnedLabel={t('collections.earned')} />
                ))}
                {!filteredSkins.length && (
                  <p className="cl-none">{t('collections.none')}</p>
                )}
              </div>
            ) : (
              <div className="cl-champs">
                {filteredChamps.map((champ) => (
                  <ChampCard key={champ.id} champ={champ} champIndex={champIndex} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
