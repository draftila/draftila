import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from '@tanstack/react-form';
import { loginSchema } from '@draftila/shared';
import { signIn } from '@/lib/auth-client';
import { AuthLayout } from '@/layouts/auth-layout';
import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { ServerError } from '@/components/ui/server-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError('');

      const { error } = await signIn.email({
        email: value.email,
        password: value.password,
      });

      if (error) {
        setServerError(error.message ?? 'Invalid email or password');
        return;
      }

      navigate('/', { replace: true });
    },
  });

  return (
    <AuthLayout title="Sign in" description="Enter your email and password to sign in">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="email">
            {(field) => (
              <FormField
                field={field}
                label="Email"
                type="email"
                placeholder="you@example.com"
                autoFocus
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <FormField
                field={field}
                label="Password"
                type="password"
                placeholder="Enter your password"
              />
            )}
          </form.Field>
          <ServerError message={serverError} />
          <SubmitButton
            form={form}
            label="Sign in"
            submittingLabel="Signing in..."
            className="w-full"
          />
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
