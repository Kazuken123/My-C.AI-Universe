'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Trash2,
  ArrowRight,
  Loader2,
  Calendar,
  Sparkles,
  Inbox,
} from 'lucide-react';
import type { ChatSessionSummary } from '@/types/chat';
import { api } from '@/lib/api';
import { resolveAvatarUrl } from '@/lib/character-utils';
import {
  formatRelativeTime,
  deduplicateSessionsByCharacter,
  removeSessionById,
} from '@/lib/chat-utils';
import { DoubleBezel } from '@/components/ui/double-bezel';

export function SavedChatsList() {
  const [rawSessions, setRawSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessions = useMemo(
    () => deduplicateSessionsByCharacter(rawSessions),
    [rawSessions]
  );

  const fetchAllSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getChatSessions();
      setRawSessions(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load chats';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllSessions();
  }, [fetchAllSessions]);

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      await api.deleteChatSession(sessionId);
      setRawSessions((prev) => removeSessionById(prev, sessionId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete chat';
      alert(msg);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-2xl border border-border-hairline bg-white/[0.02] p-5 animate-pulse space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/10" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-36 rounded bg-white/10" />
                <div className="h-3 w-20 rounded bg-white/5" />
              </div>
            </div>
            <div className="h-8 rounded bg-white/5" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <DoubleBezel coreClassName="p-8 text-center space-y-3">
        <p className="text-rose-400 text-sm font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchAllSessions}
          className="rounded-lg border border-border-hairline bg-white/5 px-4 py-2 text-xs font-semibold text-text-primary hover:bg-white/10"
        >
          Retry
        </button>
      </DoubleBezel>
    );
  }

  if (sessions.length === 0) {
    return (
      <DoubleBezel coreClassName="p-12 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-text-muted">
          <Inbox className="h-6 w-6" />
        </div>
        <h3 className="font-display text-lg font-bold text-text-primary">
          No Saved Storyline Chats
        </h3>
        <p className="text-sm text-text-muted max-w-sm mx-auto">
          You haven&apos;t started any narrative scenes yet. Pick an archetype from the directory to begin!
        </p>
        <div className="pt-2">
          <Link href="/" className="btn-island py-2 px-4 text-xs">
            <span>Browse Directory</span>
            <span className="btn-island-icon !h-5 !w-5">
              <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </DoubleBezel>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {sessions.map((sess) => {
        const preview = (sess.lastMessage || 'Scene active...').replace(/\*/g, '').slice(0, 110);
        const avatarUrl = resolveAvatarUrl(sess.characterAvatar, sess.characterName);

        return (
          <DoubleBezel
            key={sess.id}
            className="group transition-transform hover:-translate-y-1"
            coreClassName="p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start gap-3.5">
                <div className="relative h-12 w-12 shrink-0 rounded-2xl overflow-hidden border border-border-subtle bg-core-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl}
                    alt={sess.characterName}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-base text-text-primary truncate">
                    {sess.characterName}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
                    <span>{sess.messageCount} turns</span>
                    <span>&bull;</span>
                    <span>{formatRelativeTime(sess.updatedAt)}</span>
                  </div>
                </div>
              </div>

              {/* Last Message Snippet */}
              <p className="text-xs text-text-secondary line-clamp-2 italic leading-relaxed">
                &ldquo;{preview}&rdquo;
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border-hairline pt-3 mt-1">
              <span className="font-mono text-[10px] text-text-muted uppercase">
                Engine: {sess.provider || 'gemini'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, sess.id)}
                  className="icon-btn h-8 w-8 text-text-muted hover:text-rose-400"
                  title="Delete storyline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <Link
                  href={`/chat/${encodeURIComponent(sess.characterId)}?session=${encodeURIComponent(sess.id)}`}
                  className="btn-island py-1.5 px-3 text-xs"
                >
                  <span>Resume Scene</span>
                  <span className="btn-island-icon !h-5 !w-5">
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              </div>
            </div>
          </DoubleBezel>
        );
      })}
    </div>
  );
}
