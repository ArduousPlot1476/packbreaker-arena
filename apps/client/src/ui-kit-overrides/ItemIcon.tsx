// Item-icon primitive: wraps the inline-SVG ICONS map with a rotation +
// scale transform. apps/client-local for M1.3.1; promotion to
// packages/ui-kit lands in M1.3.2.

import type { ItemId } from '../data.local';
import { ICONS } from '../icons/icons';

interface ItemIconProps {
  itemId: ItemId;
  rot?: number;
  scale?: number;
}

export function ItemIcon({ itemId, rot = 0, scale = 1 }: ItemIconProps) {
  const Icon = ICONS[itemId] ?? ICONS['copper-coin'];
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        transform: `rotate(${rot}deg) scale(${scale})`,
        transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <Icon />
    </div>
  );
}
