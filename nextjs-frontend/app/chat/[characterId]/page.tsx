import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChatView } from '@/components/chat/chat-view';
import { Loader2 } from 'lucide-react';

interface ChatPageProps {
  params: {
    characterId: string;
  };
  searchParams?: {
    session?: string;
  };
}

export function generateMetadata({ params }: ChatPageProps): Metadata {
  return {
    title: `Roleplay Scene · My C.AI Universe`,
    description: `Real-time streaming roleplay chat with autonomous AI persona.`,
  };
}

function ChatFallback() {
  return (
    <div className="flex min-h-[500px] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="font-mono text-xs">Opening scene session...</p>
      </div>
    </div>
  );
}

export default function ChatPage({ params, searchParams }: ChatPageProps) {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatView
        characterId={params.characterId}
        initialSessionId={searchParams?.session}
      />
    </Suspense>
  );
}
