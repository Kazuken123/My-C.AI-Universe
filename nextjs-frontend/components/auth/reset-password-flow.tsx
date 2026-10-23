'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiError } from '@/types/api';
import {
  Send,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  KeyRound,
  Loader2,
  Mail,
} from 'lucide-react';

export type ResetStep = 'request' | 'reset' | 'success';

export function ResetPasswordFlow() {
  const searchParams = useSearchParams();

  const paramEmail = searchParams.get('email') || '';
  const paramCode = searchParams.get('code') || '';

  // Determine initial step based on query parameters (deep-link support)
  const [step, setStep] = useState<ResetStep>(() => {
    if (paramEmail && paramCode) return 'reset';
    return 'request';
  });

  const [email, setEmail] = useState(paramEmail);
  const [code, setCode] = useState(paramCode);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devPreviewCode, setDevPreviewCode] = useState<string | null>(null);

  // Sync if query params change after mount
  useEffect(() => {
    if (paramEmail && paramCode) {
      setEmail(paramEmail);
      setCode(paramCode);
      setStep('reset');
    } else if (paramEmail && !email) {
      setEmail(paramEmail);
    }
  }, [paramEmail, paramCode, email]);

  // Step 1: Request 6-digit OTP verification code
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.forgotPassword({ email: trimmedEmail });
      setInfo(res.message || 'Verification code sent to your email.');

      if (res.previewCode) {
        setDevPreviewCode(res.previewCode);
        setCode(res.previewCode);
      }

      setStep('reset');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to send verification code. Please check your email.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send verification code. Please verify the email address.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit 6-digit code and new password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    if (!trimmedEmail || !trimmedCode) {
      setError('Please enter both your email and the 6-digit verification code.');
      return;
    }

    if (!/^\d{6}$/.test(trimmedCode)) {
      setError('Verification code must be exactly 6 digits.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('New password must contain at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword({
        email: trimmedEmail,
        code: trimmedCode,
        newPassword,
      });

      setStep('success');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message || 'Password reset failed. The code may be expired or incorrect.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Password reset failed. Please check the code and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Dynamic Header */}
      <header className="flex flex-col gap-1.5 text-left">
        <h1 className="font-display text-2xl font-extrabold text-white tracking-tight">
          {step === 'request' && 'Reset Password'}
          {step === 'reset' && 'Enter New Password'}
          {step === 'success' && 'Password Reset Successful'}
        </h1>
        <p className="text-xs text-text-secondary leading-relaxed">
          {step === 'request' &&
            'Receive a 6-digit verification code via email to securely reset your password.'}
          {step === 'reset' &&
            'Enter the 6-digit code sent to your email and set a new password for your account.'}
          {step === 'success' &&
            'Your account password has been updated. You can now sign in with your new credentials.'}
        </p>
      </header>

      {/* Error Alert */}
      {error && (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Info Alert */}
      {info && (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-accent animate-fadeIn"
          role="status"
        >
          <Mail className="h-4 w-4 shrink-0 text-accent" />
          <span>{info}</span>
        </div>
      )}

      {/* Developer Sandbox Preview Banner */}
      {devPreviewCode && step === 'reset' && (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300">
          <span className="font-mono">
            Dev Preview OTP:{' '}
            <strong className="tracking-widest text-white">{devPreviewCode}</strong>
          </span>
          <span className="text-[10px] uppercase font-bold text-emerald-400/80">Dev Mode</span>
        </div>
      )}

      {/* ========================================================== */}
      {/* Step 1: Request Verification Code Form                     */}
      {/* ========================================================== */}
      {step === 'request' && (
        <form onSubmit={handleRequestCode} className="flex flex-col gap-4 animate-fadeIn">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="req-email"
              className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
            >
              Account Email
            </label>
            <input
              id="req-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. pilot@universe.ai"
              required
              autoComplete="email"
              disabled={loading}
              className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
            />
            <span className="text-[10px] text-text-muted">
              A 6-digit security verification code will be sent, valid for 15 minutes.
            </span>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-island w-full justify-between disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="font-semibold">
                {loading ? 'Sending Code...' : 'Send Verification Code'}
              </span>
              <span className="btn-island-icon">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </span>
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('reset');
              }}
              className="text-xs text-text-muted hover:text-text-primary underline transition-colors cursor-pointer"
            >
              I already have a verification code
            </button>
          </div>
        </form>
      )}

      {/* ========================================================== */}
      {/* Step 2: Verify Code and Submit New Password Form          */}
      {/* ========================================================== */}
      {step === 'reset' && (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-3.5 animate-fadeIn">
          {/* Email */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-email"
              className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
            >
              Account Email
            </label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. pilot@universe.ai"
              required
              autoComplete="email"
              disabled={loading}
              className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
            />
          </div>

          {/* 6-Digit OTP Code */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-code"
              className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
            >
              6-Digit Verification Code
            </label>
            <input
              id="reset-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              required
              autoComplete="one-time-code"
              disabled={loading}
              className="w-full h-12 text-center font-mono font-bold text-lg tracking-[0.35em] rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/40 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
            />
            <span className="text-[10px] text-text-muted">
              Check your inbox or spam folder for the 6-digit security code.
            </span>
          </div>

          {/* New Password */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-newpassword"
              className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
            >
              New Password
            </label>
            <input
              id="reset-newpassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
              autoComplete="new-password"
              disabled={loading}
              className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
            />
          </div>

          {/* Confirm New Password */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-confirmpassword"
              className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
            >
              Confirm New Password
            </label>
            <input
              id="reset-confirmpassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              autoComplete="new-password"
              disabled={loading}
              className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
            />
          </div>

          {/* Submit Reset Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-island w-full justify-between disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="font-semibold">
                {loading ? 'Updating Password...' : 'Save New Password'}
              </span>
              <span className="btn-island-icon">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
              </span>
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('request');
              }}
              className="text-xs text-text-muted hover:text-text-primary underline transition-colors cursor-pointer"
            >
              Need a new code? Send again
            </button>
          </div>
        </form>
      )}

      {/* ========================================================== */}
      {/* Step 3: Success Confirmation Screen                        */}
      {/* ========================================================== */}
      {step === 'success' && (
        <div className="flex flex-col items-center text-center py-4 gap-4 animate-fadeIn">
          <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <div className="flex flex-col gap-1 max-w-sm">
            <h2 className="font-display text-lg font-bold text-white">
              Password Successfully Updated
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              Your password has been changed securely. You can now use your new password to access your custom personas and chat storylines.
            </p>
          </div>

          <div className="w-full pt-3">
            <Link
              href="/auth?mode=signin"
              className="btn-island w-full justify-between"
            >
              <span>Sign In Now</span>
              <span className="btn-island-icon">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
