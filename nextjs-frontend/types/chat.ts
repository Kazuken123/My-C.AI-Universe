import type { Character } from './character';

export interface MessageVariant {
  id: string;
  text: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  selectedVariantIndex: number;
  variants: MessageVariant[];
  isPinned: boolean;
  rating: number;
  createdAt: string;
}

export interface RelationshipMetrics {
  changeReason?: string;
  emotionIntensity?: number;
  affinity: number;
  trust: number;
  strain: number;
  relationshipStage: string;
  relationshipMood: string;
}

export interface ChatSessionSummary {
  id: string;
  userId?: string | null;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  characterTagline: string;
  personaId?: string;
  title: string;
  provider: string;
  affinity: number;
  trust: number;
  strain: number;
  relationshipStage: string;
  relationshipMood: string;
  messageCount: number;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  userId?: string | null;
  characterId: string;
  characterName?: string;
  characterAvatar?: string;
  characterTagline?: string;
  personaId?: string;
  title: string;
  provider: string;
  affinity?: number;
  trust?: number;
  strain?: number;
  relationshipStage?: string;
  relationshipMood?: string;
  relationship?: RelationshipMetrics;
  narrativeState?: { lastChange?: string; emotion?: { intensity?: number }; memories?: Array<{kind:string;content:string;evidence:string;messageId:string}> };
  revision?: number;
  createdAt: string;
  updatedAt?: string;
  messages: ChatMessage[];
}

export interface CreateChatSessionPayload {
  characterId: string;
  personaId?: string;
  title?: string;
  provider?: string;
}

export interface UpdateMessagePayload {
  selectedVariantIndex?: number;
  content?: string;
  isPinned?: boolean;
  rating?: number;
}

export interface UpdateMessageResponse {
  message: ChatMessage;
  session: ChatSession;
}

export interface UpdateRelationshipPayload {
  affinity?: number;
  trust?: number;
  strain?: number;
  relationshipStage?: string;
  relationshipMood?: string;
}

export interface SendChatMessagePayload {
  charId: string;
  sessionId?: string;
  message: string;
  memory?: Array<{ role: string; content: string }>;
  personaId?: string;
  provider?: string;
  regenerate?: boolean;
  messageId?: string;
  excludeVariants?: string[];
  continue?: boolean;
  lastMessage?: string;
}

export interface SendChatMessageResponse {
  response: string;
  sessionId: string;
  userMessage?: ChatMessage;
  aiMessage?: ChatMessage;
  message?: ChatMessage;
  regenerated?: boolean;
  continuation?: boolean;
  characterUpdated?: Character;
  memoriesUsed?: number;
  relationship?: RelationshipMetrics;
}

export interface ChatStreamTokenChunk {
  token: string;
}

export interface ChatStreamDoneChunk {
  done: true;
  sessionId: string;
  userMessage?: ChatMessage;
  aiMessage?: ChatMessage;
  response: string;
  relationship?: RelationshipMetrics;
}

export type ChatStreamChunk = ChatStreamTokenChunk | ChatStreamDoneChunk;
