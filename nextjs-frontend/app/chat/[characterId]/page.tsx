import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChatView } from '@/components/chat/chat-view';
import ChatLoading from './loading';

interface ChatPageProps {
  params: {
    characterId: string;
  };
  searchParams?: {
    session?: string;
  };
}

export function generateMetadata(): Metadata {
  return {
    title: `Roleplay Scene · My C.AI Universe`,
    description: `Real-time streaming roleplay chat with autonomous AI persona.`,
  };
}

export default function ChatPage({ params, searchParams }: ChatPageProps) {
  return (
    <Suspense fallback={<ChatLoading />}>
      <ChatView
        key={JSON.stringify([params.characterId, searchParams?.session])}
        characterId={params.characterId}
        initialSessionId={searchParams?.session}
      />
    </Suspense>
  );
}
