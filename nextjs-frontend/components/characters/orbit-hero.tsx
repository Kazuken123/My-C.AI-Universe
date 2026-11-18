import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import type { ChatSessionSummary } from '@/types/chat';

export function OrbitHero({ hidden }: { hidden: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [recent, setRecent] = useState<{ userId: string; session: ChatSessionSummary } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    api.getChatSessions().then(sessions => {
      // The chat history endpoint returns most recently updated sessions first.
      const session = Array.isArray(sessions) ? sessions.find(scene => scene?.id && scene.characterId) : null;
      if (active) setRecent(session ? { userId, session } : null);
    }).catch(() => {
      if (active) setRecent(null);
    });
    return () => { active = false; };
  }, [userId]);

  const latest = recent && userId === recent.userId ? recent.session : null;
  const preview = latest?.lastMessage?.replace(/\*/g, '').trim();


  return (
    <section className="orbit-hero universe-hero" id="universe-hero" tabIndex={-1} hidden={hidden} aria-labelledby="orbit-title">
      <div className="orbit-art universe-art" aria-hidden="true">
        <div className="universe-scene" data-universe-scene>
          <div className="universe-fallback">
            <span className="universe-fallback-nebula" />
            <span className="universe-fallback-galaxy" />
            <span className="universe-fallback-core" />
            <span className="universe-fallback-world" />
            <span className="universe-fallback-horizon" />
          </div>
          <canvas className="universe-canvas" aria-hidden="true" />
        </div>
      </div>
      <div className="orbit-hero-copy">
        <h1 id="orbit-title" className="orbit-title">A universe. <em>Of your own.</em></h1>
        <p className="orbit-description">Meet a character and see where the conversation takes you.</p>
        {latest && (
          <div className="atlas-scene-resume">
            <p className="atlas-scene-name">{latest.characterName || latest.title || 'Your last scene'}</p>
            {preview && <p className="atlas-scene-preview">{preview}</p>}
            <Link className="btn-island" href={`/chat/${encodeURIComponent(latest.characterId)}?session=${encodeURIComponent(latest.id)}`}>Continue scene <span className="btn-island-icon" aria-hidden="true">↗</span></Link>
          </div>
        )}
        <div className="hero-actions">
          <a className={latest ? 'btn-ghost' : 'btn-island'} href="#character-roster">Explore characters <span className={latest ? undefined : 'btn-island-icon'} aria-hidden="true">↓</span></a>
          <Link className="btn-ghost" href="/create" id="hero-create-btn">Create a character <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </section>
  );
}
