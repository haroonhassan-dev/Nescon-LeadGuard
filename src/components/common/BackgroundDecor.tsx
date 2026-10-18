import React from 'react';

/** Soft, slowly drifting shapes behind the app. Purely decorative and hidden from screen readers. */
export const BackgroundDecor: React.FC = () => (
  <div className="decor" aria-hidden="true">
    <div className="decor-shape decor-grid" />
    <div className="decor-shape decor-blob-peach" />
    <div className="decor-shape decor-blob-sage" />
    <div className="decor-shape decor-ring-sky" />
    <div className="decor-shape decor-dot-butter" />
  </div>
);
