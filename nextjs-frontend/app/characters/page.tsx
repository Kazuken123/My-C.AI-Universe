import React from 'react';
import type { Metadata } from 'next';
import { CharacterCatalog } from '@/components/characters/character-catalog';

export const metadata: Metadata = {
  title: 'Character Catalog · My C.AI Universe',
  description: 'Explore autonomous canon characters and personas in My C.AI Universe.',
};

export default function CharactersPage() {
  return <CharacterCatalog />;
}
