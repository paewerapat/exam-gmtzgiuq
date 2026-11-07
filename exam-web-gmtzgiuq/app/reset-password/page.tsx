'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { AlertCircle, CheckCircle, Loader, Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  AuthShell,
  PasswordInput,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/auth/AuthShell';

const RESET_PASSWORD_MUTATION = gql`
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input) {
      id
      email
    }
  }
`;

type FieldErrors = { newPassword?: string; confirmPassword?: string };

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [resetPasswordMutation] = useMutation(RESET_PASSWORD_MUTATION);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    setFieldErrors({});

    if (!token) {
      setStatus('error');
      setMessage('Invalid reset link');
      return;
    }

    // error ที่ผูกกับช่องแสดงใต้ช่องนั้น (aria-describedby) แทนกล่อง error รวม
    if (formData.newPassword !== formData.confirmPassword) {
      setStatus('idle');
      setFieldErrors({ confirmPassword: 'รหัสผ่านไม่ตรงกัน กรุณาพิมพ์ให้เหมือนช่องด้านบน' });
      return;
    }

    if (formData.newPassword.length < 6) {
      setStatus('idle');
      setFieldErrors({ newPassword: 'รหัสผ่านสั้นเกินไป กรุณาใช้อย่างน้อย 6 ตัวอักษร' });
      return;
    }

    try {
      await resetPasswordMutation({
        variables: {
          input: {
            token,
            newPassword: formData.newPassword,
          },
        },
      });
      setStatus('success');
      setMessage('Password reset successful! Redirecting to login...');

      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error: unknown) {
      setStatus('error');
      const message = error instanceof Error ? error.message : String(error);
      setMessage(message || 'Failed to reset password. The link may have expired.');
    }
  };

  if (!token) {
    return (
      <AuthShell cardClassName="text-center">
        <div className="inline-block p-4 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
          <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Invalid Reset Link</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          The password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className={`${authPrimaryButtonClass} w-auto! px-6`}>
          Request New Link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Reset Password</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Enter your new password below</p>
      </div>

      {status === 'success' && (
        <div
          role="status"
          aria-live="polite"
          className="mb-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800/50 rounded-lg p-4 flex items-start"
        >
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-green-800 dark:text-green-300 text-sm">{message}</p>
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg p-4 flex items-start"
        >
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-red-800 dark:text-red-300 text-sm">{message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="newPassword" className={authLabelClass}>
            New Password
          </label>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            value={formData.newPassword}
            onChange={(newPassword) => {
              setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
              setFormData({ ...formData, newPassword });
            }}
            error={fieldErrors.newPassword}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className={authLabelClass}>
            Confirm New Password
          </label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={(confirmPassword) => {
              setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              setFormData({ ...formData, confirmPassword });
            }}
            error={fieldErrors.confirmPassword}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'loading' || status === 'success'}
          aria-busy={status === 'loading'}
          className={authPrimaryButtonClass}
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Resetting...
            </>
          ) : (
            'Reset Password'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link href="/login" className={authLinkClass}>
          ← Back to Login
        </Link>
      </div>
    </AuthShell>
  );
}

function LoadingFallback() {
  return (
    <AuthShell cardClassName="text-center">
      <div role="status" aria-live="polite">
        <Loader className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin motion-reduce:animate-none mx-auto mb-4" aria-hidden="true" />
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
