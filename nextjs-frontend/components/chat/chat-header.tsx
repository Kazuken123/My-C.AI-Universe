'use client';

import React from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Volume2,
  VolumeX,
  BookOpen,
  History,
  Sliders,
  Cpu,
  UserCheck,
  Radio,
  Mic,
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
  const affinityVal = Number(relationship.affinity ?? 0);
  const stage = relationship.relationshipStage || 'Stranger / Neutral';
  const mood = relationship.relationshipMood || 'Calm';
  const percent = calculateAffinityPercent(affinityVal);

  return (
    <header className="sticky top-0 z-30 border-b border-border-hairline bg-rail/90 backdrop-blur-xl px-4 py-3">
      <div className="flex flex-col gap-2.5">
        {/* Top Row: Navigation, Avatar, Name & Main Actions */}
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
                {character.tagline || (character.creator ? `By ${character.creator}` : 'Autonomous Roleplay')}
              </p>
            </div>
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Persona Selector Dropdown */}
            {personas.length > 0 && (
              <div className="hidden md:flex items-center gap-1 rounded-lg border border-border-hairline bg-white/[0.03] px-2 py-1 text-xs">
                <UserCheck className="h-3.5 w-3.5 text-accent" />
                <select
                  value={activePersonaId}
                  onChange={(e) => onSelectPersona(e.target.value)}
                  className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer max-w-[110px] truncate"
                  title="Active User Persona"
                >
                  {personas.map((p) => (
                    <option key={p.id} value={p.id} className="bg-core text-text-primary">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* AI Provider Dropdown */}
            <div className="hidden lg:flex items-center gap-1 rounded-lg border border-border-hairline bg-white/[0.03] px-2 py-1 text-xs">
              <Cpu className="h-3.5 w-3.5 text-text-muted" />
              <select
                value={aiProvider}
                onChange={(e) => onSelectProvider(e.target.value)}
                className="bg-transparent text-xs text-text-secondary focus:outline-none cursor-pointer"
                title="AI Neural Provider"
              >
                {AI_PROVIDERS.map((prov) => (
                  <option key={prov.id} value={prov.id} className="bg-core text-text-primary">
                    {prov.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Voice TTS Toggle */}
            <button
              type="button"
              onClick={onToggleTTS}
              className={cn(
                'icon-btn h-8 w-8 transition-colors',
                autoTTS ? 'border-accent bg-accent/20 text-accent' : 'text-text-muted hover:text-text-primary'
              )}
              title={autoTTS ? 'Voice narration active' : 'Enable voice narration'}
            >
              {autoTTS ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Voice Model Switcher */}
            {onOpenVoiceModal && (
              <button
                type="button"
                onClick={onOpenVoiceModal}
                className={cn(
                  'icon-btn h-8 px-2 flex items-center gap-1.5 text-xs transition-colors rounded-lg border',
                  activeVoiceName
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
                    : 'border-border-hairline text-text-muted hover:text-text-primary'
                )}
                title={activeVoiceName ? `Voice: ${activeVoiceName} (Click to swap)` : 'Select Character Voice'}
              >
                <Mic className="h-3.5 w-3.5 text-purple-400" />
                <span className="hidden md:inline max-w-[90px] truncate font-mono text-[11px]">
                  {activeVoiceName || 'Voice'}
                </span>
              </button>
            )}


            {/* Thread History Drawer Button */}
            <button
              type="button"
              onClick={onOpenHistoryDrawer}
              className="icon-btn h-8 w-8 text-text-muted hover:text-text-primary"
              title="Saved Chats &amp; History"
            >
              <History className="h-4 w-4" />
            </button>

            {/* Lore & Memories Drawer Button */}
            <button
              type="button"
              onClick={onOpenMemoriesDrawer}
              className="icon-btn h-8 w-8 text-text-muted hover:text-text-primary"
              title="Lore & Memories Notebook"
            >
              <BookOpen className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Bottom Strip: Interactive Demeanor & Relationship Status Bar */}
        <div
          onClick={onOpenRelationshipModal}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenRelationshipModal();
            }
          }}
          className="group flex flex-col gap-1 rounded-lg border border-border-hairline bg-white/[0.02] p-1.5 px-2.5 transition-colors hover:border-accent/40 hover:bg-white/[0.04] cursor-pointer"
          title="Click to inspect & override relationship dynamics"
        >
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-accent">
                {stage}
              </span>
              <span className="rounded-full bg-accent/15 px-1.5 py-0.2 font-mono text-[10px] text-accent">
                {affinityVal >= 0 ? `+${affinityVal}` : affinityVal}
              </span>
              <span className="text-text-muted">&bull;</span>
              <span className="text-text-secondary italic">
                {mood}
              </span>
            </div>

            <div className="flex items-center gap-1 font-mono text-[10px] text-text-muted group-hover:text-accent">
              <Sliders className="h-3 w-3" />
              <span className="hidden sm:inline">Director</span>
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-text-muted"><span>Trust {relationship.trust} · Strain {relationship.strain}</span><span>{relationship.emotionIntensity !== undefined ? `Emotion ${Math.round(relationship.emotionIntensity * 100)}%` : ""}</span></div>
          {/* Neutral is the center; only distance from neutral is filled. */}
          <div className="relative h-1.5 w-full rounded-full bg-white/5 overflow-hidden" role="meter" aria-label="Closeness" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={affinityVal} aria-valuetext={`${stage}, ${affinityVal}`}>
            <div
              className={cn("absolute h-full transition-all duration-500 rounded-full", affinityVal < 0 ? "bg-rose-400" : "bg-emerald-400")}
              style={{ left: `${Math.min(50, percent)}%`, width: `${Math.abs(percent - 50)}%` }}
            />
            <span className="absolute left-1/2 top-0 h-full w-px bg-white/60" />
          </div>
          <div className="flex justify-between text-[9px] text-text-muted"><span>Hostile −100</span><span>Neutral 0</span><span>Close +100</span></div>
          {relationship.changeReason && <p className="text-[10px] text-text-secondary">{relationship.changeReason}</p>}
        </div>
      </div>
    </header>
  );
}
