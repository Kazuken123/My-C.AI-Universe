'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/types/api';
import { ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

export interface LoginFormProps {
  returnUrl?: string;
  onSwitchToSignUp?: () => void;
}

export function LoginForm({ returnUrl = '/', onSwitchToSignUp }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Please enter your username.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      await login({
        username: trimmedUsername,
        password,
      });

      router.push(returnUrl || '/');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message || 'Invalid username or password.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" autoComplete="on">
      {error && (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Username Field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="login-username"
          className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
        >
          Username
        </label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. nova_pilot"
          required
          autoComplete="username"
          disabled={loading}
          className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
        />
      </div>

      {/* Password Field */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="login-password"
            className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
          >
            Password
          </label>
          <Link
            href="/reset-password"
            className="text-xs font-medium text-accent hover:text-accent-hover hover:underline transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 6 characters"
          required
          autoComplete="current-password"
          disabled={loading}
          className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-island w-full justify-between disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="font-semibold">
            {loading ? 'Signing In...' : 'Sign In'}
          </span>
          <span className="btn-island-icon">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </span>
        </button>
      </div>

      {/* Switcher Footer */}
      {onSwitchToSignUp && (
        <div className="text-center text-xs text-text-muted pt-1">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="font-semibold text-accent hover:underline hover:text-accent-hover transition-colors focus:outline-none cursor-pointer"
          >
            Create an account
          </button>
        </div>
      )}
    </form>
  );
}
