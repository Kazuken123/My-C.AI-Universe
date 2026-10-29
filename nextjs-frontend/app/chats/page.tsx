import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { SavedChatsList } from '@/components/chat/saved-chats-list';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Narrative Chats · My C.AI Universe',
  description: 'Manage and resume your saved chats across characters.',
};

function ChatsFallback() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="font-mono text-xs">Loading chats...</p>
      </div>
    </div>
  );
}

export default function ChatsPage() {
  return (
    <div className="content-container space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold text-text-primary">
          Saved Narrative Chats
        </h1>
        <p className="text-text-secondary text-sm">
          Resume active roleplay scenes or manage persisted SQL story branches.
        </p>
      </div>

      <Suspense fallback={<ChatsFallback />}>
        <SavedChatsList />
      </Suspense>
    </div>
  );
}
