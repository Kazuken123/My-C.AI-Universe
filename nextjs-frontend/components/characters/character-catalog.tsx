'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import type { Character, CharacterSortOption } from '@/types/character';
import { CharacterCard } from './character-card';
import { OrbitHero } from './orbit-hero';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const CATEGORY_TABS = ['All Canon', 'Anime', 'Roleplay', 'Fantasy', 'Action', 'Slice of Life', 'Mystery', 'Mentor', 'Original'];

function transitionCatalog(update: () => void) {
  const run = (window as Window & { orbitViewTransition?: (callback: () => void) => unknown }).orbitViewTransition;
  if (run) run(() => flushSync(update));
  else update();
}

export function CharacterCatalog() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Canon');
  const [sort, setSort] = useState<CharacterSortOption>('popular');

  const fetchCharacters = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const category = activeCategory === 'All Canon' ? undefined : activeCategory === 'Mentor' ? 'Helper' : activeCategory;
      const data = await api.getCharacters({ search: search.trim() || undefined, category, sort });
      if (currentRequest === requestId.current) transitionCatalog(() => {
        if (currentRequest === requestId.current) {
          setCharacters(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      });
    } catch {
      if (currentRequest === requestId.current) {
        setError(true);
        setLoading(false);
      }
    }
  }, [search, activeCategory, sort]);

  useEffect(() => {
    const pendingRequests = requestId;
    setLoading(true);
    setError(false);
    document.getElementById('discover-grid')?.scrollTo({ left: 0, behavior: 'instant' });
    const timer = setTimeout(fetchCharacters, 180);
    return () => { clearTimeout(timer); pendingRequests.current++; };
  }, [fetchCharacters]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      const active = document.activeElement;
      if (event.key === '/' && !active?.closest('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const resetFilters = () => {
    setSearch('');
    setActiveCategory('All Canon');
  };
  const retry = () => {
    document.getElementById('discover-grid')?.focus({ preventScroll: true });
    void fetchCharacters();
  };
  const hasFilters = Boolean(search.trim() || activeCategory !== 'All Canon');
  const hasCharacters = characters.length > 0;
  const status = loading
    ? hasCharacters ? 'Updating characters… Showing previous results.' : 'Loading characters…'
    : error
      ? hasCharacters ? 'Couldn’t update characters. Showing previous results.' : ''
      : `${characters.length} ${characters.length === 1 ? 'character' : 'characters'}`;

  return (
    <div className="content-container orbit-discover">
      <header className="discover-topbar universe-searchbar">
        <span className="topbar-heading">Discover</span>
      </header>
      <OrbitHero hidden={hasFilters} />
      <section className="section-block orbit-roster" id="character-roster" aria-labelledby="roster-heading" tabIndex={-1}>
        <div className="orbit-section-heading">
          <h2 id="roster-heading">Characters</h2>
          <a className="btn-ghost atlas-return" href="#universe-hero" onClick={() => { if (hasFilters) flushSync(resetFilters); }}>Return to scene <span aria-hidden="true">↑</span></a>
        </div>
        <div className="atlas-roster-controls">
          <div className="search-controls">
            <div className="search-box">
              <i className="ph-light ph-magnifying-glass search-icon" aria-hidden="true" />
              <input ref={searchInputRef} type="search" id="discoverSearch" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search characters" placeholder="Search" autoComplete="off" />
              <kbd className="search-kbd" aria-hidden="true">/</kbd>
            </div>
          </div>
          <div className="atlas-sort">
            <i className="ph-light ph-funnel-simple select-icon" aria-hidden="true" />
            <select className="select-control" id="discoverSort" value={sort} onChange={event => { const value = event.target.value as CharacterSortOption; transitionCatalog(() => setSort(value)); }} aria-label="Sort characters">
              <option value="popular">Most interactions</option><option value="likes">Most loved</option><option value="newest">New arrivals</option><option value="name">Name A–Z</option>
            </select>
          </div>
        </div>
        <div className="roster-filter-bar"><div className="category-pills" id="category-pills" role="group" aria-label="Character Categories">
          {CATEGORY_TABS.map(category => <button key={category} type="button" onClick={() => transitionCatalog(() => setActiveCategory(category))} className={cn('category-pill', activeCategory === category && 'active')} aria-pressed={activeCategory === category}>{category}</button>)}
        </div></div>
        <div className="atlas-roster-feedback">
          <p role="status">{status}</p>
          {error && hasCharacters && <button className="btn-ghost" type="button" onClick={retry}>Retry</button>}
        </div>
        <div className="character-rail" data-character-rail>
          <button className="rail-arrow rail-prev" type="button" data-rail-prev aria-label="Previous characters" aria-controls="discover-grid" hidden>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="bento-character-grid character-track" id="discover-grid" aria-busy={loading} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Characters. Use left and right arrow keys to browse.">
            {hasCharacters ? characters.map(character => <CharacterCard key={character.id} character={character} />) : loading ? (
              Array.from({ length: 4 }, (_, index) => <div className="orbit-skeleton atlas-portrait-skeleton" key={index} aria-hidden="true" />)
            ) : error ? (
              <div className="orbit-state" role="alert">
                <h3>Couldn’t load characters</h3>
                <p>Try again to reload the roster.</p>
                <button className="btn-island" type="button" onClick={retry}>Try again</button>
              </div>
            ) : (
              <div className="orbit-state">
                <h3>{hasFilters ? 'No characters found' : 'No characters yet'}</h3>
                {hasFilters ? (
                  <><p>Try a different name or category.</p><button className="btn-island" type="button" onClick={() => { searchInputRef.current?.focus({ preventScroll: true }); resetFilters(); }}>Clear filters</button></>
                ) : <Link className="btn-island" href="/create">Create a character</Link>}
              </div>
            )}
          </div>
          <button className="rail-arrow rail-next" type="button" data-rail-next aria-label="Next characters" aria-controls="discover-grid" hidden>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <span className="sr-only" data-rail-status role="status" aria-live="polite" />
        </div>
      </section>
    </div>
  );
}
