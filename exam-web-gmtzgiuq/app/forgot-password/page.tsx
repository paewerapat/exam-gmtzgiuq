'use client';

import { useState } from 'react';
import Link from 'next/link';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'react-toastify';
import SimpleCaptcha from '@/components/SimpleCaptcha';
import {
  AuthShell,
  FormAlert,
  authIconClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/auth/AuthShell';

const REQUEST_PASSWORD_RESET_MUTATION = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [formError, setFormError] = useState('');

  const [requestPasswordResetMutation] = useMutation(REQUEST_PASSWORD_RESET_MUTATION);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!captchaVerified) {
      toast.error('กรุณาตอบคำถามยืนยันตัวตนให้ถูกต้อง');
      return;
    }

    setLoading(true);
    setFormError('');

    try {
      await requestPasswordResetMutation({ variables: { email } });
      setSent(true);
      toast.success('ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      setFormError(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">ลืมรหัสผ่าน?</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          กรอกอีเมลของคุณ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้
        </p>
      </div>

      {sent ? (
        <div className="text-center" role="status" aria-live="polite">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-green-600 dark:text-green-400" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">ตรวจสอบอีเมลของคุณ</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            หากบัญชีนี้มีอยู่ในระบบ คุณจะได้รับลิงก์สำหรับรีเซ็ตรหัสผ่านทางอีเมล
          </p>
          <Link href="/login" className={authLinkClass}>
            ← กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      ) : (
        <>
          <FormAlert message={formError} />

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className={authLabelClass}>
                อีเมล
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className={authIconClass} aria-hidden="true" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => {
                    setFormError('');
                    setEmail(e.target.value);
                  }}
                  className={authInputClass()}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* CAPTCHA */}
            <SimpleCaptcha onVerify={setCaptchaVerified} />

            <button
              type="submit"
              disabled={loading || !captchaVerified}
              aria-busy={loading}
              className={authPrimaryButtonClass}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  กำลังส่ง...
                </>
              ) : (
                'ส่งลิงก์รีเซ็ตรหัสผ่าน'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className={authLinkClass}>
              ← กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
