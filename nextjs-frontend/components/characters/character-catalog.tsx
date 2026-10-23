'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Character, CharacterSortOption } from '@/types/character';
import { CharacterCard } from './character-card';
import { api } from '@/lib/api';
import { formatCount, resolveAvatarUrl } from '@/lib/character-utils';
import { cn } from '@/lib/utils';

const CATEGORY_TABS = [
  'All Canon',
  'Anime',
  'Roleplay',
  'Fantasy',
  'Action',
  'Slice of Life',
  'Mystery',
  'Mentor',
  'Original',
];

function getBentoSpanClass(index: number, total: number): string {
  if (total === 1) return 'bento-cell bento-wide';
  if (total === 2) return 'bento-cell bento-half';
  if (total === 4) return 'bento-cell bento-half';
  if (total === 5) {
    return index < 2 ? 'bento-cell bento-half' : 'bento-cell';
  }
  if (index === 0 && total >= 3) {
    const rem = (total - 2) % 3;
    if (rem === 0 || rem === 2) return 'bento-cell bento-wide';
  }
  if (total > 5 && index >= total - 2 && (total - 2) % 3 === 2) {
    return 'bento-cell bento-half';
  }
  return 'bento-cell';
}

export function CharacterCatalog() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All Canon');
  const [sort, setSort] = useState<CharacterSortOption>('popular');

  const fetchCharacters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const categoryParam =
        activeCategory === 'All Canon'
          ? undefined
          : activeCategory === 'Mentor'
          ? 'Helper'
          : activeCategory;

      const data = await api.getCharacters({
        search: search.trim() || undefined,
        category: categoryParam,
        sort,
      });
      setCharacters(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch characters';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [search, activeCategory, sort]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCharacters();
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchCharacters]);

  // Shortcut key: "/" focuses search box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDeleteCharacter = (deletedId: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== deletedId));
  };

  const featuredChar = characters.length > 0 ? characters[0] : null;
  const featuredTags = featuredChar
    ? Array.isArray(featuredChar.categories)
      ? featuredChar.categories
      : typeof featuredChar.categories === 'string'
      ? (featuredChar.categories as string).split(',').map((s) => s.trim()).filter(Boolean)
      : ['Anime', 'Roleplay']
    : [];

  return (
    <div className="content-container">
      {/* 1. Top Command Bar — Exact match to Image 2 & frontend/index.html */}
      <header className="discover-topbar">
        <div className="topbar-title-group">
          <span className="topbar-index">01 / DIRECTORY</span>
          <h1 className="topbar-heading">Character Roster</h1>
        </div>

        <div className="search-controls">
          <div className="search-box">
            <i className="ph-light ph-magnifying-glass search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              id="discoverSearch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, canon, or archetype..."
              autoComplete="off"
            />
            <kbd className="search-kbd">/</kbd>
          </div>

          <div className="select-wrap">
            <i className="ph-light ph-funnel-simple select-icon" />
            <select
              className="select-control"
              id="discoverSort"
              value={sort}
              onChange={(e) => setSort(e.target.value as CharacterSortOption)}
              aria-label="Sort characters"
            >
              <option value="popular">Most Interactions</option>
              <option value="likes">Highest Rated</option>
              <option value="newest">Recently Added</option>
              <option value="name">Alphabetical (A–Z)</option>
            </select>
          </div>
        </div>
      </header>

      {/* 2. Editorial Split Hero */}
      {!search && activeCategory === 'All Canon' && (
        <div className="double-bezel-shell hero-shell">
          <div className="double-bezel-core hero-split-grid">
            <div className="hero-copy-col">
              <h2 className="hero-display-title">Write scenes with characters that remember.</h2>
              <p className="hero-subtext">
                Multi-variant dialogue branching, long-term vector recall, and instant Fandom lore extraction in one studio.
              </p>
              <div className="hero-actions">
                <Link
                  href={featuredChar ? `/chat/${encodeURIComponent(featuredChar.id)}` : '/create'}
                  className="btn-island"
                  id="hero-start-chat-btn"
                >
                  <span>Enter Featured Scene</span>
                  <span className="btn-island-icon" aria-hidden="true">
                    <i className="ph-light ph-arrow-up-right" />
                  </span>
                </Link>
                <Link href="/create" className="btn-ghost" id="hero-create-btn">
                  <i className="ph-light ph-sparkle" />
                  <span>Open Character Studio</span>
                </Link>
              </div>
            </div>

            {/* Right Column: Featured Character Spotlight Card */}
            <div className="hero-Featured-col" id="hero-spotlight-card">
              {featuredChar && (
                <div
                  className="hero-spotlight-dossier"
                  id="hero-spotlight-dossier-card"
                  role="button"
                  tabIndex={0}
                  title={`Click to start scene with ${featuredChar.name}`}
                  onClick={() => router.push(`/chat/${encodeURIComponent(featuredChar.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/chat/${encodeURIComponent(featuredChar.id)}`);
                    }
                  }}
                >
                  <div className="dossier-header-strip">
                    <div className="dossier-avatar-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="dossier-avatar"
                        src={resolveAvatarUrl(featuredChar.avatar, featuredChar.name)}
                        alt={featuredChar.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(featuredChar.name)}`;
                        }}
                      />
                      <span className="dossier-live-dot" title="Ready for scene" />
                    </div>
                    <div className="dossier-header-meta">
                      <div className="dossier-badge-row">
                        <span className="soul-id-badge">
                          <span className="soul-dot" />
                          FEATURED CANON
                        </span>
                        <span className="dossier-creator-badge">
                          {featuredChar.creator && featuredChar.creator !== '@you'
                            ? featuredChar.creator
                            : '@kazuken'}
                        </span>
                      </div>
                      <div className="dossier-name">{featuredChar.name}</div>
                      <div className="dossier-tagline">
                        {featuredChar.tagline || featuredChar.personality || 'AI Roleplay Model'}
                      </div>
                    </div>
                  </div>

                  <div className="dossier-stats-grid">
                    <div className="dossier-meta-card">
                      <span className="dossier-meta-label">
                        <i className="ph-light ph-chats-circle" /> Chats
                      </span>
                      <span className="dossier-meta-val">
                        {formatCount(featuredChar.interactions || 0)}
                      </span>
                    </div>
                    <div className="dossier-meta-card">
                      <span className="dossier-meta-label">
                        <i className="ph-light ph-heart" /> Likes
                      </span>
                      <span className="dossier-meta-val">
                        {formatCount(featuredChar.likes || 0)}
                      </span>
                    </div>
                    <div className="dossier-meta-card">
                      <span className="dossier-meta-label">
                        <i className="ph-light ph-tag" /> Genre
                      </span>
                      <span className="dossier-meta-val">
                        {featuredTags[0] || 'Anime'}
                      </span>
                    </div>
                  </div>

                  <div className="dossier-footer-bar">
                    <div className="dossier-tags-wrap">
                      {featuredTags.slice(0, 2).map((t) => (
                        <span key={t} className="dossier-pill-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="dossier-cta-btn">
                      <span>Enter Scene</span>
                      <i className="ph-light ph-arrow-up-right" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Category Filter Pills & Bento Character Roster */}
      <div className="section-block">
        <div className="roster-filter-bar">
          <div className="category-pills" id="category-pills" role="tablist" aria-label="Character Categories">
            {CATEGORY_TABS.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn('category-pill', isActive && 'active')}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Error Message */}
        {error && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--danger)' }}>
            <p>{error}</p>
          </div>
        )}

        {/* 5. Asymmetric Bento 12-Column Grid */}
        <div className="bento-character-grid" id="discover-grid">
          {characters.map((char, index) => {
            const spanClass = getBentoSpanClass(index, characters.length);
            return (
              <CharacterCard
                key={char.id}
                character={char}
                spanClass={spanClass}
                onDelete={handleDeleteCharacter}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
