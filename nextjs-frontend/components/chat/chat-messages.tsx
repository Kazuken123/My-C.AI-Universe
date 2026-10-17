'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  Pin,
  Edit3,
  RotateCcw,
  Copy,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Radio,
  Check,
  CheckCircle2,
  RadioReceiver,
} from 'lucide-react';
import type { Character } from '@/types/character';
import type { ChatMessage } from '@/types/chat';
import { resolveAvatarUrl } from '@/lib/character-utils';
import { getInitials, stripStreamingRelState } from '@/lib/chat-utils';
import { cn } from '@/lib/utils';

export interface ChatMessagesProps {
  character: Character;
  messages: ChatMessage[];
  userPersonaName?: string;
  isStreaming: boolean;
  streamingBuffer: string;
  onSelectVariant: (messageId: string, index: number) => void;
  onRegenerate: (messageId: string) => void;
  onPinMessage: (messageId: string) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onRewindMessage: (messageId: string) => void;
  onSpeakText: (text: string) => void;
}

/**
 * Format markdown roleplay markers (*action*, **bold**) into safe React elements
 */
function FormattedRoleplayText({ text }: { text: string }) {
  const clean = stripStreamingRelState(text);
  if (!clean) return null;

  // Split lines
  const lines = clean.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed text-sm">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-2" />;

        // Format *italic* and **bold**
        const formatted = line
          .replace(/\*\*([^*]+)\*\*/g, '___BOLD_START___$1___BOLD_END___')
          .replace(/\*([^*]+)\*/g, '___ITALIC_START___$1___ITALIC_END___');

        const parts = formatted.split(/(___(?:BOLD|ITALIC)_(?:START|END)___)/);
        let inBold = false;
        let inItalic = false;

        return (
          <p key={idx} className="break-words">
            {parts.map((part, pIdx) => {
              if (part === '___BOLD_START___') {
                inBold = true;
                return null;
              }
              if (part === '___BOLD_END___') {
                inBold = false;
                return null;
              }
              if (part === '___ITALIC_START___') {
                inItalic = true;
                return null;
              }
              if (part === '___ITALIC_END___') {
                inItalic = false;
                return null;
              }

              if (inBold) return <strong key={pIdx} className="font-semibold text-text-primary">{part}</strong>;
              if (inItalic) return <em key={pIdx} className="italic text-text-secondary">{part}</em>;
              return <span key={pIdx}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function ChatMessages({
  character,
  messages,
  userPersonaName = 'Traveler',
  isStreaming,
  streamingBuffer,
  onSelectVariant,
  onRegenerate,
  onPinMessage,
  onEditMessage,
  onRewindMessage,
  onSpeakText,
}: ChatMessagesProps) {
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Smart auto-scroll: direct scroll on streaming tokens if near bottom; smooth scroll on new turn
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;

    if (isStreaming) {
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingBuffer, isStreaming]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const handleSaveEdit = (msgId: string) => {
    if (!editText.trim()) return;
    onEditMessage(msgId, editText.trim());
    setEditingId(null);
  };

  const avatarUrl = resolveAvatarUrl(character.avatar, character.name);
  const userInitials = getInitials(userPersonaName);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6"
    >
      {messages.length === 0 && !isStreaming && (
        <div className="flex min-h-[300px] flex-col items-center justify-center text-center p-8 space-y-3">
          <div className="h-16 w-16 rounded-2xl overflow-hidden border border-accent/40 bg-core-elevated shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
          </div>
          <h2 className="font-display text-lg font-bold text-text-primary">
            Initiate Scene with {character.name}
          </h2>
          <p className="text-xs text-text-muted max-w-sm">
            Send a message below or press Continue to advance the narrative.
          </p>
        </div>
      )}

      {messages.map((msg, index) => {
        const isUser = msg.role === 'user';
        const isLatest = index === messages.length - 1;
        const variants = msg.variants || [];
        const variantIndex = msg.selectedVariantIndex ?? 0;
        const displayContent =
          variants.length > 0 && variants[variantIndex]?.text
            ? variants[variantIndex].text
            : msg.content;

        if (isUser) {
          return (
            <div key={msg.id} className="flex justify-end gap-3 group">
              <div className="flex flex-col items-end max-w-xl space-y-1">
                <span className="font-mono text-[11px] text-text-muted px-1">
                  {userPersonaName}
                </span>

                {editingId === msg.id ? (
                  <div className="w-full space-y-2 rounded-2xl border border-accent/40 bg-user-bubble p-3">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-border-hairline bg-input p-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(msg.id)}
                        className="rounded bg-accent px-3 py-1 text-[11px] font-semibold text-white"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-2xl border border-user-bubble-border bg-user-bubble px-4 py-3 text-text-primary shadow-sm">
                    <FormattedRoleplayText text={displayContent} />
                  </div>
                )}

                {/* Turn Actions on Hover */}
                {editingId !== msg.id && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 pt-0.5 px-1 text-text-muted text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(msg)}
                      className="hover:text-text-primary flex items-center gap-1"
                      title="Edit message"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, displayContent)}
                      className="hover:text-text-primary flex items-center gap-1"
                      title="Copy text"
                    >
                      {copiedId === msg.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>Copy</span>
                    </button>
                  </div>
                )}
              </div>

              {/* User Monogram Avatar */}
              <div className="h-8 w-8 shrink-0 rounded-full border border-accent/30 bg-accent/20 flex items-center justify-center font-mono text-xs font-bold text-accent shadow-sm">
                {userInitials}
              </div>
            </div>
          );
        }

        // Model / Character Message
        return (
          <div key={msg.id} className="flex justify-start gap-3 group">
            {/* Character Avatar */}
            <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden border border-border-subtle bg-core-elevated shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
            </div>

            <div className="flex flex-col items-start max-w-xl space-y-1">
              <div className="flex items-center gap-2 px-1">
                <span className="font-display font-bold text-xs text-text-primary">
                  {character.name}
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-border-hairline bg-white/5 px-1 py-0.2 font-mono text-[9px] uppercase tracking-wider text-text-muted">
                  <Radio className="h-2 w-2 text-emerald-400" />
                  SOUL-ID
                </span>
                {msg.isPinned && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.2 font-mono text-[9px] text-accent">
                    <Pin className="h-2.5 w-2.5" />
                    Pinned
                  </span>
                )}
              </div>

              {editingId === msg.id ? (
                <div className="w-full space-y-2 rounded-2xl border border-accent/40 bg-ai-bubble p-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-border-hairline bg-input p-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(msg.id)}
                      className="rounded bg-accent px-3 py-1 text-[11px] font-semibold text-white"
                    >
                      Save Turn
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-2xl border border-ai-bubble-border bg-ai-bubble px-4 py-3 text-text-primary shadow-sm">
                  <FormattedRoleplayText text={displayContent} />
                </div>
              )}

              {/* Multi-take / Variant Switcher Bar (if variants exist) */}
              {variants.length > 1 && (
                <div className="flex items-center gap-2 px-1 text-xs text-text-muted">
                  <button
                    type="button"
                    disabled={variantIndex <= 0}
                    onClick={() => onSelectVariant(msg.id, variantIndex - 1)}
                    className="icon-btn h-5 w-5 disabled:opacity-30"
                    title="Previous Take"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span className="font-mono text-[10px]">
                    Take {variantIndex + 1} of {variants.length}
                  </span>
                  <button
                    type="button"
                    disabled={variantIndex >= variants.length - 1}
                    onClick={() => onSelectVariant(msg.id, variantIndex + 1)}
                    className="icon-btn h-5 w-5 disabled:opacity-30"
                    title="Next Take"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Turn Actions on Hover */}
              {editingId !== msg.id && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 pt-0.5 px-1 text-text-muted text-[11px]">
                  <button
                    type="button"
                    onClick={() => onPinMessage(msg.id)}
                    className={cn(
                      'hover:text-text-primary flex items-center gap-1',
                      msg.isPinned && 'text-accent'
                    )}
                    title={msg.isPinned ? 'Unpin from memory' : 'Pin to memory'}
                  >
                    <Pin className="h-3 w-3" />
                    <span>{msg.isPinned ? 'Pinned' : 'Pin'}</span>
                  </button>
                  <span>&bull;</span>
                  {isLatest && (
                    <>
                      <button
                        type="button"
                        onClick={() => onRegenerate(msg.id)}
                        className="hover:text-text-primary flex items-center gap-1"
                        title="Regenerate alternative take"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Swipe</span>
                      </button>
                      <span>&bull;</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onSpeakText(displayContent)}
                    className="hover:text-text-primary flex items-center gap-1"
                    title="Speak text aloud"
                  >
                    <Volume2 className="h-3 w-3" />
                    <span>Speak</span>
                  </button>
                  <span>&bull;</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(msg.id, displayContent)}
                    className="hover:text-text-primary flex items-center gap-1"
                    title="Copy text"
                  >
                    {copiedId === msg.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>Copy</span>
                  </button>
                  {!isLatest && (
                    <>
                      <span>&bull;</span>
                      <button
                        type="button"
                        onClick={() => onRewindMessage(msg.id)}
                        className="hover:text-rose-400 flex items-center gap-1"
                        title="Rewind storyline back to this point"
                      >
                        <RotateCcw className="h-3 w-3 text-rose-400" />
                        <span>Rewind</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Streaming Live Token Bubble */}
      {isStreaming && (
        <div className="flex justify-start gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden border border-accent/60 bg-core-elevated shadow-md shadow-accent/20 animate-pulse">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
          </div>

          <div className="flex flex-col items-start max-w-xl space-y-1">
            <div className="flex items-center gap-2 px-1">
              <span className="font-display font-bold text-xs text-text-primary">
                {character.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/15 px-1 py-0.2 font-mono text-[9px] uppercase tracking-wider text-accent animate-pulse">
                STREAMING
              </span>
            </div>

            <div className="relative rounded-2xl border border-accent/40 bg-ai-bubble px-4 py-3 text-text-primary shadow-md min-h-[44px]">
              {streamingBuffer.trim() ? (
                <FormattedRoleplayText text={streamingBuffer} />
              ) : (
                <span className="text-text-muted italic text-xs animate-pulse">
                  Contemplating response...
                </span>
              )}
              <span className="inline-block animate-pulse font-mono text-accent ml-0.5">
                ▌
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Anchor */}
      <div ref={scrollEndRef} className="h-4" />
    </div>
  );
}
