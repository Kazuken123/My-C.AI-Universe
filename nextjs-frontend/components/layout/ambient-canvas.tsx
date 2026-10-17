'use client';

import React from 'react';

export function AmbientCanvas() {
  return (
    <canvas
      id="ambient-canvas"
      className="ambient-motion-canvas"
      aria-hidden="true"
    />
  );
}
