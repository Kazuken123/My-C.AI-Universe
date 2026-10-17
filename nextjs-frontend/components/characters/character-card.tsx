'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Character } from '@/types/character';
import { formatCount, resolveAvatarUrl } from '@/lib/character-utils';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface CharacterCardProps {
  character: Character;
  spanClass?: string;
  onDelete?: (id: string) => void;
}

export function CharacterCard({
  character,
  spanClass = 'bento-cell',
}: CharacterCardProps) {
  const router = useRouter();
  const [likes, setLikes] = useState(character.likes || 0);
  const [isLiked, setIsLiked] = useState(Boolean(character.isLiked ?? character.is_liked));
  const [isLiking, setIsLiking] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(() =>
    resolveAvatarUrl(character.avatar, character.name)
  );

  const tags = Array.isArray(character.categories)
    ? character.categories
    : typeof character.categories === 'string'
    ? (character.categories as string).split(',').map((s) => s.trim()).filter(Boolean)
    : ['Roleplay'];

  const creatorLabel =
    character.creator && character.creator !== '@you'
      ? character.creator
      : '@community';

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLiking) return;

    setIsLiking(true);
    const prevLiked = isLiked;
    const prevCount = likes;

    setIsLiked(!prevLiked);
    setLikes(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);

    try {
      const res = await api.toggleLike(character.id);
      setIsLiked(res.isLiked);
      setLikes(res.likes);
    } catch {
      setIsLiked(prevLiked);
      setLikes(prevCount);
    } finally {
      setIsLiking(false);
    }
  };

  const handleCardClick = () => {
    router.push(`/chat/${encodeURIComponent(character.id)}`);
  };

  return (
    <div className={spanClass}>
      <div
        className="double-bezel-shell card-shell"
        data-char-card={character.id}
        style={{ cursor: 'pointer' }}
        onClick={handleCardClick}
      >
        <div className="double-bezel-core cai-card">
          <div className="cai-card-top">
            <div className="cai-avatar-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="cai-avatar"
                src={avatarSrc}
                alt={character.name}
                onError={() => {
                  setAvatarSrc(
                    `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(character.name)}`
                  );
                }}
              />
            </div>
            <div className="cai-card-info">
              <div className="cai-card-name">{character.name}</div>
              <div className="cai-card-creator">Authored by {creatorLabel}</div>
              <div className="cai-card-tagline">{character.tagline || ''}</div>
            </div>
          </div>

          <div className="cai-card-tags">
            {tags.slice(0, 3).map((t) => (
              <span key={t} className="tag-badge">
                {t}
              </span>
            ))}
          </div>

          <div className="cai-card-footer">
            <div className="cai-card-stats">
              <button
                className={cn('like-btn', isLiked && 'liked')}
                onClick={handleLike}
                type="button"
                title="Like character"
              >
                <i className={isLiked ? 'ph-fill ph-heart' : 'ph-light ph-heart'} />
                <span>{formatCount(likes)}</span>
              </button>
              <span className="mono-tag">
                {formatCount(character.interactions || 0)} chats
              </span>
            </div>
            <div className="cai-card-actions">
              <Link
                href={`/create?id=${encodeURIComponent(character.id)}`}
                className="icon-btn"
                title="Edit Architecture"
                onClick={(e) => e.stopPropagation()}
              >
                <i className="ph-light ph-pencil-simple" />
              </Link>
              <Link
                href={`/chat/${encodeURIComponent(character.id)}`}
                className="btn-secondary btn-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <i className="ph-light ph-chat-circle-dots" />
                <span>Enter Scene</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
