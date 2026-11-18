export function EditorSkeleton({ label }: { label: string }) {
  return (
    <div className="atlas-editor-placeholder" role="status">
      <span className="atlas-sr-only">{label}</span>
      <i className="atlas-skeleton" aria-hidden="true" />
      <div className="atlas-columns" aria-hidden="true">
        {[4, 3].map(count => (
          <section key={count}>
            {Array.from({ length: count }, (_, index) => <i key={index} className="atlas-skeleton" />)}
          </section>
        ))}
      </div>
    </div>
  );
}
