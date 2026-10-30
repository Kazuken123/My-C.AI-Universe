export type CharacterCategory =
  | 'All'
  | 'Roleplay'
  | 'Anime'
  | 'Original'
  | 'Sci-Fi'
  | 'Fantasy'
  | 'Gaming'
  | 'Philosophy'
  | 'Assistant'
  | string;

export type CharacterSortOption = 'popular' | 'likes' | 'name' | 'newest';

export interface CharacterListParams {
  search?: string;
  category?: string;
  sort?: CharacterSortOption;
}

/**
 * Core Character entity supporting dual casing from SQL serialization
 */
export interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  greeting: string;
  personality: string;
  appearance?: string;
  abilities?: string;
  background?: string;
  speaking_style?: string;
  speakingStyle?: string;
  example_dialogues?: string;
  exampleDialogues?: string;
  initial_memory?: string;
  initialMemory?: string;
  initialAffinity?: number;
  initial_affinity?: number;
  initialRelationshipStage?: string;
  initial_relationship_stage?: string;
  relationshipDynamic?: string;
  relationship_dynamic?: string;
  voice_provider?: string;
  voiceProvider?: string;
  voice_id?: string;
  voiceId?: string;
  voice_name?: string;
  voiceName?: string;
  systemPrompt?: string;
  system_prompt?: string;
  wiki?: string;
  wikiUrl?: string;
  wiki_url?: string;
  categories: string[];
  creator: string;
  ownerUserId?: string | null;
  owner_user_id?: string | null;
  interactions: number;
  likes: number;
  isLiked?: boolean;
  is_liked?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CharacterCreatePayload {
  name: string;
  tagline?: string;
  avatar?: string;
  greeting?: string;
  personality?: string;
  appearance?: string;
  abilities?: string;
  background?: string;
  speaking_style?: string;
  speakingStyle?: string;
  example_dialogues?: string;
  exampleDialogues?: string;
  initial_memory?: string;
  initialMemory?: string;
  initial_affinity?: number;
  initialAffinity?: number;
  initial_relationship_stage?: string;
  initialRelationshipStage?: string;
  relationship_dynamic?: string;
  relationshipDynamic?: string;
  voice_provider?: string;
  voiceProvider?: string;
  voice_id?: string;
  voiceId?: string;
  voice_name?: string;
  voiceName?: string;
  wiki?: string;
  wikiUrl?: string;
  categories?: string[];
}

export type CharacterUpdatePayload = Partial<CharacterCreatePayload>;

export interface CharacterLikeResponse {
  id: string;
  likes: number;
  isLiked: boolean;
}

export interface WikiParseResponse {
  name: string;
  tagline: string;
  personality: string;
  appearance: string;
  background: string;
  speaking_style: string;
  initial_memory: string;
  wikiUrl: string;
  character?: Partial<Character>;
}

export interface AIGenerateCharacterResponse {
  name: string;
  tagline: string;
  personality: string;
  appearance: string;
  abilities: string;
  greeting: string;
  speaking_style: string;
  background: string;
  categories: string[];
  avatar: string;
}
