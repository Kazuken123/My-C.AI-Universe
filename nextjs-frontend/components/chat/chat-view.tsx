'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';
import type { Character } from '@/types/character';
import type { ChatSession, ChatMessage, RelationshipMetrics } from '@/types/chat';
import type { UserPersona } from '@/types/persona';
import { api } from '@/lib/api';
import { resolveSupportedProvider } from '@/lib/chat-utils';
import { useAuth } from '@/context/auth-context';
import { ChatHeader } from './chat-header';
import { ChatMessages } from './chat-messages';
import { ChatInput } from './chat-input';
import { ChatDrawerMemories } from './chat-drawer-memories';
import { ChatDrawerHistory } from './chat-drawer-history';
import { RelationshipDirectorModal } from './relationship-director-modal';
import { VoicePickerModal } from '../characters/voice-picker-modal';
import { DoubleBezel } from '@/components/ui/double-bezel';

export interface ChatViewProps {
  characterId: string;
  initialSessionId?: string | null;
}

export function ChatView({
  characterId,
  initialSessionId,
}: ChatViewProps) {
  const { user } = useAuth();

  // State
  const [character, setCharacter] = useState<Character | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState<string>('persona_default');
  const [aiProvider, setAiProvider] = useState<string>('gemini');
  const [autoTTS, setAutoTTS] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingBuffer, setStreamingBuffer] = useState('');

  // Modals & Drawers
  const [isMemoriesOpen, setIsMemoriesOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRelationshipModalOpen, setIsRelationshipModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  // Relationship metrics
  const relationship: RelationshipMetrics = session?.relationship || {
    changeReason: session?.narrativeState?.lastChange,
    emotionIntensity: session?.narrativeState?.emotion?.intensity,
    affinity: session?.affinity ?? character?.initialAffinity ?? character?.initial_affinity ?? 0,
    trust: session?.trust ?? session?.affinity ?? character?.initialAffinity ?? character?.initial_affinity ?? 0,
    strain: session?.strain ?? 0,
    relationshipStage: session?.relationshipStage || character?.initialRelationshipStage || character?.initial_relationship_stage || 'Stranger / Neutral',
    relationshipMood: session?.relationshipMood || 'Calm',
  };

    // Character Voice & Web Speech API synthesis
  const speakText = useCallback(async (rawText: string, messageId?: string, variantIndex?: number) => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const currentVoiceId = session?.voiceIdOverride || session?.voice_id_override || character?.voiceId || character?.voice_id;

    if (currentVoiceId && session?.id && messageId) {
      try {
        setIsSpeaking(true);
        const audioBlob = await api.synthesizeMessageVoice({
          sessionId: session.id,
          messageId,
          variantIndex: variantIndex ?? 0
        });

        const blobUrl = URL.createObjectURL(audioBlob);
        activeBlobUrlRef.current = blobUrl;
        const audio = new Audio(blobUrl);
        currentAudioRef.current = audio;

        const onFinished = () => {
          setIsSpeaking(false);
          currentAudioRef.current = null;
          if (activeBlobUrlRef.current) {
            URL.revokeObjectURL(activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
          }
        };

        audio.onended = onFinished;
        audio.onerror = onFinished;
        await audio.play();
        return;
      } catch (voiceErr: any) {
        console.warn('[ChatView] Fish Audio playback notice, falling back to browser speech:', voiceErr.message);
      }
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSpeaking(false);
      return;
    }

    const clean = (rawText || '')
      .replace(/\*[^*]+\*/g, '')
      .replace(/^[^:\n]{1,40}:\s*/gm, '')
      .replace(/"/g, '')
      .trim();

    if (!clean) {
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    setIsSpeaking(true);

    const onEnd = () => setIsSpeaking(false);
    utterance.onend = onEnd;
    utterance.onerror = onEnd;

    window.speechSynthesis.speak(utterance);
  }, [session, character]);

  const handleSelectSessionVoice = async (voiceId: string, voiceName: string) => {
    if (session?.id) {
      try {
        const res = await api.updateSessionVoice(session.id, {
          voiceIdOverride: voiceId,
          voiceNameOverride: voiceName
        });
        setSession(res.session);
      } catch (err: any) {
        console.warn('Failed to update session voice override:', err.message);
      }
    }
  };

  // Initialize Character, Personas, and Session
  const initWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Load Character
      const char = await api.getCharacter(characterId);
      setCharacter(char);

      // 2. Load Personas
      let userPersonas: UserPersona[] = [];
      let defaultPersonaId = 'persona_default';
      try {
        userPersonas = await api.getPersonas();
        setPersonas(userPersonas);
        const defaultPersona = userPersonas.find((p) => p.isDefault) || userPersonas[0];
        if (defaultPersona) {
          defaultPersonaId = defaultPersona.id;
          setActivePersonaId(defaultPersona.id);
        }
      } catch {
        // Unauthenticated or personas fetch fallback
      }

      // 3. Load or Create Session
      let activeSess: ChatSession | null = null;
      if (initialSessionId) {
        try {
          activeSess = await api.getChatSession(initialSessionId);
        } catch {
          // fallback to latest session
        }
      }

      if (!activeSess) {
        try {
          const sessions = await api.getChatSessions(characterId);
          if (sessions && sessions.length > 0) {
            activeSess = await api.getChatSession(sessions[0].id);
          }
        } catch {
          // no existing sessions
        }
      }

      if (!activeSess) {
        try {
          activeSess = await api.createChatSession({
            characterId,
            provider: 'gemini',
            personaId: defaultPersonaId,
          });
        } catch {
          // If creation fails due to auth or offline, fallback to a local preview session
          activeSess = {
            id: `session_local_${Date.now()}`,
            characterId: char.id,
            characterName: char.name,
            characterAvatar: char.avatar,
            title: `Chat with ${char.name}`,
            provider: 'gemini',
            affinity: char.initialAffinity ?? char.initial_affinity ?? 0,
            trust: char.initialAffinity ?? char.initial_affinity ?? 0,
            strain: 0,
            relationshipStage: char.initialRelationshipStage || char.initial_relationship_stage || 'Stranger / Neutral',
            relationshipMood: 'Calm',
            createdAt: new Date().toISOString(),
            messages: [
              {
                id: `msg_greet_${Date.now()}`,
                role: 'model',
                content: char.greeting || '*Enters scene.*',
                selectedVariantIndex: 0,
                variants: [
                  {
                    id: `var_1`,
                    text: char.greeting || '*Enters scene.*',
                    createdAt: new Date().toISOString(),
                  },
                ],
                isPinned: false,
                rating: 0,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }
      }

      if (activeSess?.provider) {
        setAiProvider(resolveSupportedProvider(activeSess.provider));
      }
      if (activeSess?.personaId) {
        setActivePersonaId(activeSess.personaId);
      }

      setSession(activeSess);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize chat workspace';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [characterId, initialSessionId]);

  useEffect(() => {
    initWorkspace();
  }, [initWorkspace]);

  // Handle switching narrative threads
  const handleSelectSession = async (sessionId: string) => {
    try {
      const s = await api.getChatSession(sessionId);
      setAiProvider(resolveSupportedProvider(s.provider));
      setSession(s);
    } catch (err: unknown) {
      console.warn('Failed to switch session:', err);
    }
  };

  // Handle starting a fresh thread
  const handleNewSession = async () => {
    try {
      const newSess = await api.createChatSession({
        characterId,
        provider: aiProvider,
        personaId: activePersonaId,
      });
      setSession(newSess);
    } catch {
      // Re-init fallback
      initWorkspace();
    }
  };

  // Send standard user message with real-time SSE streaming
  const handleSendMessage = async (text: string) => {
    if (!character || !session || isStreaming) return;

    // Handle in-chat /update command
    if (text.startsWith('/update ')) {
      try {
        const res = await api.sendChatMessage({
          charId: character.id,
          sessionId: session.id,
          message: text,
        });
        if (res.characterUpdated) {
          setCharacter(res.characterUpdated);
        }
        const updatedSession = await api.getChatSession(session.id);
        setSession(updatedSession);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Update command failed';
        alert(msg);
      }
      return;
    }

    // 1. Optimistically append user message
    const tempUserMsgId = `temp_user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: tempUserMsgId,
      role: 'user',
      content: text,
      selectedVariantIndex: 0,
      variants: [{ id: `v_${Date.now()}`, text, createdAt: new Date().toISOString() }],
      isPinned: false,
      rating: 0,
      createdAt: new Date().toISOString(),
    };

    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, userMsg],
      };
    });

    setIsStreaming(true);
    setStreamingBuffer('');

    const memoryPayload = session.messages.slice(-40).map((m) => ({
      role: m.role,
      content: (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content,
    }));

    let accumulatedTokens = '';

    try {
      await api.sendChatMessageStream(
        {
          charId: character.id,
          sessionId: session.id,
          personaId: activePersonaId,
          provider: aiProvider,
          message: text,
          memory: memoryPayload,
        },
        // onToken: typewriter append
        (token) => {
          accumulatedTokens += token;
          setStreamingBuffer((prev) => prev + token);
        },
        // onDone: finalized by backend
        async (doneChunk) => {
          const finalResponse = doneChunk.response || accumulatedTokens;
          const finalAiMsg: ChatMessage = doneChunk.aiMessage || {
            id: `msg_model_${Date.now()}`,
            role: 'model',
            content: finalResponse,
            selectedVariantIndex: 0,
            variants: [
              {
                id: `v_${Date.now()}`,
                text: finalResponse,
                createdAt: new Date().toISOString(),
              },
            ],
            isPinned: false,
            rating: 0,
            createdAt: new Date().toISOString(),
          };

          const finalUserMsg: ChatMessage = doneChunk.userMessage
            ? doneChunk.userMessage
            : userMsg;

          // Synchronously update session so messages transition cleanly without flicker
          setSession((prev) => {
            if (!prev) return prev;
            const updatedMessages = prev.messages.map((m) =>
              m.id === tempUserMsgId ? finalUserMsg : m
            );
            if (!updatedMessages.some((m) => m.id === finalAiMsg.id)) {
              updatedMessages.push(finalAiMsg);
            }
            return {
              ...prev,
              id: doneChunk.sessionId || prev.id,
              messages: updatedMessages,
              affinity: doneChunk.relationship?.affinity ?? prev.affinity,
              trust: doneChunk.relationship?.trust ?? prev.trust,
              strain: doneChunk.relationship?.strain ?? prev.strain,
              relationshipStage: doneChunk.relationship?.relationshipStage ?? prev.relationshipStage,
              relationshipMood: doneChunk.relationship?.relationshipMood ?? prev.relationshipMood,
              relationship: doneChunk.relationship || prev.relationship,
            };
          });

          if (autoTTS && finalResponse) {
            speakText(finalResponse);
          }
        }
      );
    } catch (streamErr) {
      // An interrupted stream may already have committed. Read before allowing a manual retry.
      try { setSession(await api.getChatSession(session.id)); }
      catch { setSession(prev => prev ? {...prev,messages:prev.messages.filter(m=>m.id!==tempUserMsgId)} : prev); }
      alert('Connection interrupted. Review the conversation before sending again.');
      throw streamErr;
    } finally {
      setIsStreaming(false);
      setStreamingBuffer('');
    }
  };

  // Handle scene continuation (empty message turn)
  const handleContinueScene = async () => {
    if (!character || !session || isStreaming) return;

    setIsStreaming(true);
    setStreamingBuffer('');

    try {
      const res = await api.sendChatMessage({
        charId: character.id,
        sessionId: session.id,
        personaId: activePersonaId,
        provider: aiProvider,
        message: '',
        continue: true,
      });

      const finalAiMsg: ChatMessage = res.message || {
        id: `msg_model_${Date.now()}`,
        role: 'model',
        content: res.response || '',
        selectedVariantIndex: 0,
        variants: [{ id: `v_${Date.now()}`, text: res.response || '', createdAt: new Date().toISOString() }],
        isPinned: false,
        rating: 0,
        createdAt: new Date().toISOString(),
      };

      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          id: res.sessionId || prev.id,
          messages: [...prev.messages, finalAiMsg],
          affinity: res.relationship?.affinity ?? prev.affinity,
          trust: res.relationship?.trust ?? prev.trust,
          strain: res.relationship?.strain ?? prev.strain,
          relationshipStage: res.relationship?.relationshipStage ?? prev.relationshipStage,
          relationshipMood: res.relationship?.relationshipMood ?? prev.relationshipMood,
          relationship: res.relationship || prev.relationship,
        };
      });

      if (autoTTS && res.response) {
        speakText(res.response);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to continue scene';
      alert(msg);
    } finally {
      setIsStreaming(false);
      setStreamingBuffer('');
    }
  };

  // Variant Swiping
  const handleSelectVariant = async (messageId: string, index: number) => {
    if (!session) return;
    try {
      const res = await api.updateChatMessage(session.id, messageId, {
        selectedVariantIndex: index,
      });
      setSession(res.session);
    } catch {
      // optimistic local fallback
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId ? { ...m, selectedVariantIndex: index } : m
          ),
        };
      });
    }
  };

  // Regenerate new alternative take
  const handleRegenerate = async (messageId: string) => {
    if (!character || !session || isStreaming) return;
    setIsStreaming(true);
    setStreamingBuffer('');

    try {
      const res = await api.sendChatMessage({
        charId: character.id,
        sessionId: session.id,
        personaId: activePersonaId,
        provider: aiProvider,
        message: '',
        regenerate: true,
        messageId,
      });

      if (res.message) {
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === messageId ? res.message! : m)),
            relationshipMood: res.relationship?.relationshipMood ?? prev.relationshipMood,
            relationship: res.relationship || prev.relationship,
          };
        });
      } else {
        const updated = await api.getChatSession(res.sessionId || session.id);
        setSession(updated);
      }

      if (autoTTS && res.response) {
        speakText(res.response);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate take';
      alert(msg);
    } finally {
      setIsStreaming(false);
      setStreamingBuffer('');
    }
  };

  // Pin message to character memory
  const handlePinMessage = async (messageId: string) => {
    if (!session) return;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg) return;

    try {
      const res = await api.updateChatMessage(session.id, messageId, {
        isPinned: !msg.isPinned,
      });
      setSession(res.session);
    } catch {
      // ignore
    }
  };

  // Edit message
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!session) return;
    try {
      const res = await api.updateChatMessage(session.id, messageId, {
        content: newContent,
      });
      setSession(res.session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update message';
      alert(msg);
    }
  };

  // Rewind storyline
  const handleRewindMessage = async (messageId: string) => {
    if (!session) return;
    if (!confirm('Rewind conversation to this turn? Later messages will be discarded.')) return;

    try {
      const updated = await api.rewindChatSession(session.id, messageId);
      setSession(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rewind storyline';
      alert(msg);
    }
  };

  // Save relationship override
  const handleSaveRelationshipOverride = async (overrides: {
    affinity: number;
    trust: number;
    strain: number;
    relationshipStage: string;
    relationshipMood: string;
  }) => {
    if (!session) return;
    try {
      const res = await api.updateSessionRelationship(session.id, overrides);
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...overrides,
          relationship: res.relationship,
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update relationship';
      alert(msg);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="font-mono text-xs">Connecting to neural roleplay stream...</p>
        </div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <DoubleBezel coreClassName="p-8 text-center space-y-4 max-w-md">
          <AlertCircle className="h-8 w-8 text-rose-400 mx-auto" />
          <h2 className="font-display text-lg font-bold text-text-primary">
            Unable to Load Scene
          </h2>
          <p className="text-xs text-text-muted">
            {error || 'Character archetype not found.'}
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="btn-island py-2 px-4 text-xs"
            >
              <span>Back to Directory</span>
            </Link>
          </div>
        </DoubleBezel>
      </div>
    );
  }

  const activePersona = personas.find((p) => p.id === activePersonaId);
  const personaDisplayName = activePersona?.name || user?.displayName || 'Traveler';

  return (
    <div className="relative flex flex-col h-[calc(100dvh-5rem)] rounded-2xl border border-border-hairline bg-canvas overflow-hidden shadow-2xl">
      {/* Interactive Chat Header */}
      <ChatHeader
        character={character}
        relationship={relationship}
        personas={personas}
        activePersonaId={activePersonaId}
        onSelectPersona={setActivePersonaId}
        aiProvider={aiProvider}
        onSelectProvider={setAiProvider}
        autoTTS={autoTTS}
        onToggleTTS={() => setAutoTTS((prev) => !prev)}
        onOpenRelationshipModal={() => setIsRelationshipModalOpen(true)}
        onOpenMemoriesDrawer={() => setIsMemoriesOpen(true)}
        onOpenHistoryDrawer={() => setIsHistoryOpen(true)}
        isSpeaking={isSpeaking}
        activeVoiceName={session?.voiceNameOverride || session?.voice_name_override || character?.voiceName || character?.voice_name || ''}
        onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
      />

      {/* Guest Mode Banner */}
      {!user && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <span>Guest mode active. Sign in to persist chats, long-term memories, and custom personas.</span>
          <Link href="/auth" className="underline font-semibold hover:text-white shrink-0">
            Sign In
          </Link>
        </div>
      )}

      {/* Messages Stream Viewport */}
      <ChatMessages
        character={character}
        messages={session?.messages || []}
        userPersonaName={personaDisplayName}
        isStreaming={isStreaming}
        streamingBuffer={streamingBuffer}
        onSelectVariant={handleSelectVariant}
        onRegenerate={handleRegenerate}
        onPinMessage={handlePinMessage}
        onEditMessage={handleEditMessage}
        onRewindMessage={handleRewindMessage}
        onSpeakText={speakText}
      />

      {/* Chat Input Bar */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onContinueScene={handleContinueScene}
        disabled={loading}
        isStreaming={isStreaming}
      />

      {/* Slide-over Drawers & Modals */}
      <ChatDrawerMemories
        isOpen={isMemoriesOpen}
        onClose={() => setIsMemoriesOpen(false)}
        character={character}
        session={session}
        onRefreshSession={async () => {
          if (session) {
            const updated = await api.getChatSession(session.id);
            setSession(updated);
          }
        }}
      />

      <ChatDrawerHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        characterId={character.id}
        activeSessionId={session?.id}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />

      <RelationshipDirectorModal
        isOpen={isRelationshipModalOpen}
        onClose={() => setIsRelationshipModalOpen(false)}
        relationship={relationship}
        characterName={character.name}
        relationshipDynamic={character.relationshipDynamic || character.relationship_dynamic}
        onSaveOverride={handleSaveRelationshipOverride}
      />

      <VoicePickerModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        selectedVoiceId={session?.voiceIdOverride || session?.voice_id_override || character?.voiceId || character?.voice_id || ''}
        selectedVoiceName={session?.voiceNameOverride || session?.voice_name_override || character?.voiceName || character?.voice_name || ''}
        onSelectVoice={handleSelectSessionVoice}
        title="Swap Character Voice for this Chat"
      />
    </div>
  );
}
