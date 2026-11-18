import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { SavedChatsList, SavedChatsSkeleton } from '@/components/chat/saved-chats-list';

export const metadata: Metadata = {
  title: 'Narrative Chats · My C.AI Universe',
  description: 'Manage and resume your saved chats across characters.',
};

export default function ChatsPage() {
  return (
    <div className="content-container space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold text-text-primary">
          Saved chats
        </h1>
        <p className="text-text-secondary text-sm">
          Return to any of your storylines.
        </p>
      </div>

      <Suspense fallback={<SavedChatsSkeleton />}>
        <SavedChatsList />
      </Suspense>
    </div>
  );
}
