import Link from 'next/link';

export function OrbitHero() {
  return (
    <>
      <section className="orbit-hero universe-hero" aria-labelledby="orbit-title">
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
          <span className="universe-coordinate">BEYOND THE EDGE OF THE FAMILIAR</span>
          <div className="universe-waypoint far"><span />A thousand worlds away.</div>
          <div className="universe-waypoint near"><span />Somewhere, your story begins.</div>
          <span className="universe-horizon-line" />
        </div>
        <div className="orbit-hero-copy">
          <div className="orbit-eyebrow">Your imagination has no edge</div>
          <h1 id="orbit-title" className="orbit-title">A universe.<em>Of your own.</em></h1>
          <p className="orbit-description">Beyond every star, another world. Behind every character, a story only you can tell. Find a connection and see how far it takes you.</p>
          <div className="hero-actions">
            <a className="btn-island" href="#character-roster"><span>Explore the universe</span><span className="btn-island-icon" aria-hidden="true">&#8599;</span></a>
            <Link className="btn-ghost" href="/create" id="hero-create-btn"><span>Create a character</span><span aria-hidden="true">&#8599;</span></Link>
          </div>
          <div className="universe-hero-note"><span className="universe-live-dot" />One small hello. Endless possibilities.</div>
        </div>
        <a className="universe-scroll-cue" href="#character-roster"><span>YOUR NEXT CONNECTION IS OUT THERE</span><span aria-hidden="true">&#8595;</span></a>
      </section>
      <div className="orbit-strip universe-strip"><span><i className="ph-light ph-brain" aria-hidden="true" />Memories that stay</span><span><i className="ph-light ph-git-branch" aria-hidden="true" />Stories that unfold</span><span><i className="ph-light ph-infinity" aria-hidden="true" />A universe to make your own</span></div>
    </>
  );
}
