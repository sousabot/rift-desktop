import React, { useEffect, useState } from 'react';
import {
  champIconUrl,
  champLoadingUrl,
  itemIconUrl,
  runeIconUrl,
  spellIconUrl,
  useDdragonVersion,
  useRuneIndex,
  useSpellMap,
} from '../services/ddragon';
import './GameIcons.css';

export function ChampionIcon({ name, size = 36, className = '', title }) {
  const version = useDdragonVersion();
  const [src, setSrc] = useState(() => champIconUrl(name, version));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(champIconUrl(name, version));
    setFailed(false);
  }, [name, version]);
  if (failed) {
    return (
      <span
        className={`rift-champ-icon is-empty ${className}`.trim()}
        style={{ width: size, height: size, display: 'inline-block' }}
        title={title || name}
      />
    );
  }
  return (
    <img
      src={src}
      alt={name || ''}
      title={title || name}
      className={`rift-champ-icon ${className}`.trim()}
      style={{ width: size, height: size }}
      onError={() => {
        const fallback = champIconUrl('Aatrox', version);
        if (src === fallback) {
          setFailed(true);
          return;
        }
        setSrc(fallback);
      }}
    />
  );
}

export function ChampionPortrait({ name, className = '' }) {
  const [src, setSrc] = useState(() => (name ? champLoadingUrl(name) : ''));
  const [failed, setFailed] = useState(!name);
  useEffect(() => {
    setSrc(name ? champLoadingUrl(name) : '');
    setFailed(!name);
  }, [name]);
  if (!name || failed) {
    return <div className={`rift-champ-portrait is-empty ${className}`.trim()} />;
  }
  return (
    <img
      src={src}
      alt={name}
      className={`rift-champ-portrait ${className}`.trim()}
      onError={() => setFailed(true)}
    />
  );
}

export function ItemIcon({ id, size = 28, title }) {
  const version = useDdragonVersion();
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [id, version]);
  if (!id || failed) {
    return <span className="rift-item-empty" style={{ width: size, height: size }} title={title} />;
  }
  return (
    <img
      src={itemIconUrl(id, version)}
      alt={title || ''}
      title={title || ''}
      className="rift-item-icon"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

export function SpellIcon({ id, size = 22 }) {
  const version = useDdragonVersion();
  const map = useSpellMap();
  return (
    <img
      src={spellIconUrl(id, version, map)}
      alt=""
      className="rift-spell-icon"
      style={{ width: size, height: size }}
    />
  );
}

export function RuneIcon({ id, size = 28 }) {
  const index = useRuneIndex();
  const n = Number(id);
  const src = runeIconUrl(n, index);
  const name = index[n]?.name || '';
  if (!src) return <span className="rift-item-empty" style={{ width: size, height: size }} />;
  return (
    <img
      src={src}
      alt={name}
      title={name}
      className="rift-rune-icon"
      style={{ width: size, height: size }}
    />
  );
}
