import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthGuard, GuestGuard } from '../auth-guard';

const mockUseSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  useSession: () => mockUseSession(),
}));

function renderWithRouter(element: React.ReactElement, initialEntries = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{element}</MemoryRouter>);
}

describe('AuthGuard', () => {
  test('shows loading state when session is pending', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    renderWithRouter(<AuthGuard />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('redirects to /login when no session', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const { container } = renderWithRouter(<AuthGuard />);
    expect(container.innerHTML).toBe('');
  });

  test('renders outlet when session exists', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: '1', email: 'test@test.com' } },
      isPending: false,
    });
    renderWithRouter(<AuthGuard />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});

describe('GuestGuard', () => {
  test('shows loading state when session is pending', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    renderWithRouter(<GuestGuard />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('redirects to / when session exists', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: '1', email: 'test@test.com' } },
      isPending: false,
    });
    const { container } = renderWithRouter(<GuestGuard />);
    expect(container.innerHTML).toBe('');
  });

  test('renders outlet when no session', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    renderWithRouter(<GuestGuard />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
