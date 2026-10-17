'use client';

import React, { useState } from 'react';
import { UserPersona } from '@/types/persona';
import { DoubleBezel } from '@/components/ui/double-bezel';
import { Check, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PersonaCardProps {
  persona: UserPersona;
  onSetDefault: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  isUpdatingDefault?: boolean;
  isDeleting?: boolean;
  canDelete?: boolean;
}

export function PersonaCard({
  persona,
  onSetDefault,
  onDelete,
  isUpdatingDefault = false,
  isDeleting = false,
  canDelete = true,
}: PersonaCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const formattedDate = React.useMemo(() => {
    try {
      return new Date(persona.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }, [persona.createdAt]);

  const handleDeleteClick = () => {
    if (!canDelete) return;
    setConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    setConfirmDelete(false);
    await onDelete(persona.id);
  };

  return (
    <DoubleBezel
      shellClassName={cn(
        'w-full transition-all duration-300',
        persona.isDefault
          ? 'border-accent/60 shadow-[0_0_24px_rgba(139,92,246,0.22)] ring-1 ring-accent/30'
          : 'border-border-hairline hover:border-white/20'
      )}
      coreClassName="p-5 md:p-6 space-y-4"
    >
      {/* Header Row: Glyph, Info, Badges, and Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Monogram / Glyph Avatar */}
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-mono text-lg font-bold select-none border shadow-inner transition-colors',
              persona.isDefault
                ? 'bg-accent/20 border-accent/40 text-accent shadow-[0_0_14px_rgba(139,92,246,0.25)]'
                : 'bg-white/5 border-border-hairline text-text-primary'
            )}
            title={persona.name}
          >
            {persona.avatar || '🌟'}
          </div>

          {/* Persona Title & Default Badge */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-display text-lg font-bold text-text-primary tracking-tight truncate">
                {persona.name}
              </h3>
              {persona.isDefault && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" />
                  ACTIVE DEFAULT
                </span>
              )}
            </div>
            {formattedDate && (
              <span className="font-mono text-[11px] text-text-muted mt-0.5">
                Registered {formattedDate}
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {!persona.isDefault && (
            <button
              type="button"
              onClick={() => onSetDefault(persona.id)}
              disabled={isUpdatingDefault || isDeleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-hairline bg-white/5 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-all hover:border-accent/40 hover:bg-accent/15 hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Set as active default identity"
            >
              {isUpdatingDefault ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 text-accent" />
              )}
              <span>Set Default</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={!canDelete || isDeleting || isUpdatingDefault}
            className={cn(
              'icon-btn h-8 w-8 text-text-muted transition-colors cursor-pointer',
              !canDelete
                ? 'opacity-35 cursor-not-allowed hover:text-text-muted hover:bg-transparent'
                : 'hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30'
            )}
            title={
              !canDelete
                ? 'Cannot delete your only persona'
                : 'Delete persona identity'
            }
            aria-label="Delete persona"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Backstory & Personality Description Box */}
      <div className="rounded-lg border border-border-hairline bg-black/25 p-3.5 text-sm text-text-secondary leading-relaxed">
        {persona.description ? (
          <p className="whitespace-pre-wrap">{persona.description}</p>
        ) : (
          <p className="italic text-text-muted">
            No backstory defined. Characters will use default traveler dialogue.
          </p>
        )}
      </div>

      {/* Interactive In-Card Deletion Confirmation */}
      {confirmDelete && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>Remove this identity? Characters will no longer recognize this backstory.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded px-2.5 py-1 font-medium text-text-secondary hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="rounded bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-500 shadow-sm transition-colors cursor-pointer"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      )}
    </DoubleBezel>
  );
}
