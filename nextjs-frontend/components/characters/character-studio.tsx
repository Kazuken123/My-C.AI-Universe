'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles,
  Globe,
  Shuffle,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  User,
  Radio,
  Sliders,
  Mic,
  X,
} from 'lucide-react';
import type { CharacterCreatePayload } from '@/types/character';
import { api } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { VoicePickerModal } from '@/components/characters/voice-picker-modal';
import {
  resolveAvatarUrl,
  CHARACTER_CATEGORIES,
  RELATIONSHIP_STAGE_PRESETS,
  PRESET_AVATAR_SEEDS,
} from '@/lib/character-utils';
import { cn } from '@/lib/utils';

export function CharacterStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const { user } = useAuth();

  const [loadingInitial, setLoadingInitial] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [categories, setCategories] = useState('Roleplay, Anime');
  const [greeting, setGreeting] = useState('');
  const [avatar, setAvatar] = useState('');
  const [personality, setPersonality] = useState('');
  const [appearance, setAppearance] = useState('');
  const [abilities, setAbilities] = useState('');
  const [background, setBackground] = useState('');
  const [speakingStyle, setSpeakingStyle] = useState('');
  const [exampleDialogues, setExampleDialogues] = useState('');
  const [initialMemory, setInitialMemory] = useState('');
  const [initialAffinity, setInitialAffinity] = useState(0);
  const [initialRelationshipStage, setInitialRelationshipStage] = useState('Stranger / Neutral');
  const [relationshipDynamic, setRelationshipDynamic] = useState('');
  const [wikiUrl, setWikiUrl] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);

  // AI & Wiki toolbars
  const [aiConcept, setAiConcept] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [wikiInput, setWikiInput] = useState('');
  const [isExtractingWiki, setIsExtractingWiki] = useState(false);

  // Load existing character for edit mode
  const loadForEdit = useCallback(async (id: string) => {
    try {
      setLoadingInitial(true);
      const char = await api.getCharacter(id);
      setName(char.name || '');
      setTagline(char.tagline || '');
      setCategories(
        Array.isArray(char.categories)
          ? char.categories.join(', ')
          : (char.categories as unknown as string) || ''
      );
      setGreeting(char.greeting || '');
      setAvatar(char.avatar || '');
      setPersonality(char.personality || '');
      setAppearance(char.appearance || '');
      setAbilities(char.abilities || '');
      setBackground(char.background || '');
      setSpeakingStyle(char.speaking_style || char.speakingStyle || '');
      setExampleDialogues(char.example_dialogues || char.exampleDialogues || '');
      setInitialMemory(char.initial_memory || char.initialMemory || '');
      setInitialAffinity(char.initialAffinity ?? char.initial_affinity ?? 0);
      setVoiceId(char.voiceId || char.voice_id || '');
      setVoiceName(char.voiceName || char.voice_name || '');
      setInitialRelationshipStage(
        char.initialRelationshipStage || char.initial_relationship_stage || 'Stranger / Neutral'
      );
      setRelationshipDynamic(char.relationshipDynamic || char.relationship_dynamic || '');
      setWikiUrl(char.wiki || char.wikiUrl || char.wiki_url || '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load character data';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    if (editId) {
      loadForEdit(editId);
    }
  }, [editId, loadForEdit]);

  // AI Generation Handler
  const handleGenerateAI = async () => {
    if (!aiConcept.trim()) {
      setStatusMessage({ type: 'error', text: 'Enter a concept prompt for the AI synthesizer.' });
      return;
    }

    setIsGeneratingAI(true);
    setStatusMessage(null);
    try {
      const res = await api.generateCharacterAI(aiConcept.trim());
      if (res) {
        if (res.name) setName(res.name);
        if (res.tagline) setTagline(res.tagline);
        if (res.greeting) setGreeting(res.greeting);
        if (res.personality) setPersonality(res.personality);
        if (res.appearance) setAppearance(res.appearance);
        if (res.abilities) setAbilities(res.abilities);
        if (res.background) setBackground(res.background);
        if (res.speaking_style) setSpeakingStyle(res.speaking_style);
        if (res.avatar) setAvatar(res.avatar);
        if (res.categories && Array.isArray(res.categories)) {
          setCategories(res.categories.join(', '));
        }
        setStatusMessage({
          type: 'success',
          text: `Synthesized character profile for "${res.name || 'new character'}"!`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI generation failed';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Wiki Extraction Handler
  const handleExtractWiki = async () => {
    if (!wikiInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Provide a valid Wikipedia or Fandom URL.' });
      return;
    }

    setIsExtractingWiki(true);
    setStatusMessage(null);
    try {
      const res = await api.parseWiki(wikiInput.trim());
      const c = res.character || res;
      if (c) {
        if (c.name) setName(c.name);
        if (c.tagline) setTagline(c.tagline);
        if (c.personality) setPersonality(c.personality);
        if (c.appearance) setAppearance(c.appearance);
        if (c.background) setBackground(c.background);
        if (c.speaking_style) setSpeakingStyle(c.speaking_style);
        if (c.initial_memory) setInitialMemory(c.initial_memory);
        setWikiUrl(wikiInput.trim());
        setStatusMessage({
          type: 'success',
          text: `Extracted canon lore & dialogue patterns for "${c.name || 'character'}"!`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wiki extraction failed';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsExtractingWiki(false);
    }
  };

  // Random Avatar Seed
  const handleRandomAvatar = () => {
    const randomSeed = PRESET_AVATAR_SEEDS[Math.floor(Math.random() * PRESET_AVATAR_SEEDS.length)] + '_' + Math.floor(Math.random() * 1000);
    const newAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(randomSeed)}`;
    setAvatar(newAvatar);
  };

  // Stage Preset change syncs affinity
  const handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedStage = e.target.value;
    setInitialRelationshipStage(selectedStage);
    const matched = RELATIONSHIP_STAGE_PRESETS.find((p) => p.stage === selectedStage);
    if (matched) {
      setInitialAffinity(matched.affinity);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setStatusMessage({ type: 'error', text: 'Character name is required.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const parsedCategories = categories
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: CharacterCreatePayload = {
      name: name.trim(),
      tagline: tagline.trim(),
      avatar: avatar.trim() || undefined,
      greeting: greeting.trim(),
      categories: parsedCategories.length > 0 ? parsedCategories : ['Roleplay'],
      personality: personality.trim(),
      appearance: appearance.trim(),
      abilities: abilities.trim(),
      background: background.trim(),
      speaking_style: speakingStyle.trim(),
      example_dialogues: exampleDialogues.trim(),
      initial_memory: initialMemory.trim(),
      initial_affinity: initialAffinity,
      initial_relationship_stage: initialRelationshipStage,
      relationship_dynamic: relationshipDynamic.trim(),
      wiki: wikiUrl.trim() || undefined,
      voice_provider: voiceId ? 'fish_audio' : 'browser',
      voice_id: voiceId.trim(),
      voiceId: voiceId.trim(),
      voice_name: voiceName.trim(),
      voiceName: voiceName.trim(),
    };

    try {
      let savedCharacter;
      if (editId) {
        savedCharacter = await api.updateCharacter(editId, payload);
      } else {
        savedCharacter = await api.createCharacter(payload);
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully ${editId ? 'updated' : 'created'} "${savedCharacter.name}". Launching scene...`,
      });

      // Navigate to chat
      setTimeout(() => {
        router.push(`/chat/${encodeURIComponent(savedCharacter.id)}`);
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save character';
      setStatusMessage({ type: 'error', text: msg });
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="font-mono text-xs">Loading character architecture...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-container space-y-8">
      {/* Studio Header */}
      <div>
        <h1 className="font-display text-3xl font-extrabold text-text-primary">
          {editId ? `Modify Architecture: ${name || 'Character'}` : 'Character Architecture Studio'}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Synthesize deep autonomous roleplay personas with relational SQL lore, dynamic demeanors, and voice traits.
        </p>
      </div>

      {/* Synthesis Accelerators: AI & Wiki Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI Concept Synthesizer */}
        <DoubleBezel coreClassName="p-5 space-y-3">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles className="h-4 w-4" />
            <h2 className="font-display text-sm font-bold text-text-primary">
              AI Concept Synthesizer
            </h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Input a one-line prompt to generate a full personality, appearance, backstory, and greeting.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiConcept}
              onChange={(e) => setAiConcept(e.target.value)}
              placeholder="e.g. Rogue alchemist seeking redemption in neon Tokyo"
              className="flex-1 rounded-lg border border-border-hairline bg-input px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerateAI();
                }
              }}
            />
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={isGeneratingAI}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
            >
              {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isGeneratingAI ? 'Synthesizing...' : 'Generate'}</span>
            </button>
          </div>
        </DoubleBezel>

        {/* Canon Lore Wiki Ingestion */}
        <DoubleBezel coreClassName="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sky-400">
            <Globe className="h-4 w-4" />
            <h2 className="font-display text-sm font-bold text-text-primary">
              Canon Wiki Lore Parser
            </h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Ingest character lore, history, and traits directly from Fandom or Wikipedia.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={wikiInput}
              onChange={(e) => setWikiInput(e.target.value)}
              placeholder="https://fandom.com/wiki/..."
              className="flex-1 rounded-lg border border-border-hairline bg-input px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleExtractWiki();
                }
              }}
            />
            <button
              type="button"
              onClick={handleExtractWiki}
              disabled={isExtractingWiki}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 transition-colors hover:bg-sky-500/20 disabled:opacity-50 shrink-0"
            >
              {isExtractingWiki ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              <span>{isExtractingWiki ? 'Ingesting...' : 'Ingest Lore'}</span>
            </button>
          </div>
        </DoubleBezel>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl border p-4 text-xs font-medium',
            statusMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          )}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Form + Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Form Fields (2 columns) */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
          {/* Section 1: Core Persona Identification */}
          <DoubleBezel coreClassName="p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-text-primary border-b border-border-hairline pb-2">
              1. Core Identification
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Character Name <span className="text-accent">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Makise Kurisu"
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Tagline / Archetype
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Neuroscientist & Tsundere Lab Member 004"
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-xs text-text-secondary">
                    Avatar URL
                  </label>
                  <button
                    type="button"
                    onClick={handleRandomAvatar}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
                  >
                    <Shuffle className="h-3 w-3" />
                    Procedural Seed
                  </button>
                </div>
                <input
                  type="text"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://... or Dicebear seed"
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Categories (Comma separated)
                </label>
                <input
                  type="text"
                  value={categories}
                  onChange={(e) => setCategories(e.target.value)}
                  placeholder="Roleplay, Anime, Sci-Fi"
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-text-secondary">
                Default Character Voice / Anime Seiyuu (Author Default)
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-hairline bg-core-elevated px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      voiceId
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-border-hairline bg-white/5 text-text-muted'
                    )}
                  >
                    <Mic className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate">
                      {voiceId ? voiceName || voiceId : 'Default Browser Speech'}
                    </div>
                    <div className="font-mono text-[10px] text-text-muted truncate">
                      {voiceId
                        ? `Fish Audio S2.1 · ID: ${voiceId}`
                        : 'Default voice when chatting with this character. Users can choose a different voice in chat.'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {voiceId && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceId('');
                        setVoiceName('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border-hairline bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-text-muted hover:text-text-primary transition-colors"
                      title="Reset to Default Browser Speech"
                    >
                      <X className="h-3 w-3" />
                      <span>Clear</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsVoicePickerOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    <span>{voiceId ? 'Change Default Voice' : 'Browse Default Voices'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-text-secondary">
                Opening Scene / Greeting <span className="text-accent">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="*Adjusts lab coat and glares suspiciously at your phone.* Who are you, and how did you find this laboratory?"
                className="w-full rounded-lg border border-border-hairline bg-input p-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
              <p className="text-[11px] text-text-muted">
                Tip: Use *asterisks* for narration/actions and standard quotes for dialogue.
              </p>
            </div>
          </DoubleBezel>

          {/* Section 2: Deep Definition & Lore */}
          <DoubleBezel coreClassName="p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-text-primary border-b border-border-hairline pb-2">
              2. Deep Definition & Lore
            </h2>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-text-secondary">
                Personality & Psychological Traits
              </label>
              <textarea
                rows={3}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="Analytical, sarcastic, protective of research, defensive when embarrassed, fiercely loyal."
                className="w-full rounded-lg border border-border-hairline bg-input p-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Physical Appearance
                </label>
                <textarea
                  rows={2}
                  value={appearance}
                  onChange={(e) => setAppearance(e.target.value)}
                  placeholder="Chestnut red hair, violet eyes, loose khaki jacket over lab attire."
                  className="w-full rounded-lg border border-border-hairline bg-input p-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Abilities & Special Skills
                </label>
                <textarea
                  rows={2}
                  value={abilities}
                  onChange={(e) => setAbilities(e.target.value)}
                  placeholder="Theoretical physics, memory architecture modeling, rapid deductive reasoning."
                  className="w-full rounded-lg border border-border-hairline bg-input p-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-text-secondary">
                Background & Lore History
              </label>
              <textarea
                rows={3}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Born in Tokyo, published neuroscience research at Victor Chondria University at age 17..."
                className="w-full rounded-lg border border-border-hairline bg-input p-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Speaking Style & Cadence
                </label>
                <input
                  type="text"
                  value={speakingStyle}
                  onChange={(e) => setSpeakingStyle(e.target.value)}
                  placeholder="Sharp, articulate, scientific vocabulary, quick comebacks."
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Initial Memory Anchors
                </label>
                <input
                  type="text"
                  value={initialMemory}
                  onChange={(e) => setInitialMemory(e.target.value)}
                  placeholder="Core memories injected into narrative context."
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-text-secondary">
                Example Dialogues
              </label>
              <textarea
                rows={3}
                value={exampleDialogues}
                onChange={(e) => setExampleDialogues(e.target.value)}
                placeholder={`User: Is time travel truly feasible?\n{{char}}: "Theoretically, closed timelike curves violate causality, but under Kerr metric singularities..."`}
                className="w-full rounded-lg border border-border-hairline bg-input p-3 text-sm font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
              />
            </div>
          </DoubleBezel>

          {/* Section 3: Dynamic Demeanor & Relationship Mechanics */}
          <DoubleBezel coreClassName="p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-text-primary border-b border-border-hairline pb-2 flex items-center justify-between">
              <span>3. Relational Baseline Dynamics</span>
              <span className="font-mono text-xs text-accent font-normal">
                SQL Persisted
              </span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Initial Relationship Stage
                </label>
                <select
                  value={initialRelationshipStage}
                  onChange={handleStageChange}
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none cursor-pointer"
                >
                  {RELATIONSHIP_STAGE_PRESETS.map((preset) => (
                    <option key={preset.stage} value={preset.stage}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-xs text-text-secondary">
                    Initial Affinity Score
                  </label>
                  <span className="font-mono text-xs font-bold text-accent">
                    {initialAffinity >= 0 ? `+${initialAffinity}` : initialAffinity}
                  </span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={initialAffinity}
                  onChange={(e) => setInitialAffinity(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs text-text-secondary">
                Relationship Dynamic Description
              </label>
              <input
                type="text"
                value={relationshipDynamic}
                onChange={(e) => setRelationshipDynamic(e.target.value)}
                placeholder="e.g. Reluctant partners bound by a dangerous secret"
                className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </div>
          </DoubleBezel>

          {/* Action Row */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-border-hairline bg-white/5 px-4 py-2.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="btn-island py-2.5 px-6 text-sm"
            >
              <span>{submitting ? 'Committing to SQL...' : editId ? 'Save & Launch Scene' : 'Commit & Launch Scene'}</span>
              <span className="btn-island-icon">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              </span>
            </button>
          </div>
        </form>

        {/* Live Dossier Preview (Right Column) */}
        <div className="sticky top-6 space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Live Dossier Preview
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border-hairline bg-white/5 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
              <Radio className="h-2 w-2 animate-pulse" />
              SYNCHRONIZED
            </span>
          </div>

          <DoubleBezel coreClassName="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 shrink-0 rounded-2xl overflow-hidden border border-accent/40 bg-core-elevated shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveAvatarUrl(avatar, name || 'New Character')}
                  alt={name || 'Preview'}
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-core" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="font-display text-lg font-bold text-text-primary truncate">
                  {name || 'New Character'}
                </h3>
                <p className="font-mono text-[11px] text-text-muted truncate">
                  {user?.username ? `@${user.username}` : '@you'} · Relational SQL
                </p>
                <p className="text-xs text-text-secondary line-clamp-2">
                  {tagline || 'AI Roleplay Persona'}
                </p>
              </div>
            </div>

            {/* Greeting preview */}
            <div className="rounded-xl border border-border-hairline bg-white/[0.02] p-3 text-xs italic text-text-muted">
              &ldquo;{greeting || '*Scene awaits first line...*'}&rdquo;
            </div>

            {/* Tags preview */}
            <div className="flex flex-wrap gap-1.5">
              {categories
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 3)
                .map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full border border-border-hairline bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-text-muted"
                  >
                    {cat}
                  </span>
                ))}
            </div>

            {/* Demeanor Preview */}
            <div className="rounded-lg border border-border-hairline bg-core-elevated p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Relationship State:</span>
                <span className="font-mono font-bold text-accent">
                  {initialRelationshipStage} ({initialAffinity >= 0 ? `+${initialAffinity}` : initialAffinity})
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Voice Engine:</span>
                <span className="font-mono font-semibold text-text-primary truncate max-w-[160px]">
                  {voiceId ? voiceName || 'Fish Audio' : 'Browser Speech'}
                </span>
              </div>
              {relationshipDynamic && (
                <p className="text-[11px] text-text-secondary italic">
                  {relationshipDynamic}
                </p>
              )}
            </div>
          </DoubleBezel>
        </div>
      </div>

      <VoicePickerModal
        isOpen={isVoicePickerOpen}
        onClose={() => setIsVoicePickerOpen(false)}
        selectedVoiceId={voiceId}
        selectedVoiceName={voiceName}
        title="Set Author Default Voice"
        subtitle="Default voice for this character. Users can choose their own voice in chat."
        onSelectVoice={(id, vName) => {
          setVoiceId(id);
          setVoiceName(vName);
        }}
      />
    </div>
  );
}
