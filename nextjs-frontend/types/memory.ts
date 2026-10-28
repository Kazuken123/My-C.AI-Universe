export interface CharacterMemory {
  id: string;
  characterId: string;
  sessionId?: string | null;
  content: string;
  evidence?: string;
  messageId?: string;
  source?: string;
  createdAt: string;
}

export interface MemoriesResponse {
  memories: CharacterMemory[];
  count: number;
  storySummary: string;
}
