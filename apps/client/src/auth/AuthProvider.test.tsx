// AuthProvider + SignInAffordance — anonymous (Clerk-unconfigured) path (M2.1 PR2).
//
// In the test env VITE_CLERK_PUBLISHABLE_KEY is unset → clerkEnabled=false,
// so no ClerkProvider mounts and no Clerk component renders. This proves the
// non-throwing-when-unset contract and that anonymous builds are unchanged.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { SignInAffordance } from './SignInAffordance';

describe('AuthProvider (Clerk unconfigured)', () => {
  it('renders children without ClerkProvider and does not throw', () => {
    render(
      <AuthProvider>
        <div data-testid="child">hello</div>
      </AuthProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('SignInAffordance renders nothing when Clerk is unconfigured', () => {
    const { container } = render(<SignInAffordance />);
    expect(container).toBeEmptyDOMElement();
  });
});
