import { api } from './api.js';
import { initTheme, bindSpotlightHover, showToast } from './common.js';

class AuthPageController {
  constructor() {
    this.mode = 'signin';
    this.authTabs = document.getElementById('authTabs');
    this.tabSignIn = document.getElementById('authTabSignIn');
    this.tabSignUp = document.getElementById('authTabSignUp');
    this.title = document.getElementById('authPageTitle');
    this.submitText = document.getElementById('authSubmitText');
    this.nameWrapper = document.getElementById('authDisplayNameWrapper');
    this.nameInput = document.getElementById('authDisplayName');
    this.usernameInput = document.getElementById('authUsername');
    this.passwordInput = document.getElementById('authPassword');
    this.authForm = document.getElementById('authForm');
    this.alertBox = document.getElementById('authAlert');

    this.formSection = document.getElementById('authFormSection');
    this.userSection = document.getElementById('authActiveUserSection');
  }

  showAlert(msg, isError = true) {
    if (!this.alertBox) return;
    this.alertBox.textContent = msg;
    this.alertBox.className = `auth-alert ${isError ? 'error' : 'success'}`;
    this.alertBox.classList.remove('hidden');
  }

  clearAlert() {
    if (!this.alertBox) return;
    this.alertBox.textContent = '';
    this.alertBox.classList.add('hidden');
  }

  setMode(mode, animate = true) {
    this.mode = mode;
    this.clearAlert();

    if (this.authTabs) {
      this.authTabs.setAttribute('data-mode', mode);
    }

    const updateDom = () => {
      if (mode === 'signup') {
        if (this.tabSignIn) { this.tabSignIn.classList.remove('active'); this.tabSignIn.setAttribute('aria-selected', 'false'); }
        if (this.tabSignUp) { this.tabSignUp.classList.add('active'); this.tabSignUp.setAttribute('aria-selected', 'true'); }
        if (this.title) this.title.textContent = 'Create Universe Account';
        if (this.submitText) this.submitText.textContent = 'Create Account';
        if (this.nameWrapper) this.nameWrapper.classList.add('expanded');
        if (this.nameInput) setTimeout(() => this.nameInput.focus(), 150);
      } else {
        if (this.tabSignIn) { this.tabSignIn.classList.add('active'); this.tabSignIn.setAttribute('aria-selected', 'true'); }
        if (this.tabSignUp) { this.tabSignUp.classList.remove('active'); this.tabSignUp.setAttribute('aria-selected', 'false'); }
        if (this.title) this.title.textContent = 'Sign In to Universe';
        if (this.submitText) this.submitText.textContent = 'Sign In';
        if (this.nameWrapper) this.nameWrapper.classList.remove('expanded');
        if (this.usernameInput) setTimeout(() => this.usernameInput.focus(), 150);
      }
    };

    if (animate) {
      if (this.title) this.title.classList.add('auth-text-swap');
      if (this.submitText) this.submitText.classList.add('auth-text-swap');
      setTimeout(() => {
        updateDom();
        if (this.title) this.title.classList.remove('auth-text-swap');
        if (this.submitText) this.submitText.classList.remove('auth-text-swap');
      }, 90);
    } else {
      updateDom();
    }
  }

  async checkCurrentSession() {
    try {
      const user = await api.getCurrentUser();
      if (user) {
        if (this.formSection) this.formSection.classList.add('hidden');
        if (this.userSection) this.userSection.classList.remove('hidden');

        const nameEl = document.getElementById('activeProfileName');
        const handleEl = document.getElementById('activeProfileHandle');
        const avatarEl = document.getElementById('activeProfileAvatar');

        if (nameEl) nameEl.textContent = user.displayName || user.username;
        if (handleEl) handleEl.textContent = `@${user.username}`;
        if (avatarEl) avatarEl.textContent = user.avatar || '👤';

        const logoutBtn = document.getElementById('authLogoutActiveBtn');
        if (logoutBtn) {
          logoutBtn.onclick = async () => {
            await api.logout();
            showToast('Signed out successfully.');
            setTimeout(() => window.location.reload(), 300);
          };
        }
      }
    } catch {
      // not logged in, show form
    }
  }

  init() {
    initTheme();
    bindSpotlightHover(document.body);

    const params = new URLSearchParams(window.location.search);
    const initialMode = params.get('mode') === 'signup' ? 'signup' : 'signin';
    this.setMode(initialMode, false);

    if (this.tabSignIn) {
      this.tabSignIn.addEventListener('click', () => this.setMode('signin'));
    }
    if (this.tabSignUp) {
      this.tabSignUp.addEventListener('click', () => this.setMode('signup'));
    }

    if (this.authForm) {
      this.authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        this.clearAlert();

        const username = this.usernameInput?.value.trim();
        const password = this.passwordInput?.value;
        const displayName = this.nameInput?.value.trim();

        if (!username || !password) {
          this.showAlert('Please enter both username and password.');
          return;
        }

        const submitBtn = document.getElementById('authSubmitBtn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.6';
        }

        try {
          if (this.mode === 'signup') {
            await api.register({ username, password, displayName: displayName || username });
            showToast(`Account created! Welcome, @${username}`);
          } else {
            await api.login({ username, password });
            showToast(`Welcome back, @${username}`);
          }

          const returnUrl = params.get('return') || '/';
          setTimeout(() => {
            window.location.href = returnUrl;
          }, 400);
        } catch (err) {
          this.showAlert(err.message || 'Authentication failed. Please check credentials.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
          }
        }
      });
    }

    this.checkCurrentSession();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new AuthPageController();
  controller.init();
});
