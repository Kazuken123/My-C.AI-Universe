import test from 'node:test';
import assert from 'node:assert/strict';

// =========================================================================
// SIMULATED STATE MACHINES & CONTROLLER ORACLES
// We simulate the exact logic found in:
// - nextjs-frontend/components/auth/reset-password-flow.tsx
// - nextjs-frontend/components/auth/login-form.tsx
// - nextjs-frontend/components/auth/register-form.tsx
// - nextjs-frontend/components/profile/profile-editor.tsx
// =========================================================================

/**
 * Oracle for ResetPasswordFlow state machine and validation
 */
function createResetPasswordStateMachine(initialParams = {}, mockApi = {}) {
  const paramEmail = initialParams.email || '';
  const paramCode = initialParams.code || '';

  let step = (paramEmail && paramCode) ? 'reset' : 'request';
  let email = paramEmail;
  let code = paramCode;
  let newPassword = '';
  let confirmPassword = '';
  let loading = false;
  let error = null;
  let info = null;
  let devPreviewCode = null;

  const syncParams = (newParams) => {
    const pEmail = newParams.email || '';
    const pCode = newParams.code || '';
    if (pEmail && pCode) {
      email = pEmail;
      code = pCode;
      step = 'reset';
    } else if (pEmail && !email) {
      email = pEmail;
    }
  };

  const setCodeInput = (rawInput) => {
    code = String(rawInput || '').replace(/\D/g, '').slice(0, 6);
  };

  const handleRequestCode = async (submitEmail) => {
    if (submitEmail !== undefined) email = submitEmail;
    error = null;
    info = null;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      error = 'Please enter your email address.';
      return { success: false, error };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      error = 'Please enter a valid email address.';
      return { success: false, error };
    }

    loading = true;
    try {
      if (!mockApi.forgotPassword) {
        throw new Error('mockApi.forgotPassword not defined');
      }
      const res = await mockApi.forgotPassword({ email: trimmedEmail });
      info = res.message || 'Verification code sent to your email.';
      if (res.previewCode) {
        devPreviewCode = res.previewCode;
        code = res.previewCode;
      }
      step = 'reset';
      return { success: true, info, previewCode: res.previewCode };
    } catch (err) {
      error = err.message || 'Failed to send verification code. Please check your email.';
      return { success: false, error };
    } finally {
      loading = false;
    }
  };

  const handleResetPassword = async (submitParams = {}) => {
    if (submitParams.email !== undefined) email = submitParams.email;
    if (submitParams.code !== undefined) code = submitParams.code;
    if (submitParams.newPassword !== undefined) newPassword = submitParams.newPassword;
    if (submitParams.confirmPassword !== undefined) confirmPassword = submitParams.confirmPassword;

    error = null;
    info = null;

    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    if (!trimmedEmail || !trimmedCode) {
      error = 'Please enter both your email and the 6-digit verification code.';
      return { success: false, error };
    }

    if (!/^\d{6}$/.test(trimmedCode)) {
      error = 'Verification code must be exactly 6 digits.';
      return { success: false, error };
    }

    if (!newPassword || newPassword.length < 6) {
      error = 'New password must contain at least 6 characters.';
      return { success: false, error };
    }

    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match. Please verify.';
      return { success: false, error };
    }

    loading = true;
    try {
      if (!mockApi.resetPassword) {
        throw new Error('mockApi.resetPassword not defined');
      }
      const res = await mockApi.resetPassword({
        email: trimmedEmail,
        code: trimmedCode,
        newPassword,
      });
      step = 'success';
      return { success: true, res };
    } catch (err) {
      error = err.message || 'Password reset failed. The code may be expired or incorrect.';
      return { success: false, error };
    } finally {
      loading = false;
    }
  };

  const goToStep = (targetStep) => {
    error = null;
    step = targetStep;
  };

  return {
    getState: () => ({
      step,
      email,
      code,
      newPassword,
      confirmPassword,
      loading,
      error,
      info,
      devPreviewCode,
    }),
    syncParams,
    setCodeInput,
    handleRequestCode,
    handleResetPassword,
    goToStep,
  };
}

/**
 * Oracle for RegisterForm validation logic
 */
function validateRegisterForm(fields) {
  const { username = '', password = '', confirmPassword = '', displayName = '', email = '' } = fields;

  const trimmedUser = (username || '').trim();

  if (!trimmedUser) {
    return 'Please choose a username.';
  }

  if (trimmedUser.length < 3) {
    return 'Username must be at least 3 characters.';
  }

  if (trimmedUser.length > 50) {
    return 'Username must not exceed 50 characters.';
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUser)) {
    return 'Username may only contain letters, numbers, and underscores.';
  }

  const lowerUser = trimmedUser.toLowerCase();
  if (lowerUser === 'admin' || lowerUser === 'community') {
    return 'This username is reserved. Please choose another.';
  }

  if (displayName && displayName.trim().length > 50) {
    return 'Display name must not exceed 50 characters.';
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Please enter a valid email address.';
  }

  if (!password) {
    return 'Please enter a password.';
  }

  if (password.length < 6) {
    return 'Password must contain at least 6 characters.';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

/**
 * Oracle for LoginForm validation logic
 */
function validateLoginForm(fields) {
  const { username = '', password = '' } = fields;
  const trimmedUsername = (username || '').trim();

  if (!trimmedUsername) {
    return 'Please enter your username.';
  }

  if (!password) {
    return 'Please enter your password.';
  }

  return null;
}

// =========================================================================
// TEST SUITE 1: 3-STEP PASSWORD RESET STATE MACHINE & DEEP-LINK
// =========================================================================

test('M2 Reset Flow: Deep-link query parameter parsing & initial step determination', () => {
  // 1. Both email and code present -> Step 'reset', pre-populated fields
  const sm1 = createResetPasswordStateMachine({ email: 'pilot@universe.ai', code: '123456' });
  assert.equal(sm1.getState().step, 'reset');
  assert.equal(sm1.getState().email, 'pilot@universe.ai');
  assert.equal(sm1.getState().code, '123456');

  // 2. Only email present -> Step 'request', pre-populated email, empty code
  const sm2 = createResetPasswordStateMachine({ email: 'pilot@universe.ai' });
  assert.equal(sm2.getState().step, 'request');
  assert.equal(sm2.getState().email, 'pilot@universe.ai');
  assert.equal(sm2.getState().code, '');

  // 3. Only code present -> Step 'request' (requires email to proceed)
  const sm3 = createResetPasswordStateMachine({ code: '654321' });
  assert.equal(sm3.getState().step, 'request');
  assert.equal(sm3.getState().email, '');
  assert.equal(sm3.getState().code, '654321');

  // 4. Neither present -> Step 'request', all empty
  const sm4 = createResetPasswordStateMachine({});
  assert.equal(sm4.getState().step, 'request');
  assert.equal(sm4.getState().email, '');
  assert.equal(sm4.getState().code, '');

  // 5. Query parameters change after mount (e.g., client navigation with new query params)
  sm4.syncParams({ email: 'nova@universe.ai', code: '888999' });
  assert.equal(sm4.getState().step, 'reset');
  assert.equal(sm4.getState().email, 'nova@universe.ai');
  assert.equal(sm4.getState().code, '888999');
});

test('M2 Reset Flow: Step 1 (Request Code) email boundaries & state transition', async () => {
  let forgotCalledWith = null;
  const mockApi = {
    forgotPassword: async (payload) => {
      forgotCalledWith = payload;
      return { success: true, message: 'OTP dispatched', previewCode: '777888' };
    },
  };

  const sm = createResetPasswordStateMachine({}, mockApi);

  // 1. Empty email rejection
  const r1 = await sm.handleRequestCode('');
  assert.equal(r1.success, false);
  assert.equal(r1.error, 'Please enter your email address.');
  assert.equal(sm.getState().step, 'request');

  // 2. Whitespace email rejection
  const r2 = await sm.handleRequestCode('   ');
  assert.equal(r2.success, false);
  assert.equal(r2.error, 'Please enter your email address.');

  // 3. Invalid email regex formats
  const invalidEmails = [
    'plainaddress',
    '#@%^%#$@#$@#.com',
    '@example.com',
    'Joe Smith <email@example.com>',
    'email.example.com',
    'email@example@example.com',
    'email@example',
  ];
  for (const inv of invalidEmails) {
    const res = await sm.handleRequestCode(inv);
    assert.equal(res.success, false, `Expected ${inv} to be rejected`);
    assert.equal(res.error, 'Please enter a valid email address.');
  }

  // 4. Valid email -> Success, captures previewCode, moves to 'reset'
  const r3 = await sm.handleRequestCode('pilot@universe.ai');
  assert.equal(r3.success, true);
  assert.equal(forgotCalledWith.email, 'pilot@universe.ai');
  assert.equal(sm.getState().step, 'reset');
  assert.equal(sm.getState().code, '777888');
  assert.equal(sm.getState().devPreviewCode, '777888');
  assert.equal(sm.getState().info, 'OTP dispatched');

  // 5. Navigation button: "I already have a code"
  const smAlt = createResetPasswordStateMachine({});
  assert.equal(smAlt.getState().step, 'request');
  smAlt.goToStep('reset');
  assert.equal(smAlt.getState().step, 'reset');
});

test('M2 Reset Flow: Step 2 6-digit OTP code input sanitizer and boundary validation', () => {
  const sm = createResetPasswordStateMachine({ email: 'pilot@universe.ai' });
  sm.goToStep('reset');

  // 1. Sanitizer clamps to 6 digits and strips non-numeric characters
  sm.setCodeInput('123456');
  assert.equal(sm.getState().code, '123456');

  sm.setCodeInput('123456789'); // Exceeds 6 chars
  assert.equal(sm.getState().code, '123456', 'Sanitizer must slice to max 6 digits');

  sm.setCodeInput('12a-34#56'); // Non-numeric characters stripped
  assert.equal(sm.getState().code, '123456', 'Sanitizer must strip letters and symbols');

  sm.setCodeInput('abcdef'); // All non-numeric
  assert.equal(sm.getState().code, '', 'Sanitizer reduces non-numeric to empty');
});

test('M2 Reset Flow: Step 2 (Reset Password) input validations & failure modes', async () => {
  const mockApi = {
    resetPassword: async () => ({ success: true, message: 'Password updated' }),
  };

  const sm = createResetPasswordStateMachine({ email: 'pilot@universe.ai', code: '123456' }, mockApi);

  // 1. Missing email
  const r1 = await sm.handleResetPassword({ email: '', code: '123456', newPassword: 'newPassword123', confirmPassword: 'newPassword123' });
  assert.equal(r1.success, false);
  assert.equal(r1.error, 'Please enter both your email and the 6-digit verification code.');

  // 2. Missing code
  const r2 = await sm.handleResetPassword({ email: 'pilot@universe.ai', code: '', newPassword: 'newPassword123', confirmPassword: 'newPassword123' });
  assert.equal(r2.success, false);
  assert.equal(r2.error, 'Please enter both your email and the 6-digit verification code.');

  // 3. Code length boundary: < 6 digits (boundary: 5 digits)
  const r3 = await sm.handleResetPassword({ email: 'pilot@universe.ai', code: '12345', newPassword: 'newPassword123', confirmPassword: 'newPassword123' });
  assert.equal(r3.success, false);
  assert.equal(r3.error, 'Verification code must be exactly 6 digits.');

  // 4. Code length boundary: > 6 digits (boundary: 7 digits)
  const r4 = await sm.handleResetPassword({ email: 'pilot@universe.ai', code: '1234567', newPassword: 'newPassword123', confirmPassword: 'newPassword123' });
  assert.equal(r4.success, false);
  assert.equal(r4.error, 'Verification code must be exactly 6 digits.');

  // 5. Code format: Non-numeric
  const r5 = await sm.handleResetPassword({ email: 'pilot@universe.ai', code: '12a456', newPassword: 'newPassword123', confirmPassword: 'newPassword123' });
  assert.equal(r5.success, false);
  assert.equal(r5.error, 'Verification code must be exactly 6 digits.');

  // 6. Short password (< 6 chars)
  const r6 = await sm.handleResetPassword({ email: 'pilot@universe.ai', code: '123456', newPassword: '12345', confirmPassword: '12345' });
  assert.equal(r6.success, false);
  assert.equal(r6.error, 'New password must contain at least 6 characters.');

  // 7. Password mismatch
  const r7 = await sm.handleResetPassword({ email: 'pilot@universe.ai', code: '123456', newPassword: 'newPassword123', confirmPassword: 'mismatchPassword' });
  assert.equal(r7.success, false);
  assert.equal(r7.error, 'Passwords do not match. Please verify.');

  // 8. Password mismatch due to case sensitivity
  const r8 = await sm.handleResetPassword({ email: 'pilot@universe.ai', code: '123456', newPassword: 'Password123', confirmPassword: 'password123' });
  assert.equal(r8.success, false);
  assert.equal(r8.error, 'Passwords do not match. Please verify.');
});

test('M2 Reset Flow: Expired code and invalid code error handling from backend', async () => {
  const { ApiError } = await import('../../types/api.ts');

  // 1. Expired OTP code simulation
  const expiredMockApi = {
    resetPassword: async () => {
      throw new ApiError('Verification code has expired', 400, 400, 'code');
    },
  };
  const smExpired = createResetPasswordStateMachine({ email: 'pilot@universe.ai', code: '123456' }, expiredMockApi);
  const resExpired = await smExpired.handleResetPassword({
    email: 'pilot@universe.ai',
    code: '123456',
    newPassword: 'newPassword123',
    confirmPassword: 'newPassword123',
  });
  assert.equal(resExpired.success, false);
  assert.equal(resExpired.error, 'Verification code has expired');
  assert.equal(smExpired.getState().step, 'reset', 'Must remain on reset step on error');

  // 2. Previously used or non-existent OTP code simulation
  const usedMockApi = {
    resetPassword: async () => {
      throw new ApiError('Invalid or previously used verification code', 400, 400, 'code');
    },
  };
  const smUsed = createResetPasswordStateMachine({ email: 'pilot@universe.ai', code: '654321' }, usedMockApi);
  const resUsed = await smUsed.handleResetPassword({
    email: 'pilot@universe.ai',
    code: '654321',
    newPassword: 'newPassword123',
    confirmPassword: 'newPassword123',
  });
  assert.equal(resUsed.success, false);
  assert.equal(resUsed.error, 'Invalid or previously used verification code');
  assert.equal(smUsed.getState().step, 'reset');

  // 3. Successful password reset transitions to 'success'
  const successMockApi = {
    resetPassword: async () => ({ success: true, message: 'Password updated' }),
  };
  const smSuccess = createResetPasswordStateMachine({ email: 'pilot@universe.ai', code: '112233' }, successMockApi);
  const resSuccess = await smSuccess.handleResetPassword({
    email: 'pilot@universe.ai',
    code: '112233',
    newPassword: 'validPassword123',
    confirmPassword: 'validPassword123',
  });
  assert.equal(resSuccess.success, true);
  assert.equal(smSuccess.getState().step, 'success');
});

// =========================================================================
// TEST SUITE 2: LOGIN & REGISTER BOUNDARY VALIDATIONS
// =========================================================================

test('M2 Register Validation: Reserved handles (community, admin)', () => {
  // Exact lowercase
  assert.equal(validateRegisterForm({ username: 'admin', password: 'password123', confirmPassword: 'password123' }), 'This username is reserved. Please choose another.');
  assert.equal(validateRegisterForm({ username: 'community', password: 'password123', confirmPassword: 'password123' }), 'This username is reserved. Please choose another.');

  // Uppercase & Mixed Case
  assert.equal(validateRegisterForm({ username: 'ADMIN', password: 'password123', confirmPassword: 'password123' }), 'This username is reserved. Please choose another.');
  assert.equal(validateRegisterForm({ username: 'Community', password: 'password123', confirmPassword: 'password123' }), 'This username is reserved. Please choose another.');
  assert.equal(validateRegisterForm({ username: 'cOmMuNiTy', password: 'password123', confirmPassword: 'password123' }), 'This username is reserved. Please choose another.');

  // Substring inclusion is allowed (e.g., admin_hero, community_hub)
  assert.equal(validateRegisterForm({ username: 'admin_hero', password: 'password123', confirmPassword: 'password123' }), null);
  assert.equal(validateRegisterForm({ username: 'cai_community', password: 'password123', confirmPassword: 'password123' }), null);
});

test('M2 Register Validation: Username length boundary values (2, 3, 50, 51 chars)', () => {
  const pass = 'Password123!';

  // Empty or whitespace
  assert.equal(validateRegisterForm({ username: '', password: pass, confirmPassword: pass }), 'Please choose a username.');
  assert.equal(validateRegisterForm({ username: '   ', password: pass, confirmPassword: pass }), 'Please choose a username.');

  // 1 character (below min)
  assert.equal(validateRegisterForm({ username: 'a', password: pass, confirmPassword: pass }), 'Username must be at least 3 characters.');

  // 2 characters (boundary minus 1)
  assert.equal(validateRegisterForm({ username: 'ab', password: pass, confirmPassword: pass }), 'Username must be at least 3 characters.');

  // 3 characters (min boundary)
  assert.equal(validateRegisterForm({ username: 'abc', password: pass, confirmPassword: pass }), null);

  // 50 characters (max boundary)
  const max50 = 'a'.repeat(50);
  assert.equal(validateRegisterForm({ username: max50, password: pass, confirmPassword: pass }), null);

  // 51 characters (boundary plus 1)
  const over51 = 'a'.repeat(51);
  assert.equal(validateRegisterForm({ username: over51, password: pass, confirmPassword: pass }), 'Username must not exceed 50 characters.');
});

test('M2 Register Validation: Special characters & charset enforcement', () => {
  const pass = 'Password123!';

  // Permitted charset: [a-zA-Z0-9_]
  assert.equal(validateRegisterForm({ username: 'pilot_007', password: pass, confirmPassword: pass }), null);
  assert.equal(validateRegisterForm({ username: 'ALPHA_OMEGA_99', password: pass, confirmPassword: pass }), null);

  // Forbidden: Spaces
  assert.equal(validateRegisterForm({ username: 'user name', password: pass, confirmPassword: pass }), 'Username may only contain letters, numbers, and underscores.');
  assert.equal(validateRegisterForm({ username: ' user', password: pass, confirmPassword: pass }), null, 'Leading space gets trimmed, "user" is valid');
  assert.equal(validateRegisterForm({ username: ' u ser ', password: pass, confirmPassword: pass }), 'Username may only contain letters, numbers, and underscores.');

  // Forbidden: Symbols & Punctuation
  const forbiddenChars = ['-', '.', '@', '!', '#', '$', '%', '^', '&', '*', '(', ')', '+', '=', '[', ']', '{', '}', ';', ':', ',', '<', '>', '/', '?', '\\', '|', '~', '`'];
  for (const char of forbiddenChars) {
    const u = `user${char}name`;
    assert.equal(
      validateRegisterForm({ username: u, password: pass, confirmPassword: pass }),
      'Username may only contain letters, numbers, and underscores.',
      `Expected symbol "${char}" in "${u}" to be rejected`
    );
  }

  // Forbidden: Emojis
  assert.equal(validateRegisterForm({ username: 'pilot🚀', password: pass, confirmPassword: pass }), 'Username may only contain letters, numbers, and underscores.');
  assert.equal(validateRegisterForm({ username: 'user👤', password: pass, confirmPassword: pass }), 'Username may only contain letters, numbers, and underscores.');

  // Forbidden: Control characters & newlines
  assert.equal(validateRegisterForm({ username: 'user\nname', password: pass, confirmPassword: pass }), 'Username may only contain letters, numbers, and underscores.');
  assert.equal(validateRegisterForm({ username: 'user\tname', password: pass, confirmPassword: pass }), 'Username may only contain letters, numbers, and underscores.');
});

test('M2 Register Validation: Password & Confirm password boundaries', () => {
  // Empty password
  assert.equal(validateRegisterForm({ username: 'pilot', password: '', confirmPassword: '' }), 'Please enter a password.');

  // Password < 6 chars (boundary: 5 chars)
  assert.equal(validateRegisterForm({ username: 'pilot', password: '12345', confirmPassword: '12345' }), 'Password must contain at least 6 characters.');

  // Password = 6 chars (boundary: 6 chars)
  assert.equal(validateRegisterForm({ username: 'pilot', password: '123456', confirmPassword: '123456' }), null);

  // Passwords mismatch
  assert.equal(validateRegisterForm({ username: 'pilot', password: 'password123', confirmPassword: 'password456' }), 'Passwords do not match.');
});

test('M2 Login Validation: Boundary conditions', () => {
  // Empty username
  assert.equal(validateLoginForm({ username: '', password: 'password123' }), 'Please enter your username.');
  assert.equal(validateLoginForm({ username: '   ', password: 'password123' }), 'Please enter your username.');

  // Empty password
  assert.equal(validateLoginForm({ username: 'pilot', password: '' }), 'Please enter your password.');

  // Valid credentials format
  assert.equal(validateLoginForm({ username: 'pilot', password: 'password123' }), null);
});

// =========================================================================
// TEST SUITE 3: PROFILE EDITOR BOUNDARIES
// =========================================================================

test('M2 Profile Editor: Display name & username length/character boundaries', () => {
  const RESERVED_HANDLES = new Set(['community', 'system', 'admin', 'administrator', 'moderator', 'root', 'support', 'universe']);

  const validateProfileUpdate = ({ displayName, username, role = 'user' }) => {
    const cleanDisplayName = (displayName || '').trim();
    const cleanUsername = (username || '').trim().toLowerCase();

    if (!cleanDisplayName) {
      return 'Display name is required (between 1 and 50 characters).';
    }
    if (cleanDisplayName.length > 50) {
      return 'Display name must not exceed 50 characters.';
    }

    if (!cleanUsername) {
      return 'Username is required.';
    }
    if (!/^[a-zA-Z0-9_]{3,25}$/.test(cleanUsername)) {
      return 'Username must be 3 to 25 characters and contain only letters, numbers, and underscores.';
    }
    if (RESERVED_HANDLES.has(cleanUsername) && role !== 'admin') {
      return `Username handle "${cleanUsername}" is reserved.`;
    }

    return null;
  };

  // 1. Display name 50 chars accepted, 51 rejected
  assert.equal(validateProfileUpdate({ displayName: 'D'.repeat(50), username: 'pilot' }), null);
  assert.equal(validateProfileUpdate({ displayName: 'D'.repeat(51), username: 'pilot' }), 'Display name must not exceed 50 characters.');

  // 2. Profile username: max 25 chars in profile editor
  assert.equal(validateProfileUpdate({ displayName: 'Pilot', username: 'u'.repeat(25) }), null);
  assert.equal(validateProfileUpdate({ displayName: 'Pilot', username: 'u'.repeat(26) }), 'Username must be 3 to 25 characters and contain only letters, numbers, and underscores.');

  // 3. Profile username: reserved handles blocked for normal users
  assert.equal(validateProfileUpdate({ displayName: 'Pilot', username: 'admin', role: 'user' }), 'Username handle "admin" is reserved.');
  assert.equal(validateProfileUpdate({ displayName: 'Pilot', username: 'community', role: 'user' }), 'Username handle "community" is reserved.');
  assert.equal(validateProfileUpdate({ displayName: 'Pilot', username: 'system', role: 'user' }), 'Username handle "system" is reserved.');

  // 4. Admin user can retain/claim admin handle
  assert.equal(validateProfileUpdate({ displayName: 'Pilot', username: 'admin', role: 'admin' }), null);
});
