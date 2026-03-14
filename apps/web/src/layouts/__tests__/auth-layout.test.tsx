import { render, screen } from '@testing-library/react';
import { AuthLayout } from '../auth-layout';

describe('AuthLayout', () => {
  test('renders title and description', () => {
    render(
      <AuthLayout title="Sign in" description="Enter your credentials">
        <div>form content</div>
      </AuthLayout>,
    );

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('Enter your credentials')).toBeInTheDocument();
  });

  test('renders children', () => {
    render(
      <AuthLayout title="Title" description="Desc">
        <button>Submit</button>
      </AuthLayout>,
    );

    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });
});
