(function () {
  const cfg = window.RIFT_SITE || {};
  const gh = cfg.github || '';
  const ver = cfg.version || '';
  const base = gh ? `https://github.com/${gh}` : '';
  const tag = ver ? `v${ver}` : 'latest';
  const release = base ? `${base}/releases/latest` : '#download';
  const setupName = ver ? `Rift.lol-Setup-${ver}.exe` : 'Rift.lol-Setup.exe';
  const portableName = ver ? `Rift.lol-${ver}-portable.exe` : 'Rift.lol-portable.exe';
  // Direct asset URLs 404 until the GitHub release exists — send CTAs to /releases/latest.
  const setupUrl = release;
  const portableUrl = release;

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
})();
