// CF 57 — Popover Rule 12 contract tests: open/close rendering, auto-focus on
// open, focus return to the trigger on every close path (Esc / tap-away), focus
// trap with no focusable children, and scrim aria-hidden.

import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Popover } from './Popover';

function Harness({
  initialOpen = true,
  withFocusable = false,
}: {
  initialOpen?: boolean;
  withFocusable?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} data-testid="trigger" onClick={() => setOpen(true)}>
        open
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        ariaLabel="Item info"
      >
        <div>Body text</div>
        {withFocusable && <button data-testid="inner">inner</button>}
      </Popover>
    </>
  );
}

describe('Popover — render', () => {
  it('renders a labelled dialog with its children when open', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Item info' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Body text');
  });

  it('renders nothing when closed', () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a transparent scrim carrying aria-hidden', () => {
    render(<Harness />);
    const scrim = screen.getByRole('dialog').previousElementSibling as HTMLElement;
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Popover — focus contract (Rule 12)', () => {
  it('auto-focuses the dialog on open', () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('Esc closes and returns focus to the trigger', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });

  it('tap-away (scrim pointerdown) closes and returns focus to the trigger', () => {
    render(<Harness />);
    const scrim = screen.getByRole('dialog').previousElementSibling as HTMLElement;
    fireEvent.pointerDown(scrim);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });

  it('traps Tab on the dialog when there are no focusable children', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(dialog);
  });
});

describe('Popover — sheet presentation (CF-89 PR-A)', () => {
  function SheetHarness({ initialOpen = true }: { initialOpen?: boolean }) {
    const [open, setOpen] = useState(initialOpen);
    const triggerRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={triggerRef} data-testid="trigger" onClick={() => setOpen(true)}>
          open
        </button>
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          ariaLabel="Item info"
          presentation="sheet"
        >
          <div>Sheet body</div>
        </Popover>
      </>
    );
  }

  it('renders the same labelled dialog contract, pinned to the bottom edge and always visible', () => {
    render(<SheetHarness />);
    const dialog = screen.getByRole('dialog', { name: 'Item info' });
    expect(dialog).toHaveTextContent('Sheet body');
    // Edge-pinned, not anchor-positioned: bottom 0, full width, no
    // hidden-until-measured phase (anchored mode hides until pos lands).
    expect(dialog.style.bottom).toBe('0px');
    expect(dialog.style.left).toBe('0px');
    expect(dialog.style.right).toBe('0px');
    expect(dialog.style.visibility).not.toBe('hidden');
    // Capped height so the board above the sheet stays fully visible.
    expect(dialog.style.maxHeight).toBe('45vh');
  });

  it('keeps the Rule 12 close paths: Esc closes and returns focus to the trigger', () => {
    render(<SheetHarness />);
    const dialog = screen.getByRole('dialog', { name: 'Item info' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });

  it('keeps the scrim (aria-hidden), and tap-away closes', () => {
    render(<SheetHarness />);
    const scrim = screen.getByRole('dialog').previousElementSibling as HTMLElement;
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    fireEvent.pointerDown(scrim);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
