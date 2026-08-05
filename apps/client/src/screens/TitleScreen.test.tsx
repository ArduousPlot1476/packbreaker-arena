import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleScreen } from './TitleScreen';
import { SettingsProvider } from '../settings/SettingsContext';

const loadLocalMock = vi.hoisted(() => vi.fn());
vi.mock('../persistence', () => ({ loadLocal: loadLocalMock }));

function mount(props?: Partial<Parameters<typeof TitleScreen>[0]>) {
  const onNewRun = vi.fn();
  const onContinue = vi.fn();
  const utils = render(
    <SettingsProvider>
      <TitleScreen onNewRun={onNewRun} onContinue={onContinue} {...props} />
    </SettingsProvider>,
  );
  return { ...utils, onNewRun, onContinue };
}

describe('TitleScreen', () => {
  beforeEach(() => {
    loadLocalMock.mockReset();
    localStorage.clear();
  });

  it('renders the gdd § 14.1 menu', () => {
    loadLocalMock.mockReturnValue(null);
    const { getByTestId } = mount();
    expect(getByTestId('title-screen')).toBeInTheDocument();
    expect(getByTestId('title-new-run')).toBeInTheDocument();
    expect(getByTestId('title-settings')).toBeInTheDocument();
    expect(getByTestId('title-daily')).toBeInTheDocument();
  });

  it('offers no Continue when there is no saved run', () => {
    loadLocalMock.mockReturnValue({ inProgressRun: null });
    const { queryByTestId } = mount();
    expect(queryByTestId('title-continue')).toBeNull();
  });

  it('offers Continue, showing the round, when a run is saved', () => {
    loadLocalMock.mockReturnValue({ inProgressRun: { currentRound: 7 } });
    const { getByTestId, onContinue } = mount();
    const cta = getByTestId('title-continue');
    expect(cta.textContent).toContain('Round 7');
    fireEvent.click(cta);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('warns that New Run discards a saved run, but only when one exists', () => {
    loadLocalMock.mockReturnValue({ inProgressRun: { currentRound: 3 } });
    const withSave = mount();
    expect(withSave.getByTestId('title-new-run').textContent).toContain('Abandons');
    // Unmount before the second mount — both would otherwise be in the same
    // document and getByTestId would find two.
    withSave.unmount();

    loadLocalMock.mockReturnValue(null);
    expect(mount().getByTestId('title-new-run').textContent).not.toContain('Abandons');
  });

  it('survives a corrupt save rather than blocking the front door', () => {
    // A save that throws on read used to be unreachable — there was no title
    // screen. Now it is the FIRST thing that runs, so it must not be able to
    // stop the game from opening.
    loadLocalMock.mockImplementation(() => {
      throw new Error('corrupt');
    });
    const { getByTestId, queryByTestId, onNewRun } = mount();
    expect(getByTestId('title-screen')).toBeInTheDocument();
    expect(queryByTestId('title-continue')).toBeNull();
    fireEvent.click(getByTestId('title-new-run'));
    expect(onNewRun).toHaveBeenCalled();
  });

  it('Daily is present but not yet actionable', () => {
    loadLocalMock.mockReturnValue(null);
    const daily = mount().getByTestId('title-daily') as HTMLButtonElement;
    expect(daily.disabled).toBe(true);
  });

  it('opens and closes settings', () => {
    loadLocalMock.mockReturnValue(null);
    const { getByTestId, queryByTestId } = mount();
    expect(queryByTestId('settings-panel')).toBeNull();
    fireEvent.click(getByTestId('title-settings'));
    expect(getByTestId('settings-panel')).toBeInTheDocument();
    fireEvent.click(getByTestId('settings-close'));
    expect(queryByTestId('settings-panel')).toBeNull();
  });

  it('settings changes persist across a remount', () => {
    loadLocalMock.mockReturnValue(null);
    const first = mount();
    fireEvent.click(first.getByTestId('title-settings'));
    fireEvent.click(first.getByTestId('settings-speed-4'));
    expect(first.getByTestId('settings-speed-4').getAttribute('aria-pressed')).toBe('true');
    first.unmount();

    const second = mount();
    fireEvent.click(second.getByTestId('title-settings'));
    expect(second.getByTestId('settings-speed-4').getAttribute('aria-pressed')).toBe('true');
  });

  it('reduced motion writes the attribute the stylesheet keys off', () => {
    loadLocalMock.mockReturnValue(null);
    const { getByTestId } = mount();
    fireEvent.click(getByTestId('title-settings'));
    const toggle = getByTestId('settings-reduced-motion');
    const before = toggle.getAttribute('aria-checked');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).not.toBe(before);
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe(
      toggle.getAttribute('aria-checked') === 'true' ? 'true' : null,
    );
  });
});
