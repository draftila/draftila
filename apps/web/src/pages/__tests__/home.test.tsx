import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../home';

const mockNavigate = vi.fn();
const mockSignOut = vi.fn();
const mockUseSession = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/lib/auth-client', () => ({
  useSession: () => mockUseSession(),
  signOut: () => mockSignOut(),
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockUseSession.mockReset();
});

describe('HomePage', () => {
  test('displays the user name from session', () => {
    mockUseSession.mockReturnValue({ data: { user: { name: 'Alice' } } });
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Draftila')).toBeInTheDocument();
  });

  test('calls signOut and navigates to /login on sign out', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue({ data: { user: { name: 'Alice' } } });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
