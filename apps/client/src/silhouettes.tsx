// Silhouette test harness — visual-direction.md § 11.1 (monochrome 32×32).
// Open `pnpm dev` then navigate to /silhouettes.html and screenshot.

import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ICONS } from './icons';

const Sword = ICONS['iron-sword'];
const Herb = ICONS['healing-herb'];
const Brand = ICONS['ember-brand'];

function Cell({ label, w, h, children }: { label: string; w: number; h: number; children: ReactNode }) {
  return (
    <div className="cell">
      <div className="swatch" style={{ width: w, height: h }}>
        {children}
      </div>
      <div className="label">{label}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <div>
    <h1>Silhouette test — anchor icons</h1>

    <h2>Strict 32×32 (§ 11.1)</h2>
    <div className="row">
      <Cell label="Iron Sword" w={32} h={32}>
        <Sword />
      </Cell>
      <Cell label="Healing Herb" w={32} h={32}>
        <Herb />
      </Cell>
      <Cell label="Ember Brand" w={32} h={32}>
        <Brand />
      </Cell>
    </div>

    <h2>Native cell aspect (1×2 / 1×1 / 2×1)</h2>
    <div className="row">
      <Cell label="Iron Sword 1×2" w={32} h={64}>
        <Sword />
      </Cell>
      <Cell label="Healing Herb 1×1" w={32} h={32}>
        <Herb />
      </Cell>
      <Cell label="Ember Brand 2×1" w={64} h={32}>
        <Brand />
      </Cell>
    </div>
  </div>,
);
