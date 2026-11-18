'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  History,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  Calendar,
} from 'lucide-react';
import type { ChatSessionSummary } from '@/types/chat';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/chat-utils';
import { cn } from '@/lib/utils';

export interface ChatDrawerHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  characterId: string;
  activeSessionId?: string | null;
  actionError?: string;
  pending?: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

export function ChatDrawerHistory({
  isOpen,
  onClose,
  characterId,
  activeSessionId,
  actionError,
  pending = false,
  onSelectSession,
  onNewSession,
}: ChatDrawerHistoryProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    setFetchError(false);
    try {
      const data = await api.getChatSessions(characterId);
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen, fetchSessions]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      await api.deleteChatSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (sessionId === activeSessionId) {
        onNewSession();
      }
    } catch {
      // ignore
    }
  };


  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [isOpen]);

  return (
      <dialog
        ref={dialogRef}
        aria-labelledby="chat-history-title"
        onCancel={event => {
          event.preventDefault();
          onClose();
        }}
        className="atlas-chat-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-hairline p-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-accent" />
            <h2 id="chat-history-title" className="font-display text-sm font-bold text-text-primary">
              Narrative Chats
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="icon-btn h-7 w-7 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* New Thread CTA */}
        <div className="p-4 border-b border-border-hairline">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              onNewSession();
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            <span>Start Fresh Storyline</span>
          </button>
        </div>

        {actionError && <p className="atlas-chat-action-error" role="alert">{actionError}</p>}

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : fetchError ? (
            <div className="atlas-chat-state" role="alert">
              <p>Could not load chat history.</p>
              <button type="button" className="btn-secondary" onClick={fetchSessions}>Try again</button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-xl border border-border-hairline bg-white/[0.02] p-6 text-center text-xs text-text-muted">
              No previous chats recorded for this character yet.
            </div>
          ) : (
            sessions.map((sess) => {
              const isActive = sess.id === activeSessionId;
              const preview = (sess.lastMessage || 'Scene opened...').replace(/\*/g, '').slice(0, 90);

              return (
                <div
                  key={sess.id}
                  className={cn(
                    'group rounded-xl border p-3.5 transition-all text-xs space-y-2',
                    isActive
                      ? 'border-accent bg-accent/10 shadow-sm'
                      : 'border-border-hairline bg-white/[0.02] hover:border-border-subtle hover:bg-white/[0.04]'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="atlas-history-open font-display font-bold text-text-primary"
                      disabled={pending} aria-current={isActive ? 'true' : undefined} onClick={() => onSelectSession(sess.id)}>
                      {sess.title || 'Conversation'}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={(e) => handleDelete(e, sess.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-rose-400 p-0.5 transition-opacity"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="text-text-muted line-clamp-2 leading-relaxed">
                    &ldquo;{preview}&rdquo;
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-text-muted pt-1 border-t border-border-hairline">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      <span>{sess.messageCount} turns</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatRelativeTime(sess.updatedAt)}</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </dialog>
  );
}
