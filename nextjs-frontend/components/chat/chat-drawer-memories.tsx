'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  BookOpen,
  Pin,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Loader2,
} from 'lucide-react';
import type { Character } from '@/types/character';
import type { ChatSession } from '@/types/chat';
import type { CharacterMemory } from '@/types/memory';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ChatDrawerMemoriesProps {
  isOpen: boolean;
  onClose: () => void;
  character: Character;
  session?: ChatSession | null;
  onRefreshSession?: () => void;
}

export function ChatDrawerMemories({
  isOpen,
  onClose,
  character,
  session,
  onRefreshSession,
}: ChatDrawerMemoriesProps) {
  const [activeTab, setActiveTab] = useState<'lore' | 'memories' | 'pins'>('memories');
  const [memories, setMemories] = useState<CharacterMemory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [addingMemory, setAddingMemory] = useState(false);

  const fetchMemories = useCallback(async () => {
    if (!character.id) return;
    setLoadingMemories(true);
    try {
      const res = await api.getMemories(character.id, session?.id);
      setMemories(Array.isArray(res?.memories) ? res.memories : []);
    } catch {
      setMemories([]);
    } finally {
      setLoadingMemories(false);
    }
  }, [character.id, session?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen, fetchMemories]);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;

    setAddingMemory(true);
    try {
      await api.addMemory(character.id, newMemoryText.trim());
      setNewMemoryText('');
      fetchMemories();
    } finally {
      setAddingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // ignore
    }
  };

  const handleUnpin = async (messageId: string) => {
    if (!session) return;
    try {
      await api.updateChatMessage(session.id, messageId, { isPinned: false });
      if (onRefreshSession) onRefreshSession();
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const pinnedMessages = (session?.messages || []).filter((m) => m.isPinned);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-hairline bg-rail backdrop-blur-2xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border-hairline p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" />
            <h2 className="font-display text-sm font-bold text-text-primary">
              Lore & Memory Notebook
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn h-7 w-7 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border-hairline px-4 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('memories')}
            className={cn(
              'border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
              activeTab === 'memories'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            )}
          >
            Memories ({memories.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pins')}
            className={cn(
              'border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
              activeTab === 'pins'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            )}
          >
            Pinned Turns ({pinnedMessages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lore')}
            className={cn(
              'border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
              activeTab === 'lore'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            )}
          >
            Canon Dossier
          </button>
        </div>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: MEMORIES */}
          {activeTab === 'memories' && (
            <div className="space-y-4">
              {/* Add Memory Form */}
              <form onSubmit={handleAddMemory} className="space-y-2">
                <label className="font-mono text-xs text-text-secondary">
                  Inject Narrative Anchor:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemoryText}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    placeholder="e.g. Promised to return to the clock tower at sunset"
                    className="flex-1 rounded-lg border border-border-hairline bg-input px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={addingMemory || !newMemoryText.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 shrink-0"
                  >
                    {addingMemory ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>Add</span>
                  </button>
                </div>
              </form>

              {/* Memory List */}
              {loadingMemories ? (
                <div className="flex items-center justify-center p-8 text-text-muted">
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                </div>
              ) : memories.length === 0 ? (
                <div className="rounded-xl border border-border-hairline bg-white/[0.02] p-6 text-center text-xs text-text-muted">
                  No memories recorded yet. As your conversation evolves or when you inject anchors above, memories will persist here.
                </div>
              ) : (
                <div className="space-y-2">
                  {memories.map((mem) => (
                    <div
                      key={mem.id}
                      className="group flex items-start justify-between gap-3 rounded-lg border border-border-hairline bg-white/[0.02] p-3 text-xs transition-colors hover:border-border-subtle"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-text-primary leading-relaxed break-words">
                          {mem.content}
                        </p>
                        <span className="font-mono text-[10px] text-text-muted block">
                          Source: {mem.source || 'auto-turn'}
                          {mem.evidence && <span className="block normal-case">From your message: “{mem.evidence}”</span>}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-rose-400 p-1 shrink-0 transition-opacity"
                        title="Delete memory"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PINNED TURNS */}
          {activeTab === 'pins' && (
            <div className="space-y-3">
              {pinnedMessages.length === 0 ? (
                <div className="rounded-xl border border-border-hairline bg-white/[0.02] p-6 text-center text-xs text-text-muted">
                  No pinned messages in this scene. Click the pin icon on any dialogue turn to permanently lock it into the character&apos;s working memory.
                </div>
              ) : (
                pinnedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="group rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-bold text-accent flex items-center gap-1">
                        <Pin className="h-3 w-3" />
                        {msg.role === 'model' ? character.name : 'User'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUnpin(msg.id)}
                        className="font-mono text-[10px] text-text-muted hover:text-rose-400"
                        title="Unpin turn"
                      >
                        Unpin
                      </button>
                    </div>
                    <p className="text-text-primary italic leading-relaxed">
                      &ldquo;{msg.content}&rdquo;
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: CANON LORE DOSSIER */}
          {activeTab === 'lore' && (
            <div className="space-y-4 text-xs">
              {character.personality && (
                <div className="rounded-lg border border-border-hairline bg-white/[0.02] p-3 space-y-1">
                  <span className="font-mono text-[10px] uppercase font-semibold text-text-muted">
                    Personality
                  </span>
                  <p className="text-text-primary leading-relaxed">
                    {character.personality}
                  </p>
                </div>
              )}

              {character.appearance && (
                <div className="rounded-lg border border-border-hairline bg-white/[0.02] p-3 space-y-1">
                  <span className="font-mono text-[10px] uppercase font-semibold text-text-muted">
                    Appearance
                  </span>
                  <p className="text-text-primary leading-relaxed">
                    {character.appearance}
                  </p>
                </div>
              )}

              {character.abilities && (
                <div className="rounded-lg border border-border-hairline bg-white/[0.02] p-3 space-y-1">
                  <span className="font-mono text-[10px] uppercase font-semibold text-text-muted">
                    Abilities & Skills
                  </span>
                  <p className="text-text-primary leading-relaxed">
                    {character.abilities}
                  </p>
                </div>
              )}

              {character.background && (
                <div className="rounded-lg border border-border-hairline bg-white/[0.02] p-3 space-y-1">
                  <span className="font-mono text-[10px] uppercase font-semibold text-text-muted">
                    Background History
                  </span>
                  <p className="text-text-primary leading-relaxed">
                    {character.background}
                  </p>
                </div>
              )}

              {(character.speaking_style || character.speakingStyle) && (
                <div className="rounded-lg border border-border-hairline bg-white/[0.02] p-3 space-y-1">
                  <span className="font-mono text-[10px] uppercase font-semibold text-text-muted">
                    Speaking Style
                  </span>
                  <p className="text-text-primary leading-relaxed">
                    {character.speaking_style || character.speakingStyle}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
