import React from 'react';
import { NavLink } from 'react-router-dom';

const MODES = [
  { id: 'ranked', to: '/tierlist', label: 'Ranked' },
  { id: 'synergy', to: '/tierlist/synergy', label: 'Synergy' },
  { id: 'arena', to: '/tierlist/arena', label: 'Arena' },
  { id: 'aram', to: '/tierlist/aram', label: 'ARAM' },
];

export default function TierModeNav({ active }) {
  return (
    <nav className="tier-mode-nav" aria-label="Tier list modes">
      {MODES.map((mode) => (
        <NavLink
          key={mode.id}
          to={mode.to}
          className={({ isActive }) => (
            `tier-mode-link${(isActive || active === mode.id) ? ' is-on' : ''}${mode.soon ? ' is-soon' : ''}`
          )}
          end={mode.id === 'ranked'}
        >
          {mode.label}
          {mode.soon ? <em>Soon</em> : null}
        </NavLink>
      ))}
    </nav>
  );
}
