export function ChatSkeleton() {
  return (
    <div className="atlas-chat-reader atlas-chat-loading" aria-busy="true">
      <span className="atlas-sr-only" role="status">Opening chat</span>
      <div className="atlas-chat-load-header" aria-hidden="true">
        <span className="atlas-chat-load-avatar atlas-skeleton" />
        <div className="atlas-chat-load-label">
          <span className="atlas-skeleton" />
          <span className="atlas-skeleton" />
        </div>
      </div>
      {[false, true, false].map((fromUser, index) => (
        <div key={index} className={`atlas-chat-load-turn${fromUser ? ' atlas-chat-load-user' : ''}`} aria-hidden="true">
          <span className="atlas-chat-load-avatar atlas-skeleton" />
          <div className="atlas-chat-load-bubble">
            <span className="atlas-skeleton" />
            {!fromUser && <span className="atlas-skeleton" />}
          </div>
        </div>
      ))}
      <div className="atlas-chat-load-composer" aria-hidden="true">
        <span className="atlas-skeleton" />
        <span className="atlas-skeleton" />
      </div>
    </div>
  );
}
