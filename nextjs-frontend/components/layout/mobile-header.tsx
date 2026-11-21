'use client';

import React from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';

interface MobileHeaderProps {
  onOpenMenu: () => void;
}

export function MobileHeader({ onOpenMenu }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-border-hairline bg-canvas/90 px-4 backdrop-blur-xl lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="icon-btn h-9 w-9"
        aria-label="Open Navigation Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Link href="/" className="flex items-center gap-2 text-text-primary no-underline">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-core font-mono text-xs font-bold text-accent">
          C
        </div>
        <span className="font-display text-sm font-bold tracking-tight">C.AI Universe</span>
      </Link>

      <div className="h-9 w-9" aria-hidden="true" />
    </header>
  );
}
