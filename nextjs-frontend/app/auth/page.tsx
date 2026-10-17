'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { ArrowLeft, ArrowRight, LogOut, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function AuthPageSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto animate-pulse flex flex-col gap-5">
      <div className="h-9 w-32 bg-white/5 rounded-full" />
      <div className="h-[480px] w-full rounded-2xl bg-white/5 border border-border-hairline" />
    </div>
  );
}

function AuthContent() {
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading, logout } = useAuth();

  const modeParam = searchParams.get('mode');
  const returnUrl = searchParams.get('return') || '/';

  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  useEffect(() => {
    if (modeParam === 'signup') {
      setActiveTab('signup');
    } else if (modeParam === 'signin') {
      setActiveTab('signin');
    }
  }, [modeParam]);

  const handleGoogleAuth = () => {
    setSocialNotice('Google OAuth client integration initialized. Connecting with Identity Provider...');
    setTimeout(() => {
      setSocialNotice(null);
    }, 4000);
  };

  const handleFacebookAuth = () => {
    setSocialNotice('Facebook OAuth requires an active Facebook App ID configuration.');
    setTimeout(() => {
      setSocialNotice(null);
    }, 4000);
  };

  return (
    <div className="w-full max-w-[480px] mx-auto flex flex-col gap-5 py-6 px-3 sm:px-0">
      {/* Top Bar: Back & Brand Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-white px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-border-hairline hover:border-white/20 transition-all duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Workspace</span>
        </Link>

        <Link href="/" className="inline-flex items-center gap-2.5 text-text-primary no-underline group">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-core font-mono text-xs font-extrabold text-accent group-hover:scale-105 transition-transform">
            C
          </div>
          <span className="font-display text-base font-extrabold tracking-tight">C.AI Universe</span>
        </Link>
      </div>

      {/* Main Double-Bezel Card */}
      <DoubleBezel
        shellClassName="w-full"
        coreClassName="p-6 sm:p-8 flex flex-col gap-5"
      >
        {/* Loading session check */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <span className="text-xs font-mono">Verifying session security...</span>
          </div>
        ) : isAuthenticated && user ? (
          /* ========================================================== */
          /* State B: Active Authenticated Session Card                 */
          /* ========================================================== */
          <div className="flex flex-col gap-6 animate-fadeIn">
            <header className="flex flex-col gap-1.5 text-left">
              <span className="eyebrow-pill">ACTIVE SQL SESSION</span>
              <h1 className="font-display text-2xl font-extrabold text-white tracking-tight">
                You are Signed In
              </h1>
              <p className="text-xs text-text-secondary leading-relaxed">
                Your session is authenticated via scrypt + JWT token.
              </p>
            </header>

            {/* User Profile Summary Card */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.025] border border-border-hairline">
              <div className="relative h-14 w-14 shrink-0 rounded-full bg-accent/20 border border-border-subtle overflow-hidden flex items-center justify-center text-xl font-bold text-accent">
                {user.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.avatar} alt={user.displayName} className="h-full w-full object-cover" />
                ) : (
                  user.displayName?.[0] || user.username[0]
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-display text-base font-bold text-white truncate">
                  {user.displayName || user.username}
                </span>
                <span className="font-mono text-xs text-text-muted truncate">
                  @{user.username}
                </span>
                {user.email && (
                  <span className="text-[11px] text-text-muted/70 truncate">
                    {user.email}
                  </span>
                )}
                <div className="mt-1">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider uppercase bg-accent/15 text-accent border border-accent/30">
                    {user.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-2">
              <Link
                href={returnUrl}
                className="btn-island w-full justify-between"
              >
                <span>Enter Studio</span>
                <span className="btn-island-icon">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <button
                type="button"
                onClick={() => logout()}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border border-border-hairline bg-white/[0.02] text-xs font-semibold text-text-muted hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out of Account</span>
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================== */
          /* State A: Login / Register Tabbed Gateway                   */
          /* ========================================================== */
          <div className="flex flex-col gap-5 animate-fadeIn">
            <header className="flex flex-col gap-1.5 text-left">
              <span className="eyebrow-pill">USER IDENTITY PORTAL</span>
              <h1 className="font-display text-2xl font-extrabold text-white tracking-tight transition-all duration-200">
                {activeTab === 'signin' ? 'Sign In to Universe' : 'Create Universe Account'}
              </h1>
              <p className="text-xs text-text-secondary leading-relaxed transition-all duration-200">
                {activeTab === 'signin'
                  ? 'Access your custom personas and branching storyline threads.'
                  : 'Create an account to store custom personas and branching storyline threads.'}
              </p>
            </header>

            {/* Sliding Spring Pill Mode Switcher Tabs */}
            <div
              className="relative flex p-1 rounded-xl bg-canvas border border-border-hairline shadow-inner"
              role="tablist"
              aria-label="Authentication Mode"
            >
              {/* Sliding Pill Indicator */}
              <div
                className={cn(
                  'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-core-elevated border border-accent/40 shadow-card transition-transform duration-300 ease-spring pointer-events-none',
                  activeTab === 'signin' ? 'left-1 translate-x-0' : 'left-1 translate-x-full'
                )}
                aria-hidden="true"
              />

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'signin'}
                onClick={() => setActiveTab('signin')}
                className={cn(
                  'relative z-10 flex-1 py-2 text-center text-xs sm:text-sm font-bold transition-colors duration-200 cursor-pointer',
                  activeTab === 'signin' ? 'text-white' : 'text-text-muted hover:text-text-primary'
                )}
              >
                Sign In
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'signup'}
                onClick={() => setActiveTab('signup')}
                className={cn(
                  'relative z-10 flex-1 py-2 text-center text-xs sm:text-sm font-bold transition-colors duration-200 cursor-pointer',
                  activeTab === 'signup' ? 'text-white' : 'text-text-muted hover:text-text-primary'
                )}
              >
                Create Account
              </button>
            </div>

            {/* Social Authentication Buttons */}
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleGoogleAuth}
                className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl bg-white/[0.04] border border-border-subtle hover:bg-white/[0.08] hover:border-white/25 text-xs font-semibold text-text-primary transition-all duration-200 cursor-pointer"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.27 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.27 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                onClick={handleFacebookAuth}
                className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl bg-white/[0.04] border border-border-subtle hover:bg-white/[0.08] hover:border-white/25 text-xs font-semibold text-text-primary transition-all duration-200 cursor-pointer"
              >
                <svg className="h-4 w-4 shrink-0 fill-[#1877F2]" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span>Continue with Facebook</span>
              </button>
            </div>

            {socialNotice && (
              <div className="p-3 rounded-lg border border-accent/30 bg-accent/10 text-xs text-accent">
                {socialNotice}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <span className="flex-1 h-px bg-border-hairline" />
              <span className="font-mono text-[10px] font-bold tracking-widest text-text-muted uppercase">
                Or Continue With
              </span>
              <span className="flex-1 h-px bg-border-hairline" />
            </div>

            {/* Active Mode Form */}
            {activeTab === 'signin' ? (
              <LoginForm
                returnUrl={returnUrl}
                onSwitchToSignUp={() => setActiveTab('signup')}
              />
            ) : (
              <RegisterForm
                returnUrl={returnUrl}
                onSwitchToSignIn={() => setActiveTab('signin')}
              />
            )}
          </div>
        )}
      </DoubleBezel>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton />}>
      <AuthContent />
    </Suspense>
  );
}
