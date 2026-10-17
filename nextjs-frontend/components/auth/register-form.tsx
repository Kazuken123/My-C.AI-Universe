'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/types/api';
import { ArrowRight, AlertCircle, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RegisterFormProps {
  returnUrl?: string;
  onSwitchToSignIn?: () => void;
}

const STARTER_AVATARS = [
  { id: 'robin', label: 'Robin', url: '/assets/avatars/robin.png' },
  { id: 'frieren', label: 'Frieren', url: '/assets/avatars/frieren.png' },
  { id: 'gojo', label: 'Gojo', url: '/assets/avatars/satoru-gojo.png' },
  { id: 'kana', label: 'Kana', url: '/assets/avatars/kana-arima.png' },
];

export function RegisterForm({ returnUrl = '/', onSwitchToSignIn }: RegisterFormProps) {
  const router = useRouter();
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('/assets/avatars/robin.png');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    const trimmedUser = username.trim();

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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const trimmedUser = username.trim();
      await register({
        username: trimmedUser,
        password,
        displayName: displayName.trim() || trimmedUser,
        email: email.trim() || undefined,
        avatar: avatar || undefined,
      });

      router.push(returnUrl || '/');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message || 'Registration failed. Username may already exist.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Registration failed. Please check your information and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" autoComplete="on">
      {error && (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Starter Avatar Picker */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Starter Identity Avatar
        </label>
        <div className="flex items-center gap-2.5 pt-0.5">
          {STARTER_AVATARS.map((item) => {
            const isSelected = avatar === item.url;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAvatar(item.url)}
                className={cn(
                  'relative h-11 w-11 rounded-full overflow-hidden border-2 transition-all duration-200 cursor-pointer',
                  isSelected
                    ? 'border-accent scale-105 shadow-[0_0_12px_rgba(139,92,246,0.5)] ring-2 ring-accent/30'
                    : 'border-border-hairline opacity-65 hover:opacity-100 hover:scale-100'
                )}
                title={item.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.label} className="h-full w-full object-cover" />
                {isSelected && (
                  <div className="absolute inset-0 bg-accent/25 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-white stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Display Name Field */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="register-displayname"
          className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
        >
          Display Name
        </label>
        <input
          id="register-displayname"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Commander Shepard"
          maxLength={50}
          autoComplete="name"
          disabled={loading}
          className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
        />
        <span className="text-[10px] text-text-muted">
          The name characters will address you by in dialogue.
        </span>
      </div>

      {/* Email Field */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="register-email"
          className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
        >
          Email Address
        </label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. pilot@universe.ai"
          autoComplete="email"
          disabled={loading}
          className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
        />
        <span className="text-[10px] text-text-muted">
          Used for password reset codes and security verification.
        </span>
      </div>

      {/* Username Field */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="register-username"
          className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
        >
          Username
        </label>
        <input
          id="register-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. nova_pilot"
          required
          maxLength={50}
          autoComplete="username"
          disabled={loading}
          className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50 font-mono"
        />
        <span className="text-[10px] text-text-muted">
          3-50 characters. Letters, numbers, and underscores only.
        </span>
      </div>

      {/* Password Fields Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="register-password"
            className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
          >
            Password
          </label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 chars"
            required
            autoComplete="new-password"
            disabled={loading}
            className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="register-confirm-password"
            className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
          >
            Confirm
          </label>
          <input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            required
            autoComplete="new-password"
            disabled={loading}
            className="w-full h-11 px-4 rounded-xl bg-input border border-border-hairline text-text-primary placeholder:text-text-muted/60 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft focus:bg-input-focus transition-all duration-200 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-island w-full justify-between disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="font-semibold">
            {loading ? 'Creating Account...' : 'Create Account'}
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
      {onSwitchToSignIn && (
        <div className="text-center text-xs text-text-muted pt-1">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="font-semibold text-accent hover:underline hover:text-accent-hover transition-colors focus:outline-none cursor-pointer"
          >
            Sign in
          </button>
        </div>
      )}
    </form>
  );
}
