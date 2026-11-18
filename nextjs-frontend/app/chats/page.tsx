import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { SavedChatsList } from '@/components/chat/saved-chats-list';
import { SavedChatsSkeleton } from '@/components/chat/saved-chats-skeleton';
import { SavedChatsFrame } from '@/components/chat/saved-chats-frame';

export const metadata: Metadata = {
  title: 'Narrative Chats · My C.AI Universe',
  description: 'Manage and resume your saved chats across characters.',
};

export default function ChatsPage() {
  return (
    <SavedChatsFrame>
      <Suspense fallback={<SavedChatsSkeleton />}>
        <SavedChatsList />
      </Suspense>
    </SavedChatsFrame>
  );
}
