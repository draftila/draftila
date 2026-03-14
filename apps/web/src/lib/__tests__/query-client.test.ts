import { queryClient } from '../query-client';

describe('queryClient', () => {
  test('has expected default options', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(60_000);
    expect(defaults.queries?.retry).toBe(1);
  });
});
