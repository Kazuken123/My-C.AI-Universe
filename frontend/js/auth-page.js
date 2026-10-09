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
        if (this.title) this.title.textContent = 'Tạo Tài Khoản Universe';
        if (pageSub) pageSub.textContent = 'Tạo tài khoản để lưu trữ nhân vật đại diện và các nhánh cốt truyện.';
        if (this.submitText) this.submitText.textContent = 'Tạo Tài Khoản';
        if (this.nameWrapper) this.nameWrapper.classList.add('expanded');
        if (this.nameInput) setTimeout(() => this.nameInput.focus(), 150);
      } else {
        if (this.tabSignIn) { this.tabSignIn.classList.add('active'); this.tabSignIn.setAttribute('aria-selected', 'true'); }
        if (this.tabSignUp) { this.tabSignUp.classList.remove('active'); this.tabSignUp.setAttribute('aria-selected', 'false'); }
        if (this.title) this.title.textContent = 'Đăng Nhập vào Universe';
        if (pageSub) pageSub.textContent = 'Truy cập nhân vật đại diện và các nhánh cốt truyện của bạn.';
        if (this.submitText) this.submitText.textContent = 'Đăng Nhập';
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
            const email = this.emailInput?.value.trim();
            await api.register({
              username,
              password,
              email: email || undefined,
              displayName: displayName || username
            });
            showToast(`Tài khoản đã tạo thành công! Chào mừng, @${username}`);
          } else {
            await api.login({ username, password });
            showToast(`Chào mừng quay trở lại, @${username}`);
          }

          const returnUrl = params.get('return') || '/';
          setTimeout(() => {
            window.location.href = returnUrl;
          }, 400);
        } catch (err) {
          this.showAlert(err.message || 'Xác thực thất bại. Vui lòng kiểm tra lại thông tin.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
          }
        }
      });
    }

    const handleSocialAuth = async (provider) => {
      this.clearAlert();
      const providerName = provider === 'google' ? 'Google' : 'Facebook';
      const promptEmail = prompt(`Nhập địa chỉ email ${providerName} để đăng nhập nhanh:`, `user@${provider === 'google' ? 'gmail.com' : 'facebook.com'}`);
      if (!promptEmail || !promptEmail.trim()) return;

      const cleanEmail = promptEmail.trim().toLowerCase();
      try {
        await api.socialLogin({
          provider,
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          providerId: `${provider}_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`
        });
        showToast(`Đăng nhập thành công với ${providerName}!`);
        const returnUrl = params.get('return') || '/';
        setTimeout(() => {
          window.location.href = returnUrl;
        }, 400);
      } catch (err) {
        this.showAlert(err.message || `Đăng nhập ${providerName} thất bại.`);
      }
    };

    const googleBtn = document.getElementById('btnGoogleAuth');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => handleSocialAuth('google'));
    }

    const fbBtn = document.getElementById('btnFacebookAuth');
    if (fbBtn) {
      fbBtn.addEventListener('click', () => handleSocialAuth('facebook'));
    }

    this.checkCurrentSession();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new AuthPageController();
  controller.init();
});
