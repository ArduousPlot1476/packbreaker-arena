// CF 57 — app-side binding of derived item text into the generic ui-kit
// Popover. This is the ONLY layer that knows about Items: it resolves the
// canonical Item (the client ItemDef strips triggers/passiveStats, so we read
// @packbreaker/content directly), derives the terse lines via describeItem, and
// hands them to the content-agnostic Popover.
//
// CF-89 PR-A: optionally hosts the ADJACENCY reveal as a section below the
// describeItem lines (the ratified host-in-popover disposition — two popovers
// on one tile is a defect). The section renders per the three-display-class
// taxonomy: class 1 = resolved before→after values; class 2 = qualifier label,
// after-value row SUPPRESSED; class 3 = condition + effect, affected panel
// SUPPRESSED. `presentation` threads through to the Popover primitive so the
// mobile mount renders the locked bottom-sheet solution.

import type { RefObject } from 'react';
import { Popover } from '@packbreaker/ui-kit';
import { ITEMS as CONTENT_ITEMS } from '@packbreaker/content';
import type { Item, ItemId } from '@packbreaker/content';
import type { AffectedRef, RevealRow } from '../run/adjacencyReveal';
import { describeItem, formatSeconds } from './describeItem';

// The established adjacency teal (AdjacencyGlow's stroke family) — not a new
// accent color.
const ADJACENCY_TEAL = '#5eead4';

interface ItemInfoPopoverProps {
  itemId: ItemId;
  open: boolean;
  onClose: () => void;
  /** The trigger element (bag cell / shop card) the popover anchors to. */
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * Adjacency reveal rows for this item (CF-89 PR-A). Omitted/empty = no
   * section — the shop mount and ungated bag mounts never pass it, so this
   * popover renders exactly its CF 57 shape there.
   */
  adjacencyRows?: ReadonlyArray<RevealRow>;
  /** Popover presentation; the mobile run screen passes 'sheet'. */
  presentation?: 'anchored' | 'sheet';
}

function deltaText(a: AffectedRef): string {
  return a.deltas
    .map((d) =>
      d.kind === 'damage'
        ? `${d.before} → ${d.after}`
        : `${formatSeconds(d.before)}s → ${formatSeconds(d.after)}s`,
    )
    .join(' · ');
}

function AdjacencySection({ rows }: { rows: ReadonlyArray<RevealRow> }) {
  return (
    <div
      data-testid="adjacency-section"
      style={{ marginTop: 8, borderTop: '1px solid var(--border-default)', paddingTop: 6 }}
    >
      <div
        className="label-cap"
        style={{ fontSize: 9, letterSpacing: '0.16em', color: ADJACENCY_TEAL, marginBottom: 4 }}
      >
        ADJACENCY
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row, i) => (
          <div key={i} data-testid={`adjacency-row-class${row.revealClass}`}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
              {row.text}
            </div>
            {row.qualifier && (
              <div
                className="label-cap"
                data-testid="adjacency-qualifier"
                style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}
              >
                {row.qualifier}
              </div>
            )}
            {row.affected !== null && (
              <div data-testid="adjacency-affected" style={{ marginTop: 3 }}>
                {row.affected.length === 0 ? (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    No adjacent items affected
                  </div>
                ) : (
                  row.affected.map((a) => (
                    <div
                      key={a.uid}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 11,
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{a.name}</span>
                      {/* Class-2 rows carry no deltas by construction — the
                          after-value row is suppressed, never rendered. */}
                      {a.deltas.length > 0 && (
                        <span className="tnum" style={{ color: 'var(--text-primary)' }}>
                          {deltaText(a)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ItemInfoPopover({
  itemId,
  open,
  onClose,
  anchorRef,
  adjacencyRows,
  presentation,
}: ItemInfoPopoverProps) {
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
      presentation={presentation}
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
      {adjacencyRows && adjacencyRows.length > 0 && <AdjacencySection rows={adjacencyRows} />}
    </Popover>
  );
}
