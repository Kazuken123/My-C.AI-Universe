'use client';

import React from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Volume2,
  VolumeX,
  BookOpen,
  History,
  Cpu,
  UserCheck,
  Radio,
  Mic,
  MoreHorizontal,
} from 'lucide-react';
import type { Character } from '@/types/character';
import type { RelationshipMetrics } from '@/types/chat';
import type { UserPersona } from '@/types/persona';
import { resolveAvatarUrl } from '@/lib/character-utils';
import { calculateAffinityPercent, AI_PROVIDERS } from '@/lib/chat-utils';
import { cn } from '@/lib/utils';

export interface ChatHeaderProps {
  character: Character;
  relationship: RelationshipMetrics;
  personas: UserPersona[];
  activePersonaId: string;
  onSelectPersona: (personaId: string) => void;
  aiProvider: string;
  onSelectProvider: (provider: string) => void;
  autoTTS: boolean;
  onToggleTTS: () => void;
  onOpenRelationshipModal: () => void;
  onOpenMemoriesDrawer: () => void;
  onOpenHistoryDrawer: () => void;
  isSpeaking?: boolean;
  activeVoiceName?: string;
  onOpenVoiceModal?: () => void;
}

export function ChatHeader({
  character,
  relationship,
  personas,
  activePersonaId,
  onSelectPersona,
  aiProvider,
  onSelectProvider,
  autoTTS,
  onToggleTTS,
  onOpenRelationshipModal,
  onOpenMemoriesDrawer,
  onOpenHistoryDrawer,
  isSpeaking = false,
  activeVoiceName,
  onOpenVoiceModal,
}: ChatHeaderProps) {
  const [isOptionsOpen, setIsOptionsOpen] = React.useState(false);
  const optionsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setIsOptionsOpen(false);
      }
    }
    if (isOptionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOptionsOpen]);

  const affinityVal = Number(relationship.affinity ?? 0);
  const stage = relationship.relationshipStage || 'Stranger / Neutral';
  const mood = relationship.relationshipMood || 'Calm';
  const percent = calculateAffinityPercent(affinityVal);

  return (
    <header className="sticky top-0 z-30 border-b border-border-hairline bg-rail/90 backdrop-blur-xl px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Back & Avatar & Info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="icon-btn h-8 w-8 text-text-muted hover:text-text-primary shrink-0"
            title="Return to Directory"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden border border-border-subtle bg-core-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAvatarUrl(character.avatar, character.name)}
              alt={character.name}
              className={cn(
                'h-full w-full object-cover transition-transform',
                isSpeaking && 'scale-110'
              )}
            />
            <span
              className={cn(
                'absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-core',
                isSpeaking ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'
              )}
            />
          </div>

          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-sm font-bold text-text-primary truncate">
                {character.name}
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 rounded border border-border-hairline bg-white/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
                <Radio className="h-2 w-2 text-emerald-400" />
                SOUL-ID
              </span>
            </div>
            <p className="text-[11px] text-text-muted truncate max-w-xs sm:max-w-md">
              {character.tagline || (character.creator ? `By ${character.creator}` : 'Cinema Studio · 35mm Lens')}
            </p>
          </div>
        </div>

        {/* Right: Relationship Bar Pill + Narration + ... More Options */}
        <div className="flex items-center gap-2 shrink-0 relative" ref={optionsRef}>
          {/* Relationship Dynamics Bar Pill */}
          <button
            type="button"
            onClick={onOpenRelationshipModal}
            className="group flex items-center gap-2 rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1.5 text-xs transition-colors hover:border-accent/40 hover:bg-white/[0.08] cursor-pointer"
            title="Psychological Relationship Dynamics (Click to Direct / Inspect)"
          >
            <span className="font-mono font-bold text-accent text-[11px]">
              {stage}
            </span>
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">
              {affinityVal >= 0 ? `+${affinityVal}` : affinityVal}
            </span>
            <span className="hidden sm:inline text-text-secondary italic text-[11px]">
              {mood}
            </span>
            <div className="hidden sm:block w-12 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn("h-full transition-all duration-500 rounded-full", affinityVal < 0 ? "bg-rose-400" : "bg-emerald-400")}
                style={{ width: `${Math.max(5, percent)}%` }}
              />
            </div>
          </button>

          {/* Voice Narration Audio Toggle */}
          <button
            type="button"
            onClick={onToggleTTS}
            className={cn(
              'h-8 w-8 rounded-full border flex items-center justify-center transition-colors',
              autoTTS ? 'border-accent bg-accent/20 text-accent' : 'border-border-subtle bg-white/[0.04] text-text-muted hover:text-text-primary hover:bg-white/[0.08]'
            )}
            title={autoTTS ? 'Narration: ON (Click to mute)' : 'Narration: OFF (Click to unmute)'}
          >
            {autoTTS ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* ... More Options Button */}
          <button
            type="button"
            onClick={() => setIsOptionsOpen((prev) => !prev)}
            className={cn(
              'h-8 w-8 rounded-full border flex items-center justify-center transition-colors',
              isOptionsOpen ? 'border-accent bg-accent/20 text-accent' : 'border-border-subtle bg-white/[0.04] text-text-muted hover:text-text-primary hover:bg-white/[0.08]'
            )}
            title="More Options & Profile"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {/* C.AI Style Options Popover Menu */}
          {isOptionsOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border-subtle bg-[#16161a] p-2 shadow-2xl backdrop-blur-2xl z-50 flex flex-col gap-1 text-xs">
              {/* Persona Row */}
              {personas.length > 0 && (
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04]">
                  <div className="flex items-center gap-2 text-text-secondary">
                    <UserCheck className="h-4 w-4 text-accent" />
                    <span>User Persona</span>
                  </div>
                  <select
                    value={activePersonaId}
                    onChange={(e) => onSelectPersona(e.target.value)}
                    className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer max-w-[110px] truncate text-right font-medium"
                  >
                    {personas.map((p) => (
                      <option key={p.id} value={p.id} className="bg-core text-text-primary">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* AI Model Row */}
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04]">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Cpu className="h-4 w-4 text-text-muted" />
                  <span>AI Model</span>
                </div>
                <select
                  value={aiProvider}
                  onChange={(e) => onSelectProvider(e.target.value)}
                  className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer text-right font-medium"
                >
                  {AI_PROVIDERS.map((prov) => (
                    <option key={prov.id} value={prov.id} className="bg-core text-text-primary">
                      {prov.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice Picker Row */}
              {onOpenVoiceModal && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    onOpenVoiceModal();
                  }}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] text-left w-full"
                >
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Mic className="h-4 w-4 text-purple-400" />
                    <span>Voice</span>
                  </div>
                  <span className="text-text-muted font-mono text-[11px] truncate max-w-[100px]">
                    {activeVoiceName || 'Default'}
                  </span>
                </button>
              )}

              {/* History Row */}
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  onOpenHistoryDrawer();
                }}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] text-left w-full"
              >
                <div className="flex items-center gap-2 text-text-secondary">
                  <History className="h-4 w-4 text-text-muted" />
                  <span>Saved Chats</span>
                </div>
              </button>

              {/* Memories & Dossier Row */}
              <button
                type="button"
                onClick={() => {
                  setIsOptionsOpen(false);
                  onOpenMemoriesDrawer();
                }}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] text-left w-full"
              >
                <div className="flex items-center gap-2 text-text-secondary">
                  <BookOpen className="h-4 w-4 text-text-muted" />
                  <span>Memories &amp; Dossier</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
