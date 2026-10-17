'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface NavigationShortcutsOptions {
  onToggleSidebar?: () => void;
}

export function useNavigationShortcuts({ onToggleSidebar }: NavigationShortcutsOptions = {}) {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isInputFocused) return;

      if (e.key === '1') {
        e.preventDefault();
        router.push('/');
      } else if (e.key === '2') {
        e.preventDefault();
        router.push('/create');
      } else if (e.key === '3') {
        e.preventDefault();
        router.push('/chats');
      } else if (e.key === '4') {
        e.preventDefault();
        router.push('/personas');
      } else if (e.key === '[' || (e.ctrlKey && e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        onToggleSidebar?.();
      } else if (e.key === '/') {
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[type="text"][placeholder*="search" i], input[type="text"][placeholder*="filter" i], #discoverSearch'
        );
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, onToggleSidebar]);
}
