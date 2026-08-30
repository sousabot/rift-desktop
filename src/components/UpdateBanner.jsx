import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/LocaleContext';
import './UpdateBanner.css';

export default function UpdateBanner() {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!window.riftUpdate) return undefined;
    window.riftUpdate.status().then(setStatus).catch(() => {});
    return window.riftUpdate.onStatus(setStatus);
  }, []);

  if (!status || status.state === 'dev' || status.state === 'idle' || status.state === 'current' || status.state === 'checking') {
    return null;
  }

  const version = status.version ? `v${status.version}` : 'a new version';
  let text = t('update.available', { version });
  let action = t('update.update');
  if (status.state === 'error') {
    if (status.portable) text = t('update.portable');
    else if (status.blocked || status.reason === 'blocked') text = t('update.blocked');
    else if (status.reason === 'timeout') text = t('update.timeout');
    else text = t('update.fail');
    action = t('update.getSetup');
  } else if (status.state === 'downloading') {
    text = t('update.downloading', { version, percent: status.percent || 0 });
    action = null;
  } else if (status.state === 'ready') {
    text = t('update.ready', { version });
    action = t('update.restart');
  } else if (status.portable) {
    text = t('update.portableOut', { version });
    action = t('update.getSetup');
  }

  const onClick = async () => {
    if (status.portable || status.state === 'error') {
      await window.riftUpdate.open(status.setupUrl || status.url);
      return;
    }
    if (status.state === 'ready' || status.state === 'available') {
      await window.riftUpdate.install();
    }
  };

  return (
    <div className="rift-update-banner" role="status">
      <span>{text}</span>
      {action ? (
        <button type="button" onClick={onClick}>{action}</button>
      ) : null}
    </div>
  );
}
