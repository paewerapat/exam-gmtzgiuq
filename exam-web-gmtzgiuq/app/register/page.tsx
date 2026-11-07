'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, User, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { getAuthErrorMessage } from '@/lib/auth-errors';
import {
  AuthShell,
  AuthPageLoading,
  FormAlert,
  GoogleButtonSlot,
  PasswordInput,
  authIconClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/auth/AuthShell';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, register, loginWithGoogle } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setFormError('');

    if (formData.password !== formData.confirmPassword) {
      toast.error('รหัสผ่านไม่ตรงกัน');
      setFieldErrors({ confirmPassword: 'รหัสผ่านไม่ตรงกัน กรุณาพิมพ์ให้เหมือนช่องรหัสผ่านด้านบน' });
      return;
    }

    if (formData.password.length < 6) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      setFieldErrors({ password: 'รหัสผ่านสั้นเกินไป กรุณาใช้อย่างน้อย 6 ตัวอักษร' });
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      await register(
        formData.email,
        formData.password,
        formData.firstName || undefined,
        formData.lastName || undefined
      );
      toast.success('สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี');
    } catch (err: unknown) {
      // แปลง error ของ API (เช่น "Bad Request Exception", อีเมลซ้ำ) เป็นข้อความไทยที่บอกวิธีแก้
      const errorMessage = getAuthErrorMessage(err, 'register');
      toast.error(errorMessage);
      setFormError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      toast.error('ไม่สามารถสมัครด้วย Google ได้');
      return;
    }

    setGoogleLoading(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      toast.success('สมัครสมาชิกด้วย Google สำเร็จ!');
    } catch {
      toast.error('เกิดข้อผิดพลาดในการสมัครด้วย Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return <AuthPageLoading />;
  }

  // Don't render if authenticated (will redirect)
  if (user) {
    return null;
  }

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">สมัครสมาชิก</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">เริ่มต้นการเรียนรู้วันนี้</p>
      </div>

      {/* Google Sign Up */}
      <div className="mb-6">
        {googleLoading ? (
          <div className="flex items-center justify-center py-2 min-h-11" role="status" aria-live="polite">
            <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none text-indigo-600 dark:text-indigo-400 mr-2" aria-hidden="true" />
            <span className="text-gray-600 dark:text-gray-400">กำลังสมัครสมาชิก...</span>
          </div>
        ) : (
          <GoogleButtonSlot>
            {(width, buttonTheme) => (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('ไม่สามารถสมัครด้วย Google ได้')}
                text="signup_with"
                shape="rectangular"
                size="large"
                width={width}
                theme={buttonTheme}
              />
            )}
          </GoogleButtonSlot>
        )}
      </div>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">หรือสมัครด้วยอีเมล</span>
        </div>
      </div>

      <FormAlert message={formError} />

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className={authLabelClass}>
              ชื่อ
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className={authIconClass} aria-hidden="true" />
              </div>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className={authInputClass()}
                placeholder="ชื่อ"
              />
            </div>
          </div>

          <div>
            <label htmlFor="lastName" className={authLabelClass}>
              นามสกุล
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className={authInputClass({ icon: false })}
              placeholder="นามสกุล"
            />
          </div>
        </div>

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
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={authInputClass()}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className={authLabelClass}>
            รหัสผ่าน
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={formData.password}
            onChange={(password) => {
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
              setFormData({ ...formData, password });
            }}
            error={fieldErrors.password}
            describedBy={fieldErrors.password ? undefined : 'password-hint'}
          />
          {!fieldErrors.password && (
            <p id="password-hint" className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              อย่างน้อย 6 ตัวอักษร
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className={authLabelClass}>
            ยืนยันรหัสผ่าน
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

        <button type="submit" disabled={loading} aria-busy={loading} className={authPrimaryButtonClass}>
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              กำลังสร้างบัญชี...
            </>
          ) : (
            'สมัครสมาชิก'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-600 dark:text-gray-400">
          มีบัญชีอยู่แล้ว?{' '}
          <Link href="/login" className={authLinkClass}>
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
