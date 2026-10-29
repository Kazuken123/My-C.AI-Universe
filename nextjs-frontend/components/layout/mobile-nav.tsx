'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Sparkles, MessagesSquare, Contact2, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  onOpenMenu: () => void;
}

export function MobileNav({ onOpenMenu }: MobileNavProps) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Discover', href: '/', icon: Compass },
    { label: 'Studio', href: '/create', icon: Sparkles },
    { label: 'Chats', href: '/chats', icon: MessagesSquare },
    { label: 'Personas', href: '/personas', icon: Contact2 },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex h-[calc(56px+var(--safe-bottom))] items-center justify-around border-t border-border-hairline bg-canvas/95 px-2 pb-[var(--safe-bottom)] backdrop-blur-2xl lg:hidden"
      aria-label="Mobile Bottom Navigation"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-transform active:scale-90',
              isActive ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[10px] font-semibold text-text-muted transition-transform active:scale-90 hover:text-text-primary"
      >
        <LayoutGrid className="h-5 w-5" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
