import { api } from './api.js';
import { initTheme, bindSpotlightHover, showToast, renderUserAvatar, sanitizeReturnUrl } from './common.js';
import { openImageCropper } from './cropper.js';

class ProfileSetupController {
  constructor() {
    this.form = document.getElementById('profileSetupForm');
    this.alertBox = document.getElementById('setupAlert');

    this.avatarInput = document.getElementById('setupAvatarInput');
    this.avatarPreview = document.getElementById('setupAvatarPreview');
    this.uploadBtn = document.getElementById('btnUploadProfileAvatar');
    this.displayNameInput = document.getElementById('setupDisplayName');
    this.usernameInput = document.getElementById('setupUsername');

    this.personaNameInput = document.getElementById('setupPersonaName');
    this.personaAvatarInput = document.getElementById('setupPersonaAvatar');
    this.personaDescInput = document.getElementById('setupPersonaDesc');

    this.submitBtn = document.getElementById('btnSaveSetup');

    this.currentUser = null;
    this.activePersona = null;
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

  updateAvatarPreview() {
    const val = this.avatarInput?.value.trim() || '👤';
    renderUserAvatar(this.avatarPreview, val);
  }

  launchAvatarCropper() {
    const currentVal = this.avatarInput?.value.trim() || '';
    const initial = (currentVal.startsWith('http') || currentVal.startsWith('data:') || currentVal.startsWith('/')) ? currentVal : null;
    openImageCropper({
      initialImage: initial,
      title: 'Profile Avatar Framing',
      shape: 'circle',
      onCrop: ({ url }) => {
        if (this.avatarInput) {
          this.avatarInput.value = url;
          this.updateAvatarPreview();
        }
      }
    });
  }

  async loadInitialData() {
    try {
      this.currentUser = await api.getCurrentUser();
      if (!this.currentUser) {
        window.location.href = '/auth?mode=signin&return=/profile-setup';
        return;
      }

      if (this.displayNameInput) {
        this.displayNameInput.value = this.currentUser.displayName || this.currentUser.username || '';
      }
      if (this.usernameInput) {
        this.usernameInput.value = this.currentUser.username || '';
      }
      if (this.avatarInput) {
        this.avatarInput.value = this.currentUser.avatar || '👤';
      }
      this.updateAvatarPreview();

      const personas = await api.getPersonas().catch(() => []);
      if (Array.isArray(personas) && personas.length > 0) {
        this.activePersona = personas.find(p => p.isDefault) || personas[0];
      }

      if (this.activePersona) {
        if (this.personaNameInput) this.personaNameInput.value = this.activePersona.name || '';
        if (this.personaAvatarInput) this.personaAvatarInput.value = this.activePersona.avatar || '';
        if (this.personaDescInput) this.personaDescInput.value = this.activePersona.description || '';
      } else {
        const defaultName = this.currentUser.displayName || 'Adventurer';
        if (this.personaNameInput) this.personaNameInput.value = defaultName;
        if (this.personaAvatarInput) {
          const glyph = defaultName.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'AD';
          this.personaAvatarInput.value = glyph;
        }
        if (this.personaDescInput) {
          this.personaDescInput.value = `Roleplay persona for @${this.currentUser.username}.`;
        }
      }
    } catch (err) {
      this.showAlert(err.message || 'Failed to load user profile data');
    }
  }

  init() {
    initTheme();
    bindSpotlightHover(document.body);

    this.loadInitialData();

    if (this.avatarInput) {
      this.avatarInput.addEventListener('input', () => this.updateAvatarPreview());
    }

    if (this.uploadBtn) {
      this.uploadBtn.addEventListener('click', () => this.launchAvatarCropper());
    }

    if (this.avatarPreview) {
      this.avatarPreview.addEventListener('click', () => this.launchAvatarCropper());
      this.avatarPreview.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.launchAvatarCropper();
        }
      });
    }

    const presetBtns = document.querySelectorAll('.setup-preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (this.avatarInput && val) {
          this.avatarInput.value = val;
          this.updateAvatarPreview();
        }
      });
    });

    if (this.form) {
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        this.clearAlert();

        const displayName = this.displayNameInput?.value.trim();
        const username = this.usernameInput?.value.trim().toLowerCase();
        const avatar = this.avatarInput?.value.trim() || '👤';

        const personaName = this.personaNameInput?.value.trim();
        const personaAvatar = this.personaAvatarInput?.value.trim().toUpperCase() || 'AD';
        const personaDesc = this.personaDescInput?.value.trim() || '';

        if (!displayName) {
          this.showAlert('Display name is required.');
          return;
        }

        if (!username || !/^[a-zA-Z0-9_]{3,25}$/.test(username)) {
          this.showAlert('Username must be 3 to 25 characters with only letters, numbers, and underscores.');
          return;
        }

        if (!personaName) {
          this.showAlert('Persona name is required.');
          return;
        }

        if (this.submitBtn) {
          this.submitBtn.disabled = true;
          this.submitBtn.style.opacity = '0.6';
        }

        try {
          await api.updateProfile({
            displayName,
            username,
            avatar
          });

          if (this.activePersona?.id) {
            await api.updatePersona(this.activePersona.id, {
              name: personaName,
              avatar: personaAvatar,
              description: personaDesc,
              isDefault: true
            });
          } else {
            await api.createPersona({
              name: personaName,
              avatar: personaAvatar,
              description: personaDesc,
              isDefault: true
            });
          }

          showToast('Profile and persona saved successfully!');
          const params = new URLSearchParams(window.location.search);
          const returnUrl = sanitizeReturnUrl(params.get('return'));
          setTimeout(() => {
            window.location.href = returnUrl;
          }, 350);
        } catch (err) {
          this.showAlert(err.message || 'Failed to save profile and persona.');
          if (this.submitBtn) {
            this.submitBtn.disabled = false;
            this.submitBtn.style.opacity = '1';
          }
        }
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new ProfileSetupController();
  controller.init();
});
