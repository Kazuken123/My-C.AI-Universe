'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, AlertCircle, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { AvatarUploader } from '@/components/profile/avatar-uploader';
import { ApiError } from '@/types/api';
import { cn } from '@/lib/utils';
import type { User } from '@/types/auth';

export interface ProfileEditorProps {
  user: User;
  onProfileUpdated?: (user: User) => void;
}

const RESERVED_HANDLES = new Set([
  'community',
  'system',
  'admin',
  'administrator',
  'moderator',
  'root',
  'support',
  'universe',
]);

export function ProfileEditor({ user, onProfileUpdated }: ProfileEditorProps) {
  const { updateProfile, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [username, setUsername] = useState(user.username || '');
  const [avatar, setAvatar] = useState(user.avatar || '👤');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Synchronize when user prop updates
  useEffect(() => {
    setDisplayName(user.displayName || '');
    setUsername(user.username || '');
    setAvatar(user.avatar || '👤');
  }, [user.id, user.displayName, user.username, user.avatar]);

  // Track if changes have been made
  const isDirty =
    displayName.trim() !== (user.displayName || '').trim() ||
    username.trim().toLowerCase() !== (user.username || '').trim().toLowerCase() ||
    avatar.trim() !== (user.avatar || '👤').trim();

  const handleReset = () => {
    setDisplayName(user.displayName || '');
    setUsername(user.username || '');
    setAvatar(user.avatar || '👤');
    setErrorMessage(null);
    setErrorField(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorField(null);
    setSuccessMessage(null);

    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanAvatar = avatar.trim() || '👤';

    // 1. Validate Display Name
    if (!cleanDisplayName) {
      setErrorMessage('Display name is required (between 1 and 50 characters).');
      setErrorField('displayName');
      return;
    }
    if (cleanDisplayName.length > 50) {
      setErrorMessage('Display name must not exceed 50 characters.');
      setErrorField('displayName');
      return;
    }

    // 2. Validate Username
    if (!cleanUsername) {
      setErrorMessage('Username is required.');
      setErrorField('username');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,25}$/.test(cleanUsername)) {
      setErrorMessage('Username must be 3 to 25 characters and contain only letters, numbers, and underscores.');
      setErrorField('username');
      return;
    }
    if (RESERVED_HANDLES.has(cleanUsername) && user.role !== 'admin') {
      setErrorMessage(`Username handle "${cleanUsername}" is reserved.`);
      setErrorField('username');
      return;
    }

    setIsSubmitting(true);

    try {
      const updatedUser = await updateProfile({
        displayName: cleanDisplayName,
        username: cleanUsername,
        avatar: cleanAvatar,
      });

      await refreshUser();
      setSuccessMessage('Profile details updated successfully!');
      if (onProfileUpdated) {
        onProfileUpdated(updatedUser);
      }

      // Auto clear success notice after 4 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        setErrorField(err.field || null);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to update profile details');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DoubleBezel coreClassName="p-6 md:p-8 space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-hairline pb-4">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-text-primary">
            Edit Account Identity
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Configure your public callsign, unique handle, and avatar icon
          </p>
        </div>
        {isDirty && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent">
            <Sparkles className="h-3 w-3" />
            <span>Unsaved Changes</span>
          </span>
        )}
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200 animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar Uploader Section */}
        <div className="space-y-2">
          <label className="block font-sans text-xs font-semibold text-text-primary">
            Account Avatar &amp; Portrait
          </label>
          <AvatarUploader
            currentAvatar={avatar}
            onAvatarChange={(newUrl) => setAvatar(newUrl)}
            disabled={isSubmitting}
          />
        </div>

        {/* Display Name Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="displayName" className="font-sans text-xs font-semibold text-text-primary">
              Display Name <span className="text-rose-400">*</span>
            </label>
            <span className="font-mono text-[11px] text-text-muted">{displayName.length}/50</span>
          </div>
          <input
            id="displayName"
            type="text"
            required
            maxLength={50}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g. Commander Shepard"
            className={cn(
              'w-full rounded-xl border bg-input px-3.5 py-2.5 font-sans text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:outline-none focus:ring-1',
              errorField === 'displayName'
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                : 'border-border-hairline focus:border-accent focus:ring-accent'
            )}
          />
          <p className="text-[11px] text-text-muted">
            The name AI roleplay characters and world pilots will address you by in dialogue.
          </p>
        </div>

        {/* Username Handle Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="username" className="font-sans text-xs font-semibold text-text-primary">
              Username Handle <span className="text-rose-400">*</span>
            </label>
            <span className="font-mono text-[11px] text-text-muted">{username.length}/25</span>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 font-mono text-sm text-text-muted">
              @
            </span>
            <input
              id="username"
              type="text"
              required
              maxLength={25}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              disabled={isSubmitting}
              placeholder="e.g. vanguard_pilot"
              className={cn(
                'w-full rounded-xl border bg-input pl-8 pr-3.5 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:outline-none focus:ring-1',
                errorField === 'username'
                  ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-border-hairline focus:border-accent focus:ring-accent'
              )}
            />
          </div>
          <p className="text-[11px] text-text-muted">
            Unique handle identifier (3-25 alphanumeric characters and underscores only).
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-hairline">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-hairline px-4 py-2.5 text-xs font-semibold text-text-secondary hover:bg-white/5 active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Discard</span>
          </button>

          <button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className="btn-island py-2.5 px-5 text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <span>{isSubmitting ? 'Saving Changes...' : 'Save Profile Changes'}</span>
            <span className="btn-island-icon h-5 w-5">
              <UserCheck className="h-3 w-3" />
            </span>
          </button>
        </div>
      </form>
    </DoubleBezel>
  );
}
