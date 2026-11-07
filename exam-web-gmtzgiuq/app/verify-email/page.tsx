'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import Link from 'next/link';
import { AuthShell, authPrimaryButtonClass, authSecondaryButtonClass } from '@/components/auth/AuthShell';
import { getAuthErrorMessage } from '@/lib/auth-errors';

const VERIFY_EMAIL_MUTATION = gql`
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token) {
      id
      email
      isEmailVerified
    }
  }
`;

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const [verifyEmailMutation] = useMutation(VERIFY_EMAIL_MUTATION);
  // token ที่ตรวจไปแล้วใน instance นี้ — StrictMode (dev) รัน effect ซ้ำแต่ ref คงอยู่ กันยิง verifyEmail ซ้ำ
  const verifiedTokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (verifiedTokenRef.current === token) return;
    verifiedTokenRef.current = token;

    if (!token) {
      setStatus('error');
      setMessage('ไม่พบรหัสยืนยันในลิงก์ กรุณาเปิดลิงก์จากอีเมลอีกครั้ง');
      return;
    }

    const verifyEmail = async () => {
      try {
        await verifyEmailMutation({ variables: { token } });
        setStatus('success');
        setMessage('ยืนยันอีเมลของคุณเรียบร้อยแล้ว!');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } catch (error: unknown) {
        setStatus('error');
        // error ของ API เป็นอังกฤษ (เช่น "Invalid verification token") → ข้อความไทย
        setMessage(getAuthErrorMessage(error, 'verifyEmail'));
      }
    };

    verifyEmail();
  }, [token, verifyEmailMutation, router]);

  return (
    <AuthShell cardClassName="text-center">
      {status === 'loading' && (
        <div role="status" aria-live="polite">
          <div className="inline-block p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-full mb-4">
            <Loader className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            กำลังยืนยันอีเมล
          </h2>
          <p className="text-gray-600 dark:text-gray-400">กรุณารอสักครู่ ระบบกำลังตรวจสอบอีเมลของคุณ...</p>
        </div>
      )}

      {status === 'success' && (
        <div role="status" aria-live="polite">
          <div className="inline-block p-4 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            ยืนยันอีเมลสำเร็จ!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">กำลังพาไปหน้าเข้าสู่ระบบ...</p>
        </div>
      )}

      {status === 'error' && (
        <div role="alert">
          <div className="inline-block p-4 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
            <XCircle className="w-12 h-12 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            ยืนยันอีเมลไม่สำเร็จ
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
          <div className="space-y-3">
            <Link href="/login" className={authPrimaryButtonClass}>
              ไปหน้าเข้าสู่ระบบ
            </Link>
            <Link href="/register" className={authSecondaryButtonClass}>
              สมัครบัญชีใหม่
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}

function LoadingFallback() {
  return (
    <AuthShell cardClassName="text-center">
      <div role="status" aria-live="polite">
        <Loader className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin motion-reduce:animate-none mx-auto mb-4" aria-hidden="true" />
        <p className="text-gray-600 dark:text-gray-400">กำลังโหลด...</p>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
