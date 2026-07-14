// MobileClassSelectScreen — sign-in affordance mount (M2.1 PR2, Codex round 4 F1).
//
// Confirms the mobile screen mounts SignInAffordance in its top chrome, at
// parity with the desktop screen. The affordance's own configured/unconfigured
// rendering (null when Clerk is unset) is covered by AuthProvider.test.tsx —
// the same shared component on both screens; here it is mocked to a marker so
// the assertion is about the MOUNT, not Clerk state.

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/SignInAffordance', () => ({
  SignInAffordance: () => <div data-testid="signin-affordance" />,
}));

import { MobileClassSelectScreen } from './MobileClassSelectScreen';

describe('MobileClassSelectScreen', () => {
  it('mounts the sign-in affordance in the top chrome (parity with desktop)', () => {
    const { getByTestId } = render(
      <MobileClassSelectScreen
        classId={null}
        starterRelicId={null}
        onSelectClass={() => {}}
        onSelectRelic={() => {}}
        onChangeClass={() => {}}
        onBeginRun={() => {}}
      />,
    );
    expect(getByTestId('signin-affordance')).toBeInTheDocument();
  });
});
