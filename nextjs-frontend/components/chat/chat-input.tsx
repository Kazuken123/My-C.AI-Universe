'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  onContinueScene: () => Promise<void>;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function ChatInput({
  onSendMessage,
  onContinueScene,
  disabled = false,
  isStreaming = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [text]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      // If empty, trigger scene continuation
      if (disabled || isStreaming || sending) return;
      setSending(true);
      try {
        await onContinueScene();
      } finally {
        setSending(false);
      }
      return;
    }

    if (disabled || isStreaming || sending) return;
    setSending(true);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await onSendMessage(trimmed);
    } catch {
      // If sending failed, restore text
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isContinueMode = !text.trim();

  return (
    <div className="border-t border-border-hairline bg-rail/80 backdrop-blur-xl p-3 md:p-4">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Input Bar */}
        <div className="relative flex items-end gap-2 rounded-2xl border border-border-subtle bg-input p-2 transition-colors focus-within:border-accent focus-within:bg-input-focus shadow-sm">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isStreaming}
            placeholder={
              isStreaming
                ? 'AI is generating narrative...'
                : 'Send a message or press Enter without text to continue scene...'
            }
            className="w-full resize-none bg-transparent px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none max-h-40 overflow-y-auto"
          />

          <div className="flex items-center gap-1.5 shrink-0">
            {isContinueMode ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || isStreaming || sending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border-hairline bg-white/5 px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white/10 hover:text-text-primary disabled:opacity-40 transition-colors"
                title="Advance the scene without user dialogue"
              >
                {sending || isStreaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                )}
                <span>Continue</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || isStreaming || sending}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
                title="Send Message (Enter)"
              >
                {sending || isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tips Footer */}
        <div className="flex items-center justify-between px-2 text-[10px] font-mono text-text-muted">
          <span>Shift + Enter for new line</span>
          <span className="hidden sm:inline">Supports /update [field]: [value] command</span>
        </div>
      </div>
    </div>
  );
}
