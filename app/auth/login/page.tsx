'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

const schema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z
    .string()
    .min(8, { message: 'Password must contain at least 8 characters.' })
    .max(128),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid, isValidating },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: FormData) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      router.push('/dashboard');
    } else {
      alert('Invalid credentials');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md space-y-4 rounded border p-6"
      >
        <h1 className="text-2xl font-bold">Login</h1>

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

        <button
          disabled={isSubmitting || isValidating || !isValid}
          className="w-full bg-black p-2 text-white disabled:opacity-50"
          aria-disabled={isSubmitting || isValidating || !isValid}
        >
          Login
        </button>
      </form>
    </main>
  );
}