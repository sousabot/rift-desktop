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
    // Hero "Get the app" stays on #premium — only the download section gets the installer URL.
    if (setupBtn2) setupBtn2.href = setupUrl;
    if (setupBtn && setupBtn.getAttribute('href') === '#download') setupBtn.href = '#premium';
    if (navDownload) navDownload.href = '#premium';
    if (portableBtn) portableBtn.href = portableUrl;
    if (releasesBtn) releasesBtn.href = release;
  } else {
    [setupBtn2, portableBtn, releasesBtn].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Set github in docs/config.js, then push to GitHub Pages.');
      });
    });
  }

  const twHandle = String(cfg.twitter || 'RIFT_LOL_').replace(/^@/, '');
  const discord = String(cfg.discord || '').trim() || 'https://discord.gg/riftlol';
  const setHref = (id, href) => {
    const el = document.getElementById(id);
    if (el && href) el.href = href;
  };
  setHref('communityDiscord', discord);
  setHref('socialDiscord', discord);
  setHref('socialTwitter', `https://x.com/${twHandle}`);
  setHref('socialInstagram', String(cfg.instagram || '').trim());
  setHref('socialTiktok', String(cfg.tiktok || '').trim());
  setHref('socialLinkedin', String(cfg.linkedin || '').trim());

  // —— Premium checkout (web) ——
  const DEVICE_KEY = 'rift-web-device-id';
  function webDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = `web-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return `web-${Date.now()}`;
    }
  }

  const apiBase = String(cfg.apiBase || window.RIFT_WEB_API || 'https://gd-desktop.onrender.com').replace(/\/$/, '');
  const checkoutError = document.getElementById('premiumCheckoutError');
  const planButtons = document.querySelectorAll('[data-premium-plan]');

  async function startCheckout(plan, btn) {
    if (checkoutError) {
      checkoutError.hidden = true;
      checkoutError.textContent = '';
    }
    planButtons.forEach((b) => { b.disabled = true; });
    const label = btn.textContent;
    btn.textContent = 'Opening checkout…';
    try {
      const params = new URLSearchParams({ plan, deviceId: webDeviceId() });
      const res = await fetch(`${apiBase}/v1/web/premium/checkout?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Checkout failed (${res.status})`);
      if (!body.url) throw new Error('Checkout did not return a payment link.');
      window.location.href = body.url;
    } catch (err) {
      if (checkoutError) {
        checkoutError.hidden = false;
        checkoutError.textContent = err.message || 'Could not start Premium checkout.';
      }
      planButtons.forEach((b) => { b.disabled = false; });
      btn.textContent = label;
    }
  }

  planButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-premium-plan');
      if (plan) startCheckout(plan, btn);
    });
  });

  const nav = document.querySelector('.topnav') || document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
    }, { passive: true });
  }
})();
