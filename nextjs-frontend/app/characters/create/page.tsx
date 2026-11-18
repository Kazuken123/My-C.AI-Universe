import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { CharacterStudio } from '@/components/characters/character-studio';
import StudioLoading from './loading';

export const metadata: Metadata = {
  title: 'Character Studio · My C.AI Universe',
  description: 'Design and synthesize autonomous roleplay characters with relational SQL persistence.',
};


export default function CreateCharacterPage() {
  return (
    <Suspense fallback={<StudioLoading />}>
      <CharacterStudio />
    </Suspense>
  );
}
