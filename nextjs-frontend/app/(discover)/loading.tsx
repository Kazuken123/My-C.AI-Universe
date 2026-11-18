import './loading.css';

export default function DiscoverLoading() {
  return (
    <div className="content-container orbit-discover">
      <header className="discover-topbar universe-searchbar">
        <span className="topbar-heading">Discover</span>
      </header>
      <p className="atlas-sr-only" role="status">Loading Discover</p>
      <div className="orbit-hero universe-hero" aria-hidden="true">
        <div className="orbit-art universe-art">
          <div className="universe-scene" data-universe-scene>
            <div className="universe-fallback">
              <video muted playsInline loop preload="none" />
            </div>
          </div>
        </div>
        <div className="orbit-hero-copy atlas-discover-placeholder">
          <span className="atlas-skeleton" />
          <span className="atlas-skeleton" />
          <span className="atlas-skeleton" />
        </div>
      </div>
      <section className="section-block orbit-roster" aria-busy="true">
        <div className="orbit-section-heading"><h2>Characters</h2></div>
        <div className="character-rail">
          <div className="bento-character-grid character-track" aria-hidden="true">
            {[0, 1, 2, 3].map(index => <div key={index} className="orbit-skeleton atlas-portrait-skeleton" />)}
          </div>
        </div>
      </section>
    </div>
  );
}
