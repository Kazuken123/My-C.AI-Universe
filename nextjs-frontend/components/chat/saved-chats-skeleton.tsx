export function SavedChatsSkeleton() {
  return (
    <div className="atlas-saved-list" aria-busy="true">
      <span className="atlas-sr-only" role="status">Loading saved chats</span>
      {[0, 1, 2].map(index => (
        <div key={index} className="atlas-saved-entry atlas-saved-placeholder" aria-hidden="true">
          <span className="atlas-saved-avatar atlas-skeleton" />
          <div className="atlas-saved-text">
            <span className="atlas-skeleton" />
            <span className="atlas-skeleton" />
            <span className="atlas-skeleton" />
          </div>
          <div className="atlas-saved-actions">
            <span className="atlas-skeleton" />
            <span className="atlas-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}
