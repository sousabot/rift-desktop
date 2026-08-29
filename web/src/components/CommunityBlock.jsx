import React from 'react';
import {
  SOCIAL,
  IconDiscord,
  IconX,
  IconInstagram,
  IconTikTok,
  IconLinkedIn,
} from '../socialLinks';

const ICONS = [
  { id: 'discord', href: SOCIAL.discord, label: 'Discord', Icon: IconDiscord },
  { id: 'twitter', href: SOCIAL.twitter, label: 'X', Icon: IconX },
  { id: 'instagram', href: SOCIAL.instagram, label: 'Instagram', Icon: IconInstagram },
  { id: 'tiktok', href: SOCIAL.tiktok, label: 'TikTok', Icon: IconTikTok },
  { id: 'linkedin', href: SOCIAL.linkedin, label: 'LinkedIn', Icon: IconLinkedIn },
];

export default function CommunityBlock({ className = '' }) {
  return (
    <div className={`community-block${className ? ` ${className}` : ''}`}>
      <h4 className="community-block__title">Community</h4>
      <a
        className="community-discord"
        href={SOCIAL.discord}
        target="_blank"
        rel="noreferrer"
      >
        <IconDiscord size={20} />
        Join our Discord
      </a>
      <div className="community-socials" aria-label="Social links">
        {ICONS.map(({ id, href, label, Icon }) => (
          <a key={id} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
            <Icon size={18} />
          </a>
        ))}
      </div>
    </div>
  );
}
