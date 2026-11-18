'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
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
  const { user, loading: authLoading } = useAuth();

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
  const sessionRequest = useRef(0);
  const pendingSessionChange = useRef(false);
  const [switchingSession, setSwitchingSession] = useState(false);

  // Streaming state
  const [actionError, setActionError] = useState('');
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
  const speakText = useCallback(async (rawText: string, messageId?: string, variantIndex?: number, sessionIdOverride?: string) => {
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
    const targetSessionId = sessionIdOverride || session?.id;
    const isPersistedTurn = Boolean(
      targetSessionId &&
      !targetSessionId.startsWith('session_local_') &&
      messageId &&
      !messageId.startsWith('msg_greet_') &&
      !messageId.startsWith('msg_model_')
    );

    if (currentVoiceId && isPersistedTurn && targetSessionId && messageId) {
      try {
        setIsSpeaking(true);
        const audioBlob = await api.synthesizeMessageVoice({
          sessionId: targetSessionId,
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
      .replace(/\[\[REL_STATE:[\s\S]*?\]\]/gi, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*[^*]+\*/g, '')
      .replace(/^[^:\n]{1,40}:\s*/gm, '')
      .replace(/["“”«»]/g, '')
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
        setSession(current => current?.id === session.id ? res.session : current);
      } catch (err: any) {
        console.warn('Failed to update session voice override:', err.message);
      }
    }
  };

  const activateSession = useCallback((next: ChatSession, defaultPersonaId: string) => {
    if (next.characterId !== characterId) throw new Error('This chat belongs to another character.');
    setAiProvider(resolveSupportedProvider(next.provider));
    setActivePersonaId(next.personaId || defaultPersonaId);
    setSession(next);
  }, [characterId]);

  const initWorkspace = useCallback(async () => {
    const request = ++sessionRequest.current;
    setLoading(true);
    setError(null);
    try {
      const [nextCharacter, nextPersonas, latestSessions] = await Promise.all([
        api.getCharacter(characterId),
        api.getPersonas().catch(() => [] as UserPersona[]),
        initialSessionId ? Promise.resolve([]) : api.getChatSessions(characterId),
      ]);
      if (request !== sessionRequest.current) return;

      const defaultPersona = nextPersonas.find(p => p.isDefault) || nextPersonas[0];
      const defaultPersonaId = defaultPersona?.id || 'persona_default';
      const targetId = initialSessionId || latestSessions[0]?.id;
      const next = targetId
        ? await api.getChatSession(targetId)
        : await api.createChatSession({ characterId, provider: 'gemini', personaId: defaultPersonaId });

      if (request !== sessionRequest.current) return;
      activateSession(next, defaultPersonaId);
      setCharacter(nextCharacter);
      setPersonas(nextPersonas);
    } catch (err: unknown) {
      if (request !== sessionRequest.current) return;
      setError(err instanceof Error ? err.message : 'Failed to initialize chat workspace');
    } finally {
      if (request === sessionRequest.current) setLoading(false);
    }
  }, [characterId, initialSessionId, activateSession]);

  const invalidateSessionRequest = useCallback(() => {
    // Late responses from the previous route must not commit state.
    sessionRequest.current += 1;
    pendingSessionChange.current = false;
  }, []);

  const userId = user?.id;
  useLayoutEffect(() => {
    if (authLoading || !userId) return;
    const timer = window.setTimeout(initWorkspace, 0);
    return () => {
      window.clearTimeout(timer);
      invalidateSessionRequest();
    };
  }, [authLoading, userId, initWorkspace, invalidateSessionRequest]);

  const changeSession = async (targetId?: string) => {
    if (isStreaming) {
      setActionError('Wait for the current reply before switching chats.');
      return;
    }
    if (pendingSessionChange.current) return;
    if (targetId && targetId === session?.id) {
      setIsHistoryOpen(false);
      return;
    }

    const request = ++sessionRequest.current;
    pendingSessionChange.current = true;
    setSwitchingSession(true);
    setActionError('');
    try {
      const next = targetId
        ? await api.getChatSession(targetId)
        : await api.createChatSession({ characterId, provider: aiProvider, personaId: activePersonaId });
      if (request !== sessionRequest.current) return;

      const defaultPersona = personas.find(p => p.isDefault) || personas[0];
      activateSession(next, defaultPersona?.id || 'persona_default');
      setIsHistoryOpen(false);
    } catch {
      if (request !== sessionRequest.current) return;
      setActionError(targetId
        ? 'Could not open the selected chat. Try again from history.'
        : 'Could not start a new storyline. Try again.');
    } finally {
      if (request === sessionRequest.current) {
        pendingSessionChange.current = false;
        setSwitchingSession(false);
      }
    }
  };

  useLayoutEffect(() => {
    if (!session || session.characterId !== characterId || loading || error) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('session') === session.id) return;
    url.searchParams.set('session', session.id);
    window.history.replaceState(window.history.state, '', url);
  }, [session, characterId, loading, error]);

  // Send standard user message with real-time SSE streaming
  const handleSendMessage = async (text: string) => {
    if (!character || !session || isStreaming || pendingSessionChange.current) return;

    // Handle in-chat /update command
    if (text.startsWith('/update ')) {
      setIsStreaming(true);
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
        setSession(current => current?.id === session.id ? updatedSession : current);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Update command failed';
        setActionError(msg);
        throw err;
      } finally {
        setIsStreaming(false);
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
      if (prev?.id !== session.id) return prev;
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
            if (prev?.id !== session.id) return prev;
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
            speakText(finalResponse, finalAiMsg.id, finalAiMsg.selectedVariantIndex ?? 0, doneChunk.sessionId || session.id);
          }
        }
      );
    } catch (streamErr) {
      // An interrupted stream may already have committed. Read before allowing a manual retry.
      try { setSession(await api.getChatSession(session.id)); }
      catch { setSession(prev => prev ? {...prev,messages:prev.messages.filter(m=>m.id!==tempUserMsgId)} : prev); }
      setActionError('Connection interrupted. Review the conversation before sending again.');
      throw streamErr;
    } finally {
      setIsStreaming(false);
      setStreamingBuffer('');
    }
  };

  // Handle scene continuation (empty message turn)
  const handleContinueScene = async () => {
    if (!character || !session || isStreaming || pendingSessionChange.current) return;

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
        if (prev?.id !== session.id) return prev;
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
        speakText(res.response, finalAiMsg.id, finalAiMsg.selectedVariantIndex ?? 0, res.sessionId || session.id);
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
      setSession(current => current?.id === session.id ? res.session : current);
    } catch {
      // optimistic local fallback
      setSession((prev) => {
        if (prev?.id !== session.id) return prev;
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
    if (!character || !session || isStreaming || pendingSessionChange.current) return;
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
          if (prev?.id !== session.id) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === messageId ? res.message! : m)),
            relationshipMood: res.relationship?.relationshipMood ?? prev.relationshipMood,
            relationship: res.relationship || prev.relationship,
          };
        });
      } else {
        const updated = await api.getChatSession(res.sessionId || session.id);
        setSession(current => current?.id === session.id ? updated : current);
      }

      if (autoTTS && res.response) {
        speakText(res.response, res.message?.id || messageId, res.message?.selectedVariantIndex ?? 0, res.sessionId || session.id);
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
      setSession(current => current?.id === session.id ? res.session : current);
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
      setSession(current => current?.id === session.id ? res.session : current);
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
      setSession(current => current?.id === session.id ? updated : current);
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
        if (prev?.id !== session.id) return prev;
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

  if (authLoading) return <ChatSkeleton />;

  if (!user) {
    const params = new URLSearchParams();
    if (initialSessionId) params.set('session', initialSessionId);
    const returnTo = typeof window === 'undefined'
      ? `/chat/${encodeURIComponent(characterId)}${params.size ? `?${params}` : ''}`
      : window.location.pathname + window.location.search;
    return (
      <div className="atlas-chat-state">
        <h2>Sign in to open this chat</h2>
        <Link href={`/auth?return=${encodeURIComponent(returnTo)}`} className="btn-secondary">Sign in</Link>
      </div>
    );
  }

  if (loading) return <ChatSkeleton />;

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
          <div className="atlas-chat-actions">
            <button type="button" className="btn-secondary" onClick={initWorkspace}>Try again</button>
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
  const personaDisplayName = activePersona?.name || user.displayName || 'Traveler';

  return (
    <div className="atlas-chat-reader relative flex flex-col rounded-2xl border border-border-hairline bg-canvas overflow-hidden">
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

      {/* Messages Stream Viewport */}
      <ChatMessages
        key={session?.id}
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

      {actionError && !isHistoryOpen && (
        <div className="atlas-chat-action-error" role="alert">
          <span>{actionError}</span>
          <button className="btn-secondary btn-sm" onClick={() => setActionError('')}>Dismiss</button>
        </div>
      )}

      {/* Chat Input Bar */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onContinueScene={handleContinueScene}
        disabled={switchingSession}
        isStreaming={isStreaming}
      />

      {/* Slide-over Drawers & Modals */}
      <ChatDrawerMemories
        key={session?.id}
        isOpen={isMemoriesOpen}
        onClose={() => setIsMemoriesOpen(false)}
        character={character}
        session={session}
        onRefreshSession={async () => {
          if (session) {
            const updated = await api.getChatSession(session.id);
            setSession(current => current?.id === session.id ? updated : current);
          }
        }}
      />

      <ChatDrawerHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        characterId={character.id}
        activeSessionId={session?.id}
        actionError={actionError}
        onSelectSession={changeSession}
        onNewSession={() => changeSession()}
        pending={switchingSession}
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
        selectedVoiceId={session?.voiceIdOverride || session?.voice_id_override || ''}
        selectedVoiceName={session?.voiceNameOverride || session?.voice_name_override || ''}
        authorDefaultVoiceId={character?.voiceId || character?.voice_id || ''}
        authorDefaultVoiceName={character?.voiceName || character?.voice_name || ''}
        characterName={character?.name || 'Character'}
        onSelectVoice={handleSelectSessionVoice}
        title={`Choose Voice for ${character?.name || 'Character'}`}
      />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="atlas-chat-reader atlas-chat-loading" aria-busy="true">
      <span className="atlas-sr-only" role="status">Opening chat</span>
      <div className="atlas-chat-load-header atlas-skeleton" aria-hidden="true" />
      <div className="atlas-chat-load-turn atlas-skeleton" aria-hidden="true" />
      <div className="atlas-chat-load-turn atlas-chat-load-user atlas-skeleton" aria-hidden="true" />
      <div className="atlas-chat-load-turn atlas-skeleton" aria-hidden="true" />
      <div className="atlas-chat-load-composer atlas-skeleton" aria-hidden="true" />
    </div>
  );
}
