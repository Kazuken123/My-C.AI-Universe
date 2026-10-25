import { api } from './api.js';
import { initTheme, bindSpotlightHover, showToast } from './common.js';

class ResetPasswordPageController {
  constructor() {
    this.reqForm = document.getElementById('requestCodeForm');
    this.resetForm = document.getElementById('resetPasswordForm');
    this.successSection = document.getElementById('resetSuccessSection');
    this.alertBox = document.getElementById('resetAlert');

    this.reqEmailInput = document.getElementById('reqEmail');
    this.resetEmailInput = document.getElementById('resetEmail');
    this.resetCodeInput = document.getElementById('resetCode');
    this.newPassInput = document.getElementById('newPassword');
    this.confirmPassInput = document.getElementById('confirmPassword');

    this.titleEl = document.getElementById('resetCardTitle');
    this.subEl = document.getElementById('resetCardSub');
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

  showStep(step) {
    this.clearAlert();
    if (step === 'request') {
      if (this.reqForm) this.reqForm.classList.remove('hidden');
      if (this.resetForm) this.resetForm.classList.add('hidden');
      if (this.successSection) this.successSection.classList.add('hidden');
      if (this.titleEl) this.titleEl.textContent = 'Reset Password';
      if (this.subEl) this.subEl.textContent = 'Enter your email to receive a 6-digit verification code.';
    } else if (step === 'reset') {
      if (this.reqForm) this.reqForm.classList.add('hidden');
      if (this.resetForm) this.resetForm.classList.remove('hidden');
      if (this.successSection) this.successSection.classList.add('hidden');
      if (this.titleEl) this.titleEl.textContent = 'Enter New Password';
      if (this.subEl) this.subEl.textContent = 'Enter the verification code and choose a new password.';
    } else if (step === 'success') {
      if (this.reqForm) this.reqForm.classList.add('hidden');
      if (this.resetForm) this.resetForm.classList.add('hidden');
      if (this.successSection) this.successSection.classList.remove('hidden');
      if (this.titleEl) this.titleEl.textContent = 'Password Reset Successful';
      if (this.subEl) this.subEl.textContent = 'Your account password has been updated successfully.';
    }
  }

  init() {
    initTheme();
    bindSpotlightHover(document.body);

    const params = new URLSearchParams(window.location.search);
    const paramEmail = params.get('email');
    const paramCode = params.get('code');

    // If both email and code exist in URL query params, go straight to entering new password
    if (paramEmail && paramCode) {
      if (this.resetEmailInput) this.resetEmailInput.value = paramEmail;
      if (this.resetCodeInput) this.resetCodeInput.value = paramCode;
      this.showStep('reset');
      if (this.newPassInput) setTimeout(() => this.newPassInput.focus(), 150);
    } else if (paramEmail) {
      if (this.reqEmailInput) this.reqEmailInput.value = paramEmail;
      if (this.resetEmailInput) this.resetEmailInput.value = paramEmail;
      this.showStep('request');
    } else {
      this.showStep('request');
    }

    // Switch buttons
    const btnSwitchToInputCode = document.getElementById('btnSwitchToInputCode');
    if (btnSwitchToInputCode) {
      btnSwitchToInputCode.addEventListener('click', () => {
        if (this.reqEmailInput?.value && this.resetEmailInput) {
          this.resetEmailInput.value = this.reqEmailInput.value;
        }
        this.showStep('reset');
      });
    }

    const btnSwitchToSendCode = document.getElementById('btnSwitchToSendCode');
    if (btnSwitchToSendCode) {
      btnSwitchToSendCode.addEventListener('click', () => {
        if (this.resetEmailInput?.value && this.reqEmailInput) {
          this.reqEmailInput.value = this.resetEmailInput.value;
        }
        this.showStep('request');
      });
    }

    // 1. Submit Request Code
    if (this.reqForm) {
      this.reqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        this.clearAlert();

        const email = this.reqEmailInput?.value.trim();
        if (!email) {
          this.showAlert('Please enter a valid email address.');
          return;
        }

        const btn = document.getElementById('btnSendCode');
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
        }

        try {
          const res = await api.forgotPassword(email);
          showToast('Verification code sent successfully!');
          if (this.resetEmailInput) this.resetEmailInput.value = email;

          const msg = res.message || 'A verification code has been sent to your email address.';

          this.showStep('reset');
          this.showAlert(msg, false);
          if (this.resetCodeInput && !this.resetCodeInput.value) {
            setTimeout(() => this.resetCodeInput.focus(), 150);
          } else if (this.newPassInput) {
            setTimeout(() => this.newPassInput.focus(), 150);
          }
        } catch (err) {
          this.showAlert(err.message || 'Failed to send verification code. Please check your email.');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        }
      });
    }

    // 2. Submit Reset Password
    if (this.resetForm) {
      this.resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        this.clearAlert();

        const email = this.resetEmailInput?.value.trim();
        const code = this.resetCodeInput?.value.trim();
        const newPassword = this.newPassInput?.value;
        const confirmPassword = this.confirmPassInput?.value;

        if (!email || !code) {
          this.showAlert('Please enter both your email address and the 6-digit code.');
          return;
        }

        if (!newPassword || newPassword.length < 6) {
          this.showAlert('New password must contain at least 6 characters.');
          return;
        }

        if (newPassword !== confirmPassword) {
          this.showAlert('Passwords do not match. Please try again.');
          return;
        }

        const btn = document.getElementById('btnSubmitReset');
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
        }

        try {
          await api.resetPassword({ email, code, newPassword });
          showToast('Password updated successfully!');
          this.showStep('success');
        } catch (err) {
          this.showAlert(err.message || 'Password reset failed. The code may be expired or incorrect.');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        }
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new ResetPasswordPageController();
  controller.init();
});
