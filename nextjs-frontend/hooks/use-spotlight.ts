'use client';

import { useRef, useCallback, useEffect } from 'react';

interface UseSpotlightOptions {
  disabled?: boolean;
}

export function useSpotlight<T extends HTMLElement = HTMLDivElement>(options: UseSpotlightOptions = {}) {
  const ref = useRef<T | null>(null);
  const disabled = options.disabled ?? false;

  const updateCoordinates = useCallback((clientX: number, clientY: number) => {
    if (disabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ref.current.style.setProperty('--mouse-x', `${x}px`);
    ref.current.style.setProperty('--mouse-y', `${y}px`);
  }, [disabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent<T>) => {
    updateCoordinates(e.clientX, e.clientY);
  }, [updateCoordinates]);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty('--mouse-x', `${x}px`);
      el.style.setProperty('--mouse-y', `${y}px`);
    };

    el.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onPointerMove);
    };
  }, [disabled]);

  return {
    ref,
    onPointerMove: handlePointerMove,
  };
}
