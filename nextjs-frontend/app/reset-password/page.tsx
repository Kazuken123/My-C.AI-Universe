'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { ResetPasswordFlow } from '@/components/auth/reset-password-flow';
import { ArrowLeft } from 'lucide-react';

function ResetPasswordSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto animate-pulse flex flex-col gap-5">
      <div className="h-9 w-32 bg-white/5 rounded-full" />
      <div className="h-[420px] w-full rounded-2xl bg-white/5 border border-border-hairline" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-[480px] mx-auto flex flex-col gap-5 py-6 px-3 sm:px-0">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/auth"
          className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-white px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-border-hairline hover:border-white/20 transition-all duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Sign In</span>
        </Link>

        <Link href="/" className="inline-flex items-center gap-2.5 text-text-primary no-underline group">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-core font-mono text-xs font-extrabold text-accent group-hover:scale-105 transition-transform">
            C
          </div>
          <span className="font-display text-base font-extrabold tracking-tight">C.AI Universe</span>
        </Link>
      </div>

      {/* Reset Flow Card */}
      <DoubleBezel
        shellClassName="w-full"
        coreClassName="p-6 sm:p-8"
      >
        <Suspense fallback={<ResetPasswordSkeleton />}>
          <ResetPasswordFlow />
        </Suspense>
      </DoubleBezel>
    </div>
  );
}
