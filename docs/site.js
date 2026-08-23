(function () {
  const cfg = window.RIFT_SITE || {};
  const gh = cfg.github || '';
  const ver = cfg.version || '';
  const base = gh ? `https://github.com/${gh}` : '';
  const tag = ver ? `v${ver}` : 'latest';
  const release = base ? `${base}/releases/latest` : '#download';
  const setupName = ver ? `Rift.lol-Setup-${ver}.exe` : 'Rift.lol-Setup.exe';
  const portableName = ver ? `Rift.lol-${ver}-portable.exe` : 'Rift.lol-portable.exe';
  const setupUrl = base && ver
    ? `${base}/releases/download/${tag}/${setupName}`
    : release;
  const portableUrl = base && ver
    ? `${base}/releases/download/${tag}/${portableName}`
    : release;

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  const versionPills = document.querySelectorAll('[data-version]');
  versionPills.forEach((el) => { el.textContent = ver ? `v${ver}` : 'Beta'; });

  const setupBtn = document.getElementById('downloadSetup');
  const setupBtn2 = document.getElementById('downloadSetupBottom');
  const navDownload = document.getElementById('navDownload');
  const portableBtn = document.getElementById('downloadPortable');
  const releasesBtn = document.getElementById('releasesBtn');
  const setupMeta = document.getElementById('setupMeta');
  const portableMeta = document.getElementById('portableMeta');

  if (setupMeta && ver) setupMeta.textContent = setupName;
  if (portableMeta && ver) portableMeta.textContent = portableName;

  if (base) {
    if (setupBtn) setupBtn.href = setupUrl;
    if (setupBtn2) setupBtn2.href = setupUrl;
    if (navDownload) navDownload.href = setupUrl;
    if (portableBtn) portableBtn.href = portableUrl;
    if (releasesBtn) releasesBtn.href = release;
  } else {
    [setupBtn, setupBtn2, navDownload, portableBtn, releasesBtn].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Set github in docs/config.js, then push to GitHub Pages.');
      });
    });
  }

  const nav = document.querySelector('.topnav') || document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
    }, { passive: true });
  }

  // —— Launch giveaway (Follow + RT on X) ——
  const tw = String(cfg.twitter || 'RIFT_LOL_').replace(/^@/, '');
  const followUrl = `https://x.com/intent/follow?screen_name=${encodeURIComponent(tw)}`;
  const profileUrl = `https://x.com/${encodeURIComponent(tw)}`;
  const postUrl = String(cfg.giveawayPost || '').trim() || profileUrl;
  const winners = Number(cfg.giveawayWinners) || 8;
  const announce = cfg.giveawayAnnounce || '25 Aug 2026';
  const prize = cfg.giveawayPrize || 'Rift Premium';

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('giveawayWinners', String(winners));
  setText('giveawayWinnersMeta', String(winners));
  setText('giveawayAnnounce', announce);
  setText('giveawayPrize', prize);

  const followLink = document.getElementById('gwFollowLink');
  if (followLink) {
    followLink.href = profileUrl;
    followLink.textContent = `@${tw}`;
  }
  const openFollow = document.getElementById('gwOpenFollow');
  if (openFollow) {
    openFollow.href = followUrl;
    openFollow.textContent = `Follow @${tw}`;
  }

  const followBox = document.getElementById('gwFollow');
  const rtBox = document.getElementById('gwRt');
  const enterBtn = document.getElementById('gwEnter');
  const hint = document.getElementById('gwHint');

  function syncGiveaway() {
    const ready = !!(followBox && rtBox && followBox.checked && rtBox.checked);
    if (enterBtn) enterBtn.disabled = !ready;
    if (hint) {
      hint.classList.toggle('is-ready', ready);
      hint.textContent = ready
        ? 'You’re set — open the post and make sure your RT is public.'
        : 'Tick both boxes after you follow and RT, then open the post.';
    }
  }

  if (followBox) followBox.addEventListener('change', syncGiveaway);
  if (rtBox) rtBox.addEventListener('change', syncGiveaway);
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      if (enterBtn.disabled) return;
      window.open(postUrl, '_blank', 'noopener,noreferrer');
    });
  }
  syncGiveaway();
})();
