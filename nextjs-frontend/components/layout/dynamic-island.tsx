'use client';

import Link from 'next/link';
import { ArrowUpRight, ChevronDown, Compass, MessageCircle, Palette, PanelLeft, Plus, Settings, Sparkles, UserRound, LogOut } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { stripStreamingRelState, type DedupedChatSession } from '@/lib/chat-utils';

interface DynamicIslandProps {
  sessions: DedupedChatSession[];
  personaName: string;
  currentTheme: string;
  onCycleTheme: () => void;
  onToggleSidebar: () => void;
}

export function DynamicIsland({ sessions, personaName, currentTheme, onCycleTheme, onToggleSidebar }: DynamicIslandProps) {
  const { user, logout } = useAuth();
  const recent = user ? sessions[0] : undefined;
  const chatHref = (session: DedupedChatSession) => `/chat/${encodeURIComponent(session.characterId)}?session=${encodeURIComponent(session.id)}`;
  return (
    <div className="universe-island" data-universe-island>
      <div className="island-capsule">
        <Link className="island-context" href={recent ? chatHref(recent) : '#character-roster'} aria-label={recent ? `Resume story with ${recent.characterName}` : 'Discover characters'}>
          <span className="island-orb" aria-hidden="true" />
          <span className="island-context-copy"><strong>{recent ? recent.characterName : 'Discover'}</strong><small>{recent ? 'Resume your story' : 'Find your next story'}</small></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
        <button className="island-trigger" type="button" aria-expanded="false" aria-controls="island-menu" aria-label="Open universe navigation" title="Hover to explore. Click to keep open.">
          <span className="island-trigger-label">Explore</span><ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="island-menu" id="island-menu" hidden>
        <div className="island-menu-heading"><span>YOUR UNIVERSE</span><span>Jump back in.</span></div>
        <nav className="island-nav" aria-label="Universe navigation">
          <Link href="/" aria-current="page"><Compass aria-hidden="true" /><span>Discover<small>Find a character</small></span></Link>
          <Link href="/create"><Sparkles aria-hidden="true" /><span>Studio<small>Create a character</small></span></Link>
          <Link href="/chats"><MessageCircle aria-hidden="true" /><span>Threads<small>Your conversations</small></span></Link>
          <Link href="/personas"><UserRound aria-hidden="true" /><span>Personas<small>Choose your identity</small></span></Link>
        </nav>
        <div className="island-history">
          <div className="island-section-label"><span>Pick up where you left off</span>{!!sessions.length && <Link href="/chats">View all <ArrowUpRight size={12} aria-hidden="true" /></Link>}</div>
          {recent ? sessions.slice(0, 3).map(session => (
            <Link className="island-thread" key={session.characterId} href={chatHref(session)}>
              <span className="island-thread-avatar" aria-hidden="true">{session.characterName.slice(0, 2).toUpperCase()}</span>
              <span className="island-thread-copy"><strong>{session.characterName}</strong><small>{stripStreamingRelState(session.lastMessage).replace(/\*/g, '') || 'Continue your story'}</small></span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          )) : <Link className="island-empty" href={user ? '#character-roster' : '/auth'}><MessageCircle size={20} aria-hidden="true" /><span><strong>{user ? 'Your first story is waiting' : 'Your stories, right here'}</strong><small>{user ? 'Find a character to start a conversation.' : 'Sign in to save and resume conversations.'}</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link>}
        </div>
        <div className="island-account">
          <Link href={user ? '/profile' : '/auth'}><UserRound size={18} aria-hidden="true" /><span>{user ? user.displayName || user.username : 'Sign in / Register'}</span></Link>
          {user && <button type="button" onClick={() => logout()} title="Sign out" aria-label="Sign out"><LogOut size={18} aria-hidden="true" /></button>}
        </div>
        <div className="island-tools">
          <Link href="/personas" title={`Active persona: ${personaName}`}><span className="island-persona-dot" aria-hidden="true" /><span>{personaName}</span></Link>
          <Link href="/profile" title="Account settings" aria-label="Account settings"><Settings size={17} aria-hidden="true" /></Link>
          <button type="button" onClick={onCycleTheme} aria-label={`Change theme, current: ${currentTheme}`} title="Change theme"><Palette size={17} aria-hidden="true" /></button>
          <button type="button" onClick={onToggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar"><PanelLeft size={17} aria-hidden="true" /></button>
          <button className="orbit-motion-toggle" data-motion-toggle type="button" aria-label="Pause animations" aria-pressed="true" />
        </div>
        <Link className="island-new-story" href="/create"><Plus size={16} aria-hidden="true" /><span>Create a character</span><ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
    </div>
  );
}
