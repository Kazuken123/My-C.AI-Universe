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
      if (this.titleEl) this.titleEl.textContent = 'Đặt Lại Mật Khẩu';
      if (this.subEl) this.subEl.textContent = 'Nhập email để nhận mã xác nhận bảo mật gồm 6 chữ số.';
    } else if (step === 'reset') {
      if (this.reqForm) this.reqForm.classList.add('hidden');
      if (this.resetForm) this.resetForm.classList.remove('hidden');
      if (this.successSection) this.successSection.classList.add('hidden');
      if (this.titleEl) this.titleEl.textContent = 'Nhập Mật Khẩu Mới';
      if (this.subEl) this.subEl.textContent = 'Nhập mã xác nhận vừa nhận được và thiết lập mật khẩu mới.';
    } else if (step === 'success') {
      if (this.reqForm) this.reqForm.classList.add('hidden');
      if (this.resetForm) this.resetForm.classList.add('hidden');
      if (this.successSection) this.successSection.classList.remove('hidden');
      if (this.titleEl) this.titleEl.textContent = 'Khôi Phục Thành Công';
      if (this.subEl) this.subEl.textContent = 'Mật khẩu tài khoản của bạn đã được cập nhật thành công.';
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
          this.showAlert('Vui lòng nhập địa chỉ email hợp lệ.');
          return;
        }

        const btn = document.getElementById('btnSendCode');
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
        }

        try {
          const res = await api.forgotPassword(email);
          showToast('Mã xác nhận đã được gửi đi!');
          if (this.resetEmailInput) this.resetEmailInput.value = email;

          let msg = res.message || 'Mã xác nhận đã được gửi đến email của bạn.';
          if (res.previewCode) {
            msg += ` (Mã thử nghiệm: ${res.previewCode})`;
            if (this.resetCodeInput) this.resetCodeInput.value = res.previewCode;
          }

          this.showStep('reset');
          this.showAlert(msg, false);
          if (this.resetCodeInput && !this.resetCodeInput.value) {
            setTimeout(() => this.resetCodeInput.focus(), 150);
          } else if (this.newPassInput) {
            setTimeout(() => this.newPassInput.focus(), 150);
          }
        } catch (err) {
          this.showAlert(err.message || 'Không thể gửi mã xác nhận. Vui lòng kiểm tra lại email.');
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
          this.showAlert('Vui lòng điền đầy đủ email và mã xác nhận 6 số.');
          return;
        }

        if (!newPassword || newPassword.length < 6) {
          this.showAlert('Mật khẩu mới phải có tối thiểu 6 ký tự.');
          return;
        }

        if (newPassword !== confirmPassword) {
          this.showAlert('Nhập lại mật khẩu không khớp. Vui lòng thử lại.');
          return;
        }

        const btn = document.getElementById('btnSubmitReset');
        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.6';
        }

        try {
          await api.resetPassword({ email, code, newPassword });
          showToast('Mật khẩu đã được cập nhật thành công!');
          this.showStep('success');
        } catch (err) {
          this.showAlert(err.message || 'Đặt lại mật khẩu thất bại. Mã có thể đã hết hạn hoặc không đúng.');
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
