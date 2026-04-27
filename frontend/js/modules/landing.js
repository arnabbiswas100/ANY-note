/* ═══════════════════════════════════════════════════════════════
   STUDY-HUB — Landing Page Module
   Handles scroll-reveal, theme override, show/hide logic
   ═══════════════════════════════════════════════════════════════ */

window.Landing = (() => {
  let observer = null;
  let savedTheme = null;    // { style, mode } to restore after leaving landing

  // ── Elements ─────────────────────────────────────────────────
  const els = () => ({
    landing:    document.getElementById('landing-page'),
    authScreen: document.getElementById('auth-screen'),
    app:        document.getElementById('app'),
    beginBtn:   document.getElementById('landing-begin-btn'),
  });

  // ── Show landing page ────────────────────────────────────────
  const show = () => {
    const e = els();
    if (!e.landing) return;

    // Save current theme so we can restore it later
    savedTheme = {
      style: Storage.get('themeStyle', 'minimal'),
      mode:  Storage.get('themeMode',  'dark'),
    };

    // Force glass-light for landing page
    document.documentElement.dataset.theme = 'glass-light';

    // Show landing, hide everything else
    e.landing.classList.remove('hidden');
    e.landing.scrollTop = 0;  // Always start at the top (hero section)
    if (e.authScreen) e.authScreen.classList.add('hidden');
    if (e.app)        e.app.classList.add('hidden');
    document.body.style.overflow = 'hidden'; // landing has its own scroll

    // Init scroll-reveal animations
    initScrollReveal();
  };

  // ── Hide landing page ────────────────────────────────────────
  const hide = () => {
    const e = els();
    if (!e.landing) return;

    e.landing.classList.add('hidden');
    document.body.style.overflow = '';

    // Restore the user's saved theme
    if (savedTheme) {
      document.documentElement.dataset.theme = savedTheme.style + '-' + savedTheme.mode;
    }

    // Cleanup observer
    destroyScrollReveal();
  };

  // ── Scroll-reveal with IntersectionObserver ──────────────────
  const initScrollReveal = () => {
    // Destroy any existing observer first
    destroyScrollReveal();

    const targets = document.querySelectorAll(
      '.landing-feature, .landing-cta'
    );

    if (!targets.length) return;

    // Reset all targets to un-revealed state
    targets.forEach(el => el.classList.remove('revealed'));

    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          // Once revealed, stop observing
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: document.getElementById('landing-page'), // scroll container
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px',
    });

    targets.forEach(t => observer.observe(t));
  };

  const destroyScrollReveal = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  // ── Navigate to auth ─────────────────────────────────────────
  const goToAuth = () => {
    // Push history state so browser back button returns to landing
    history.pushState({ view: 'auth' }, '', '#auth');
    hide();
    Auth.showAuth();
  };

  // ── Handle browser back button ──────────────────────────────
  const handlePopState = (e) => {
    // If we're on the auth screen and user pressed back, return to landing
    const authScreen = document.getElementById('auth-screen');
    const landing    = document.getElementById('landing-page');
    const app        = document.getElementById('app');

    // Only handle if the app is NOT visible (i.e. user is not logged in)
    if (app && !app.classList.contains('hidden')) return;

    // If auth screen is visible and landing is hidden → go back to landing
    if (authScreen && !authScreen.classList.contains('hidden') &&
        landing && landing.classList.contains('hidden')) {
      show();
    }
  };

  // ── Init ─────────────────────────────────────────────────────
  const init = () => {
    const e = els();

    // Begin button → go to auth
    e.beginBtn?.addEventListener('click', goToAuth);

    // Browser back button support
    window.addEventListener('popstate', handlePopState);

    // Set initial history state for landing page
    if (!history.state) {
      history.replaceState({ view: 'landing' }, '', window.location.pathname);
    }
  };

  return { init, show, hide, goToAuth };
})();
