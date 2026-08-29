import React, { useEffect, useState } from 'react';
import { champIconUrl } from '../lib';

export function ChampionIcon({ name, size = 36, className = '', title }) {
  const [version, setVersion] = useState('16.16.1');
  const [src, setSrc] = useState(() => champIconUrl(name, '16.16.1'));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then((r) => r.json())
      .then((versions) => {
        if (!cancelled && versions?.[0]) setVersion(versions[0]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      style={{ width: size, height: size, borderRadius: 6 }}
      onError={() => setFailed(true)}
    />
  );
}
