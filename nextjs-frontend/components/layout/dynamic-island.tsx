'use client';

import { ChevronDown, Copy, RefreshCw, Sparkles, ArrowUpRight } from 'lucide-react';

export function DynamicIsland() {
  return (
    <div className="universe-island" data-universe-island data-scene-spark data-chat-base="/chat/">
      <button className="island-trigger" type="button" aria-expanded="false" aria-controls="island-menu" aria-label="Open Scene Spark" title="Hover to create a scene. Click to keep open.">
        <span className="island-orb" aria-hidden="true" /><span>Scene spark</span><ChevronDown className="island-trigger-hint" size={15} aria-hidden="true" />
      </button>
      <div className="island-menu" id="island-menu" hidden>
        <div className="spark-heading"><span className="spark-eyebrow"><Sparkles size={13} aria-hidden="true" /> A LITTLE WHAT IF</span><h2>Give your story a spark.</h2><p>Pick a mood. Make the scene yours.</p></div>
        <div className="spark-moods" role="group" aria-label="Scene mood">
          <button type="button" data-spark-mood="cozy" aria-pressed="true">Cozy</button>
          <button type="button" data-spark-mood="mystery" aria-pressed="false">Mystery</button>
          <button type="button" data-spark-mood="adventure" aria-pressed="false">Adventure</button>
          <button type="button" data-spark-mood="tension" aria-pressed="false">Tension</button>
        </div>
        <label className="spark-label" htmlFor="spark-prompt">Your opening scene <span>EDITABLE</span></label>
        <textarea className="spark-prompt" id="spark-prompt" data-spark-prompt rows={4} maxLength={1000} defaultValue={'*Rain taps against the window of the last cafe still open. There is only one free seat, across from you.* "Mind if I stay until the storm passes?"'} />
        <div className="spark-draft-tools"><button type="button" data-spark-reroll><RefreshCw size={14} aria-hidden="true" />Another idea</button><button type="button" data-spark-copy><Copy size={14} aria-hidden="true" />Copy</button></div>
        <label className="spark-label" htmlFor="spark-character">Who is in this scene?</label>
        <select className="spark-character" id="spark-character" data-spark-character aria-describedby="spark-status" defaultValue=""><option value="">Loading characters...</option></select>
        <p className="spark-status" id="spark-status" data-spark-status role="status" aria-live="polite">Choose a character from the catalogue.</p>
        <a className="spark-start" data-spark-start href="#character-roster"><span>Browse characters</span><ArrowUpRight size={16} aria-hidden="true" /></a>
        <p className="spark-footnote">Opens as a draft. You choose when to send.</p>
      </div>
    </div>
  );
}
