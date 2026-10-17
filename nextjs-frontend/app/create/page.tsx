import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { CharacterStudio } from '@/components/characters/character-studio';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Character Architecture Studio · My C.AI Universe',
  description: 'Design and synthesize autonomous roleplay characters with relational SQL persistence.',
};

function StudioFallback() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="font-mono text-xs">Opening Character Studio...</p>
      </div>
    </div>
  );
}

export default function CreateAliasPage() {
  return (
    <Suspense fallback={<StudioFallback />}>
      <CharacterStudio />
    </Suspense>
  );
}
