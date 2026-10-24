'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import type { DedupedChatSession } from '@/lib/chat-utils';

interface DynamicIslandProps {
  sessions: DedupedChatSession[];
  personaName: string;
  currentTheme: string;
  onCycleTheme: () => void;
  onToggleSidebar: () => void;
}

export function DynamicIsland({ sessions, personaName, currentTheme, onCycleTheme, onToggleSidebar }: DynamicIslandProps) {
  const { user, logout } = useAuth();
  return (
    <div className="universe-island" data-universe-island>
      <button className="island-trigger" type="button" aria-expanded="false" aria-controls="island-menu" aria-label="Open universe navigation">
        <span className="island-orb" aria-hidden="true" />
        <span>My universe</span><span className="island-trigger-hint" aria-hidden="true">✦</span>
      </button>
      <div className="island-menu" id="island-menu" hidden>
        <div className="island-menu-heading"><span>YOUR UNIVERSE</span><span>Make yourself at home.</span></div>
        <nav className="island-nav" aria-label="Universe navigation">
          <Link href="/" aria-current="page"><i className="ph-light ph-compass" />Discover</Link>
          <Link href="/create"><i className="ph-light ph-sparkle" />Studio</Link>
          <Link href="/chats"><i className="ph-light ph-chats-circle" />Threads</Link>
          <Link href="/personas"><i className="ph-light ph-identification-card" />Personas</Link>
        </nav>
        <Link className="island-new-story" href="/create"><i className="ph-light ph-plus" />Create a character<span aria-hidden="true">↗</span></Link>
        <div className="island-history">
          <div className="island-section-label">Active storylines <span>{sessions.length}</span></div>
          {user && sessions.length ? sessions.slice(0, 4).map(session => (
            <Link className="island-thread" key={session.characterId} href={`/chat/${encodeURIComponent(session.characterId)}?session=${encodeURIComponent(session.id)}`}>
              <span>{session.characterName}</span><span aria-hidden="true">↗</span>
            </Link>
          )) : <p>{user ? 'Your next story starts with a hello.' : 'Sign in to pick up your stories.'}</p>}
          {sessions.length > 4 && <Link className="island-thread" href="/chats">All threads →</Link>}
        </div>
        <div className="island-account">
          <Link href={user ? '/profile' : '/auth'}><i className="ph-light ph-user-circle" /><span>{user ? user.displayName || user.username : 'Sign in / Register'}</span></Link>
          {user && <button type="button" onClick={() => logout()} title="Sign out" aria-label="Sign out"><i className="ph-light ph-sign-out" /></button>}
        </div>
        <div className="island-tools">
          <Link href="/personas" title={`Active persona: ${personaName}`}><i className="ph-light ph-identification-card" /><span>{personaName}</span></Link>
          <Link href="/profile" title="Account settings" aria-label="Account settings"><i className="ph-light ph-gear" /></Link>
          <button type="button" onClick={onCycleTheme} aria-label={`Change theme, current: ${currentTheme}`} title="Change theme"><i className="ph-light ph-palette" /></button>
          <button type="button" onClick={onToggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar"><i className="ph-light ph-sidebar-simple" /></button>
          <button className="orbit-motion-toggle" data-motion-toggle type="button" aria-label="Pause animations" aria-pressed="true">Ⅱ</button>
        </div>
      </div>
    </div>
  );
}
