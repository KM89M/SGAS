import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  BookOpen,
  Users,
  UserCheck,
  BookMarked,
  CalendarDays,
  Clock,
  QrCode,
  ClipboardList,
  FileEdit,
  BarChart3,
  Bot,
  Bell,
  FileSpreadsheet,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
} from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { getBaghdadDateString, getBaghdadTimeString } from '../lib/attendanceMath';
import { INSTITUTION } from '../lib/i18n';
import { UserRole } from '../types/sgas';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';

export type NavTab =
  | 'dashboard'
  | 'departments'
  | 'programs'
  | 'students'
  | 'lecturers'
  | 'subjects'
  | 'calendar'
  | 'schedules'
  | 'sessions'
  | 'records'
  | 'corrections'
  | 'reports'
  | 'ai'
  | 'notifications'
  | 'import_export'
  | 'audit'
  | 'settings'
  | 'student_scan'
  | 'student_attendance'
  | 'student_profile';

interface LayoutShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  children: React.ReactNode;
}

export const LayoutShell: React.FC<LayoutShellProps> = ({ activeTab, onSelectTab, children }) => {
  const {
    lang,
    setLang,
    t,
    currentUser,
    isDemoMode,
    switchDemoRole,
    resetDemoSandbox,
    logout,
    dataset,
    toasts,
    dismissToast,
  } = useSGAS();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [baghdadClock, setBaghdadClock] = useState(() => `${getBaghdadDateString()} · ${getBaghdadTimeString()}`);

  useEffect(() => {
    const timer = setInterval(() => {
      setBaghdadClock(`${getBaghdadDateString()} · ${getBaghdadTimeString()}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const role = currentUser?.role || 'student';
  const unreadCount = dataset.notifications.filter(
    (n) => !n.isRead && (role === 'super_admin' || role === 'pg_admin' || n.recipientUid === currentUser?.uid),
  ).length;

  const adminItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'departments', label: t.nav.departments, icon: Building2 },
    { id: 'programs', label: t.nav.programs, icon: BookOpen },
    { id: 'students', label: t.nav.students, icon: Users },
    { id: 'lecturers', label: t.nav.lecturers, icon: UserCheck },
    { id: 'subjects', label: t.nav.subjects, icon: BookMarked },
    { id: 'calendar', label: t.nav.calendar, icon: CalendarDays },
    { id: 'schedules', label: t.nav.schedules, icon: Clock },
    { id: 'sessions', label: t.nav.sessions, icon: QrCode },
    { id: 'records', label: t.nav.records, icon: ClipboardList },
    { id: 'corrections', label: t.nav.corrections, icon: FileEdit },
    { id: 'reports', label: t.nav.reports, icon: BarChart3 },
    { id: 'ai', label: t.nav.ai, icon: Bot },
    { id: 'notifications', label: t.nav.notifications, icon: Bell },
    { id: 'import_export', label: t.nav.import_export, icon: FileSpreadsheet },
    { id: 'audit', label: t.nav.audit, icon: ShieldCheck },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const deptAdminItems = adminItems.filter(
    (i) => !['audit', 'settings', 'import_export'].includes(i.id),
  );

  const lecturerItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'schedules', label: t.nav.mySchedule, icon: Clock },
    { id: 'subjects', label: t.nav.mySubjects, icon: BookMarked },
    { id: 'sessions', label: t.nav.startAttendance, icon: QrCode },
    { id: 'records', label: t.nav.attendanceHistory, icon: ClipboardList },
    { id: 'corrections', label: t.nav.corrections, icon: FileEdit },
    { id: 'reports', label: t.nav.reports, icon: BarChart3 },
    { id: 'ai', label: t.nav.ai, icon: Bot },
    { id: 'notifications', label: t.nav.notifications, icon: Bell },
  ];

  const studentItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: t.nav.home, icon: LayoutDashboard },
    { id: 'schedules', label: t.nav.mySchedule, icon: CalendarDays },
    { id: 'student_scan', label: t.nav.scanQr, icon: QrCode },
    { id: 'student_attendance', label: t.nav.myAttendance, icon: ClipboardList },
    { id: 'corrections', label: t.nav.corrections, icon: FileEdit },
    { id: 'notifications', label: t.nav.notifications, icon: Bell },
    { id: 'student_profile', label: t.nav.profile, icon: Users },
  ];

  const navItems =
    role === 'super_admin' || role === 'pg_admin'
      ? adminItems
      : role === 'dept_admin'
        ? deptAdminItems
        : role === 'lecturer'
          ? lecturerItems
          : studentItems;

  const currentTabMeta = navItems.find((n) => n.id === activeTab) || navItems[0];
  const sys = dataset.settings;
  const collegeTitle = lang === 'ar' ? sys?.collegeNameAr || INSTITUTION.collegeAr : sys?.collegeNameEn || INSTITUTION.collegeEn;
  const uniTitle = lang === 'ar' ? sys?.universityNameAr || INSTITUTION.universityAr : sys?.universityNameEn || INSTITUTION.universityEn;

  const BreadcrumbArrow = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div className="min-h-screen bg-[#F5F9FF] text-[#1E293B] flex flex-col">
      {/* Isolated Demo Mode Banner */}
      {isDemoMode && (
        <div className="no-print bg-amber-50 border-b border-amber-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
          <div className="font-semibold">{t.demoModeBanner}</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-amber-800">{lang === 'ar' ? 'تبديل الدور:' : 'Switch Role:'}</label>
            <select
              value={role}
              onChange={(e) => {
                switchDemoRole(e.target.value as UserRole);
                onSelectTab('dashboard');
              }}
              className="px-2 py-1 rounded-md border border-amber-300 bg-white text-slate-800 font-medium"
            >
              <option value="super_admin">{t.roles.super_admin}</option>
              <option value="pg_admin">{t.roles.pg_admin}</option>
              <option value="dept_admin">{t.roles.dept_admin}</option>
              <option value="lecturer">{t.roles.lecturer}</option>
              <option value="student">{t.roles.student}</option>
            </select>
            <button
              onClick={resetDemoSandbox}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-amber-300 hover:bg-amber-100 font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t.actions.reset}</span>
            </button>
            <button
              onClick={logout}
              className="px-2.5 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800 font-medium"
            >
              {t.exitDemo}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Sidebar Desktop & Mobile Drawer */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`no-print fixed lg:sticky top-0 z-50 lg:z-20 h-screen w-64 bg-white border-e border-blue-100 flex flex-col transition-transform duration-200 ${
            sidebarOpen
              ? 'translate-x-0'
              : lang === 'ar'
                ? 'translate-x-full lg:translate-x-0'
                : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Institutional Logo Area */}
          <div className="p-4 border-b border-blue-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              {sys?.universityLogoUrl ? (
                <img
                  src={sys.universityLogoUrl}
                  alt="University Logo"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-xl object-contain border border-blue-100 bg-white shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-[#1565C0] text-white flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-bold text-sm text-[#1565C0] truncate">{uniTitle}</div>
                <div className="text-[11px] text-slate-500 truncate">{collegeTitle}</div>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#E3F2FD] text-[#1565C0] font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1565C0]' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'notifications' && unreadCount > 0 && (
                    <span className="text-xs font-mono-num font-bold text-[#1565C0]">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Account Footer */}
          <div className="p-3 border-t border-blue-100 space-y-2">
            <div className="px-2.5 py-2 rounded-xl bg-[#F5F9FF] border border-blue-100">
              <div className="text-xs font-bold text-slate-900 truncate">
                {lang === 'ar' ? currentUser?.displayNameAr : currentUser?.displayNameEn || currentUser?.displayNameAr}
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {t.roles[role]}
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.signOut}</span>
            </button>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-blue-100 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Breadcrumbs */}
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="font-bold text-[#1565C0] whitespace-nowrap hidden sm:inline">
                  SGAS
                </span>
                <BreadcrumbArrow className="w-4 h-4 text-slate-400 hidden sm:inline shrink-0" />
                <span className="font-semibold text-slate-900 truncate">
                  {currentTabMeta?.label}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <span className="hidden md:inline-block text-xs text-slate-500 font-mono-num whitespace-nowrap">
                {baghdadClock} · {t.common.baghdadTime}
              </span>
              <PWAInstallButton />
              <button
                onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Globe className="w-3.5 h-3.5 text-[#2196F3]" />
                <span>{t.switchLang}</span>
              </button>
            </div>
          </header>

          {/* Main Workspace */}
          <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Student Quick Bottom Navigation */}
      {role === 'student' && (
        <nav className="no-print sm:hidden sticky bottom-0 z-30 bg-white border-t border-blue-100 grid grid-cols-4 py-1.5 px-2">
          {[
            { id: 'dashboard' as NavTab, icon: LayoutDashboard, label: t.nav.home },
            { id: 'student_scan' as NavTab, icon: QrCode, label: t.nav.scanQr },
            { id: 'student_attendance' as NavTab, icon: ClipboardList, label: t.nav.myAttendance },
            { id: 'notifications' as NavTab, icon: Bell, label: t.nav.notifications },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 rounded-lg text-[11px] font-medium ${
                  active ? 'text-[#1565C0] font-bold' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="truncate max-w-[72px]">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Toast Notifications */}
      <div className="no-print fixed top-16 end-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-md border text-sm font-medium bg-white ${
              toast.type === 'success'
                ? 'border-emerald-200 text-emerald-800'
                : toast.type === 'error'
                  ? 'border-red-200 text-red-800'
                  : toast.type === 'warning'
                    ? 'border-amber-200 text-amber-800'
                    : 'border-blue-200 text-[#1565C0]'
            }`}
          >
            <span>{toast.text}</span>
            <button onClick={() => dismissToast(toast.id)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <OfflineIndicator />
    </div>
  );
};
