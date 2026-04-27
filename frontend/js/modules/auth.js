/* ═══════════════════════════════════════════════════════════════
   STUDY-HUB — Auth Module
   ═══════════════════════════════════════════════════════════════ */

window.Auth = (() => {
  const { toast, setLoading, show, hide, getInitials } = Helpers;

  // ── Elements ─────────────────────────────────────────────────
  const els = () => ({
    landing:      document.getElementById('landing-page'),
    authScreen:   document.getElementById('auth-screen'),
    app:          document.getElementById('app'),
    loginForm:    document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    forgotForm:   document.getElementById('forgot-form'),
    resetForm:    document.getElementById('reset-form'),
    loginError:   document.getElementById('login-error'),
    registerError:document.getElementById('register-error'),
    forgotError:  document.getElementById('forgot-error'),
    forgotSuccess:document.getElementById('forgot-success'),
    resetError:   document.getElementById('reset-error'),
    loginBtn:     document.getElementById('login-btn'),
    registerBtn:  document.getElementById('register-btn'),
    forgotBtn:    document.getElementById('forgot-btn'),
    resetBtn:     document.getElementById('reset-btn'),
    showRegister: document.getElementById('show-register'),
    showLogin:    document.getElementById('show-login'),
    showForgot:   document.getElementById('show-forgot'),
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
    forgotEmail:  document.getElementById('forgot-email'),
    resetPass:     document.getElementById('reset-password'),
  });

  // ── Show / hide screens ───────────────────────────────────────
  const showAuth = () => {
    const e = els();
    // Hide landing page if it's visible
    if (e.landing) e.landing.classList.add('hidden');
    show(e.authScreen);
    hide(e.app);
    document.body.style.overflow = 'hidden';

    // Restore saved theme (landing page may have forced glass-light)
    const style = Storage.get('themeStyle', 'minimal');
    const mode  = Storage.get('themeMode',  'dark');
    document.documentElement.dataset.theme = style + '-' + mode;
  };

  const showApp = (user) => {
    const e = els();
    // Hide both landing page and auth screen
    if (e.landing) e.landing.classList.add('hidden');
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
    hide(el.forgotForm);
    hide(el.resetForm);
    show(el.registerForm);
    hideError(el.loginError);
    el.regName?.focus();
  };

  const switchToLogin = (e) => {
    e?.preventDefault();
    const el = els();
    show(el.loginForm);
    hide(el.registerForm);
    hide(el.forgotForm);
    hide(el.resetForm);
    hideError(el.registerError);
    el.loginEmail?.focus();
  };

  const switchToForgot = (e) => {
    e?.preventDefault();
    const el = els();
    hide(el.loginForm);
    hide(el.registerForm);
    hide(el.resetForm);
    show(el.forgotForm);
    hideError(el.forgotError);
    el.forgotSuccess.classList.add('hidden');
    el.forgotEmail?.focus();
  };

  const switchToReset = () => {
    const el = els();
    hide(el.loginForm);
    hide(el.registerForm);
    hide(el.forgotForm);
    show(el.resetForm);
    hideError(el.resetError);
    el.resetPass?.focus();
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

  // ── Forgot Password ──────────────────────────────────────────
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const el = els();
    hideError(el.forgotError);
    el.forgotSuccess.classList.add('hidden');

    const email = el.forgotEmail.value.trim();
    setLoading(el.forgotBtn, true);

    try {
      const data = await API.auth.forgotPassword({ email });
      el.forgotSuccess.textContent = data.message;
      el.forgotSuccess.classList.remove('hidden');
      el.forgotForm.reset();
    } catch (err) {
      showError(el.forgotError, err.message);
    } finally {
      setLoading(el.forgotBtn, false);
    }
  };

  // ── Reset Password ────────────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    const el = els();
    hideError(el.resetError);

    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const token = urlParams.get('token');
    const password = el.resetPass.value;

    if (!token) {
      showError(el.resetError, 'Reset token is missing. Please use the link from your email.');
      return;
    }

    if (password.length < 8) {
      showError(el.resetError, 'Password must be at least 8 characters.');
      return;
    }

    setLoading(el.resetBtn, true);

    try {
      await API.auth.resetPassword({ token, password });
      toast.success('Password updated! You can now sign in.');
      switchToLogin();
      window.location.hash = ''; // clear hash
    } catch (err) {
      showError(el.resetError, err.message);
    } finally {
      setLoading(el.resetBtn, false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────
  const handleLogout = () => {
    Storage.removeToken();
    Storage.removeUser();
    closeDropdown();
    // Go to landing page instead of auth screen
    Landing.show();
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
    // Check if we are in reset mode first
    if (window.location.hash.startsWith('#reset-password')) {
      Landing.hide();
      showAuth();
      switchToReset();
      return false;
    }

    const token = Storage.getToken();
    if (!token) {
      // Show landing page instead of auth screen for new visitors
      Landing.show();
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
      // Show landing page for expired sessions
      Landing.show();
      return false;
    }
  };

  // ── Init ─────────────────────────────────────────────────────
  const init = () => {
    const el = els();

    el.loginForm?.addEventListener('submit', handleLogin);
    el.registerForm?.addEventListener('submit', handleRegister);
    el.forgotForm?.addEventListener('submit', handleForgotPassword);
    el.resetForm?.addEventListener('submit', handleResetPassword);

    el.showRegister?.addEventListener('click', switchToRegister);
    el.showLogin?.addEventListener('click', switchToLogin);
    el.showForgot?.addEventListener('click', switchToForgot);
    document.querySelectorAll('.back-to-login').forEach(btn => btn.addEventListener('click', switchToLogin));

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
      Landing.show();
      toast.error('Session expired. Please sign in again.');
    });

    initPasswordToggles();
  };

  return { init, checkSession, showAuth, showApp, updateUserUI };
})();
