'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { useNavigationShortcuts } from '@/hooks/use-navigation-shortcuts';
import { cn } from '@/lib/utils';

const THEMES = ['higgsfield', 'vanguard', 'editorial', 'telemetry'];

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname?.startsWith('/auth') || pathname?.startsWith('/reset-password');

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('higgsfield');

  useEffect(() => {
    const savedCollapsed = localStorage.getItem('cai_sidebar_collapsed') === 'true';
    setIsCollapsed(savedCollapsed);

    const savedTheme = localStorage.getItem('cai_skill_theme') || 'higgsfield';
    const validTheme = THEMES.includes(savedTheme) ? savedTheme : 'higgsfield';
    setCurrentTheme(validTheme);
    document.documentElement.setAttribute('data-theme', validTheme);

    const handlePointerMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.double-bezel-shell') as HTMLElement | null;
      if (target) {
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        target.style.setProperty('--mouse-x', `${x}px`);
        target.style.setProperty('--mouse-y', `${y}px`);
      }
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('cai_sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleCycleTheme = () => {
    const nextIndex = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
    const nextTheme = THEMES[nextIndex];
    setCurrentTheme(nextTheme);
    localStorage.setItem('cai_skill_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  useNavigationShortcuts({
    onToggleSidebar: handleToggleCollapse,
  });

  // Dedicated full-screen layout for authentication & recovery routes
  if (isAuthRoute) {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center p-4 md:p-8 overflow-y-auto">
        {children}
      </div>
    );
  }

  return (
    <>
      <a href="#main-workspace" className="skip-link">Skip to workspace</a>

      {/* Top Mobile App Bar */}
      <header className="mobile-header" aria-label="Mobile Navigation Bar">
        <button
          className="mobile-menu-btn"
          id="mobileMenuBtn"
          type="button"
          aria-label="Open Navigation Menu"
          onClick={() => setIsMobileOpen(true)}
        >
          <i className="ph-light ph-list" />
        </button>
        <Link href="/" className="mobile-brand">
          <span className="brand-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.svg" alt="C.AI Universe" className="brand-mark-img" width={22} height={22} />
          </span>
          <span className="brand-title">C.AI Universe</span>
        </Link>
        <div className="mobile-header-actions">
          <button
            className="icon-btn mobile-theme-btn"
            id="mobileThemeBtn"
            type="button"
            aria-label="Cycle Theme"
            title="Theme"
            onClick={handleCycleTheme}
          >
            <i className="ph-light ph-sliders-horizontal" />
          </button>
        </div>
      </header>

      {/* Main Two-Column App Shell */}
      <div className="app-shell">
        <Sidebar
          isMobileOpen={isMobileOpen}
          onMobileClose={() => setIsMobileOpen(false)}
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
          currentTheme={currentTheme}
          onCycleTheme={handleCycleTheme}
        />

        <main className="main-workspace" id="main-workspace">
          {children}
        </main>
      </div>

      {/* Mobile Sidebar Backdrop */}
      <div
        className={cn('sidebar-backdrop', isMobileOpen && 'active')}
        id="sidebarBackdrop"
        aria-hidden="true"
        onClick={() => setIsMobileOpen(false)}
      />

      {/* Mobile Bottom Navigation Dock */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <Link href="/" className={cn('mobile-nav-tab', pathname === '/' && 'active')} data-page="discover">
          <i className="ph-light ph-compass" />
          <span>Discover</span>
        </Link>
        <Link href="/create" className={cn('mobile-nav-tab', pathname.startsWith('/create') && 'active')} data-page="create">
          <i className="ph-light ph-sparkle" />
          <span>Studio</span>
        </Link>
        <Link href="/chats" className={cn('mobile-nav-tab', pathname.startsWith('/chats') && 'active')} data-page="chats">
          <i className="ph-light ph-chats-circle" />
          <span>Threads</span>
        </Link>
        <Link href="/personas" className={cn('mobile-nav-tab', pathname.startsWith('/personas') && 'active')} data-page="personas">
          <i className="ph-light ph-identification-card" />
          <span>Personas</span>
        </Link>
        <button
          type="button"
          className="mobile-nav-tab"
          id="mobileNavMenuBtn"
          aria-label="Open Workspace Menu"
          onClick={() => setIsMobileOpen((prev) => !prev)}
        >
          <i className="ph-light ph-squares-four" />
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}

