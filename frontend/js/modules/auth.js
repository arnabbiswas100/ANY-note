/* ═══════════════════════════════════════════════════════════════
   STUDY-HUB — Auth Module
   ═══════════════════════════════════════════════════════════════ */

const Auth = (() => {
  const { toast, setLoading, show, hide, getInitials } = Helpers;

  // ── Elements ─────────────────────────────────────────────────
  const els = () => ({
    authScreen:   document.getElementById('auth-screen'),
    app:          document.getElementById('app'),
    loginForm:    document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    loginError:   document.getElementById('login-error'),
    registerError:document.getElementById('register-error'),
    loginBtn:     document.getElementById('login-btn'),
    registerBtn:  document.getElementById('register-btn'),
    showRegister: document.getElementById('show-register'),
    showLogin:    document.getElementById('show-login'),
    logoutBtn:    document.getElementById('logout-btn'),
    userAvatarBtn:document.getElementById('user-avatar-btn'),
    userInitials: document.getElementById('user-avatar-initials'),
    dropdown:     document.getElementById('user-dropdown'),
    dropName:     document.getElementById('dropdown-user-name'),
    dropEmail:    document.getElementById('dropdown-user-email'),
    loginEmail:   document.getElementById('login-email'),
    loginPass:    document.getElementById('login-password'),
    regName:      document.getElementById('reg-name'),
    regEmail:     document.getElementById('reg-email'),
    regPass:      document.getElementById('reg-password'),
  });

  // ── Show / hide screens ───────────────────────────────────────
  const showAuth = () => {
    const e = els();
    show(e.authScreen);
    hide(e.app);
    document.body.style.overflow = 'hidden';
  };

  const showApp = (user) => {
    const e = els();
    hide(e.authScreen);
    show(e.app);
    document.body.style.overflow = '';
    updateUserUI(user);
  };

  const updateUserUI = (user) => {
    if (!user) return;
    const e = els();
    const initials = getInitials(user.full_name || user.name, user.email);
    if (e.userInitials) e.userInitials.textContent = initials;
    if (e.dropName)     e.dropName.textContent  = user.full_name || user.name || 'User';
    if (e.dropEmail)    e.dropEmail.textContent = user.email || '';
  };

  // ── Toggle forms ─────────────────────────────────────────────
  const switchToRegister = (e) => {
    e?.preventDefault();
    const el = els();
    hide(el.loginForm);
    show(el.registerForm);
    hideError(el.loginError);
    el.regName?.focus();
  };

  const switchToLogin = (e) => {
    e?.preventDefault();
    const el = els();
    show(el.loginForm);
    hide(el.registerForm);
    hideError(el.registerError);
    el.loginEmail?.focus();
  };

  // ── Error helpers ─────────────────────────────────────────────
  const showError = (el, msg) => {
    if (!el) return;
    el.textContent = msg;
    show(el);
  };

  const hideError = (el) => {
    if (!el) return;
    el.textContent = '';
    hide(el);
  };

  // ── Login ─────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    const el = els();
    hideError(el.loginError);
    setLoading(el.loginBtn, true);

    try {
      const data = await API.auth.login({
        email:    el.loginEmail.value.trim(),
        password: el.loginPass.value,
      });

      Storage.setToken(data.token || data.data?.token);
      const user = data.user || data.data?.user;
      Storage.setUser(user);

      showApp(user);
      window.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
      toast.success('Welcome back!');

    } catch (err) {
      showError(el.loginError, err.message);
    } finally {
      setLoading(el.loginBtn, false);
    }
  };

  // ── Register ──────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    const el = els();
    hideError(el.registerError);

    const name  = el.regName.value.trim();
    const email = el.regEmail.value.trim();
    const pass  = el.regPass.value;

    if (pass.length < 8) {
      showError(el.registerError, 'Password must be at least 8 characters.');
      return;
    }

    setLoading(el.registerBtn, true);

    try {
      const data = await API.auth.register({ name, email, password: pass });

      Storage.setToken(data.token || data.data?.token);
      const user = data.user || data.data?.user;
      Storage.setUser(user);

      showApp(user);
      window.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
      toast.success('Account created! Welcome to Study-Hub.');

    } catch (err) {
      showError(el.registerError, err.message);
    } finally {
      setLoading(el.registerBtn, false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────
  const handleLogout = () => {
    Storage.removeToken();
    Storage.removeUser();
    closeDropdown();
    showAuth();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    toast.info('Signed out.');
  };

  // ── Dropdown ──────────────────────────────────────────────────
  const toggleDropdown = () => {
    const el = els();
    el.dropdown?.classList.toggle('hidden');
  };

  const closeDropdown = () => {
    els().dropdown?.classList.add('hidden');
  };

  // ── Password toggle ───────────────────────────────────────────
  const initPasswordToggles = () => {
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? '🙈' : '👁';
      });
    });
  };

  // ── Check existing session ────────────────────────────────────
  const checkSession = async () => {
    const token = Storage.getToken();
    if (!token) {
      showAuth();
      return false;
    }

    try {
      const data = await API.auth.profile();
      const user = data.user || data.data?.user || data;
      Storage.setUser(user);
      showApp(user);
      return true;
    } catch {
      Storage.removeToken();
      Storage.removeUser();
      showAuth();
      return false;
    }
  };

  // ── Init ─────────────────────────────────────────────────────
  const init = () => {
    const el = els();

    el.loginForm?.addEventListener('submit', handleLogin);
    el.registerForm?.addEventListener('submit', handleRegister);
    el.showRegister?.addEventListener('click', switchToRegister);
    el.showLogin?.addEventListener('click', switchToLogin);
    el.logoutBtn?.addEventListener('click', handleLogout);
    el.userAvatarBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!el.userAvatarBtn?.contains(e.target) && !el.dropdown?.contains(e.target)) {
        closeDropdown();
      }
    });

    // Listen for expired session events
    window.addEventListener('auth:expired', () => {
      showAuth();
      toast.error('Session expired. Please sign in again.');
    });

    initPasswordToggles();
  };

  return { init, checkSession, showAuth, showApp, updateUserUI };
})();
