import { render, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const captureMock = vi.hoisted(() => vi.fn());
const clearLocalMock = vi.hoisted(() => vi.fn());

vi.mock('./telemetry/emit', () => ({ capture: captureMock }));
vi.mock('./persistence', () => ({ clearLocal: clearLocalMock }));

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    captureMock.mockReset();
    clearLocalMock.mockReset();
    // React logs the caught error itself; silence it so a passing run is quiet.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children when nothing throws', () => {
    const { getByText, queryByTestId } = render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>,
    );
    expect(getByText('all good')).toBeInTheDocument();
    expect(queryByTestId('error-boundary-fallback')).toBeNull();
  });

  it('renders the fallback instead of a blank page when a child throws', () => {
    const { getByTestId } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    // The defect being fixed: previously this was an empty document.
    expect(getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(getByTestId('error-boundary-message').textContent).toContain('kaboom');
  });

  it('emits error_boundary_caught — the event has had no emit site since 2026-04-27', () => {
    render(
      <ErrorBoundary>
        <Boom message="sim exploded" />
      </ErrorBoundary>,
    );
    expect(captureMock).toHaveBeenCalled();
    const event = captureMock.mock.calls[0]![0];
    expect(event.name).toBe('error_boundary_caught');
    expect(event.errorMessage).toContain('sim exploded');
    expect(typeof event.componentStack).toBe('string');
  });

  it('survives a telemetry transport that throws', () => {
    // A boundary that can itself throw is worse than no boundary: it turns a
    // caught error into an uncaught one and the page dies anyway.
    captureMock.mockImplementation(() => {
      throw new Error('transport down');
    });
    const { getByTestId } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(getByTestId('error-boundary-fallback')).toBeInTheDocument();
  });

  it('reload does not touch the saved run', () => {
    const { getByTestId } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(getByTestId('error-boundary-reload'));
    expect(clearLocalMock).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('discard clears the save, so a poisoned save cannot brick the game', () => {
    // The run persists to localStorage, so a save that crashes the render
    // crashes it again on reload. Without this escape the game is unplayable
    // forever for that player.
    const { getByTestId } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(getByTestId('error-boundary-discard'));
    expect(clearLocalMock).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('still reloads when clearing storage itself throws', () => {
    clearLocalMock.mockImplementation(() => {
      throw new Error('storage denied');
    });
    const { getByTestId } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(getByTestId('error-boundary-discard'));
    expect(reload).toHaveBeenCalled();
  });
});
