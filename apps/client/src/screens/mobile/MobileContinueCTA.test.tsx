// Unit tests for MobileContinueCTA. Verifies the full-width-bar CTA
// renders the correct label, disables when busy, and meets the
// 44×44 touch-target floor.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MobileContinueCTA } from './MobileContinueCTA';

describe('MobileContinueCTA', () => {
  it('renders a CONTINUE label and fires onContinue on click', () => {
    const onContinue = vi.fn();
    const { getByRole } = render(<MobileContinueCTA onContinue={onContinue} busy={false} />);
    const button = getByRole('button', { name: /CONTINUE/i });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('is disabled when busy=true', () => {
    const onContinue = vi.fn();
    const { getByRole } = render(<MobileContinueCTA onContinue={onContinue} busy={true} />);
    const button = getByRole('button', { name: /CONTINUE/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('meets the 44×44 touch-target floor', () => {
    const { getByRole } = render(<MobileContinueCTA onContinue={() => {}} busy={false} />);
    const button = getByRole('button', { name: /CONTINUE/i }) as HTMLElement;
    expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(button.style.width).toBe('100%');
  });
});
