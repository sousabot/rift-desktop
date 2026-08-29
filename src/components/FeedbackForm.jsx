import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import { version as APP_VERSION } from '../../package.json';
import './FeedbackForm.css';

const FALLBACK_VERSION = APP_VERSION;

export default function FeedbackForm({ open, onClose }) {
  const { session } = useSession();
  const { t } = useI18n();
  const location = useLocation();
  const riotId = session ? `${session.gameName}#${session.tagLine}` : '';

  const [kind, setKind] = useState('bug');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sending, onClose]);

  useEffect(() => {
    if (!open) {
      setKind('bug');
      setTitle('');
      setMessage('');
      setContact('');
      setError('');
      setSent(false);
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError(t('feedback.needFields'));
      return;
    }
    if (!window.riftAPI?.sendFeedback) {
      setError(t('feedback.needApp'));
      return;
    }
    setSending(true);
    setError('');
    try {
      await window.riftAPI.sendFeedback({
        kind,
        title: title.trim(),
        message: message.trim(),
        contact: contact.trim(),
        riotId,
        page: location.pathname || '/',
        appVersion: (await window.riftAPI?.appInfo?.())?.version || FALLBACK_VERSION,
      });
      setSent(true);
    } catch (err) {
      const raw = String(err?.message || '');
      if (raw.includes('No handler registered')) {
        setError(t('feedback.needRestart'));
      } else {
        setError(raw.replace(/^Error invoking remote method '[^']+': Error:\s*/i, '') || t('feedback.fail'));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rift-fb-overlay" onClick={() => !sending && onClose?.()} role="presentation">
      <div
        className="rift-fb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rift-fb-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="rift-fb-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        {sent ? (
          <div className="rift-fb-done">
            <h2 id="rift-fb-title">{t('feedback.sent')}</h2>
            <p>{t('feedback.thanks')}</p>
            <button type="button" className="rift-fb-submit" onClick={onClose}>{t('feedback.close')}</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 id="rift-fb-title">{t('feedback.title')}</h2>
            <p className="rift-fb-lead">{t('feedback.lead')}</p>

            <div className="rift-fb-kinds">
              <button type="button" className={kind === 'bug' ? 'is-on' : ''} onClick={() => setKind('bug')}>{t('feedback.bug')}</button>
              <button type="button" className={kind === 'feedback' ? 'is-on' : ''} onClick={() => setKind('feedback')}>{t('feedback.idea')}</button>
            </div>

            <label>
              {t('feedback.titleLabel')}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder={t('feedback.titlePh')}
                autoFocus
              />
            </label>
            <label>
              {t('feedback.details')}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1800}
                rows={6}
                placeholder={t('feedback.detailsPh')}
              />
            </label>
            <label>
              {t('feedback.contact')}
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={80}
                placeholder={t('feedback.contactPh')}
              />
            </label>
            {riotId && <div className="rift-fb-meta">{t('feedback.linkedAs', { id: riotId })}</div>}
            {error && <div className="rift-fb-error">{error}</div>}
            <button type="submit" className="rift-fb-submit" disabled={sending}>
              {sending ? t('feedback.sending') : t('feedback.send')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
