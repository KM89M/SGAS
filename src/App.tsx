/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { SGASProvider, useSGAS } from './context/SGASContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { LayoutShell, NavTab } from './components/LayoutShell';
import { AdminDashboard } from './components/AdminDashboard';
import { AcademicModules } from './components/AcademicModules';
import { ScheduleModule } from './components/ScheduleModule';
import { AttendanceSessionView } from './components/AttendanceSessionView';
import { StudentPortal } from './components/StudentPortal';
import { CorrectionsView, RecordsView } from './components/RecordsAndCorrections';
import { ReportsCenter } from './components/ReportsCenter';
import { AIAssistantView } from './components/AIAssistantView';
import {
  AuditLogsView,
  ImportExportView,
  NotificationsView,
  SettingsView,
} from './components/ImportExportAuditSettings';
import { Lecture } from './types/sgas';

function SGASRouter() {
  const { authStatus, currentUser } = useSGAS();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [sessionLecture, setSessionLecture] = useState<Lecture | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('scanToken');
    } catch {
      return null;
    }
  });

  // If user opens a QR link (?scanToken=...) and is authenticated as student, auto-route to scanner
  useEffect(() => {
    if (scanToken && (authStatus === 'authenticated' || authStatus === 'demo') && currentUser?.role === 'student') {
      setActiveTab('student_scan');
    }
  }, [authStatus, currentUser?.role, scanToken]);

  const clearScanToken = () => {
    setScanToken(null);
    if (window.location.search.includes('scanToken')) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  };

  if (authStatus !== 'authenticated' && authStatus !== 'demo') {
    return <LoginView />;
  }

  const role = currentUser?.role || 'student';

  const handleOpenSession = (lec: Lecture) => {
    setSessionLecture(lec);
    setActiveTab('sessions');
  };

  const renderContent = () => {
    if (activeTab === 'dashboard') {
      if (role === 'student') {
        return <StudentPortal mode="home" onNavigate={setActiveTab} />;
      }
      return <AdminDashboard />;
    }

    if (
      activeTab === 'departments' ||
      activeTab === 'programs' ||
      activeTab === 'students' ||
      activeTab === 'lecturers' ||
      activeTab === 'subjects' ||
      activeTab === 'calendar'
    ) {
      return <AcademicModules view={activeTab} />;
    }

    if (activeTab === 'schedules') {
      return <ScheduleModule onOpenSession={handleOpenSession} />;
    }

    if (activeTab === 'sessions') {
      return <AttendanceSessionView initialLecture={sessionLecture} />;
    }

    if (activeTab === 'records') {
      return <RecordsView />;
    }

    if (activeTab === 'corrections') {
      return <CorrectionsView />;
    }

    if (activeTab === 'reports') {
      return <ReportsCenter />;
    }

    if (activeTab === 'ai') {
      return <AIAssistantView onOpenReports={() => setActiveTab('reports')} />;
    }

    if (activeTab === 'notifications') {
      return <NotificationsView />;
    }

    if (activeTab === 'import_export') {
      return <ImportExportView />;
    }

    if (activeTab === 'audit') {
      return <AuditLogsView />;
    }

    if (activeTab === 'settings') {
      return <SettingsView />;
    }

    if (activeTab === 'student_scan') {
      return (
        <StudentPortal
          mode="scan"
          initialScanToken={scanToken}
          onClearScanToken={clearScanToken}
          onNavigate={setActiveTab}
        />
      );
    }

    if (activeTab === 'student_attendance') {
      return <StudentPortal mode="attendance" onNavigate={setActiveTab} />;
    }

    if (activeTab === 'student_profile') {
      return <StudentPortal mode="profile" onNavigate={setActiveTab} />;
    }

    return <AdminDashboard />;
  };

  return (
    <LayoutShell activeTab={activeTab} onSelectTab={setActiveTab}>
      {renderContent()}
    </LayoutShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SGASProvider>
        <SGASRouter />
      </SGASProvider>
    </ErrorBoundary>
  );
}
