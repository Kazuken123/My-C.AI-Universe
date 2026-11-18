'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trash2, ArrowRight } from 'lucide-react';
import type { ChatSessionSummary } from '@/types/chat';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import { resolveAvatarUrl } from '@/lib/character-utils';
import { formatRelativeTime, removeSessionById } from '@/lib/chat-utils';
import { SavedChatsSkeleton } from './saved-chats-skeleton';

export function SavedChatsList() {
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAllSessions = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSessions(await api.getChatSessions());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) fetchAllSessions();
  }, [authLoading, user, fetchAllSessions]);

  const handleDeleteSession = async (sessionId: string) => {
    if (deletingId || !confirm('Permanently delete this saved chat?')) return;
    setDeleteError('');
    setDeletingId(sessionId);
    try {
      await api.deleteChatSession(sessionId);
      setSessions((prev) => removeSessionById(prev, sessionId));
    } catch {
      setDeleteError('Could not delete the chat. Try again.');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading) return <SavedChatsSkeleton />;
  if (!user) return (
    <div className="atlas-chat-state">
      <h2>Sign in to see your saved chats</h2>
      <Link href="/auth?return=%2Fchats" className="btn-secondary">Sign in</Link>
    </div>
  );
  if (loading) return <SavedChatsSkeleton />;

  if (error) return (
    <div className="atlas-chat-state" role="alert">
      <h2>Saved chats are unavailable</h2>
      <p>Check your connection and try again.</p>
      <button type="button" className="btn-secondary" onClick={fetchAllSessions}>Try again</button>
    </div>
  );

  if (!sessions.length) return (
    <div className="atlas-chat-state">
      <h2>No saved chats yet</h2>
      <p>Start a conversation to find it here.</p>
      <Link href="/" className="btn-secondary">Browse characters</Link>
    </div>
  );

  return (
    <div className="atlas-saved-list">
      {deleteError && <p role="alert">{deleteError}</p>}
      {sessions.map((session) => {
        const href = `/chat/${encodeURIComponent(session.characterId)}?session=${encodeURIComponent(session.id)}`;
        const preview = (session.lastMessage || 'Scene opened.').replace(/\*/g, '');
        return (
          <article key={session.id} className="atlas-saved-entry">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="atlas-saved-avatar" src={resolveAvatarUrl(session.characterAvatar, session.characterName)} alt="" />
            <div className="atlas-saved-text">
              <h2><Link href={href}>{session.title || session.characterName}</Link></h2>
              <p className="atlas-saved-meta">{session.characterName} · {session.messageCount ?? 0} messages · {formatRelativeTime(session.updatedAt)}</p>
              <p className="atlas-saved-preview">{preview}</p>
            </div>
            <div className="atlas-saved-actions">
              <Link href={href} className="btn-secondary btn-sm">Resume <ArrowRight size={15} aria-hidden="true" /></Link>
              <button type="button" className="icon-btn" onClick={() => handleDeleteSession(session.id)} aria-label="Delete chat" disabled={deletingId === session.id}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
