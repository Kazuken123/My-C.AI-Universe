'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User as UserIcon,
  Shield,
  Calendar,
  Contact2,
  Sparkles,
  MessagesSquare,
  LogOut,
  KeyRound,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { ProfileEditor } from '@/components/profile/profile-editor';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading, logout, refreshUser } = useAuth();

  // Route protection: redirect guests to login with return path
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth?return=/profile');
    }
  }, [loading, user, router]);

  // Loading skeleton during authentication check
  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
          <UserIcon className="h-6 w-6 text-accent" />
        </div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted animate-pulse">
          Authenticating Profile Session...
        </p>
      </div>
    );
  }

  const isImageUrl = (val: string) => /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(val?.trim() || '');
  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : 'Recently';

  return (
    <div className="content-container space-y-8">
      {/* Breadcrumb Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 font-mono text-xs text-text-muted pb-1.5">
            <Link href="/" className="hover:text-text-primary transition-colors">Universe</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-secondary">Pilot Account</span>
          </nav>
          <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-text-primary">
            Account Profile &amp; Identity
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your public credentials, avatar portrait, and roleplay identity across storylines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/personas"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-hairline bg-core px-3.5 py-2 text-xs font-semibold text-text-primary hover:border-accent/60 hover:bg-white/5 active:scale-98 transition-all"
          >
            <Contact2 className="h-3.5 w-3.5 text-accent" />
            <span>Manage Personas</span>
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="icon-btn h-9 px-3 text-xs gap-1.5 text-rose-400 hover:text-rose-300 hover:border-rose-500/40 cursor-pointer"
            title="Sign out of active session"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Dossier Overview Card */}
        <div className="lg:col-span-4 space-y-6">
          <DoubleBezel coreClassName="p-6 space-y-6">
            {/* Dossier Avatar & Name Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-accent/40 bg-core p-1 shadow-accent-glow overflow-hidden">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-shell overflow-hidden">
                  {isImageUrl(user.avatar) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={user.avatar}
                      alt={user.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl select-none">{user.avatar || '👤'}</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-display text-lg font-bold text-text-primary">
                  {user.displayName}
                </h3>
                <p className="font-mono text-xs text-text-muted">
                  @{user.username}
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-xs font-semibold text-accent">
                <Shield className="h-3 w-3" />
                <span className="capitalize">{user.role === 'admin' ? 'Administrator' : 'Verified Explorer'}</span>
              </div>
            </div>

            {/* Account Metadata Breakdown */}
            <div className="border-t border-border-hairline pt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-text-muted">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Member Since</span>
                </span>
                <span className="font-mono text-text-secondary">{memberSince}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-text-muted">
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Authentication</span>
                </span>
                <span className="font-mono capitalize text-text-secondary">
                  Direct Credentials
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-text-muted">
                  <UserIcon className="h-3.5 w-3.5" />
                  <span>Account ID</span>
                </span>
                <span className="font-mono text-[11px] text-text-muted" title={user.id}>
                  {user.id ? `${user.id.slice(0, 10)}...` : 'N/A'}
                </span>
              </div>
            </div>

            {/* Quick Links Card Section */}
            <div className="border-t border-border-hairline pt-4 space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                Quick Shortcuts
              </span>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <Link
                  href="/personas"
                  className="flex items-center justify-between rounded-lg border border-border-hairline bg-shell p-2.5 text-xs font-semibold text-text-secondary hover:border-accent/40 hover:text-text-primary hover:bg-white/5 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Contact2 className="h-3.5 w-3.5 text-accent" />
                    <span>Roleplay Personas</span>
                  </span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>

                <Link
                  href="/create"
                  className="flex items-center justify-between rounded-lg border border-border-hairline bg-shell p-2.5 text-xs font-semibold text-text-secondary hover:border-accent/40 hover:text-text-primary hover:bg-white/5 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <span>Character Studio</span>
                  </span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>

                <Link
                  href="/chats"
                  className="flex items-center justify-between rounded-lg border border-border-hairline bg-shell p-2.5 text-xs font-semibold text-text-secondary hover:border-accent/40 hover:text-text-primary hover:bg-white/5 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <MessagesSquare className="h-3.5 w-3.5 text-accent" />
                    <span>Active Storylines</span>
                  </span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
              </div>
            </div>
          </DoubleBezel>
        </div>

        {/* Right Column: Profile Editor Form */}
        <div className="lg:col-span-8">
          <ProfileEditor user={user} onProfileUpdated={refreshUser} />
        </div>
      </div>
    </div>
  );
}
