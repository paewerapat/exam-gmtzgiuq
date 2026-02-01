'use client';

import { useState } from 'react';
import Link from 'next/link';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { Mail } from 'lucide-react';
import { toast } from 'react-toastify';
import SimpleCaptcha from '@/components/SimpleCaptcha';

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

  const [requestPasswordResetMutation] = useMutation(REQUEST_PASSWORD_RESET_MUTATION);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!captchaVerified) {
      toast.error('กรุณาตอบคำถามยืนยันตัวตนให้ถูกต้อง');
      return;
    }

    setLoading(true);

    try {
      await requestPasswordResetMutation({ variables: { email } });
      setSent(true);
      toast.success('ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">ลืมรหัสผ่าน?</h2>
            <p className="text-gray-600 mt-2">
              กรอกอีเมลของคุณ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้
            </p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">ตรวจสอบอีเมลของคุณ</h3>
              <p className="text-gray-600 mb-6">
                หากบัญชีนี้มีอยู่ในระบบ คุณจะได้รับลิงก์สำหรับรีเซ็ตรหัสผ่านทางอีเมล
              </p>
              <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                ← กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    อีเมล
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                {/* CAPTCHA */}
                <SimpleCaptcha onVerify={setCaptchaVerified} />

                <button
                  type="submit"
                  disabled={loading || !captchaVerified}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                  ← กลับไปหน้าเข้าสู่ระบบ
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
