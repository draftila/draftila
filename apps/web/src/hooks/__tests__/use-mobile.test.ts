import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../use-mobile';

let listeners: Array<() => void> = [];

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: matches ? 500 : 1024,
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      addEventListener: (_event: string, handler: () => void) => {
        listeners.push(handler);
      },
      removeEventListener: (_event: string, handler: () => void) => {
        listeners = listeners.filter((l) => l !== handler);
      },
    }),
  });
}

beforeEach(() => {
  listeners = [];
});

describe('useIsMobile', () => {
  test('returns true when window width is below breakpoint', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test('returns false when window width is above breakpoint', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test('updates when window resizes', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 500 });
      listeners.forEach((l) => l());
    });

    expect(result.current).toBe(true);
  });

  test('cleans up event listener on unmount', () => {
    mockMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners).toHaveLength(1);
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
