'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { UserPersona } from '@/types/persona';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { Check, Loader2, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PersonaFormProps {
  onCreated?: (newPersona: UserPersona) => void;
  existingPersonasCount?: number;
  className?: string;
}

const PRESET_GLYPHS = ['AK', 'TR', '⚔️', '✨', '👑', '🕵️', '🔮', '🛡️', '🌌', '🦾'];

export function PersonaForm({
  onCreated,
  existingPersonasCount = 0,
  className,
}: PersonaFormProps) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('AK');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isFirstPersona = existingPersonasCount === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Persona name is required.');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Persona name cannot exceed 100 characters.');
      return;
    }
    if (description.length > 2000) {
      setError('Persona backstory cannot exceed 2000 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: trimmedName,
        avatar: avatar.trim() || '🌟',
        description: description.trim(),
        isDefault: isFirstPersona ? true : isDefault,
      };

      const created = await api.createPersona(payload);
      setSuccess(`Identity "${created.name}" registered successfully.`);
      setName('');
      setDescription('');
      setAvatar('AK');
      setIsDefault(true);

      if (onCreated) {
        onCreated(created);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register persona';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DoubleBezel className={cn('w-full', className)} coreClassName="p-6 space-y-6">
      {/* Form Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h2 className="font-display text-xl font-bold tracking-tight text-text-primary">
            Register Identity
          </h2>
          <span className="rounded bg-accent/15 border border-accent/30 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-accent">
            PERSONA
          </span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Characters adapt their dialogue, tone, and memory to match your active roleplay persona.
        </p>
      </div>

      {/* Status Feedback */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Identity Name */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="persona-name" className="text-xs font-semibold text-text-secondary">
              Identity Name <span className="text-accent">*</span>
            </label>
            <span className="font-mono text-[10px] text-text-muted">
              {name.length}/100
            </span>
          </div>
          <input
            id="persona-name"
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Akira / Sorcerer"
            className="w-full rounded-lg border border-border-hairline bg-input px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:bg-input-focus focus:outline-none transition-colors"
          />
        </div>

        {/* Row 2: Monogram Glyph / Avatar + Quick Pickers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="persona-avatar" className="text-xs font-semibold text-text-secondary">
              Monogram Glyph / Avatar
            </label>
            <span className="font-mono text-[10px] text-text-muted">
              {avatar.length}/4
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Preview Avatar */}
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 font-mono text-base font-bold text-accent shadow-inner select-none"
              title="Live Avatar Preview"
            >
              {avatar || '🌟'}
            </div>

            <input
              id="persona-avatar"
              type="text"
              maxLength={4}
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="AK or ⚔️"
              className="flex-1 rounded-lg border border-border-hairline bg-input px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:bg-input-focus focus:outline-none transition-colors uppercase font-mono"
            />
          </div>

          {/* Quick Glyph Picker Pills */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-text-muted font-mono mr-1">Presets:</span>
            {PRESET_GLYPHS.map((glyph) => (
              <button
                key={glyph}
                type="button"
                onClick={() => setAvatar(glyph)}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-mono transition-colors border cursor-pointer',
                  avatar === glyph
                    ? 'border-accent bg-accent/20 text-accent font-bold'
                    : 'border-border-hairline bg-white/5 text-text-muted hover:text-text-primary hover:bg-white/10'
                )}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Backstory & Traits */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="persona-desc" className="text-xs font-semibold text-text-secondary">
              Persona Backstory &amp; Traits
            </label>
            <span className="font-mono text-[10px] text-text-muted">
              {description.length}/2000
            </span>
          </div>
          <textarea
            id="persona-desc"
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your background, relationship to the world, and traits so characters address you with contextual awareness..."
            className="w-full rounded-lg border border-border-hairline bg-input p-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:bg-input-focus focus:outline-none transition-colors resize-y leading-relaxed"
          />
        </div>

        {/* Row 4: Default Identity Checkbox */}
        <div className="flex items-center gap-2.5 pt-1">
          <input
            id="persona-default"
            type="checkbox"
            checked={isFirstPersona ? true : isDefault}
            disabled={isFirstPersona}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-border-subtle bg-input text-accent accent-accent focus:ring-accent"
          />
          <label htmlFor="persona-default" className="text-xs font-medium text-text-secondary cursor-pointer select-none">
            {isFirstPersona
              ? 'Active default identity (Required for first persona)'
              : 'Set as active default identity'}
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="btn-island w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving Identity to SQL...</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>Save Identity to SQL</span>
            </span>
          )}
          <span className="btn-island-icon">
            <Check className="h-3.5 w-3.5" />
          </span>
        </button>
      </form>
    </DoubleBezel>
  );
}
