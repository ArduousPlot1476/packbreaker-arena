// Item-icon primitive: rotation + scale transform wrapper. Promoted from
// apps/client/src/ui-kit-overrides/ItemIcon.tsx during M1.3.2 commit 1.
//
// API change vs. the M1.3.1 ui-kit-overrides version: takes `children`
// (the icon SVG) instead of `itemId` + an internal ICONS lookup. Decouples
// the primitive from apps/client's content-tied ICONS map. Caller sites
// in apps/client now do their own ICONS[itemId] lookup at the call site
// and pass the result as children.

import type { ReactNode } from 'react';

interface ItemIconProps {
  children: ReactNode;
  rot?: number;
  scale?: number;
}

export function ItemIcon({ children, rot = 0, scale = 1 }: ItemIconProps) {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        transform: `rotate(${rot}deg) scale(${scale})`,
        transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {children}
    </div>
  );
}
