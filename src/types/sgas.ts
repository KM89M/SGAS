export type UserRole = 'super_admin' | 'pg_admin' | 'dept_admin' | 'lecturer' | 'student';
export type AccountStatus = 'active' | 'disabled' | 'pending';
export type DegreeType = 'masters' | 'phd' | 'diploma';
export type EnrollmentStatus = 'enrolled' | 'deferred' | 'graduated' | 'archived';
export type SubjectType = 'mandatory' | 'elective';
export type LectureType = 'regular' | 'makeup' | 'additional' | 'seminar';
export type LectureStatus =
  | 'scheduled'
  | 'attendance_open'
  | 'pending_approval'
  | 'approved'
  | 'completed'
  | 'cancelled'
  | 'postponed'
  | 'rescheduled';
export type SessionStatus = 'open' | 'paused' | 'closed' | 'approved';
export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'excused'
  | 'pending_approval'
  | 'not_recorded'
  | 'cancelled';
export type AttendanceMethod = 'qr_camera' | 'qr_url' | 'manual' | 'fallback_code' | 'auto_absent';
export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export const BLUEPRINT_CONSTRAINTS = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  MAX_ID_LEN: 128,
  MAX_CODE_LEN: 32,
  MAX_NAME_LEN: 160,
  MAX_EMAIL_LEN: 160,
  MAX_NOTES_LEN: 500,
  MAX_REASON_LEN: 600,
  MAX_LIST_LEN: 10,
} as const;

export function sanitizeId(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128) || `id_${Date.now()}`;
}

export interface UserAccount {
  id: string;
  uid: string;
  email: string;
  displayNameAr: string;
  displayNameEn?: string;
  role: UserRole;
  departmentId?: string;
  linkedEntityId?: string;
  inviteId?: string;
  status: AccountStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserInvite {
  id: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  linkedEntityId?: string;
  displayNameAr: string;
  displayNameEn?: string;
  status: 'pending' | 'claimed' | 'revoked';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Department {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  adminUid?: string;
  adminName?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AcademicProgram {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  degreeType: DegreeType;
  departmentId: string;
  totalRequiredHours?: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Semester {
  id: string;
  academicYearId: string;
  nameAr: string;
  nameEn: string;
  semesterNumber: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Cohort {
  id: string;
  nameAr: string;
  nameEn: string;
  departmentId: string;
  programId: string;
  academicYearId: string;
  admissionYear?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Student {
  id: string;
  universityId: string;
  fullNameAr: string;
  fullNameEn: string;
  email: string;
  phone?: string;
  departmentId: string;
  programId: string;
  academicYearId?: string;
  semesterId?: string;
  cohortId?: string;
  enrollmentStatus: EnrollmentStatus;
  accountStatus: 'active' | 'disabled';
  uid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Lecturer {
  id: string;
  lecturerCode: string;
  fullNameAr: string;
  fullNameEn: string;
  academicTitleAr: string;
  academicTitleEn?: string;
  email: string;
  departmentId: string;
  accountStatus: 'active' | 'disabled';
  uid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Subject {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  departmentId: string;
  programId: string;
  academicYearId?: string;
  semesterId?: string;
  subjectType: SubjectType;
  weeklyHours: number;
  totalPlannedHours: number;
  lecturerIds?: string[];
  lecturerUids?: string[];
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentEnrollment {
  id: string;
  studentId: string;
  studentUid?: string;
  subjectId: string;
  departmentId: string;
  programId: string;
  academicYearId?: string;
  semesterId?: string;
  status: 'active' | 'dropped' | 'completed';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Lecture {
  id: string;
  academicYearId?: string;
  semesterId?: string;
  departmentId: string;
  programId: string;
  cohortId?: string;
  subjectId: string;
  subjectNameAr?: string;
  subjectNameEn?: string;
  lecturerId: string;
  lecturerUid?: string;
  lecturerNameAr?: string;
  lecturerNameEn?: string;
  replacementLecturerId?: string;
  lectureDate: string; // YYYY-MM-DD in Asia/Baghdad
  dayOfWeek?: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  plannedDurationMinutes: number;
  academicCreditHours: number;
  classroom: string;
  lectureType: LectureType;
  status: LectureStatus;
  notes?: string;
  recurrenceGroupId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Holiday {
  id: string;
  titleAr: string;
  titleEn: string;
  startDate: string;
  endDate: string;
  type: 'official' | 'religious' | 'academic';
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceSession {
  id: string;
  lectureId: string;
  subjectId: string;
  departmentId: string;
  programId: string;
  lecturerId: string;
  lecturerUid: string;
  status: SessionStatus;
  qrTokenHash?: string;
  qrExpiresAt?: number;
  rotationSeconds: number;
  geofenceEnabled: boolean;
  geofenceLat?: number;
  geofenceLng?: number;
  geofenceRadiusMeters?: number;
  totalEnrolled?: number;
  registeredCount?: number;
  approvedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  lectureId: string;
  subjectId: string;
  departmentId: string;
  programId: string;
  academicYearId?: string;
  semesterId?: string;
  studentId: string;
  studentUid: string;
  studentNameAr?: string;
  studentNameEn?: string;
  universityId?: string;
  lecturerUid: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  registeredAt?: string;
  isApproved: boolean;
  approvedByUid?: string;
  approvedAt?: string;
  notes?: string;
  suspiciousFlag?: boolean;
  suspiciousReason?: string;
  tokenHash?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceCorrection {
  id: string;
  recordId: string;
  sessionId?: string;
  lectureId: string;
  subjectId?: string;
  departmentId?: string;
  studentId: string;
  studentUid: string;
  studentNameAr?: string;
  currentStatus: string;
  requestedStatus: 'present' | 'late' | 'excused';
  reason: string;
  attachmentNote?: string;
  status: CorrectionStatus;
  reviewedByUid?: string;
  reviewNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendancePolicy {
  id: string;
  name: string;
  maxAbsencePercent: number;
  firstWarningPercent: number;
  secondWarningPercent: number;
  criticalWarningPercent: number;
  lateThresholdMinutes?: number;
  lateCountsAsFraction?: number; // e.g., 1 = full credit, 0.5 = half credit
  excusedCountsTowardAttendance?: boolean;
  academicHourMinutes: number;
  defaultQrRotationSeconds: number;
  defaultSessionDurationMinutes?: number;
  geofencingEnabledByDefault?: boolean;
  updatedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  recipientRole?: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  category: 'absence_warning' | 'session_approved' | 'correction_update' | 'system';
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  relatedId?: string;
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  previousSummary?: string;
  newSummary?: string;
  reason?: string;
  createdAt?: unknown;
}

export interface AiQueryLog {
  id: string;
  actorUid: string;
  actorRole: string;
  queryText: string;
  toolsCalled?: string[];
  modelUsed: string;
  status: 'success' | 'fallback' | 'denied' | 'error';
  createdAt?: unknown;
}

export interface ReportHistory {
  id: string;
  reportType: string;
  titleAr: string;
  titleEn?: string;
  format: 'xlsx' | 'pdf' | 'csv' | 'print';
  periodLabel?: string;
  generatedByUid: string;
  generatedByRole: string;
  recordCount: number;
  createdAt?: unknown;
}

export interface SystemSetting {
  id: string;
  universityNameAr: string;
  universityNameEn: string;
  collegeNameAr: string;
  collegeNameEn: string;
  departmentTitleAr: string;
  departmentTitleEn: string;
  universityLogoUrl?: string;
  collegeLogoUrl?: string;
  timezone: string;
  defaultLanguage: 'ar' | 'en';
  updatedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SGASDataset {
  departments: Department[];
  programs: AcademicProgram[];
  academicYears: AcademicYear[];
  semesters: Semester[];
  cohorts: Cohort[];
  students: Student[];
  lecturers: Lecturer[];
  subjects: Subject[];
  enrollments: StudentEnrollment[];
  lectures: Lecture[];
  holidays: Holiday[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  corrections: AttendanceCorrection[];
  policies: AttendancePolicy[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  aiQueryLogs: AiQueryLog[];
  reportHistory: ReportHistory[];
  settings: SystemSetting | null;
  users: UserAccount[];
  invites: UserInvite[];
}
