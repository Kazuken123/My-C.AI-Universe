'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import { UserPersona } from '@/types/persona';
import { PersonaCard } from '@/components/personas/persona-card';
import { PersonaForm } from '@/components/personas/persona-form';
import { DoubleBezel } from '@/components/ui/double-bezel';
import {
  Contact2,
  RefreshCw,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

export default function PersonasPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingDefaultId, setUpdatingDefaultId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadPersonas = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getPersonas();
      setPersonas(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load personas';
      showToast(msg, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPersonas(false);
  }, [loadPersonas]);

  const handleSetDefault = async (id: string) => {
    setUpdatingDefaultId(id);
    try {
      await api.setDefaultPersona(id);
      showToast('Active default persona updated.');
      await loadPersonas(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update default persona';
      showToast(msg, 'error');
    } finally {
      setUpdatingDefaultId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (personas.length <= 1) {
      showToast('Cannot delete the last remaining persona of your account.', 'error');
      return;
    }

    setDeletingId(id);
    try {
      await api.deletePersona(id);
      showToast('Persona identity removed.');
      await loadPersonas(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete persona';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreated = async (newPersona: UserPersona) => {
    showToast(`Saved identity "${newPersona.name}" to SQL.`);
    await loadPersonas(true);
  };

  const activePersona = personas.find((p) => p.isDefault);

  return (
    <div className="content-container space-y-8">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-border-hairline bg-core-elevated p-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-200"
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-text-primary pr-2">
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hero Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border-hairline">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent border border-accent/30">
              <Contact2 className="h-5 w-5" />
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-text-primary">
              Roleplay Identities
            </h1>
          </div>
          <p className="text-sm text-text-secondary max-w-2xl leading-relaxed">
            Configure multiple user personas injected into LLM system prompts so characters recognize your name, backstory, and personality traits.
          </p>
        </div>

        {/* Telemetry Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-border-hairline bg-core px-3 py-1 font-mono text-xs text-text-muted">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>{personas.length} Identities in SQL</span>
          </div>

          <button
            type="button"
            onClick={() => loadPersonas(false)}
            disabled={loading}
            className="icon-btn h-9 w-9 text-text-muted hover:text-text-primary cursor-pointer"
            title="Refresh Roster"
            aria-label="Refresh Roster"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-accent' : ''}`} />
          </button>
        </div>
      </div>

      {/* Guest Warning Banner if not authenticated */}
      {!authLoading && !isAuthenticated && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-semibold text-amber-300">You are browsing personas as a guest</p>
              <p className="text-amber-200/80">Sign in to save custom identities permanently and bind them to your account storylines.</p>
            </div>
          </div>
          <Link
            href="/auth?mode=signin&return=/personas"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 font-semibold text-black hover:bg-amber-300 transition-colors shadow-sm shrink-0"
          >
            <UserCheck className="h-4 w-4" />
            <span>Sign In / Register</span>
          </Link>
        </div>
      )}

      {/* Two-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Personas Stack Roster */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-base font-bold text-text-secondary tracking-tight">
              Active Personas Roster
            </h2>
            {activePersona && (
              <span className="font-mono text-xs text-accent">
                Default: <strong className="text-text-primary">{activePersona.name}</strong>
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <DoubleBezel key={i} coreClassName="p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-white/5 animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-1/3 bg-white/10 rounded animate-pulse" />
                      <div className="h-3 w-1/4 bg-white/5 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="h-16 w-full bg-white/5 rounded-lg animate-pulse" />
                </DoubleBezel>
              ))}
            </div>
          ) : personas.length === 0 ? (
            <DoubleBezel coreClassName="p-10 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-text-muted">
                <Contact2 className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-text-primary">
                No custom personas registered
              </h3>
              <p className="text-sm text-text-muted max-w-md mx-auto">
                Fill out the identity registration form to build your first roleplay persona and unlock customized dialogue.
              </p>
            </DoubleBezel>
          ) : (
            <div className="space-y-4">
              {personas.map((persona) => (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  onSetDefault={handleSetDefault}
                  onDelete={handleDelete}
                  isUpdatingDefault={updatingDefaultId === persona.id}
                  isDeleting={deletingId === persona.id}
                  canDelete={personas.length > 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Persona Registration Form */}
        <div className="lg:col-span-5 sticky top-6">
          <PersonaForm
            onCreated={handleCreated}
            existingPersonasCount={personas.length}
          />
        </div>
      </div>
    </div>
  );
}
