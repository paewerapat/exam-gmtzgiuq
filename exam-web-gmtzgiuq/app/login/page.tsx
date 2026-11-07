'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { getSafeRedirect } from '@/lib/safe-redirect';
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // SEC-13: รับเฉพาะ path ภายใน กัน open redirect / javascript: XSS
  const redirectTo = getSafeRedirect(searchParams.get('redirect'));
  const { user, loading: authLoading, login, loginWithGoogle } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(redirectTo);
    }
  }, [user, authLoading, router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');

    try {
      await login(formData.email, formData.password);
      toast.success('เข้าสู่ระบบสำเร็จ!');
      router.replace(redirectTo);
    } catch {
      toast.error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      setFormError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่ หรือกด "ลืมรหัสผ่าน?" เพื่อตั้งรหัสใหม่');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      toast.error('ไม่สามารถเข้าสู่ระบบด้วย Google ได้');
      return;
    }

    setGoogleLoading(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      toast.success('เข้าสู่ระบบด้วย Google สำเร็จ!');
      router.replace(redirectTo);
    } catch {
      toast.error('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google');
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
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">ยินดีต้อนรับ</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">เข้าสู่ระบบเพื่อเริ่มการเรียนรู้</p>
      </div>

      {/* Google Login */}
      <div className="mb-6">
        {googleLoading ? (
          <div className="flex items-center justify-center py-2 min-h-11" role="status" aria-live="polite">
            <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none text-indigo-600 dark:text-indigo-400 mr-2" aria-hidden="true" />
            <span className="text-gray-600 dark:text-gray-400">กำลังเข้าสู่ระบบ...</span>
          </div>
        ) : (
          <GoogleButtonSlot>
            {(width, buttonTheme) => (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('ไม่สามารถเข้าสู่ระบบด้วย Google ได้')}
                text="signin_with"
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
          <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">หรือเข้าสู่ระบบด้วยอีเมล</span>
        </div>
      </div>

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
              value={formData.email}
              onChange={(e) => {
                setFormError('');
                setFormData({ ...formData, email: e.target.value });
              }}
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
            autoComplete="current-password"
            value={formData.password}
            onChange={(password) => {
              setFormError('');
              setFormData({ ...formData, password });
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">
            <Link href="/forgot-password" className={authLinkClass}>
              ลืมรหัสผ่าน?
            </Link>
          </div>
        </div>

        <button type="submit" disabled={loading} aria-busy={loading} className={authPrimaryButtonClass}>
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              กำลังเข้าสู่ระบบ...
            </>
          ) : (
            'เข้าสู่ระบบ'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-600 dark:text-gray-400">
          ยังไม่มีบัญชี?{' '}
          <Link href="/register" className={authLinkClass}>
            สมัครสมาชิก
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageLoading />}>
      <LoginForm />
    </Suspense>
  );
}
