import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import {
  calculateStudentAttendance,
  DEFAULT_POLICY,
  getBaghdadDateString,
  getBaghdadTimeString,
} from '../lib/attendanceMath';
import { createIsolatedDemoDataset, getDemoUserByRole } from '../lib/demoData';
import { INSTITUTION, Language, translations } from '../lib/i18n';
import {
  AcademicProgram,
  AcademicYear,
  AiQueryLog,
  AttendanceCorrection,
  AttendanceMethod,
  AttendancePolicy,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  AuditLog,
  Cohort,
  Department,
  Holiday,
  Lecture,
  LectureStatus,
  Lecturer,
  NotificationItem,
  ReportHistory,
  sanitizeId,
  Semester,
  SGASDataset,
  Student,
  StudentEnrollment,
  Subject,
  SystemSetting,
  UserAccount,
  UserInvite,
  UserRole,
} from '../types/sgas';

const EMPTY_DATASET: SGASDataset = {
  departments: [],
  programs: [],
  academicYears: [],
  semesters: [],
  cohorts: [],
  students: [],
  lecturers: [],
  subjects: [],
  enrollments: [],
  lectures: [],
  holidays: [],
  sessions: [],
  records: [],
  corrections: [],
  policies: [],
  notifications: [],
  auditLogs: [],
  aiQueryLogs: [],
  reportHistory: [],
  settings: null,
  users: [],
  invites: [],
};

const DEMO_STORAGE_KEY = 'sgas_demo_sandbox_v1';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'unauthorized'
  | 'disabled'
  | 'authenticated'
  | 'demo';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

interface SGASContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (typeof translations)['ar'] | (typeof translations)['en'];
  isOnline: boolean;
  authStatus: AuthStatus;
  firebaseUser: FirebaseUser | null;
  currentUser: UserAccount | null;
  isDemoMode: boolean;
  dataset: SGASDataset;
  activePolicy: AttendancePolicy;
  toasts: ToastMessage[];
  pushToast: (type: ToastMessage['type'], text: string) => void;
  dismissToast: (id: string) => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  enterDemoMode: (role?: UserRole) => void;
  switchDemoRole: (role: UserRole) => void;
  resetDemoSandbox: () => void;
  getAuthToken: () => Promise<string | null>;

  // Domain Operations
  saveDepartment: (item: Partial<Department> & { code: string; nameAr: string; nameEn: string }) => Promise<void>;
  saveProgram: (item: Partial<AcademicProgram> & { code: string; nameAr: string; nameEn: string; degreeType: AcademicProgram['degreeType']; departmentId: string }) => Promise<void>;
  saveAcademicYear: (item: Partial<AcademicYear> & { label: string; startDate: string; endDate: string }) => Promise<void>;
  saveSemester: (item: Partial<Semester> & { academicYearId: string; nameAr: string; nameEn: string; semesterNumber: number; startDate: string; endDate: string }) => Promise<void>;
  saveCohort: (item: Partial<Cohort> & { nameAr: string; nameEn: string; departmentId: string; programId: string; academicYearId: string }) => Promise<void>;
  saveHoliday: (item: Partial<Holiday> & { titleAr: string; titleEn: string; startDate: string; endDate: string; type: Holiday['type'] }) => Promise<void>;
  saveStudent: (item: Partial<Student> & { universityId: string; fullNameAr: string; fullNameEn: string; email: string; departmentId: string; programId: string }) => Promise<void>;
  bulkSaveStudents: (items: Array<Partial<Student> & { universityId: string; fullNameAr: string; fullNameEn: string; email: string; departmentId: string; programId: string }>) => Promise<number>;
  saveLecturer: (item: Partial<Lecturer> & { lecturerCode: string; fullNameAr: string; fullNameEn: string; academicTitleAr: string; email: string; departmentId: string }) => Promise<void>;
  saveSubject: (item: Partial<Subject> & { code: string; nameAr: string; nameEn: string; departmentId: string; programId: string }) => Promise<void>;
  saveEnrollment: (item: Omit<StudentEnrollment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  saveLecture: (item: Partial<Lecture> & { departmentId: string; programId: string; subjectId: string; lecturerId: string; lectureDate: string; startTime: string; endTime: string; classroom: string }) => Promise<void>;
  bulkCreateLectures: (items: Array<Partial<Lecture> & { departmentId: string; programId: string; subjectId: string; lecturerId: string; lectureDate: string; startTime: string; endTime: string; classroom: string }>) => Promise<number>;
  updateLectureStatus: (lectureId: string, status: LectureStatus, extra?: Partial<Lecture>, reason?: string) => Promise<void>;

  // QR & Attendance Workflow
  openOrResumeSession: (lecture: Lecture, geofence?: { enabled: boolean; lat?: number; lng?: number; radius?: number }) => Promise<{ session: AttendanceSession; qrData: { token: string; tokenHash: string; issuedAt: number; expiresAt: number } }>;
  rotateSessionQr: (session: AttendanceSession) => Promise<{ token: string; tokenHash: string; issuedAt: number; expiresAt: number }>;
  setSessionStatus: (sessionId: string, status: AttendanceSession['status']) => Promise<void>;
  recordStudentQrAttendance: (qrToken: string, method: AttendanceMethod, geoCoords?: { lat: number; lng: number }) => Promise<{ ok: boolean; message: string; status?: AttendanceStatus }>;
  markManualAttendance: (session: AttendanceSession, student: Student, status: AttendanceStatus, notes?: string) => Promise<void>;
  approveAttendanceSession: (session: AttendanceSession) => Promise<void>;
  overrideApprovedRecord: (record: AttendanceRecord, newStatus: AttendanceStatus, reason: string) => Promise<void>;

  // Corrections, Settings, Invites, Audit
  submitCorrectionRequest: (payload: { record: AttendanceRecord; requestedStatus: 'present' | 'late' | 'excused'; reason: string; attachmentNote?: string }) => Promise<void>;
  reviewCorrectionRequest: (correction: AttendanceCorrection, decision: 'approved' | 'rejected', reviewNote: string) => Promise<void>;
  saveAttendancePolicy: (policy: AttendancePolicy) => Promise<void>;
  saveSystemSettings: (setting: SystemSetting) => Promise<void>;
  createUserInvite: (invite: { email: string; role: UserRole; displayNameAr: string; displayNameEn?: string; departmentId?: string; linkedEntityId?: string }) => Promise<void>;
  updateUserAccountStatus: (user: UserAccount, status: UserAccount['status'], role?: UserRole) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  logAiActivity: (entry: Omit<AiQueryLog, 'id' | 'createdAt'>) => Promise<void>;
  logReportGeneration: (entry: Omit<ReportHistory, 'id' | 'createdAt'>) => Promise<void>;
  restoreFromBackup: (backupData: Partial<SGASDataset>) => Promise<void>;
}

const SGASContext = createContext<SGASContextValue | null>(null);

export const SGASProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('sgas_lang');
    return saved === 'en' ? 'en' : 'ar';
  });
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [prodDataset, setProdDataset] = useState<SGASDataset>(EMPTY_DATASET);
  const [demoDataset, setDemoDataset] = useState<SGASDataset>(() => {
    try {
      const saved = localStorage.getItem(DEMO_STORAGE_KEY);
      if (saved) return JSON.parse(saved) as SGASDataset;
    } catch {
      // ignore corrupted local storage
    }
    return createIsolatedDemoDataset();
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const setLang = useCallback((nextLang: Language) => {
    setLangState(nextLang);
    localStorage.setItem('sgas_lang', nextLang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Persist isolated demo dataset changes only inside demo local storage key
  useEffect(() => {
    if (isDemoMode) {
      try {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoDataset));
      } catch {
        // ignore quota errors
      }
    }
  }, [demoDataset, isDemoMode]);

  // Startup connection validation
  useEffect(() => {
    testConnection();
  }, []);

  // Firebase Auth listener & role resolution
  useEffect(() => {
    if (isDemoMode) return;

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setCurrentUser(null);
        setAuthStatus('unauthenticated');
        return;
      }

      if (!fbUser.emailVerified) {
        setCurrentUser(null);
        setAuthStatus('unauthorized');
        return;
      }

      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = { id: userSnap.id, ...userSnap.data() } as UserAccount;
          if (data.status === 'disabled') {
            setCurrentUser(data);
            setAuthStatus('disabled');
            return;
          }
          setCurrentUser(data);
          setAuthStatus('authenticated');
          return;
        }

        // Bootstrapped Super Admin provisioning
        if (fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
          const batch = writeBatch(db);
          const profilePayload = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayNameAr: fbUser.displayName || 'مدير النظام الأعلى',
            displayNameEn: fbUser.displayName || 'System Super Administrator',
            role: 'super_admin' as UserRole,
            status: 'active' as const,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          batch.set(userRef, profilePayload);
          batch.set(doc(db, 'admins', fbUser.uid), {
            uid: fbUser.uid,
            email: fbUser.email,
            role: 'super_admin',
            grantedBy: fbUser.uid,
            createdAt: serverTimestamp(),
          });

          // Bootstrap default institutional settings & default policy if absent
          const sysSnap = await getDoc(doc(db, 'systemSettings', 'default'));
          if (!sysSnap.exists()) {
            batch.set(doc(db, 'systemSettings', 'default'), {
              universityNameAr: INSTITUTION.universityAr,
              universityNameEn: INSTITUTION.universityEn,
              collegeNameAr: INSTITUTION.collegeAr,
              collegeNameEn: INSTITUTION.collegeEn,
              departmentTitleAr: INSTITUTION.departmentAr,
              departmentTitleEn: INSTITUTION.departmentEn,
              universityLogoUrl: '',
              collegeLogoUrl: '',
              timezone: 'Asia/Baghdad',
              defaultLanguage: 'ar',
              updatedByUid: fbUser.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          const polSnap = await getDoc(doc(db, 'attendancePolicies', 'default'));
          if (!polSnap.exists()) {
            batch.set(doc(db, 'attendancePolicies', 'default'), {
              name: DEFAULT_POLICY.name,
              maxAbsencePercent: DEFAULT_POLICY.maxAbsencePercent,
              firstWarningPercent: DEFAULT_POLICY.firstWarningPercent,
              secondWarningPercent: DEFAULT_POLICY.secondWarningPercent,
              criticalWarningPercent: DEFAULT_POLICY.criticalWarningPercent,
              lateThresholdMinutes: DEFAULT_POLICY.lateThresholdMinutes,
              lateCountsAsFraction: DEFAULT_POLICY.lateCountsAsFraction,
              excusedCountsTowardAttendance: DEFAULT_POLICY.excusedCountsTowardAttendance,
              academicHourMinutes: DEFAULT_POLICY.academicHourMinutes,
              defaultQrRotationSeconds: DEFAULT_POLICY.defaultQrRotationSeconds,
              defaultSessionDurationMinutes: DEFAULT_POLICY.defaultSessionDurationMinutes,
              geofencingEnabledByDefault: false,
              updatedByUid: fbUser.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          await batch.commit();
          setCurrentUser({ id: fbUser.uid, ...profilePayload });
          setAuthStatus('authenticated');
          return;
        }

        // Check admin-issued invitation matching this verified email
        const invQuery = query(
          collection(db, 'userInvites'),
          where('email', '==', fbUser.email?.toLowerCase() || ''),
        );
        const invSnap = await getDocs(invQuery);
        const pendingInviteDoc = invSnap.docs.find((d) => d.data().status === 'pending');

        if (!pendingInviteDoc) {
          setCurrentUser(null);
          setAuthStatus('unauthorized');
          return;
        }

        const inv = pendingInviteDoc.data() as UserInvite;
        const batch = writeBatch(db);
        const claimedUser: Omit<UserAccount, 'id'> = {
          uid: fbUser.uid,
          email: fbUser.email || inv.email,
          displayNameAr: inv.displayNameAr || fbUser.displayName || 'مستخدم مؤسسي',
          displayNameEn: inv.displayNameEn || fbUser.displayName || 'Institutional User',
          role: inv.role,
          departmentId: inv.departmentId || '',
          linkedEntityId: inv.linkedEntityId || '',
          inviteId: pendingInviteDoc.id,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        batch.set(userRef, claimedUser);
        batch.update(doc(db, 'userInvites', pendingInviteDoc.id), {
          status: 'claimed',
          updatedAt: serverTimestamp(),
        });

        if (inv.linkedEntityId && inv.role === 'student') {
          batch.update(doc(db, 'students', inv.linkedEntityId), {
            uid: fbUser.uid,
            updatedAt: serverTimestamp(),
          });
        } else if (inv.linkedEntityId && inv.role === 'lecturer') {
          batch.update(doc(db, 'lecturers', inv.linkedEntityId), {
            uid: fbUser.uid,
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        setCurrentUser({ id: fbUser.uid, ...claimedUser });
        setAuthStatus('authenticated');
      } catch (err) {
        console.error('Auth resolution error:', err);
        setAuthStatus('unauthorized');
      }
    });

    return () => unsub();
  }, [isDemoMode]);

  // Real-time Firestore listeners (only attached when authenticated in production mode)
  useEffect(() => {
    if (isDemoMode || authStatus !== 'authenticated' || !currentUser) return;

    const unsubs: Unsubscribe[] = [];
    const role = currentUser.role;
    const isAdminLevel = role === 'super_admin' || role === 'pg_admin';
    const isStaffLevel = isAdminLevel || role === 'dept_admin' || role === 'lecturer';

    const attach = <T,>(
      path: string,
      qRef: ReturnType<typeof query> | ReturnType<typeof collection>,
      setter: (items: T[]) => void,
    ) => {
      const u = onSnapshot(
        qRef,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as T);
          setter(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        },
      );
      unsubs.push(u);
    };

    // Catalog collections (active or staff)
    attach<Department>(
      'departments',
      isAdminLevel ? collection(db, 'departments') : query(collection(db, 'departments'), where('isActive', '==', true)),
      (departments) => setProdDataset((p) => ({ ...p, departments })),
    );
    attach<AcademicProgram>(
      'academicPrograms',
      isAdminLevel ? collection(db, 'academicPrograms') : query(collection(db, 'academicPrograms'), where('isActive', '==', true)),
      (programs) => setProdDataset((p) => ({ ...p, programs })),
    );
    attach<AcademicYear>(
      'academicYears',
      isAdminLevel ? collection(db, 'academicYears') : query(collection(db, 'academicYears'), where('isActive', '==', true)),
      (academicYears) => setProdDataset((p) => ({ ...p, academicYears })),
    );
    attach<Semester>(
      'semesters',
      isAdminLevel ? collection(db, 'semesters') : query(collection(db, 'semesters'), where('isActive', '==', true)),
      (semesters) => setProdDataset((p) => ({ ...p, semesters })),
    );
    attach<Cohort>(
      'cohorts',
      isAdminLevel ? collection(db, 'cohorts') : query(collection(db, 'cohorts'), where('isActive', '==', true)),
      (cohorts) => setProdDataset((p) => ({ ...p, cohorts })),
    );
    attach<Subject>(
      'subjects',
      isStaffLevel ? collection(db, 'subjects') : query(collection(db, 'subjects'), where('isActive', '==', true)),
      (subjects) => setProdDataset((p) => ({ ...p, subjects })),
    );
    attach<Holiday>(
      'holidays',
      isAdminLevel ? collection(db, 'holidays') : query(collection(db, 'holidays'), where('isActive', '==', true)),
      (holidays) => setProdDataset((p) => ({ ...p, holidays })),
    );
    attach<AttendancePolicy>(
      'attendancePolicies',
      query(collection(db, 'attendancePolicies'), where('academicHourMinutes', '>=', 30)),
      (policies) => setProdDataset((p) => ({ ...p, policies })),
    );
    unsubs.push(
      onSnapshot(
        doc(db, 'systemSettings', 'default'),
        (snap) => {
          setProdDataset((p) => ({
            ...p,
            settings: snap.exists() ? ({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as SystemSetting) : null,
          }));
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, 'systemSettings/default');
        },
      ),
    );

    // PII-sensitive collections scoped by role
    attach<Student>(
      'students',
      isStaffLevel
        ? collection(db, 'students')
        : query(collection(db, 'students'), where('uid', '==', currentUser.uid)),
      (students) => setProdDataset((p) => ({ ...p, students })),
    );
    attach<Lecturer>(
      'lecturers',
      isStaffLevel
        ? collection(db, 'lecturers')
        : query(collection(db, 'lecturers'), where('uid', '==', currentUser.uid)),
      (lecturers) => setProdDataset((p) => ({ ...p, lecturers })),
    );
    attach<StudentEnrollment>(
      'studentEnrollments',
      isStaffLevel
        ? collection(db, 'studentEnrollments')
        : query(collection(db, 'studentEnrollments'), where('studentUid', '==', currentUser.uid)),
      (enrollments) => setProdDataset((p) => ({ ...p, enrollments })),
    );

    // Lectures & Attendance Sessions
    attach<Lecture>(
      'lectures',
      query(collection(db, 'lectures'), where('status', 'in', ['scheduled', 'attendance_open', 'pending_approval', 'approved', 'completed', 'cancelled', 'postponed', 'rescheduled'])),
      (lectures) => setProdDataset((p) => ({ ...p, lectures })),
    );
    attach<AttendanceSession>(
      'attendanceSessions',
      role === 'lecturer'
        ? query(collection(db, 'attendanceSessions'), where('lecturerUid', '==', currentUser.uid))
        : query(collection(db, 'attendanceSessions'), where('status', 'in', ['open', 'paused', 'closed', 'approved'])),
      (sessions) => setProdDataset((p) => ({ ...p, sessions })),
    );

    // Attendance Records strictly scoped
    attach<AttendanceRecord>(
      'attendanceRecords',
      isAdminLevel
        ? collection(db, 'attendanceRecords')
        : role === 'dept_admin' && currentUser.departmentId
          ? query(collection(db, 'attendanceRecords'), where('departmentId', '==', currentUser.departmentId))
          : role === 'lecturer'
            ? query(collection(db, 'attendanceRecords'), where('lecturerUid', '==', currentUser.uid))
            : query(collection(db, 'attendanceRecords'), where('studentUid', '==', currentUser.uid)),
      (records) => setProdDataset((p) => ({ ...p, records })),
    );

    // Corrections & Notifications
    attach<AttendanceCorrection>(
      'attendanceCorrections',
      isStaffLevel
        ? collection(db, 'attendanceCorrections')
        : query(collection(db, 'attendanceCorrections'), where('studentUid', '==', currentUser.uid)),
      (corrections) => setProdDataset((p) => ({ ...p, corrections })),
    );
    attach<NotificationItem>(
      'notifications',
      isAdminLevel
        ? collection(db, 'notifications')
        : query(collection(db, 'notifications'), where('recipientUid', '==', currentUser.uid)),
      (notifications) => setProdDataset((p) => ({ ...p, notifications })),
    );

    if (isAdminLevel) {
      attach<UserAccount>('users', collection(db, 'users'), (users) => setProdDataset((p) => ({ ...p, users })));
      attach<UserInvite>('userInvites', collection(db, 'userInvites'), (invites) => setProdDataset((p) => ({ ...p, invites })));
      attach<AuditLog>('auditLogs', collection(db, 'auditLogs'), (auditLogs) => setProdDataset((p) => ({ ...p, auditLogs })));
      attach<AiQueryLog>('aiQueryLogs', collection(db, 'aiQueryLogs'), (aiQueryLogs) => setProdDataset((p) => ({ ...p, aiQueryLogs })));
      attach<ReportHistory>('reportHistory', collection(db, 'reportHistory'), (reportHistory) => setProdDataset((p) => ({ ...p, reportHistory })));
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authStatus, currentUser, isDemoMode]);

  const dataset = isDemoMode ? demoDataset : prodDataset;
  const activePolicy = dataset.policies[0] || DEFAULT_POLICY;
  const t = translations[lang];

  const writeAudit = useCallback(
    async (action: string, targetCollection: string, targetId: string, previousSummary?: string, newSummary?: string, reason?: string) => {
      if (!currentUser) return;
      const logId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      if (isDemoMode) {
        setDemoDataset((prev) => ({
          ...prev,
          auditLogs: [
            {
              id: logId,
              actorUid: currentUser.uid,
              actorEmail: currentUser.email,
              actorRole: currentUser.role,
              action,
              targetCollection,
              targetId,
              previousSummary,
              newSummary,
              reason,
              createdAt: new Date().toISOString(),
            },
            ...prev.auditLogs,
          ],
        }));
        return;
      }
      try {
        await setDoc(doc(db, 'auditLogs', logId), {
          actorUid: currentUser.uid,
          actorEmail: currentUser.email,
          actorRole: currentUser.role,
          action,
          targetCollection,
          targetId,
          ...(previousSummary ? { previousSummary: previousSummary.slice(0, 390) } : {}),
          ...(newSummary ? { newSummary: newSummary.slice(0, 390) } : {}),
          ...(reason ? { reason: reason.slice(0, 390) } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `auditLogs/${logId}`);
      }
    },
    [currentUser, isDemoMode],
  );

  const loginWithGoogle = useCallback(async () => {
    try {
      setIsDemoMode(false);
      await signInWithPopup(auth, googleProvider);
      pushToast('success', lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Sign-in failed');
    }
  }, [lang, pushToast]);

  const logout = useCallback(async () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setCurrentUser(null);
      setAuthStatus('unauthenticated');
      return;
    }
    await writeAudit('LOGOUT', 'users', currentUser?.uid || 'unknown');
    await signOut(auth);
    setCurrentUser(null);
    setAuthStatus('unauthenticated');
  }, [currentUser, isDemoMode, writeAudit]);

  const enterDemoMode = useCallback((role: UserRole = 'super_admin') => {
    setIsDemoMode(true);
    setCurrentUser(getDemoUserByRole(role));
    setAuthStatus('demo');
  }, []);

  const switchDemoRole = useCallback((role: UserRole) => {
    setCurrentUser(getDemoUserByRole(role));
  }, []);

  const resetDemoSandbox = useCallback(() => {
    const fresh = createIsolatedDemoDataset();
    setDemoDataset(fresh);
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fresh));
    pushToast('info', lang === 'ar' ? 'تمت إعادة ضبط بيئة التجربة المعزولة' : 'Isolated demo sandbox reset');
  }, [lang, pushToast]);

  const getAuthToken = useCallback(async () => {
    if (isDemoMode && currentUser) return `DEMO_SANDBOX_${currentUser.uid}`;
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  }, [currentUser, isDemoMode]);

  // Generic helper for demo vs Firestore CRUD
  const saveEntity = useCallback(
    async <T extends { id: string }>(
      colName: keyof SGASDataset,
      firestoreCol: string,
      id: string,
      payload: Record<string, unknown>,
      isNew: boolean,
      auditAction: string,
    ) => {
      const cleanId = sanitizeId(id);
      if (isDemoMode) {
        const nowIso = new Date().toISOString();
        setDemoDataset((prev) => {
          const list = (prev[colName] as unknown as T[]) || [];
          const existing = list.find((i) => i.id === cleanId);
          const updatedItem = { ...existing, ...payload, id: cleanId, createdAt: existing ? (existing as Record<string, unknown>).createdAt || nowIso : nowIso, updatedAt: nowIso } as unknown as T;
          const nextList = existing ? list.map((i) => (i.id === cleanId ? updatedItem : i)) : [updatedItem, ...list];
          return { ...prev, [colName]: nextList };
        });
        await writeAudit(auditAction, firestoreCol, cleanId, undefined, JSON.stringify(payload).slice(0, 200));
        return;
      }

      const ref = doc(db, firestoreCol, cleanId);
      try {
        if (isNew) {
          await setDoc(ref, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, {
            ...payload,
            updatedAt: serverTimestamp(),
          });
        }
        await writeAudit(auditAction, firestoreCol, cleanId, undefined, JSON.stringify(payload).slice(0, 200));
      } catch (err) {
        handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `${firestoreCol}/${cleanId}`);
      }
    },
    [isDemoMode, writeAudit],
  );

  const saveDepartment = useCallback(
    async (item: Partial<Department> & { code: string; nameAr: string; nameEn: string }) => {
      const isNew = !item.id;
      const id = item.id || `dept_${sanitizeId(item.code.toLowerCase())}_${Date.now().toString(36)}`;
      await saveEntity('departments', 'departments', id, {
        code: sanitizeId(item.code).slice(0, 32),
        nameAr: item.nameAr.trim(),
        nameEn: item.nameEn.trim(),
        adminName: item.adminName || '',
        adminUid: item.adminUid || '',
        isActive: item.isActive ?? true,
      }, isNew, isNew ? 'CREATE_DEPARTMENT' : 'UPDATE_DEPARTMENT');
    },
    [saveEntity],
  );

  const saveProgram = useCallback(
    async (item: Partial<AcademicProgram> & { code: string; nameAr: string; nameEn: string; degreeType: AcademicProgram['degreeType']; departmentId: string }) => {
      const isNew = !item.id;
      const id = item.id || `prog_${sanitizeId(item.code.toLowerCase())}_${Date.now().toString(36)}`;
      await saveEntity('programs', 'academicPrograms', id, {
        code: sanitizeId(item.code).slice(0, 32),
        nameAr: item.nameAr.trim(),
        nameEn: item.nameEn.trim(),
        degreeType: item.degreeType,
        departmentId: item.departmentId,
        totalRequiredHours: Number(item.totalRequiredHours) || 180,
        isActive: item.isActive ?? true,
      }, isNew, isNew ? 'CREATE_PROGRAM' : 'UPDATE_PROGRAM');
    },
    [saveEntity],
  );

  const saveAcademicYear = useCallback(
    async (item: Partial<AcademicYear> & { label: string; startDate: string; endDate: string }) => {
      const isNew = !item.id;
      const id = item.id || `ay_${Date.now().toString(36)}`;
      await saveEntity('academicYears', 'academicYears', id, {
        label: item.label.trim(),
        startDate: item.startDate,
        endDate: item.endDate,
        isCurrent: item.isCurrent ?? false,
        isActive: item.isActive ?? true,
      }, isNew, isNew ? 'CREATE_ACADEMIC_YEAR' : 'UPDATE_ACADEMIC_YEAR');
    },
    [saveEntity],
  );

  const saveSemester = useCallback(
    async (item: Partial<Semester> & { academicYearId: string; nameAr: string; nameEn: string; semesterNumber: number; startDate: string; endDate: string }) => {
      const isNew = !item.id;
      const id = item.id || `sem_${Date.now().toString(36)}`;
      await saveEntity('semesters', 'semesters', id, {
        academicYearId: item.academicYearId,
        nameAr: item.nameAr.trim(),
        nameEn: item.nameEn.trim(),
        semesterNumber: Number(item.semesterNumber) || 1,
        startDate: item.startDate,
        endDate: item.endDate,
        isCurrent: item.isCurrent ?? false,
        isActive: item.isActive ?? true,
      }, isNew, isNew ? 'CREATE_SEMESTER' : 'UPDATE_SEMESTER');
    },
    [saveEntity],
  );

  const saveCohort = useCallback(
    async (item: Partial<Cohort> & { nameAr: string; nameEn: string; departmentId: string; programId: string; academicYearId: string }) => {
      const isNew = !item.id;
      const id = item.id || `coh_${Date.now().toString(36)}`;
      await saveEntity('cohorts', 'cohorts', id, {
        nameAr: item.nameAr.trim(),
        nameEn: item.nameEn.trim(),
        departmentId: item.departmentId,
        programId: item.programId,
        academicYearId: item.academicYearId,
        admissionYear: item.admissionYear || '2026',
        isActive: item.isActive ?? true,
      }, isNew, isNew ? 'CREATE_COHORT' : 'UPDATE_COHORT');
    },
    [saveEntity],
  );

  const saveHoliday = useCallback(
    async (item: Partial<Holiday> & { titleAr: string; titleEn: string; startDate: string; endDate: string; type: Holiday['type'] }) => {
      const isNew = !item.id;
      const id = item.id || `hol_${Date.now().toString(36)}`;
      await saveEntity('holidays', 'holidays', id, {
        titleAr: item.titleAr.trim(),
        titleEn: item.titleEn.trim(),
        startDate: item.startDate,
        endDate: item.endDate,
        type: item.type,
        isActive: item.isActive ?? true,
      }, isNew, isNew ? 'CREATE_HOLIDAY' : 'UPDATE_HOLIDAY');
    },
    [saveEntity],
  );

  const saveStudent = useCallback(
    async (item: Partial<Student> & { universityId: string; fullNameAr: string; fullNameEn: string; email: string; departmentId: string; programId: string }) => {
      const isNew = !item.id;
      const cleanUniId = sanitizeId(item.universityId).slice(0, 48);
      if (isNew && dataset.students.some((s) => s.universityId.toLowerCase() === cleanUniId.toLowerCase())) {
        throw new Error(lang === 'ar' ? `الرقم الجامعي مكرر: ${cleanUniId}` : `Duplicate university ID: ${cleanUniId}`);
      }
      const id = item.id || `stu_${cleanUniId}_${Date.now().toString(36)}`;
      await saveEntity('students', 'students', id, {
        universityId: cleanUniId,
        fullNameAr: item.fullNameAr.trim(),
        fullNameEn: item.fullNameEn.trim(),
        email: item.email.trim().toLowerCase(),
        phone: item.phone?.trim() || '',
        departmentId: item.departmentId,
        programId: item.programId,
        academicYearId: item.academicYearId || '',
        semesterId: item.semesterId || '',
        cohortId: item.cohortId || '',
        enrollmentStatus: item.enrollmentStatus || 'enrolled',
        accountStatus: item.accountStatus || 'active',
        uid: item.uid || '',
      }, isNew, isNew ? 'CREATE_STUDENT' : 'UPDATE_STUDENT');
    },
    [dataset.students, lang, saveEntity],
  );

  const bulkSaveStudents = useCallback(
    async (items: Array<Partial<Student> & { universityId: string; fullNameAr: string; fullNameEn: string; email: string; departmentId: string; programId: string }>) => {
      let count = 0;
      if (isDemoMode) {
        const nowIso = new Date().toISOString();
        const added: Student[] = [];
        for (const item of items) {
          const cleanUniId = sanitizeId(item.universityId);
          if (dataset.students.some((s) => s.universityId === cleanUniId)) continue;
          added.push({
            id: `stu_${cleanUniId}_${Date.now().toString(36)}_${count}`,
            universityId: cleanUniId,
            fullNameAr: item.fullNameAr.trim(),
            fullNameEn: item.fullNameEn.trim(),
            email: item.email.trim().toLowerCase(),
            phone: item.phone || '',
            departmentId: item.departmentId,
            programId: item.programId,
            enrollmentStatus: item.enrollmentStatus || 'enrolled',
            accountStatus: 'active',
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          count++;
        }
        setDemoDataset((prev) => ({ ...prev, students: [...added, ...prev.students] }));
        await writeAudit('BULK_IMPORT_STUDENTS', 'students', 'batch', undefined, `Imported ${count} students`);
        return count;
      }

      const batch = writeBatch(db);
      for (const item of items) {
        const cleanUniId = sanitizeId(item.universityId).slice(0, 48);
        if (dataset.students.some((s) => s.universityId === cleanUniId)) continue;
        const id = `stu_${cleanUniId}_${Date.now().toString(36)}_${count}`;
        batch.set(doc(db, 'students', id), {
          universityId: cleanUniId,
          fullNameAr: item.fullNameAr.trim(),
          fullNameEn: item.fullNameEn.trim(),
          email: item.email.trim().toLowerCase(),
          phone: item.phone || '',
          departmentId: item.departmentId,
          programId: item.programId,
          enrollmentStatus: item.enrollmentStatus || 'enrolled',
          accountStatus: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        count++;
      }
      try {
        await batch.commit();
        await writeAudit('BULK_IMPORT_STUDENTS', 'students', 'batch', undefined, `Imported ${count} students`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'students');
      }
      return count;
    },
    [dataset.students, isDemoMode, writeAudit],
  );

  const saveLecturer = useCallback(
    async (item: Partial<Lecturer> & { lecturerCode: string; fullNameAr: string; fullNameEn: string; academicTitleAr: string; email: string; departmentId: string }) => {
      const isNew = !item.id;
      const code = sanitizeId(item.lecturerCode).slice(0, 48);
      const id = item.id || `lec_${code}_${Date.now().toString(36)}`;
      await saveEntity('lecturers', 'lecturers', id, {
        lecturerCode: code,
        fullNameAr: item.fullNameAr.trim(),
        fullNameEn: item.fullNameEn.trim(),
        academicTitleAr: item.academicTitleAr.trim(),
        academicTitleEn: item.academicTitleEn?.trim() || '',
        email: item.email.trim().toLowerCase(),
        departmentId: item.departmentId,
        accountStatus: item.accountStatus || 'active',
        uid: item.uid || '',
      }, isNew, isNew ? 'CREATE_LECTURER' : 'UPDATE_LECTURER');
    },
    [saveEntity],
  );

  const saveSubject = useCallback(
    async (item: Partial<Subject> & { code: string; nameAr: string; nameEn: string; departmentId: string; programId: string }) => {
      const isNew = !item.id;
      const code = sanitizeId(item.code).slice(0, 32);
      const id = item.id || `sub_${code}_${Date.now().toString(36)}`;
      await saveEntity('subjects', 'subjects', id, {
        code,
        nameAr: item.nameAr.trim(),
        nameEn: item.nameEn.trim(),
        departmentId: item.departmentId,
        programId: item.programId,
        academicYearId: item.academicYearId || '',
        semesterId: item.semesterId || '',
        subjectType: item.subjectType || 'mandatory',
        weeklyHours: Number(item.weeklyHours) || 2,
        totalPlannedHours: Number(item.totalPlannedHours) || 30,
        lecturerIds: (item.lecturerIds || []).slice(0, 10),
        lecturerUids: (item.lecturerUids || []).slice(0, 10),
        isActive: item.isActive ?? true,
      }, isNew, isNew ? 'CREATE_SUBJECT' : 'UPDATE_SUBJECT');
    },
    [saveEntity],
  );

  const saveEnrollment = useCallback(
    async (item: Omit<StudentEnrollment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const id = item.id || `enr_${sanitizeId(item.studentId)}_${sanitizeId(item.subjectId)}`;
      const isNew = !dataset.enrollments.some((e) => e.id === id);
      await saveEntity('enrollments', 'studentEnrollments', id, {
        studentId: item.studentId,
        studentUid: item.studentUid || '',
        subjectId: item.subjectId,
        departmentId: item.departmentId,
        programId: item.programId,
        academicYearId: item.academicYearId || '',
        semesterId: item.semesterId || '',
        status: item.status || 'active',
      }, isNew, isNew ? 'CREATE_ENROLLMENT' : 'UPDATE_ENROLLMENT');
    },
    [dataset.enrollments, saveEntity],
  );

  const saveLecture = useCallback(
    async (item: Partial<Lecture> & { departmentId: string; programId: string; subjectId: string; lecturerId: string; lectureDate: string; startTime: string; endTime: string; classroom: string }) => {
      const isNew = !item.id;
      const id = item.id || `lec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const sub = dataset.subjects.find((s) => s.id === item.subjectId);
      const lec = dataset.lecturers.find((l) => l.id === item.lecturerId);
      const durMin = Number(item.plannedDurationMinutes) || 120;
      const hourMin = activePolicy.academicHourMinutes || 60;
      const creditHours = Number(item.academicCreditHours) || Number((durMin / hourMin).toFixed(2));

      await saveEntity('lectures', 'lectures', id, {
        academicYearId: item.academicYearId || '',
        semesterId: item.semesterId || '',
        departmentId: item.departmentId,
        programId: item.programId,
        cohortId: item.cohortId || '',
        subjectId: item.subjectId,
        subjectNameAr: item.subjectNameAr || sub?.nameAr || '',
        subjectNameEn: item.subjectNameEn || sub?.nameEn || '',
        lecturerId: item.lecturerId,
        lecturerUid: item.lecturerUid || lec?.uid || '',
        lecturerNameAr: item.lecturerNameAr || lec?.fullNameAr || '',
        lecturerNameEn: item.lecturerNameEn || lec?.fullNameEn || '',
        replacementLecturerId: item.replacementLecturerId || '',
        lectureDate: item.lectureDate,
        dayOfWeek: item.dayOfWeek || '',
        startTime: item.startTime,
        endTime: item.endTime,
        plannedDurationMinutes: durMin,
        academicCreditHours: creditHours,
        classroom: item.classroom.trim(),
        lectureType: item.lectureType || 'regular',
        status: item.status || 'scheduled',
        notes: item.notes || '',
        recurrenceGroupId: item.recurrenceGroupId || '',
      }, isNew, isNew ? 'CREATE_LECTURE' : 'UPDATE_LECTURE');
    },
    [activePolicy.academicHourMinutes, dataset.lecturers, dataset.subjects, saveEntity],
  );

  const bulkCreateLectures = useCallback(
    async (items: Array<Partial<Lecture> & { departmentId: string; programId: string; subjectId: string; lecturerId: string; lectureDate: string; startTime: string; endTime: string; classroom: string }>) => {
      let count = 0;
      for (const item of items) {
        await saveLecture(item);
        count++;
      }
      return count;
    },
    [saveLecture],
  );

  const updateLectureStatus = useCallback(
    async (lectureId: string, status: LectureStatus, extra?: Partial<Lecture>, reason?: string) => {
      const existing = dataset.lectures.find((l) => l.id === lectureId);
      if (!existing) return;
      const cleanExtra = { ...(extra || {}) };
      delete (cleanExtra as Record<string, unknown>).id;
      delete (cleanExtra as Record<string, unknown>).createdAt;
      delete (cleanExtra as Record<string, unknown>).updatedAt;
      await saveEntity('lectures', 'lectures', lectureId, { ...cleanExtra, status }, false, `LECTURE_STATUS_${status.toUpperCase()}`);
      if (reason) {
        await writeAudit('LECTURE_RESCHEDULE_OR_CANCEL', 'lectures', lectureId, existing.status, status, reason);
      }
    },
    [dataset.lectures, saveEntity, writeAudit],
  );

  const fetchSignedQrToken = useCallback(
    async (sessionId: string, lectureId: string, subjectId: string, rotationSeconds: number) => {
      const token = await getAuthToken();
      const resp = await fetch('/api/qr/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId, lectureId, subjectId, rotationSeconds }),
      });
      if (!resp.ok) {
        throw new Error('Failed to generate cryptographic QR token');
      }
      return (await resp.json()) as { token: string; tokenHash: string; issuedAt: number; expiresAt: number };
    },
    [getAuthToken],
  );

  const openOrResumeSession = useCallback(
    async (lecture: Lecture, geofence?: { enabled: boolean; lat?: number; lng?: number; radius?: number }) => {
      if (!isOnline && !isDemoMode) {
        throw new Error(lang === 'ar' ? 'لا يمكن فتح جلسة حضور بدون اتصال بالخادم' : 'Online connection required to open attendance session');
      }
      const existing = dataset.sessions.find((s) => s.lectureId === lecture.id);
      const sessionId = existing?.id || `sess_${sanitizeId(lecture.id)}`;
      const rotationSeconds = activePolicy.defaultQrRotationSeconds || 30;
      const qrData = await fetchSignedQrToken(sessionId, lecture.id, lecture.subjectId, rotationSeconds);

      const enrolledCount = dataset.enrollments.filter(
        (e) => e.subjectId === lecture.subjectId && e.status !== 'dropped',
      ).length || dataset.students.filter((s) => s.departmentId === lecture.departmentId && s.programId === lecture.programId).length;

      const sessionPayload: Omit<AttendanceSession, 'id'> = {
        lectureId: lecture.id,
        subjectId: lecture.subjectId,
        departmentId: lecture.departmentId,
        programId: lecture.programId,
        lecturerId: lecture.lecturerId,
        lecturerUid: lecture.lecturerUid || currentUser?.uid || 'lecturer',
        status: 'open',
        qrTokenHash: qrData.tokenHash,
        qrExpiresAt: qrData.expiresAt,
        rotationSeconds,
        geofenceEnabled: geofence?.enabled ?? false,
        ...(geofence?.enabled && geofence.lat != null ? { geofenceLat: geofence.lat, geofenceLng: geofence.lng, geofenceRadiusMeters: geofence.radius || 100 } : {}),
        totalEnrolled: enrolledCount,
        registeredCount: existing?.registeredCount || 0,
      };

      await saveEntity('sessions', 'attendanceSessions', sessionId, sessionPayload, !existing, 'OPEN_ATTENDANCE_SESSION');
      await saveEntity('lectures', 'lectures', lecture.id, { status: 'attendance_open' }, false, 'LECTURE_ATTENDANCE_OPEN');

      if (!isDemoMode && currentUser) {
        const tokId = `tok_${Date.now().toString(36)}`;
        await setDoc(doc(db, 'attendanceSessions', sessionId, 'tokens', tokId), {
          tokenHash: qrData.tokenHash,
          issuedAt: qrData.issuedAt,
          expiresAt: qrData.expiresAt,
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }

      return { session: { id: sessionId, ...sessionPayload }, qrData };
    },
    [activePolicy.defaultQrRotationSeconds, currentUser, dataset.enrollments, dataset.sessions, dataset.students, fetchSignedQrToken, isDemoMode, isOnline, lang, saveEntity],
  );

  const rotateSessionQr = useCallback(
    async (session: AttendanceSession) => {
      const qrData = await fetchSignedQrToken(session.id, session.lectureId, session.subjectId, session.rotationSeconds || 30);
      await saveEntity(
        'sessions',
        'attendanceSessions',
        session.id,
        { qrTokenHash: qrData.tokenHash, qrExpiresAt: qrData.expiresAt },
        false,
        'ROTATE_QR_TOKEN',
      );
      if (!isDemoMode && currentUser) {
        const tokId = `tok_${Date.now().toString(36)}`;
        await setDoc(doc(db, 'attendanceSessions', session.id, 'tokens', tokId), {
          tokenHash: qrData.tokenHash,
          issuedAt: qrData.issuedAt,
          expiresAt: qrData.expiresAt,
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }
      return qrData;
    },
    [currentUser, fetchSignedQrToken, isDemoMode, saveEntity],
  );

  const setSessionStatus = useCallback(
    async (sessionId: string, status: AttendanceSession['status']) => {
      const session = dataset.sessions.find((s) => s.id === sessionId);
      if (!session) return;
      await saveEntity('sessions', 'attendanceSessions', sessionId, { status }, false, `SESSION_${status.toUpperCase()}`);
      if (status === 'closed') {
        await saveEntity('lectures', 'lectures', session.lectureId, { status: 'pending_approval' }, false, 'LECTURE_PENDING_APPROVAL');
      } else if (status === 'open') {
        await saveEntity('lectures', 'lectures', session.lectureId, { status: 'attendance_open' }, false, 'LECTURE_ATTENDANCE_OPEN');
      }
    },
    [dataset.sessions, saveEntity],
  );

  const recordStudentQrAttendance = useCallback(
    async (qrToken: string, method: AttendanceMethod, geoCoords?: { lat: number; lng: number }) => {
      if (!currentUser) {
        return { ok: false, message: lang === 'ar' ? 'يجب تسجيل الدخول أولاً' : 'Authentication required' };
      }
      if (!isOnline && !isDemoMode) {
        return { ok: false, message: lang === 'ar' ? 'تسجيل الحضور يتطلب اتصالاً بالخادم' : 'Server connection required to confirm attendance' };
      }

      const authToken = await getAuthToken();
      const verifyResp = await fetch('/api/qr/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ token: qrToken }),
      });
      const verifyData = await verifyResp.json();
      if (!verifyResp.ok || !verifyData.valid) {
        await writeAudit('INVALID_QR_ATTEMPT', 'attendanceRecords', currentUser.uid, undefined, verifyData.code || 'INVALID', verifyData.message);
        return { ok: false, message: verifyData.message || (lang === 'ar' ? 'رمز QR غير صالح' : 'Invalid QR token') };
      }

      const { sessionId, lectureId, subjectId, tokenHash, serverTimeBaghdad } = verifyData;
      const session = dataset.sessions.find((s) => s.id === sessionId);
      if (!session || session.status !== 'open') {
        await writeAudit('CLOSED_SESSION_ATTEMPT', 'attendanceSessions', sessionId, session?.status, 'rejected');
        return {
          ok: false,
          message: lang === 'ar' ? 'جلسة الحضور مغلقة أو متوقفة حالياً' : 'Attendance session is closed or paused',
        };
      }

      const lecture = dataset.lectures.find((l) => l.id === lectureId);
      if (!lecture || lecture.status === 'cancelled') {
        return { ok: false, message: lang === 'ar' ? 'هذه المحاضرة ملغاة' : 'Lecture is cancelled' };
      }

      const student = dataset.students.find(
        (s) => s.uid === currentUser.uid || s.id === currentUser.linkedEntityId || s.email.toLowerCase() === currentUser.email.toLowerCase(),
      );
      if (!student) {
        return { ok: false, message: lang === 'ar' ? 'لم يتم ربط حسابك بسجل طالب رسمي' : 'Account is not linked to an enrolled student profile' };
      }

      const isEnrolled =
        dataset.enrollments.length === 0 ||
        dataset.enrollments.some((e) => e.studentId === student.id && e.subjectId === subjectId && e.status !== 'dropped') ||
        (student.departmentId === lecture.departmentId && student.programId === lecture.programId);

      if (!isEnrolled) {
        await writeAudit('UNAUTHORIZED_SUBJECT_SCAN', 'attendanceRecords', student.id, undefined, subjectId);
        return { ok: false, message: lang === 'ar' ? 'أنت غير مسجل في هذه المادة الدراسية' : 'You are not enrolled in this subject' };
      }

      const recordId = `${sanitizeId(sessionId)}_${sanitizeId(student.id)}`;
      if (dataset.records.some((r) => r.id === recordId)) {
        return { ok: false, message: lang === 'ar' ? 'تم تسجيل حضورك مسبقاً في هذه الجلسة' : 'Attendance already recorded for this session' };
      }

      // Check late arrival policy & optional geofence
      let computedStatus: AttendanceStatus = 'present';
      const nowTime = getBaghdadTimeString();
      const [sh, sm] = lecture.startTime.split(':').map(Number);
      const [nh, nm] = nowTime.split(':').map(Number);
      const lateMin = (nh * 60 + nm) - (sh * 60 + sm);
      if (lateMin > (activePolicy.lateThresholdMinutes || 15) && lecture.lectureDate === getBaghdadDateString()) {
        computedStatus = 'late';
      }

      let suspiciousFlag = false;
      let suspiciousReason = '';
      if (session.geofenceEnabled && session.geofenceLat != null && session.geofenceLng != null) {
        if (!geoCoords) {
          suspiciousFlag = true;
          suspiciousReason = 'Location permission not granted under geofenced session';
        }
      }

      const recPayload = {
        sessionId,
        lectureId,
        subjectId,
        departmentId: lecture.departmentId,
        programId: lecture.programId,
        academicYearId: lecture.academicYearId || '',
        semesterId: lecture.semesterId || '',
        studentId: student.id,
        studentUid: currentUser.uid,
        studentNameAr: student.fullNameAr,
        studentNameEn: student.fullNameEn,
        universityId: student.universityId,
        lecturerUid: session.lecturerUid,
        status: computedStatus,
        method,
        registeredAt: serverTimeBaghdad || new Date().toISOString(),
        isApproved: false,
        suspiciousFlag,
        suspiciousReason,
        tokenHash,
      };

      await saveEntity('records', 'attendanceRecords', recordId, recPayload, true, 'STUDENT_QR_ATTENDANCE');
      await saveEntity(
        'sessions',
        'attendanceSessions',
        sessionId,
        { registeredCount: (session.registeredCount || 0) + 1 },
        false,
        'INCREMENT_SESSION_COUNT',
      );

      return {
        ok: true,
        status: computedStatus,
        message:
          lang === 'ar'
            ? `تم تسجيل حضورك بنجاح (${computedStatus === 'late' ? 'متأخر' : 'حاضر'}) وبانتظار اعتماد التدريسي`
            : `Attendance recorded (${computedStatus}) pending lecturer approval`,
      };
    },
    [activePolicy.lateThresholdMinutes, currentUser, dataset.enrollments, dataset.lectures, dataset.records, dataset.sessions, dataset.students, getAuthToken, isDemoMode, isOnline, lang, saveEntity, writeAudit],
  );

  const markManualAttendance = useCallback(
    async (session: AttendanceSession, student: Student, status: AttendanceStatus, notes?: string) => {
      const recordId = `${sanitizeId(session.id)}_${sanitizeId(student.id)}`;
      const existing = dataset.records.find((r) => r.id === recordId);
      if (existing?.isApproved) {
        throw new Error(lang === 'ar' ? 'السجل معتمد ومقفل؛ استخدم صلاحية التصحيح الإداري' : 'Record is approved and locked');
      }
      const lecture = dataset.lectures.find((l) => l.id === session.lectureId);
      await saveEntity('records', 'attendanceRecords', recordId, {
        sessionId: session.id,
        lectureId: session.lectureId,
        subjectId: session.subjectId,
        departmentId: session.departmentId,
        programId: session.programId,
        academicYearId: lecture?.academicYearId || '',
        semesterId: lecture?.semesterId || '',
        studentId: student.id,
        studentUid: student.uid || student.id,
        studentNameAr: student.fullNameAr,
        studentNameEn: student.fullNameEn,
        universityId: student.universityId,
        lecturerUid: session.lecturerUid,
        status,
        method: 'manual',
        registeredAt: existing?.registeredAt || new Date().toISOString(),
        isApproved: false,
        notes: notes || '',
      }, !existing, 'MANUAL_ATTENDANCE_MARK');
    },
    [dataset.lectures, dataset.records, lang, saveEntity],
  );

  const approveAttendanceSession = useCallback(
    async (session: AttendanceSession) => {
      if (!isOnline && !isDemoMode) {
        throw new Error(lang === 'ar' ? 'لا يمكن اعتماد الجلسة بدون اتصال بالخادم' : 'Cannot finalize attendance while offline');
      }
      const lecture = dataset.lectures.find((l) => l.id === session.lectureId);
      if (!lecture) return;

      const enrolledStudentIds = new Set(
        dataset.enrollments
          .filter((e) => e.subjectId === session.subjectId && e.status !== 'dropped')
          .map((e) => e.studentId),
      );
      const eligibleStudents =
        enrolledStudentIds.size > 0
          ? dataset.students.filter((s) => enrolledStudentIds.has(s.id))
          : dataset.students.filter(
              (s) => s.departmentId === session.departmentId && s.programId === session.programId && s.enrollmentStatus === 'enrolled',
            );

      const approvedAt = new Date().toISOString();
      const approverUid = currentUser?.uid || session.lecturerUid;

      if (isDemoMode) {
        setDemoDataset((prev) => {
          const updatedRecords = [...prev.records];
          for (const stu of eligibleStudents) {
            const recId = `${sanitizeId(session.id)}_${sanitizeId(stu.id)}`;
            const idx = updatedRecords.findIndex((r) => r.id === recId);
            if (idx >= 0) {
              updatedRecords[idx] = {
                ...updatedRecords[idx],
                isApproved: true,
                approvedByUid: approverUid,
                approvedAt,
              };
            } else {
              updatedRecords.push({
                id: recId,
                sessionId: session.id,
                lectureId: session.lectureId,
                subjectId: session.subjectId,
                departmentId: session.departmentId,
                programId: session.programId,
                studentId: stu.id,
                studentUid: stu.uid || stu.id,
                studentNameAr: stu.fullNameAr,
                studentNameEn: stu.fullNameEn,
                universityId: stu.universityId,
                lecturerUid: session.lecturerUid,
                status: 'absent',
                method: 'auto_absent',
                isApproved: true,
                approvedByUid: approverUid,
                approvedAt,
                createdAt: approvedAt,
                updatedAt: approvedAt,
              });
            }
          }
          return {
            ...prev,
            records: updatedRecords,
            sessions: prev.sessions.map((s) =>
              s.id === session.id ? { ...s, status: 'approved', approvedByUid: approverUid } : s,
            ),
            lectures: prev.lectures.map((l) =>
              l.id === session.lectureId ? { ...l, status: 'approved' } : l,
            ),
          };
        });
        await writeAudit('APPROVE_ATTENDANCE_SESSION', 'attendanceSessions', session.id, session.status, 'approved');
        return;
      }

      // Transactional / batched approval in Firestore
      const batch = writeBatch(db);
      for (const stu of eligibleStudents) {
        const recId = `${sanitizeId(session.id)}_${sanitizeId(stu.id)}`;
        const existingRec = dataset.records.find((r) => r.id === recId);
        const recRef = doc(db, 'attendanceRecords', recId);
        if (existingRec) {
          batch.update(recRef, {
            isApproved: true,
            approvedByUid: approverUid,
            approvedAt,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(recRef, {
            sessionId: session.id,
            lectureId: session.lectureId,
            subjectId: session.subjectId,
            departmentId: session.departmentId,
            programId: session.programId,
            academicYearId: lecture.academicYearId || '',
            semesterId: lecture.semesterId || '',
            studentId: stu.id,
            studentUid: stu.uid || stu.id,
            studentNameAr: stu.fullNameAr,
            studentNameEn: stu.fullNameEn,
            universityId: stu.universityId,
            lecturerUid: session.lecturerUid,
            status: 'absent',
            method: 'auto_absent',
            isApproved: true,
            approvedByUid: approverUid,
            approvedAt,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      batch.update(doc(db, 'attendanceSessions', session.id), {
        status: 'approved',
        approvedByUid: approverUid,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'lectures', session.lectureId), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
        await writeAudit('APPROVE_ATTENDANCE_SESSION', 'attendanceSessions', session.id, session.status, 'approved');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `attendanceSessions/${session.id}`);
      }
    },
    [currentUser?.uid, dataset.enrollments, dataset.lectures, dataset.records, dataset.students, isDemoMode, isOnline, lang, writeAudit],
  );

  const overrideApprovedRecord = useCallback(
    async (record: AttendanceRecord, newStatus: AttendanceStatus, reason: string) => {
      if (!reason.trim()) {
        throw new Error(lang === 'ar' ? 'يجب إدخال سبب التعديل الإلزامي' : 'Mandatory reason required');
      }
      await saveEntity(
        'records',
        'attendanceRecords',
        record.id,
        { status: newStatus, notes: `${record.notes ? record.notes + ' | ' : ''}Override: ${reason}` },
        false,
        'ADMIN_OVERRIDE_ATTENDANCE',
      );
      await writeAudit('ADMIN_OVERRIDE_ATTENDANCE', 'attendanceRecords', record.id, record.status, newStatus, reason);
    },
    [lang, saveEntity, writeAudit],
  );

  const submitCorrectionRequest = useCallback(
    async (payload: { record: AttendanceRecord; requestedStatus: 'present' | 'late' | 'excused'; reason: string; attachmentNote?: string }) => {
      const id = `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await saveEntity('corrections', 'attendanceCorrections', id, {
        recordId: payload.record.id,
        sessionId: payload.record.sessionId,
        lectureId: payload.record.lectureId,
        subjectId: payload.record.subjectId,
        departmentId: payload.record.departmentId,
        studentId: payload.record.studentId,
        studentUid: currentUser?.uid || payload.record.studentUid,
        studentNameAr: payload.record.studentNameAr || currentUser?.displayNameAr || '',
        currentStatus: payload.record.status,
        requestedStatus: payload.requestedStatus,
        reason: payload.reason.trim(),
        attachmentNote: payload.attachmentNote?.trim() || '',
        status: 'pending',
      }, true, 'SUBMIT_CORRECTION_REQUEST');
    },
    [currentUser?.displayNameAr, currentUser?.uid, saveEntity],
  );

  const reviewCorrectionRequest = useCallback(
    async (correction: AttendanceCorrection, decision: 'approved' | 'rejected', reviewNote: string) => {
      await saveEntity(
        'corrections',
        'attendanceCorrections',
        correction.id,
        {
          status: decision,
          reviewedByUid: currentUser?.uid || '',
          reviewNote: reviewNote.trim(),
        },
        false,
        `CORRECTION_${decision.toUpperCase()}`,
      );
      if (decision === 'approved') {
        const rec = dataset.records.find((r) => r.id === correction.recordId);
        if (rec) {
          await saveEntity(
            'records',
            'attendanceRecords',
            rec.id,
            { status: correction.requestedStatus, notes: `Correction approved: ${reviewNote}` },
            false,
            'CORRECTION_APPLIED_TO_RECORD',
          );
          await writeAudit('APPLY_CORRECTION', 'attendanceRecords', rec.id, rec.status, correction.requestedStatus, reviewNote);
        }
      }
      // Notify student
      const notifId = `not_${Date.now().toString(36)}`;
      await saveEntity('notifications', 'notifications', notifId, {
        recipientUid: correction.studentUid,
        recipientRole: 'student',
        titleAr: decision === 'approved' ? 'تمت الموافقة على طلب التصحيح' : 'تم رفض طلب التصحيح',
        titleEn: decision === 'approved' ? 'Correction Request Approved' : 'Correction Request Rejected',
        bodyAr: reviewNote || correction.reason,
        bodyEn: reviewNote || correction.reason,
        category: 'correction_update',
        severity: decision === 'approved' ? 'info' : 'warning',
        isRead: false,
        relatedId: correction.id,
      }, true, 'SEND_CORRECTION_NOTIFICATION');
    },
    [currentUser?.uid, dataset.records, saveEntity, writeAudit],
  );

  const saveAttendancePolicy = useCallback(
    async (policy: AttendancePolicy) => {
      const id = policy.id || 'default';
      const isNew = !dataset.policies.some((p) => p.id === id);
      await saveEntity('policies', 'attendancePolicies', id, {
        name: policy.name,
        maxAbsencePercent: Number(policy.maxAbsencePercent),
        firstWarningPercent: Number(policy.firstWarningPercent),
        secondWarningPercent: Number(policy.secondWarningPercent),
        criticalWarningPercent: Number(policy.criticalWarningPercent),
        lateThresholdMinutes: Number(policy.lateThresholdMinutes ?? 15),
        lateCountsAsFraction: Number(policy.lateCountsAsFraction ?? 1),
        excusedCountsTowardAttendance: Boolean(policy.excusedCountsTowardAttendance),
        academicHourMinutes: Number(policy.academicHourMinutes),
        defaultQrRotationSeconds: Number(policy.defaultQrRotationSeconds),
        defaultSessionDurationMinutes: Number(policy.defaultSessionDurationMinutes ?? 20),
        geofencingEnabledByDefault: Boolean(policy.geofencingEnabledByDefault),
        updatedByUid: currentUser?.uid || '',
      }, isNew, 'UPDATE_ATTENDANCE_POLICY');
    },
    [currentUser?.uid, dataset.policies, saveEntity],
  );

  const saveSystemSettings = useCallback(
    async (setting: SystemSetting) => {
      const id = setting.id || 'default';
      const isNew = !dataset.settings;
      await saveEntity('settings' as keyof SGASDataset, 'systemSettings', id, {
        universityNameAr: setting.universityNameAr,
        universityNameEn: setting.universityNameEn,
        collegeNameAr: setting.collegeNameAr,
        collegeNameEn: setting.collegeNameEn,
        departmentTitleAr: setting.departmentTitleAr,
        departmentTitleEn: setting.departmentTitleEn,
        universityLogoUrl: setting.universityLogoUrl || '',
        collegeLogoUrl: setting.collegeLogoUrl || '',
        timezone: setting.timezone || 'Asia/Baghdad',
        defaultLanguage: setting.defaultLanguage || 'ar',
        updatedByUid: currentUser?.uid || '',
      }, isNew, 'UPDATE_SYSTEM_SETTINGS');
      if (isDemoMode) {
        setDemoDataset((prev) => ({ ...prev, settings: setting }));
      }
    },
    [currentUser?.uid, dataset.settings, isDemoMode, saveEntity],
  );

  const createUserInvite = useCallback(
    async (invite: { email: string; role: UserRole; displayNameAr: string; displayNameEn?: string; departmentId?: string; linkedEntityId?: string }) => {
      const id = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await saveEntity('invites', 'userInvites', id, {
        email: invite.email.trim().toLowerCase(),
        role: invite.role,
        departmentId: invite.departmentId || '',
        linkedEntityId: invite.linkedEntityId || '',
        displayNameAr: invite.displayNameAr.trim(),
        displayNameEn: invite.displayNameEn?.trim() || '',
        status: 'pending',
        createdBy: currentUser?.uid || 'admin',
      }, true, 'CREATE_USER_INVITE');
    },
    [currentUser?.uid, saveEntity],
  );

  const updateUserAccountStatus = useCallback(
    async (user: UserAccount, status: UserAccount['status'], role?: UserRole) => {
      await saveEntity('users', 'users', user.id, {
        uid: user.uid,
        email: user.email,
        displayNameAr: user.displayNameAr,
        displayNameEn: user.displayNameEn || '',
        role: role || user.role,
        departmentId: user.departmentId || '',
        linkedEntityId: user.linkedEntityId || '',
        status,
      }, false, 'UPDATE_USER_ACCESS');
    },
    [saveEntity],
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (isDemoMode) {
        setDemoDataset((prev) => ({
          ...prev,
          notifications: prev.notifications.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
        }));
        return;
      }
      try {
        await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
      }
    },
    [isDemoMode],
  );

  const logAiActivity = useCallback(
    async (entry: Omit<AiQueryLog, 'id' | 'createdAt'>) => {
      const id = `ai_${Date.now().toString(36)}`;
      if (isDemoMode) {
        setDemoDataset((prev) => ({
          ...prev,
          aiQueryLogs: [{ id, ...entry, createdAt: new Date().toISOString() }, ...prev.aiQueryLogs],
        }));
        return;
      }
      try {
        await setDoc(doc(db, 'aiQueryLogs', id), {
          ...entry,
          queryText: entry.queryText.slice(0, 490),
          toolsCalled: (entry.toolsCalled || []).slice(0, 10),
          createdAt: serverTimestamp(),
        });
      } catch {
        // non-blocking AI telemetry log
      }
    },
    [isDemoMode],
  );

  const logReportGeneration = useCallback(
    async (entry: Omit<ReportHistory, 'id' | 'createdAt'>) => {
      const id = `rep_${Date.now().toString(36)}`;
      if (isDemoMode) {
        setDemoDataset((prev) => ({
          ...prev,
          reportHistory: [{ id, ...entry, createdAt: new Date().toISOString() }, ...prev.reportHistory],
        }));
        return;
      }
      try {
        await setDoc(doc(db, 'reportHistory', id), {
          ...entry,
          createdAt: serverTimestamp(),
        });
      } catch {
        // non-blocking report history log
      }
    },
    [isDemoMode],
  );

  const restoreFromBackup = useCallback(
    async (backupData: Partial<SGASDataset>) => {
      if (isDemoMode) {
        setDemoDataset((prev) => ({ ...prev, ...backupData }));
        await writeAudit('RESTORE_BACKUP', 'system', 'demo', undefined, 'Restored backup JSON');
        return;
      }
      // Restore departments, programs, students, lecturers, subjects safely via batches
      const collectionsToRestore: Array<[keyof SGASDataset, string]> = [
        ['departments', 'departments'],
        ['programs', 'academicPrograms'],
        ['academicYears', 'academicYears'],
        ['semesters', 'semesters'],
        ['cohorts', 'cohorts'],
        ['students', 'students'],
        ['lecturers', 'lecturers'],
        ['subjects', 'subjects'],
      ];
      for (const [key, col] of collectionsToRestore) {
        const items = (backupData[key] as unknown as Array<{ id: string } & Record<string, unknown>>) || [];
        if (!Array.isArray(items) || items.length === 0) continue;
        const batch = writeBatch(db);
        for (const item of items.slice(0, 200)) {
          const { id, createdAt: _c, updatedAt: _u, ...rest } = item;
          batch.set(doc(db, col, sanitizeId(id || `rest_${Date.now()}`)), {
            ...rest,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      await writeAudit('RESTORE_BACKUP', 'system', 'production', undefined, 'Restored institutional backup');
    },
    [isDemoMode, writeAudit],
  );

  // Automatic threshold calculation helper for notifications check (exposed via dataset)
  const value = useMemo<SGASContextValue>(
    () => ({
      lang,
      setLang,
      t,
      isOnline,
      authStatus,
      firebaseUser,
      currentUser,
      isDemoMode,
      dataset,
      activePolicy,
      toasts,
      pushToast,
      dismissToast,
      loginWithGoogle,
      logout,
      enterDemoMode,
      switchDemoRole,
      resetDemoSandbox,
      getAuthToken,
      saveDepartment,
      saveProgram,
      saveAcademicYear,
      saveSemester,
      saveCohort,
      saveHoliday,
      saveStudent,
      bulkSaveStudents,
      saveLecturer,
      saveSubject,
      saveEnrollment,
      saveLecture,
      bulkCreateLectures,
      updateLectureStatus,
      openOrResumeSession,
      rotateSessionQr,
      setSessionStatus,
      recordStudentQrAttendance,
      markManualAttendance,
      approveAttendanceSession,
      overrideApprovedRecord,
      submitCorrectionRequest,
      reviewCorrectionRequest,
      saveAttendancePolicy,
      saveSystemSettings,
      createUserInvite,
      updateUserAccountStatus,
      markNotificationRead,
      logAiActivity,
      logReportGeneration,
      restoreFromBackup,
    }),
    [
      lang,
      setLang,
      t,
      isOnline,
      authStatus,
      firebaseUser,
      currentUser,
      isDemoMode,
      dataset,
      activePolicy,
      toasts,
      pushToast,
      dismissToast,
      loginWithGoogle,
      logout,
      enterDemoMode,
      switchDemoRole,
      resetDemoSandbox,
      getAuthToken,
      saveDepartment,
      saveProgram,
      saveAcademicYear,
      saveSemester,
      saveCohort,
      saveHoliday,
      saveStudent,
      bulkSaveStudents,
      saveLecturer,
      saveSubject,
      saveEnrollment,
      saveLecture,
      bulkCreateLectures,
      updateLectureStatus,
      openOrResumeSession,
      rotateSessionQr,
      setSessionStatus,
      recordStudentQrAttendance,
      markManualAttendance,
      approveAttendanceSession,
      overrideApprovedRecord,
      submitCorrectionRequest,
      reviewCorrectionRequest,
      saveAttendancePolicy,
      saveSystemSettings,
      createUserInvite,
      updateUserAccountStatus,
      markNotificationRead,
      logAiActivity,
      logReportGeneration,
      restoreFromBackup,
    ],
  );

  return <SGASContext.Provider value={value}>{children}</SGASContext.Provider>;
};

export function useSGAS() {
  const ctx = useContext(SGASContext);
  if (!ctx) throw new Error('useSGAS must be used within SGASProvider');
  return ctx;
}

export { calculateStudentAttendance };
