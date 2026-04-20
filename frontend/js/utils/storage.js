/* ═══════════════════════════════════════════════════════════════
   STUDY-HUB — Storage Utility
   ═══════════════════════════════════════════════════════════════ */

const Storage = (() => {
  const PREFIX = 'studyhub_';

  const set = (key, value) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage.set failed:', e);
      return false;
    }
  };

  const get = (key, fallback = null) => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const remove = (key) => {
    try {
      localStorage.removeItem(PREFIX + key);
      return true;
    } catch (e) {
      return false;
    }
  };

  const clear = () => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
      return true;
    } catch (e) {
      return false;
    }
  };

  // ── Auth shortcuts ──────────────────────────────────────────
  const setToken = (token) => set('token', token);
  const getToken = ()      => get('token', null);
  const removeToken = ()   => remove('token');

  const setUser = (user)   => set('user', user);
  const getUser = ()       => get('user', null);
  const removeUser = ()    => remove('user');

  // ── Theme ───────────────────────────────────────────────────
  const setTheme = (theme) => set('theme', theme);
  const getTheme = ()      => get('theme', 'dark');

  // ── App state ───────────────────────────────────────────────
  const setActiveView = (view) => set('activeView', view);
  const getActiveView = ()     => get('activeView', 'notes');

  const setActiveChatSession = (id) => set('activeChatSession', id);
  const getActiveChatSession = ()   => get('activeChatSession', null);

  return {
    set, get, remove, clear,
    setToken, getToken, removeToken,
    setUser, getUser, removeUser,
    setTheme, getTheme,
    setActiveView, getActiveView,
    setActiveChatSession, getActiveChatSession,
  };
})();
