import type { ReactNode } from 'react';

export function SavedChatsFrame({ children }: { children: ReactNode }) {
  return (
    <div className="content-container space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold text-text-primary">Saved chats</h1>
        <p className="text-text-secondary text-sm">Return to any of your storylines.</p>
      </div>
      {children}
    </div>
  );
}
