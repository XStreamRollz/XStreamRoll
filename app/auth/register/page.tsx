'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
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
        noValidate
        aria-label="Registration form"
      >
        <h1 className="text-2xl font-bold">Register</h1>

        <div className="flex flex-col gap-1">
          <label htmlFor="register-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            {...register('email')}
            placeholder="you@example.com"
            className="w-full border p-2"
            autoComplete="email"
          />
          {errors.email && (
            <p className="text-red-500" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="register-password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            {...register('password')}
            placeholder="Choose a password (min 6 characters)"
            className="w-full border p-2"
            autoComplete="new-password"
          />
          {errors.password && (
            <p className="text-red-500" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-black p-2 text-white"
        >
          {isSubmitting ? 'Creating account…' : 'Register'}
        </button>
      </form>
    </main>
  );
}