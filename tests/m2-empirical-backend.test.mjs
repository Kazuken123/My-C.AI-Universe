import test from 'node:test';
import assert from 'node:assert/strict';
import { authService } from '../backend/services/auth.service.js';
import { getDatabase, closeDatabase } from '../backend/db/database.js';
import { ValidationError, AuthenticationError, NotFoundError } from '../backend/ai/errors.js';

test('Backend M2 Empirical: Register boundary validations (reserved handles, lengths, charsets)', async () => {
  const ts = Date.now();

  // 1. Reserved handles
  await assert.rejects(
    async () => authService.register({ username: 'admin', password: 'Password123!' }),
    (err) => err instanceof ValidationError && err.message.includes('reserved')
  );

  await assert.rejects(
    async () => authService.register({ username: 'community', password: 'Password123!' }),
    (err) => err instanceof ValidationError && err.message.includes('reserved')
  );

  await assert.rejects(
    async () => authService.register({ username: 'system', password: 'Password123!' }),
    (err) => err instanceof ValidationError && err.message.includes('reserved')
  );

  // 2. Short username (< 3 chars)
  await assert.rejects(
    async () => authService.register({ username: 'ab', password: 'Password123!' }),
    (err) => err instanceof ValidationError
  );

  // 3. Long username (> 50 chars)
  await assert.rejects(
    async () => authService.register({ username: 'u'.repeat(51), password: 'Password123!' }),
    (err) => err instanceof ValidationError
  );

  // 4. Special characters in username
  await assert.rejects(
    async () => authService.register({ username: 'pilot@user', password: 'Password123!' }),
    (err) => err instanceof ValidationError
  );

  await assert.rejects(
    async () => authService.register({ username: 'pilot user', password: 'Password123!' }),
    (err) => err instanceof ValidationError
  );

  // 5. Short password (< 6 chars)
  await assert.rejects(
    async () => authService.register({ username: `valid_${ts}`, password: '12345' }),
    (err) => err instanceof ValidationError && err.message.includes('at least 6 characters')
  );

  // 6. Valid user registration
  const validUsername = `challenger_${ts}`;
  const validEmail = `challenger_${ts}@universe.ai`;
  const regResult = await authService.register({
    username: validUsername,
    email: validEmail,
    password: 'InitialPassword123!',
    displayName: 'Milestone 2 Challenger'
  });

  assert.ok(regResult.token, 'Registration must yield session JWT');
  assert.equal(regResult.user.username, validUsername);
  assert.equal(regResult.user.email, validEmail);
});

test('Backend M2 Empirical: 3-step Password Reset State Machine & Lifecycle', async () => {
  const ts = Date.now();
  const testUsername = `reset_test_${ts}`;
  const testEmail = `reset_${ts}@universe.ai`;
  const initialPassword = 'InitialPassword123!';
  const updatedPassword = 'NewSecretPassword456!';

  // Step 0: Register account for password reset lifecycle
  const { user } = await authService.register({
    username: testUsername,
    email: testEmail,
    password: initialPassword,
    displayName: 'Reset Test Subject'
  });
  assert.ok(user.id);

  // --- Step 1: Request Password Reset ---
  // Non-existent email
  await assert.rejects(
    async () => authService.requestPasswordReset({ email: 'nonexistent_account@universe.ai' }),
    (err) => err instanceof NotFoundError
  );

  // Valid account request
  const requestRes = await authService.requestPasswordReset({ email: testEmail });
  assert.equal(requestRes.success, true);
  assert.ok(requestRes.previewCode, 'Dev/test environment must expose previewCode');
  assert.match(requestRes.previewCode, /^\d{6}$/, 'OTP must be exactly 6 digits');

  const validOtp = requestRes.previewCode;

  // --- Step 2: Verify Reset Code ---
  // A. Wrong 6-digit OTP code
  await assert.rejects(
    async () => authService.verifyResetCode({ email: testEmail, code: '000000' }),
    (err) => err instanceof ValidationError && err.message.includes('Invalid or previously used')
  );

  // B. Expired OTP code verification
  const expiredCode = '999888';
  const db = getDatabase();
  const pastExpiration = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
  await db.prepare(`
    INSERT INTO password_resets (id, email, code, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(`reset_exp_${ts}`, testEmail, expiredCode, pastExpiration, new Date().toISOString());

  await assert.rejects(
    async () => authService.verifyResetCode({ email: testEmail, code: expiredCode }),
    (err) => err instanceof ValidationError && err.message.includes('expired')
  );

  // C. Valid OTP code verification
  const verifyRes = await authService.verifyResetCode({ email: testEmail, code: validOtp });
  assert.equal(verifyRes.valid, true);

  // --- Step 3: Submit New Password ---
  // A. Short new password (< 6 chars)
  await assert.rejects(
    async () => authService.resetPassword({ email: testEmail, code: validOtp, newPassword: '12345' }),
    (err) => err instanceof ValidationError && err.message.includes('at least 6 characters')
  );

  // B. Valid reset submission
  const resetRes = await authService.resetPassword({
    email: testEmail,
    code: validOtp,
    newPassword: updatedPassword
  });
  assert.equal(resetRes.success, true);
  assert.ok(resetRes.message.includes('Password changed successfully'));

  // C. Replay attack defense: Re-using the same OTP code must fail
  await assert.rejects(
    async () => authService.resetPassword({ email: testEmail, code: validOtp, newPassword: 'AnotherPassword789!' }),
    (err) => err instanceof ValidationError && err.message.includes('Invalid or previously used')
  );

  // --- Post-Reset Authentication Verification ---
  // A. Old password must be rejected
  await assert.rejects(
    async () => authService.login({ username: testUsername, password: initialPassword }),
    (err) => err instanceof AuthenticationError && err.message.includes('Invalid username or password')
  );

  // B. New password must be accepted
  const newLoginRes = await authService.login({ username: testUsername, password: updatedPassword });
  assert.ok(newLoginRes.token, 'Login with updated password must issue valid JWT');
  assert.equal(newLoginRes.user.username, testUsername);
});

// Teardown database handle cleanly
test.after(async () => {
  await closeDatabase();
});
