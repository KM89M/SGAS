import React from 'react';
import { ShieldAlert, ShieldCheck, Globe, GraduationCap, PlayCircle, LogOut } from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { INSTITUTION } from '../lib/i18n';
import { PWAInstallButton } from './PWAInstallButton';

export const LoginView: React.FC = () => {
  const {
    lang,
    setLang,
    t,
    authStatus,
    firebaseUser,
    loginWithGoogle,
    logout,
    enterDemoMode,
  } = useSGAS();

  return (
    <div className="min-h-screen bg-[#F5F9FF] flex flex-col justify-between">
      {/* Top Institutional Bar */}
      <header className="w-full bg-white border-b border-blue-100 px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1565C0] text-white flex items-center justify-center font-bold text-sm shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <span className="font-bold text-[#1565C0] text-base whitespace-nowrap">
            {lang === 'ar' ? INSTITUTION.shortCode + ' · الدراسات العليا' : 'SGAS · Postgraduate Studies'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5 text-[#2196F3]" />
            <span>{t.switchLang}</span>
          </button>
        </div>
      </header>

      {/* Main Auth Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-white border border-blue-100 rounded-2xl overflow-hidden shadow-sm">
          {/* Institutional Identity Panel */}
          <div className="lg:col-span-5 bg-[#1565C0] text-white p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center">
                  <GraduationCap className="w-7 h-7 text-white" />
                </div>
                <div className="text-xs text-blue-100 leading-relaxed">
                  {lang === 'ar' ? INSTITUTION.countryAr : INSTITUTION.countryEn}
                </div>
              </div>

              <h1 className="text-2xl font-extrabold leading-snug mb-3">
                {lang === 'ar' ? INSTITUTION.systemAr : INSTITUTION.systemEn}
              </h1>
              <p className="text-sm text-blue-100 leading-relaxed mb-6">
                {lang === 'ar'
                  ? `${INSTITUTION.universityAr} — ${INSTITUTION.collegeAr} — ${INSTITUTION.departmentAr}`
                  : `${INSTITUTION.universityEn} — ${INSTITUTION.collegeEn} — ${INSTITUTION.departmentEn}`}
              </p>
            </div>

            <div className="space-y-2.5 text-xs text-blue-100 border-t border-white/20 pt-5">
              <div>· {lang === 'ar' ? 'توثيق الحضور برمز QR ديناميكي مشفر' : 'Cryptographic Dynamic QR Attendance'}</div>
              <div>· {lang === 'ar' ? 'احتساب الساعات الأكاديمية ونسب الغياب تلقائياً' : 'Automated Academic Hours & Thresholds'}</div>
              <div>· {lang === 'ar' ? 'المساعد الذكي للدراسات العليا (Gemini AI)' : 'Graduate AI Assistant (Gemini Function Calling)'}</div>
              <div>· {lang === 'ar' ? 'تقارير رسمية بصيغ Excel و PDF بالعربية' : 'Official Arabic PDF & Excel Reporting'}</div>
            </div>
          </div>

          {/* Login / Access Status Panel */}
          <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
            {authStatus === 'loading' ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-[#1565C0] rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-600">{t.common.loading}</p>
              </div>
            ) : authStatus === 'unauthorized' || authStatus === 'disabled' ? (
              <div className="space-y-5">
                <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-200">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">
                    {authStatus === 'disabled'
                      ? (lang === 'ar' ? 'تم تعطيل هذا الحساب' : 'Account Disabled')
                      : t.unauthorizedTitle}
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {t.unauthorizedDesc}
                  </p>
                  {firebaseUser?.email && (
                    <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono-num">
                      {firebaseUser.email}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={logout}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t.signOut}</span>
                  </button>
                  <button
                    onClick={() => enterDemoMode('super_admin')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 bg-[#E3F2FD] text-[#1565C0] text-sm font-semibold hover:bg-blue-100 transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>{t.demoModeBtn}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">{t.loginTitle}</h2>
                  <p className="text-sm text-slate-500">
                    {lang === 'ar'
                      ? 'استخدم حسابك المؤسسي المصرح به للوصول إلى لوحة التحكم أو تسجيل حضور المحاضرات.'
                      : 'Sign in with your authorized institutional account to access your dashboard or record lecture attendance.'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F5F9FF] border border-blue-100 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#1565C0] shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-600 leading-relaxed">
                    {lang === 'ar'
                      ? 'نظام محمي بصلاحيات الأدوار (RBAC) وقواعد أمان Firebase Firestore. لا يُسمح بالتسجيل المفتوح للعامة.'
                      : 'Protected by Role-Based Access Control (RBAC) and Firebase Firestore Security Rules. Open public registration is disabled.'}
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={loginWithGoogle}
                    className="w-full py-3 px-4 rounded-xl bg-[#1565C0] hover:bg-blue-800 text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors shadow-sm"
                  >
                    <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>{t.signInGoogle}</span>
                  </button>

                  <div className="relative py-2 flex items-center">
                    <div className="flex-grow border-t border-slate-200" />
                    <span className="px-3 text-xs text-slate-400">
                      {lang === 'ar' ? 'أو للتقييم السريع' : 'or for evaluation'}
                    </span>
                    <div className="flex-grow border-t border-slate-200" />
                  </div>

                  <button
                    onClick={() => enterDemoMode('super_admin')}
                    className="w-full py-2.5 px-4 rounded-xl border border-blue-200 bg-[#E3F2FD] hover:bg-blue-100 text-[#1565C0] font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>{t.demoModeBtn}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="py-4 px-6 text-center text-xs text-slate-500">
        {lang === 'ar'
          ? 'الجامعة التقنية الوسطى · الكلية التقنية الإدارية – بغداد · شعبة الدراسات العليا'
          : 'Middle Technical University · Technical College of Management – Baghdad · Postgraduate Studies'}
      </footer>
    </div>
  );
};
