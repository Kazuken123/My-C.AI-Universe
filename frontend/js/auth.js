import { api } from './api.js';

/**
 * AuthManager Class (Frontend Authentication, Modal Controller & Multi-Tenant State Lifecycle)
 */
export class AuthManager {
  constructor(state, toastFn, onAuthChange) {
    this.state = state;
    this.toast = toastFn;
    this.onAuthChange = onAuthChange;
    this.mode = 'signin'; // 'signin' | 'signup'

    this.#bindDomEvents();
  }

  #bindDomEvents() {
    const modal = document.getElementById('authModal');
    const openBtn = document.getElementById('openAuthModalBtn');
    const closeBtn = document.getElementById('closeAuthModalBtn');
    const tabSignIn = document.getElementById('authTabSignIn');
    const tabSignUp = document.getElementById('authTabSignUp');
    const form = document.getElementById('authForm');
    const signOutBtn = document.getElementById('authSignOutBtn');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => this.openModal('signin'));
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.close());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.close();
      });
    }

    if (tabSignIn) {
      tabSignIn.addEventListener('click', () => this.setMode('signin'));
    }

    if (tabSignUp) {
      tabSignUp.addEventListener('click', () => this.setMode('signup'));
    }

    if (form) {
      form.addEventListener('submit', (e) => this.#handleAuthSubmit(e));
    }

    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => this.logout());
    }
  }

  openModal(mode = 'signin') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    this.clearAlert();
    this.setMode(mode, false);
    modal.showModal();
    const targetInput = mode === 'signup' 
      ? document.getElementById('authDisplayName') 
      : document.getElementById('authUsername');
    if (targetInput) setTimeout(() => targetInput.focus(), 100);
  }

  setMode(mode, animate = true) {
    this.mode = mode;
    this.clearAlert();

    const authTabs = document.getElementById('authTabs');
    const tabSignIn = document.getElementById('authTabSignIn');
    const tabSignUp = document.getElementById('authTabSignUp');
    const title = document.getElementById('authModalTitle');
    const submitText = document.getElementById('authSubmitText');
    const nameWrapper = document.getElementById('authDisplayNameWrapper');
    const nameInput = document.getElementById('authDisplayName');

    if (authTabs) {
      authTabs.setAttribute('data-mode', mode);
    }

    const updateDom = () => {
      if (mode === 'signup') {
        if (tabSignIn) { tabSignIn.classList.remove('active'); tabSignIn.setAttribute('aria-selected', 'false'); }
        if (tabSignUp) { tabSignUp.classList.add('active'); tabSignUp.setAttribute('aria-selected', 'true'); }
        if (title) title.textContent = 'Create Universe Account';
        if (submitText) submitText.textContent = 'Create Account';
        if (nameWrapper) nameWrapper.classList.add('expanded');
        if (nameInput) setTimeout(() => nameInput.focus(), 150);
      } else {
        if (tabSignIn) { tabSignIn.classList.add('active'); tabSignIn.setAttribute('aria-selected', 'true'); }
        if (tabSignUp) { tabSignUp.classList.remove('active'); tabSignUp.setAttribute('aria-selected', 'false'); }
        if (title) title.textContent = 'Sign In to Universe';
        if (submitText) submitText.textContent = 'Sign In';
        if (nameWrapper) nameWrapper.classList.remove('expanded');
      }
    };

    if (animate) {
      if (title) title.classList.add('auth-text-swap');
      if (submitText) submitText.classList.add('auth-text-swap');

      setTimeout(() => {
        updateDom();
        if (title) title.classList.remove('auth-text-swap');
        if (submitText) submitText.classList.remove('auth-text-swap');
      }, 90);
    } else {
      updateDom();
    }
  }

  showAlert(msg) {
    const alertBox = document.getElementById('authAlert');
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.classList.remove('hidden');
    }
  }

  clearAlert() {
    const alertBox = document.getElementById('authAlert');
    if (alertBox) {
      alertBox.textContent = '';
      alertBox.classList.add('hidden');
    }
  }

  async #handleAuthSubmit(e) {
    e.preventDefault();
    this.clearAlert();

    const usernameInput = document.getElementById('authUsername');
    const passwordInput = document.getElementById('authPassword');
    const nameInput = document.getElementById('authDisplayName');
    const submitBtn = document.getElementById('authSubmitBtn');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const displayName = nameInput ? nameInput.value.trim() : '';

    if (!username || !password) {
      this.showAlert('Please fill in both username and password.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      let result;
      if (this.mode === 'signup') {
        result = await api.register({
          username,
          password,
          displayName: displayName || username
        });
        this.toast(`Account created! Welcome, ${result.user.displayName}`);
      } else {
        result = await api.login({ username, password });
        this.toast(`Welcome back, ${result.user.displayName}!`);
      }

      api.setToken(result.token);
      this.state.currentUser = result.user;
      this.renderUserState();

      const modal = document.getElementById('authModal');
      if (modal) modal.close();

      // Reset form
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      if (nameInput) nameInput.value = '';

      if (this.onAuthChange) {
        await this.onAuthChange(result.user);
      }
    } catch (err) {
      this.showAlert(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async logout() {
    await api.logout();
    this.state.currentUser = null;
    this.renderUserState();
    this.toast('Signed out. Switched to guest session.');
    if (this.onAuthChange) {
      await this.onAuthChange(null);
    }
  }

  renderUserState() {
    const guestView = document.getElementById('authGuestView');
    const userView = document.getElementById('authUserView');
    const avatarEl = document.getElementById('authUserAvatar');
    const nameEl = document.getElementById('authUserName');
    const handleEl = document.getElementById('authUserHandle');

    const user = this.state.currentUser;

    if (user) {
      if (guestView) guestView.classList.add('hidden');
      if (userView) userView.classList.remove('hidden');
      if (avatarEl) avatarEl.textContent = user.avatar || '👤';
      if (nameEl) nameEl.textContent = user.displayName || user.username;
      if (handleEl) handleEl.textContent = `@${user.username}`;
    } else {
      if (guestView) guestView.classList.remove('hidden');
      if (userView) userView.classList.add('hidden');
    }
  }

  async checkInitialSession() {
    const token = api.getToken();
    if (!token) {
      this.state.currentUser = null;
      this.renderUserState();
      return null;
    }

    try {
      const res = await api.getMe();
      if (res && res.authenticated && res.user) {
        this.state.currentUser = res.user;
        this.renderUserState();
        return res.user;
      }
    } catch {
      // Token invalid or expired
    }

    api.setToken(null);
    this.state.currentUser = null;
    this.renderUserState();
    return null;
  }
}
