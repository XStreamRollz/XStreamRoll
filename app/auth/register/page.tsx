'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be between 3 and 30 characters')
    .max(30, 'Username must be between 3 and 30 characters')
    .regex(/^[A-Za-z0-9_]+$/, 'Username may only contain letters, digits, and underscores'),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

type FormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isValid, isValidating },
  } = useForm<FormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: FormData) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      router.push('/dashboard');
      return;
    }

    setError('root', {
      type: 'server',
      message:
        response.status === 409
          ? 'Unable to register with these credentials. Please try again.'
          : 'Unable to register. Please try again later.',
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md space-y-4 rounded border p-6"
        noValidate
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Create Account</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-medium text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <div>
          <label htmlFor="username" className="sr-only">
            Username
          </label>
          <input
            id="username"
            {...register('username')}
            placeholder="Username"
            aria-invalid={errors.username ? 'true' : 'false'}
            aria-describedby={errors.username ? 'username-error' : undefined}
            className="w-full border p-2"
          />
          {errors.username && (
            <p id="username-error" role="alert" aria-live="assertive" className="text-red-500">
              {errors.username.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            {...register('email')}
            placeholder="Email"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className="w-full border p-2"
          />
          {errors.email && (
            <p id="email-error" role="alert" aria-live="assertive" className="text-red-500">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            type="password"
            {...register('password')}
            placeholder="Password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className="w-full border p-2"
          />
          {errors.password && (
            <p id="password-error" role="alert" aria-live="assertive" className="text-red-500">
              {errors.password.message}
            </p>
          )}
        </div>

        {errors.root && (
          <p id="root-error" className="text-sm text-red-500" role="alert" aria-live="assertive">
            {errors.root.message}
          </p>
        )}

        <button
          disabled={isSubmitting || isValidating || !isValid}
          className="w-full bg-black p-2 text-white disabled:opacity-50"
          aria-disabled={isSubmitting || isValidating || !isValid}
        >
          Create account
        </button>
      </form>
    </main>
  );
}
