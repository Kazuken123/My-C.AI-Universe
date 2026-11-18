'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';

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

  useEffect(() => {
    const url = new URL(window.location.href);
    const opener = url.searchParams.get('opener')?.trim().slice(0, 1000);
    if (!opener) return;
    setText(current => current || opener);
    // Remove the consumed draft from the URL without changing Next router state.
    url.searchParams.delete('opener');
    window.history.replaceState(window.history.state, '', url);
  }, []);

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
    <div className="atlas-chat-composer border-t border-border-hairline bg-rail/80 p-3 md:p-4">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Input Bar */}
        <div className="relative flex items-end gap-2 rounded-2xl border border-border-subtle bg-input p-2 transition-colors focus-within:border-accent focus-within:bg-input-focus shadow-sm">
          <textarea
            ref={textareaRef}
            aria-label="Message"
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

          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || isStreaming || sending}
            className="atlas-composer-submit inline-flex h-9 min-w-[6.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border-hairline px-3 text-xs font-semibold disabled:opacity-40"
            data-mode={isContinueMode ? 'continue' : 'send'}
            title={isContinueMode ? 'Advance the scene without dialogue' : 'Send message'}
          >
            {sending || isStreaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : isContinueMode ? (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{isContinueMode ? 'Continue' : 'Send'}</span>
          </button>
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
