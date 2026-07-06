// CF 57 — app-side binding of derived item text into the generic ui-kit
// Popover. This is the ONLY layer that knows about Items: it resolves the
// canonical Item (the client ItemDef strips triggers/passiveStats, so we read
// @packbreaker/content directly), derives the terse lines via describeItem, and
// hands them to the content-agnostic Popover.

import type { RefObject } from 'react';
import { Popover } from '@packbreaker/ui-kit';
import { ITEMS as CONTENT_ITEMS } from '@packbreaker/content';
import type { Item, ItemId } from '@packbreaker/content';
import { describeItem } from './describeItem';

interface ItemInfoPopoverProps {
  itemId: ItemId;
  open: boolean;
  onClose: () => void;
  /** The trigger element (bag cell / shop card) the popover anchors to. */
  anchorRef: RefObject<HTMLElement | null>;
}

export function ItemInfoPopover({ itemId, open, onClose, anchorRef }: ItemInfoPopoverProps) {
  // Defensive undefined-safe lookup — every shipped id resolves, but never throw
  // inside a popover (unlike getItem, which throws on an unknown id).
  const item: Item | undefined = (
    CONTENT_ITEMS as Readonly<Record<string, Item | undefined>>
  )[itemId];
  if (!item) return null;
  const lines = describeItem(item);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      ariaLabel={`${item.name} details`}
      testId="item-info-popover"
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        {item.name}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {lines.map((line, i) => (
          <li key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
            {line}
          </li>
        ))}
      </ul>
    </Popover>
  );
}
