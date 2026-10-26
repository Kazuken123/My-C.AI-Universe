'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { Character, CharacterSortOption } from '@/types/character';
import { CharacterCard } from './character-card';
import { OrbitHero } from './orbit-hero';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const CATEGORY_TABS = ['All Canon', 'Anime', 'Roleplay', 'Fantasy', 'Action', 'Slice of Life', 'Mystery', 'Mentor', 'Original'];

export function CharacterCatalog() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Canon');
  const [sort, setSort] = useState<CharacterSortOption>('popular');

  const fetchCharacters = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    document.getElementById('discover-grid')?.scrollTo({ left: 0, behavior: 'instant' });
    setError(null);
    try {
      const category = activeCategory === 'All Canon' ? undefined : activeCategory === 'Mentor' ? 'Helper' : activeCategory;
      const data = await api.getCharacters({ search: search.trim() || undefined, category, sort });
      if (currentRequest === requestId.current) setCharacters(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      if (currentRequest === requestId.current) setError(err instanceof Error ? err.message : 'Could not load characters.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [search, activeCategory, sort]);

  useEffect(() => {
    const pendingRequests = requestId;
    const timer = setTimeout(fetchCharacters, 180);
    return () => { clearTimeout(timer); pendingRequests.current++; };
  }, [fetchCharacters]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (event.key === '/' && !active?.matches('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const resetFilters = () => { setSearch(''); setActiveCategory('All Canon'); };
  const hasFilters = Boolean(search || activeCategory !== 'All Canon');

  return (
    <div className="content-container orbit-discover">
      <header className="discover-topbar universe-searchbar">
        <div className="topbar-title-group"><span className="topbar-index">YOUR UNIVERSE</span><span className="topbar-heading">Discover</span></div>
        <div className="search-controls">
          <div className="search-box">
            <i className="ph-light ph-magnifying-glass search-icon" aria-hidden="true" />
            <input ref={searchInputRef} type="search" id="discoverSearch" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search characters" placeholder="Search characters, worlds, stories..." autoComplete="off" />
            <kbd className="search-kbd">/</kbd>
          </div>
        </div>
      </header>
      {!hasFilters && <OrbitHero />}
      <section className="section-block orbit-roster" id="character-roster" aria-labelledby="roster-heading">
        <div className="orbit-section-heading">
          <div><h2 id="roster-heading">{hasFilters ? 'Find your kind of story' : 'Discover your next connection'}</h2><p role="status">{loading ? 'Finding your next connection…' : error ? 'Your universe will be right back.' : characters.length + ' characters. Endless ways to begin.'}</p></div>
          <div className="select-wrap">
            <i className="ph-light ph-funnel-simple select-icon" aria-hidden="true" />
            <select className="select-control" id="discoverSort" value={sort} onChange={event => setSort(event.target.value as CharacterSortOption)} aria-label="Sort characters">
              <option value="popular">Most interactions</option><option value="likes">Most loved</option><option value="newest">New arrivals</option><option value="name">Name A–Z</option>
            </select>
          </div>
        </div>
        <div className="roster-filter-bar"><div className="category-pills" id="category-pills" role="group" aria-label="Character Categories">
          {CATEGORY_TABS.map(category => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={cn('category-pill', activeCategory === category && 'active')} aria-pressed={activeCategory === category}>{category}</button>)}
        </div></div>
        <div className="character-rail" data-character-rail>
        <button className="rail-arrow rail-prev" type="button" data-rail-prev aria-label="Previous characters" aria-controls="discover-grid" hidden>‹</button>
        <div className="bento-character-grid character-track" id="discover-grid" aria-busy={loading} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Characters. Use left and right arrow keys to browse.">
          {loading ? Array.from({ length: 8 }, (_, index) => <div className="orbit-skeleton" key={index} aria-hidden="true" />) : error ? (
            <div className="orbit-state" role="alert"><h3>A little pause in the story.</h3><p>We couldn’t load the characters. Please try again.</p><button className="btn-island" type="button" onClick={fetchCharacters}>Try again <span aria-hidden="true">↗</span></button></div>
          ) : characters.length ? characters.map(character => <CharacterCard key={character.id} character={character} />) : (
            <div className="orbit-state"><h3>{hasFilters ? 'No characters found. Yet.' : 'Your universe starts here.'}</h3><p>{hasFilters ? 'Try a different name or explore another genre.' : 'Create your first character and give a new story a beginning.'}</p>{hasFilters ? <button className="btn-island" type="button" onClick={resetFilters}>Clear filters</button> : <Link className="btn-island" href="/create">Create a character ↗</Link>}</div>
          )}
        </div>
        <button className="rail-arrow rail-next" type="button" data-rail-next aria-label="Next characters" aria-controls="discover-grid" hidden>›</button>
        <span className="sr-only" data-rail-status role="status" aria-live="polite" />
        </div>
      </section>
      <footer className="orbit-footer"><strong>Made for the stories only you can tell.</strong><span>My C.AI Universe · Your imagination, in motion.</span></footer>
    </div>
  );
}
