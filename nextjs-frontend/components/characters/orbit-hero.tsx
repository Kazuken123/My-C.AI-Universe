import Link from 'next/link';

export function OrbitHero() {
  return (
    <>
      <section className="orbit-hero" aria-labelledby="orbit-title">
        <div className="orbit-hero-copy">
          <div className="orbit-eyebrow">A space for your imagination</div>
          <h1 id="orbit-title" className="orbit-title">Every character.<em>A new universe.</em></h1>
          <p className="orbit-description">Meet someone unforgettable. Build a world together. Write stories with characters who remember you.</p>
          <div className="hero-actions">
            <a className="btn-island" href="#character-roster"><span>Find your next story</span><span className="btn-island-icon" aria-hidden="true">↗</span></a>
            <Link className="btn-ghost" href="/create" id="hero-create-btn"><span>Create a character</span><span aria-hidden="true">↗</span></Link>
          </div>
          <div className="orbit-hero-note"><span><i className="ph-light ph-infinity" aria-hidden="true" />Endless possibilities</span><span><i className="ph-light ph-fingerprint" aria-hidden="true" />Entirely your story</span></div>
        </div>
        <div className="orbit-art universe-art" aria-hidden="true">
          <span className="orbit-coordinate">YOUR IMAGINATION, EXPANDING</span>
          <div className="universe-scene" data-universe-scene>
            <div className="universe-fallback"><span className="universe-fallback-galaxy" /><span className="universe-fallback-core" /></div>
            <canvas className="universe-canvas" aria-hidden="true" />
          </div>
          <div className="orbit-floating-label memory"><i className="ph-light ph-sparkle" /><div><strong>A connection that stays</strong><small>Characters with memory</small></div></div>
          <div className="orbit-floating-label story"><i className="ph-light ph-infinity" /><div><strong>Worlds within worlds.</strong><small>Let your universe unfold</small></div></div>
          <span className="orbit-art-caption">COUNTLESS WORLDS. ONE PLACE TO BEGIN.</span>
        </div>
      </section>
      <div className="orbit-strip"><span><i className="ph-light ph-brain" aria-hidden="true" />Memories that last</span><span><i className="ph-light ph-git-branch" aria-hidden="true" />Stories that branch</span><span><i className="ph-light ph-heart" aria-hidden="true" />Connections that grow</span></div>
    </>
  );
}
