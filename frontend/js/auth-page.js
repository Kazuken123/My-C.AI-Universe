import { api } from './api.js';
import { initTheme, bindSpotlightHover, showToast, renderUserAvatar, sanitizeReturnUrl } from './common.js';

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
    this.emailInput = document.getElementById('authEmail');
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
      const pageSub = document.getElementById('authPageSub');
      if (mode === 'signup') {
        if (this.tabSignIn) { this.tabSignIn.classList.remove('active'); this.tabSignIn.setAttribute('aria-selected', 'false'); }
        if (this.tabSignUp) { this.tabSignUp.classList.add('active'); this.tabSignUp.setAttribute('aria-selected', 'true'); }
        if (this.title) this.title.textContent = 'Create Universe Account';
        if (pageSub) pageSub.textContent = 'Create an account to store custom personas and branching storyline chats.';
        if (this.submitText) this.submitText.textContent = 'Create Account';
        if (this.nameWrapper) this.nameWrapper.classList.add('expanded');
        if (this.nameInput) setTimeout(() => this.nameInput.focus(), 150);
      } else {
        if (this.tabSignIn) { this.tabSignIn.classList.add('active'); this.tabSignIn.setAttribute('aria-selected', 'true'); }
        if (this.tabSignUp) { this.tabSignUp.classList.remove('active'); this.tabSignUp.setAttribute('aria-selected', 'false'); }
        if (this.title) this.title.textContent = 'Sign In to Universe';
        if (pageSub) pageSub.textContent = 'Access your custom personas and branching storyline chats.';
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
        if (avatarEl) renderUserAvatar(avatarEl, user.avatar);

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
            const email = this.emailInput?.value.trim();
            await api.register({
              username,
              password,
              email: email || undefined,
              displayName: displayName || username
            });
            showToast(`Account created successfully. Welcome, @${username}!`);
            const returnUrl = sanitizeReturnUrl(params.get('return'));
            const returnParam = returnUrl !== '/' ? `&return=${encodeURIComponent(returnUrl)}` : '';
            setTimeout(() => {
              window.location.href = `/profile-setup.html?new=1${returnParam}`;
            }, 400);
          } else {
            await api.login({ username, password });
            showToast(`Welcome back, @${username}!`);
            const returnUrl = sanitizeReturnUrl(params.get('return'));
            setTimeout(() => {
              window.location.href = returnUrl;
            }, 400);
          }
        } catch (err) {
          this.showAlert(err.message || 'Authentication failed. Please verify your credentials.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
          }
        }
      });
    }

    const GOOGLE_CLIENT_ID = '254873060516-vtieqsbihjcle1lqgpqfp3u5lpgocf7g.apps.googleusercontent.com';

    const loginWithGoogleToken = async (token) => {
      this.clearAlert();
      try {
        showToast('Authenticating with Google');
        const authResult = await api.socialLogin({
          provider: 'google',
          token
        });
        showToast('Signed in successfully with Google!');
        const returnUrl = sanitizeReturnUrl(params.get('return'));
        const returnParam = returnUrl !== '/' ? `&return=${encodeURIComponent(returnUrl)}` : '';
        const targetUrl = authResult?.isNewUser ? `/profile-setup.html?new=1${returnParam}` : returnUrl;
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 400);
      } catch (err) {
        this.showAlert(err.message || 'Google sign-in failed.');
      }
    };

    const setupGoogleAuth = () => {
      if (!window.google?.accounts) return false;

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (response?.credential) {
              await loginWithGoogleToken(response.credential);
            }
          }
        });
        window.google.accounts.id.prompt();
      } catch {
        // One Tap fallback
      }

      let tokenClient = null;
      try {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile openid',
          callback: async (tokenResponse) => {
            if (tokenResponse?.error) {
              this.showAlert(`Google authentication error: ${tokenResponse.error}`);
              return;
            }
            if (tokenResponse?.access_token) {
              await loginWithGoogleToken(tokenResponse.access_token);
            }
          }
        });
      } catch {
        // tokenClient fallback
      }

      const googleBtn = document.getElementById('btnGoogleAuth');
      if (googleBtn) {
        googleBtn.onclick = () => {
          this.clearAlert();
          if (tokenClient) {
            tokenClient.requestAccessToken();
          } else if (window.google?.accounts?.id) {
            window.google.accounts.id.prompt();
          } else {
            this.showAlert('Google Sign-In is unavailable. Please check your network connection.');
          }
        };
      }
      return true;
    };

    if (!setupGoogleAuth()) {
      const checkGsi = setInterval(() => {
        if (setupGoogleAuth()) {
          clearInterval(checkGsi);
        }
      }, 150);
      setTimeout(() => clearInterval(checkGsi), 4000);
    }

    const fbBtn = document.getElementById('btnFacebookAuth');
    if (fbBtn) {
      fbBtn.onclick = () => {
        this.clearAlert();
        this.showAlert('Facebook Sign-In requires a registered Facebook App ID.');
      };
    }

    this.checkCurrentSession();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new AuthPageController();
  controller.init();
});
