'use client';

import React, { useState } from 'react';
import { X, Sliders, Heart, Shield, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import type { RelationshipMetrics } from '@/types/chat';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { RELATIONSHIP_MOODS } from '@/lib/chat-utils';
import { RELATIONSHIP_STAGE_PRESETS } from '@/lib/character-utils';

export interface RelationshipDirectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  relationship: RelationshipMetrics;
  characterName: string;
  relationshipDynamic?: string;
  onSaveOverride: (overrides: {
    affinity: number;
    trust: number;
    strain: number;
    relationshipStage: string;
    relationshipMood: string;
  }) => Promise<void>;
}

export function RelationshipDirectorModal({
  isOpen,
  onClose,
  relationship,
  characterName,
  relationshipDynamic,
  onSaveOverride,
}: RelationshipDirectorModalProps) {
  const [affinity, setAffinity] = useState(relationship.affinity ?? 0);
  const [trust, setTrust] = useState(relationship.trust ?? 0);
  const [strain, setStrain] = useState(relationship.strain ?? 0);
  const [stage, setStage] = useState(relationship.relationshipStage || 'Stranger / Neutral');
  const [mood, setMood] = useState(relationship.relationshipMood || 'Calm');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleStagePresetSelect = (presetStage: string) => {
    setStage(presetStage);
    const matched = RELATIONSHIP_STAGE_PRESETS.find((p) => p.stage === presetStage);
    if (matched) {
      setAffinity(matched.affinity);
      setTrust(Math.max(0, matched.affinity));
    }
  };

  const handleApply = async () => {
    setIsSaving(true);
    try {
      await onSaveOverride({
        affinity,
        trust,
        strain,
        relationshipStage: stage,
        relationshipMood: mood,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-lg">
        <DoubleBezel coreClassName="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-hairline pb-3">
            <div className="flex items-center gap-2 text-accent">
              <Sliders className="h-4 w-4" />
              <h2 className="font-display text-base font-bold text-text-primary">
                Relationship Director: {characterName}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="icon-btn h-7 w-7 text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Dynamic Rule Banner if present */}
          {relationshipDynamic && (
            <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 space-y-1">
              <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-accent flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Dynamic Directive
              </span>
              <p className="text-xs text-text-secondary italic">
                {relationshipDynamic}
              </p>
            </div>
          )}

          {/* 4 Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-border-hairline bg-white/[0.03] p-2.5 space-y-1">
              <div className="flex items-center justify-center gap-1 text-[11px] text-text-muted">
                <Heart className="h-3 w-3 text-rose-400" />
                <span>Affinity</span>
              </div>
              <p className="font-mono text-sm font-bold text-text-primary">
                {affinity >= 0 ? `+${affinity}` : affinity}
              </p>
            </div>

            <div className="rounded-lg border border-border-hairline bg-white/[0.03] p-2.5 space-y-1">
              <div className="flex items-center justify-center gap-1 text-[11px] text-text-muted">
                <Shield className="h-3 w-3 text-sky-400" />
                <span>Trust</span>
              </div>
              <p className="font-mono text-sm font-bold text-text-primary">
                {trust >= 0 ? `+${trust}` : trust}
              </p>
            </div>

            <div className="rounded-lg border border-border-hairline bg-white/[0.03] p-2.5 space-y-1">
              <div className="flex items-center justify-center gap-1 text-[11px] text-text-muted">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                <span>Strain</span>
              </div>
              <p className="font-mono text-sm font-bold text-text-primary">
                {strain}
              </p>
            </div>

            <div className="rounded-lg border border-border-hairline bg-white/[0.03] p-2.5 space-y-1">
              <div className="flex items-center justify-center gap-1 text-[11px] text-text-muted">
                <Sparkles className="h-3 w-3 text-emerald-400" />
                <span>Mood</span>
              </div>
              <p className="font-mono text-xs font-bold text-emerald-400 truncate">
                {mood}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4 pt-1">
            {/* Stage Preset */}
            <div className="space-y-1.5">
              <label className="font-mono text-xs text-text-secondary">
                Relationship Stage Preset
              </label>
              <select
                value={stage}
                onChange={(e) => handleStagePresetSelect(e.target.value)}
                className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none cursor-pointer"
              >
                {RELATIONSHIP_STAGE_PRESETS.map((preset) => (
                  <option key={preset.stage} value={preset.stage}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Affinity Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-mono text-xs text-text-secondary">
                  Manual Affinity Adjustment
                </label>
                <span className="font-mono text-xs font-bold text-accent">
                  {affinity >= 0 ? `+${affinity}` : affinity}
                </span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={affinity}
                onChange={(e) => setAffinity(Number(e.target.value))}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

            {/* Mood & Strain Row */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <label className="font-mono text-xs text-text-secondary">
                  Current Emotional Mood
                </label>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="w-full rounded-lg border border-border-hairline bg-input px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none cursor-pointer"
                >
                  {RELATIONSHIP_MOODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setStrain(0)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border-hairline bg-white/5 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Reset Strain to 0</span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-hairline">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-hairline bg-white/5 px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isSaving}
              className="btn-island py-2 px-4 text-xs"
            >
              <span>{isSaving ? 'Applying...' : 'Apply Overrides'}</span>
            </button>
          </div>
        </DoubleBezel>
      </div>
    </div>
  );
}
