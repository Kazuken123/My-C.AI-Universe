'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DynamicIsland } from './dynamic-island';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import { resolveAvatarUrl } from '@/lib/character-utils';
import { deduplicateSessionsByCharacter, DedupedChatSession } from '@/lib/chat-utils';

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentTheme: string;
  onCycleTheme: () => void;
}

export function Sidebar({
  isMobileOpen,
  onMobileClose,
  isCollapsed,
  onToggleCollapse,
  currentTheme,
  onCycleTheme,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<DedupedChatSession[]>([]);
  const [activePersona, setActivePersona] = useState<{ name: string; avatar: string }>({
    name: 'Traveler',
    avatar: 'TR',
  });

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setActivePersona({ name: 'Traveler', avatar: 'TR' });
      return;
    }
    let isCancelled = false;
    api.getChatSessions()
      .then((data) => {
        if (!isCancelled && Array.isArray(data)) {
          setSessions(deduplicateSessionsByCharacter(data));
        }
      })
      .catch(() => {
        if (!isCancelled) setSessions([]);
      });

    api.getPersonas()
      .then((data) => {
        if (!isCancelled && Array.isArray(data) && data.length > 0) {
          const def = data.find((p) => p.isDefault) || data[0];
          setActivePersona({
            name: def.name || 'Traveler',
            avatar: def.avatar || 'TR',
          });
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [user, pathname]);

  return (
    <>
    <aside
      className={cn('sidebar', isCollapsed && 'collapsed', isMobileOpen && 'mobile-open')}
      aria-label="Primary Navigation"
      id="primary-navigation"
    >
      {/* 1. Header: Brand Logo & Collapse Controls */}
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <Link href="/" className="brand-logo" id="brand-home-link" onClick={onMobileClose}>
            <span className="brand-mark" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.svg" alt="C.AI Universe" className="brand-mark-img" width={24} height={24} />
            </span>
            <div className="brand-text-wrap">
              <span className="brand-title">C.AI Universe</span>
              <span className="brand-version">ORBIT STUDIO</span>
            </div>
          </Link>
          <div className="sidebar-header-actions">
            <button
              className="icon-btn sidebar-collapse-btn"
              id="sidebarCollapseBtn"
              type="button"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
              aria-controls="primary-navigation"
              title={isCollapsed ? 'Expand Sidebar ([)' : 'Collapse Sidebar ([)'}
              onClick={onToggleCollapse}
            >
              <i className="ph-light ph-sidebar-simple" />
            </button>
            <button
              className="icon-btn mobile-sidebar-close"
              id="mobileSidebarClose"
              type="button"
              aria-label="Close Navigation Menu"
              onClick={onMobileClose}
            >
              <i className="ph-light ph-x" />
            </button>
          </div>
        </div>
        <div className="sidebar-header-sub">
          <span className="engine-telemetry" id="ai-status-badge" title="AI Engine Status: Gemini 3.5 Lite">
            <span className="status-dot" />
            <span className="status-label">Gemini 3.5 lite</span>
          </span>
        </div>
      </div>

      {/* 2. Primary CTA: New Character */}
      <div className="sidebar-cta-wrap">
        <Link href="/create" onClick={onMobileClose} className="btn-island btn-island-full" aria-label="Create a character">
          <span>New Character</span>
          <span className="btn-island-icon" aria-hidden="true">
            <i className="ph-light ph-arrow-up-right" />
          </span>
        </Link>
      </div>

      {/* 3. Navigation Rail */}
      <nav className="sidebar-nav" aria-label="Workspace Views">
        <Link
          href="/"
          onClick={onMobileClose}
          className={cn('nav-item', pathname === '/' && 'active')}
          title="Discover"
          aria-label="Discover"
          aria-current={pathname === '/' ? 'page' : undefined}
          data-page="discover"
        >
          <i className="ph-light ph-compass" />
          <span>Discover</span>
          <kbd className="nav-kbd">1</kbd>
        </Link>
        <Link
          href="/create"
          onClick={onMobileClose}
          className={cn('nav-item', pathname.startsWith('/create') && 'active')}
          title="Studio"
          aria-label="Studio"
          data-page="create"
        >
          <i className="ph-light ph-sparkle" />
          <span>Studio</span>
          <kbd className="nav-kbd">2</kbd>
        </Link>
        <Link
          href="/chats"
          onClick={onMobileClose}
          className={cn('nav-item', pathname.startsWith('/chats') && 'active')}
          title="Threads"
          aria-label="Threads"
          data-page="chats"
        >
          <i className="ph-light ph-chats-circle" />
          <span>Threads</span>
          <kbd className="nav-kbd">3</kbd>
        </Link>
        <Link
          href="/personas"
          onClick={onMobileClose}
          className={cn('nav-item', pathname.startsWith('/personas') && 'active')}
          title="Personas"
          aria-label="Personas"
          data-page="personas"
        >
          <i className="ph-light ph-identification-card" />
          <span>Personas</span>
          <kbd className="nav-kbd">4</kbd>
        </Link>
      </nav>

      <div className="sidebar-divider" />

      {/* 4. Active Storylines Section */}
      <div className="sidebar-section-header">
        <span>Active Storylines</span>
        <span className="mono-counter" id="sidebar-session-count">
          {sessions.length}
        </span>
      </div>

      <div className="recent-chats-list" id="sidebar-recent-chats">
        {!user ? (
          <div
            className="sidebar-empty-threads"
            style={{
              padding: '14px 12px',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              margin: '6px 0',
            }}
          >
            Sign in to access your chat history.
          </div>
        ) : sessions.length === 0 ? (
          <div
            className="sidebar-empty-threads"
            style={{
              padding: '14px 12px',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              margin: '6px 0',
            }}
          >
            No active storylines yet.
            <br />
            Select any character to begin!
          </div>
        ) : (
          sessions.slice(0, 8).map((s) => {
            const avatar = resolveAvatarUrl(s.characterAvatar, s.characterName);
            const isCurrentChat = pathname.startsWith(`/chat/${s.characterId}`);
            return (
              <Link
                key={s.characterId}
                href={`/chat/${encodeURIComponent(s.characterId)}?session=${encodeURIComponent(s.id)}`}
                onClick={onMobileClose}
                className={cn('recent-chat-item', isCurrentChat && 'active')}
              >
                <span className="recent-chat-avatar-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="recent-chat-avatar"
                    src={avatar}
                    alt={s.characterName}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(s.characterName)}`;
                    }}
                  />
                </span>
                <div className="recent-chat-meta">
                  <div className="recent-chat-name">{s.characterName}</div>
                  <div className="recent-chat-preview">
                    {(s.lastMessage || 'Scene active...').replace(/\*/g, '').slice(0, 42)}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* 5. Footer Area: Auth State & Persona / Theme Row */}
      <div className="sidebar-footer">
        <div className="sidebar-account-box" id="sidebar-account-section">
          {user ? (
            <div className="auth-user-view" id="authUserView">
              <Link
                href="/profile"
                onClick={onMobileClose}
                className="auth-user-meta-wrap"
                title="Edit Profile and Persona"
              >
                <span className="auth-user-avatar-tag" id="authUserAvatar">
                  {user.avatar && /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(user.avatar) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={user.avatar}
                      alt={user.displayName}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    user.avatar || user.displayName?.[0] || '👤'
                  )}
                </span>
                <div className="auth-user-text">
                  <div className="auth-user-name" id="authUserName">
                    {user.displayName || user.username}
                  </div>
                  <div className="auth-user-handle" id="authUserHandle">
                    @{user.username}
                  </div>
                </div>
              </Link>
              <button
                className="icon-btn auth-signout-btn"
                id="authSignOutBtn"
                type="button"
                title="Sign Out"
                aria-label="Sign out"
                onClick={() => logout()}
              >
                <i className="ph-light ph-sign-out" />
              </button>
            </div>
          ) : (
            <div className="auth-guest-view" id="authGuestView">
              <Link
                href="/auth"
                onClick={onMobileClose}
                className="btn-island btn-island-full auth-launch-btn"
                aria-label="Sign in or register"
              >
                <span>Sign In / Register</span>
                <span className="btn-island-icon" aria-hidden="true">
                  <i className="ph-light ph-user-circle" />
                </span>
              </Link>
            </div>
          )}
        </div>

        <div className="sidebar-footer-row">
          <Link
            href="/personas"
            onClick={onMobileClose}
            className="persona-pill"
            id="sidebar-persona-pill"
            title="Switch Active Roleplay Identity"
          >
            <span className="persona-monogram" id="sidebar-persona-emoji">
              { /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(activePersona.avatar) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activePersona.avatar} alt="" className="persona-avatar-image" />
              ) : (activePersona.avatar || activePersona.name.slice(0, 2)).slice(0, 3) }
            </span>
            <div className="persona-info">
              <div className="persona-name" id="sidebar-persona-name">
                {activePersona.name || 'Traveler'}
              </div>
              <div className="persona-sub">Active Identity</div>
            </div>
            <i className="ph-light ph-caret-up-down persona-caret" />
          </Link>

          <button
            className="icon-btn theme-toggle-btn"
            id="themeToggleBtn"
            aria-label="Change color theme"
            type="button"
            title={`Cycle Theme (Current: ${currentTheme})`}
            onClick={onCycleTheme}
          >
            <i className="ph-light ph-sliders-horizontal" id="themeToggleIcon" />
            <span className="theme-mode-label sr-only" id="themeModeLabel">
              {currentTheme}
            </span>
          </button>
        </div>
      </div>
    </aside>
    {pathname === '/' && <div className="island-dock"><DynamicIsland sessions={sessions} personaName={activePersona.name} currentTheme={currentTheme} onCycleTheme={onCycleTheme} onToggleSidebar={onToggleCollapse} /></div>}
    </>
  );
}
