import {
  AttendancePolicy,
  AttendanceRecord,
  Holiday,
  Lecture,
  Student,
  StudentEnrollment,
} from '../types/sgas';

export const DEFAULT_POLICY: AttendancePolicy = {
  id: 'default',
  name: 'السياسة الافتراضية للدراسات العليا / Default PG Policy',
  maxAbsencePercent: 10,
  firstWarningPercent: 5,
  secondWarningPercent: 7.5,
  criticalWarningPercent: 9,
  lateThresholdMinutes: 15,
  lateCountsAsFraction: 1,
  excusedCountsTowardAttendance: false,
  academicHourMinutes: 60,
  defaultQrRotationSeconds: 30,
  defaultSessionDurationMinutes: 20,
  geofencingEnabledByDefault: false,
};

export function getBaghdadDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getBaghdadTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

export function formatBaghdadDateTime(isoOrDate?: unknown, lang: 'ar' | 'en' = 'ar'): string {
  if (!isoOrDate) return '—';
  let d: Date | null = null;
  if (isoOrDate instanceof Date) {
    d = isoOrDate;
  } else if (typeof isoOrDate === 'string' || typeof isoOrDate === 'number') {
    d = new Date(isoOrDate);
  } else if (typeof isoOrDate === 'object' && isoOrDate !== null && 'toDate' in isoOrDate) {
    d = (isoOrDate as { toDate: () => Date }).toDate();
  } else if (typeof isoOrDate === 'object' && isoOrDate !== null && 'seconds' in isoOrDate) {
    d = new Date((isoOrDate as { seconds: number }).seconds * 1000);
  }
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-GB', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function computeAcademicHours(durationMinutes: number, policy: AttendancePolicy): number {
  const hourMin = policy.academicHourMinutes > 0 ? policy.academicHourMinutes : 60;
  return Number((durationMinutes / hourMin).toFixed(2));
}

export interface StudentAttendanceSummary {
  studentId: string;
  totalScheduledLectures: number;
  totalCompletedLectures: number;
  totalAttendedLectures: number;
  totalMissedLectures: number;
  totalExcusedLectures: number;
  totalLateArrivals: number;
  totalScheduledHours: number;
  totalCompletedHours: number;
  totalAttendedHours: number;
  totalAbsentHours: number;
  totalExcusedHours: number;
  attendancePercentage: number;
  absencePercentage: number;
  warningLevel: 'none' | 'first' | 'second' | 'critical' | 'exceeded';
}

/**
 * Deterministic attendance calculation respecting:
 * - Cancelled lectures excluded
 * - Unapproved records excluded from finalized calculations
 * - Division-by-zero protection (0 completed hours => 100% attendance / 0% absence)
 * - Configurable academicHourMinutes and late/excused policies
 */
export function calculateStudentAttendance(
  student: Student,
  lectures: Lecture[],
  records: AttendanceRecord[],
  enrollments: StudentEnrollment[],
  policy: AttendancePolicy = DEFAULT_POLICY,
  subjectFilterId?: string,
): StudentAttendanceSummary {
  const activeSubjectIds = new Set(
    enrollments
      .filter((e) => e.studentId === student.id && e.status !== 'dropped')
      .map((e) => e.subjectId),
  );

  const relevantLectures = lectures.filter((l) => {
    if (subjectFilterId && l.subjectId !== subjectFilterId) return false;
    if (activeSubjectIds.size > 0) {
      return activeSubjectIds.has(l.subjectId);
    }
    return l.departmentId === student.departmentId && l.programId === student.programId;
  });

  const nonCancelled = relevantLectures.filter((l) => l.status !== 'cancelled');
  const finalizedLectures = nonCancelled.filter(
    (l) => l.status === 'approved' || l.status === 'completed',
  );

  const lectureMap = new Map(relevantLectures.map((l) => [l.id, l]));
  const approvedRecordsByLecture = new Map<string, AttendanceRecord>();
  for (const r of records) {
    if (r.studentId !== student.id) continue;
    if (!r.isApproved) continue;
    const lec = lectureMap.get(r.lectureId);
    if (!lec || lec.status === 'cancelled') continue;
    approvedRecordsByLecture.set(r.lectureId, r);
  }

  let totalScheduledHours = 0;
  for (const l of nonCancelled) {
    totalScheduledHours += l.academicCreditHours || computeAcademicHours(l.plannedDurationMinutes, policy);
  }

  let totalCompletedHours = 0;
  let totalAttendedHours = 0;
  let totalAbsentHours = 0;
  let totalExcusedHours = 0;
  let totalAttendedLectures = 0;
  let totalMissedLectures = 0;
  let totalExcusedLectures = 0;
  let totalLateArrivals = 0;

  const lateFraction = policy.lateCountsAsFraction ?? 1;
  const excusedCounts = policy.excusedCountsTowardAttendance ?? false;

  for (const lec of finalizedLectures) {
    const hours = lec.academicCreditHours || computeAcademicHours(lec.plannedDurationMinutes, policy);
    const rec = approvedRecordsByLecture.get(lec.id);
    if (!rec) {
      // If a lecture is marked approved/completed and has no record for an enrolled student,
      // count as completed hours unless unrecorded policy ignores it.
      totalCompletedHours += hours;
      totalAbsentHours += hours;
      totalMissedLectures += 1;
      continue;
    }

    if (rec.status === 'cancelled') continue;

    totalCompletedHours += hours;

    if (rec.status === 'present') {
      totalAttendedHours += hours;
      totalAttendedLectures += 1;
    } else if (rec.status === 'late') {
      totalLateArrivals += 1;
      totalAttendedHours += hours * lateFraction;
      totalAbsentHours += hours * (1 - lateFraction);
      totalAttendedLectures += 1;
    } else if (rec.status === 'excused') {
      totalExcusedLectures += 1;
      totalExcusedHours += hours;
      if (excusedCounts) {
        totalAttendedHours += hours;
      } else {
        // Excused absences do not count as unexcused absence penalty, or count as missed non-attended
        totalAbsentHours += hours;
      }
    } else if (rec.status === 'absent') {
      totalMissedLectures += 1;
      totalAbsentHours += hours;
    }
  }

  const attendancePercentage =
    totalCompletedHours > 0
      ? Number(((totalAttendedHours / totalCompletedHours) * 100).toFixed(1))
      : 100;
  const absencePercentage =
    totalCompletedHours > 0
      ? Number(((totalAbsentHours / totalCompletedHours) * 100).toFixed(1))
      : 0;

  let warningLevel: StudentAttendanceSummary['warningLevel'] = 'none';
  if (totalCompletedHours > 0) {
    if (absencePercentage >= policy.maxAbsencePercent) {
      warningLevel = 'exceeded';
    } else if (absencePercentage >= policy.criticalWarningPercent) {
      warningLevel = 'critical';
    } else if (absencePercentage >= policy.secondWarningPercent) {
      warningLevel = 'second';
    } else if (absencePercentage >= policy.firstWarningPercent) {
      warningLevel = 'first';
    }
  }

  return {
    studentId: student.id,
    totalScheduledLectures: nonCancelled.length,
    totalCompletedLectures: finalizedLectures.length,
    totalAttendedLectures,
    totalMissedLectures,
    totalExcusedLectures,
    totalLateArrivals,
    totalScheduledHours: Number(totalScheduledHours.toFixed(2)),
    totalCompletedHours: Number(totalCompletedHours.toFixed(2)),
    totalAttendedHours: Number(totalAttendedHours.toFixed(2)),
    totalAbsentHours: Number(totalAbsentHours.toFixed(2)),
    totalExcusedHours: Number(totalExcusedHours.toFixed(2)),
    attendancePercentage,
    absencePercentage,
    warningLevel,
  };
}

export interface ScheduleConflict {
  type: 'classroom' | 'lecturer' | 'cohort' | 'holiday';
  messageAr: string;
  messageEn: string;
  conflictingId?: string;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function detectScheduleConflicts(
  candidate: {
    id?: string;
    lectureDate: string;
    startTime: string;
    endTime: string;
    classroom: string;
    lecturerId: string;
    cohortId?: string;
    programId: string;
  },
  existingLectures: Lecture[],
  holidays: Holiday[] = [],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const startMin = timeToMinutes(candidate.startTime);
  const endMin = timeToMinutes(candidate.endTime);

  for (const h of holidays) {
    if (!h.isActive) continue;
    if (candidate.lectureDate >= h.startDate && candidate.lectureDate <= h.endDate) {
      conflicts.push({
        type: 'holiday',
        conflictingId: h.id,
        messageAr: `تاريخ المحاضرة يصادف عطلة رسمية: ${h.titleAr}`,
        messageEn: `Lecture date falls on official holiday: ${h.titleEn}`,
      });
    }
  }

  for (const lec of existingLectures) {
    if (candidate.id && lec.id === candidate.id) continue;
    if (lec.status === 'cancelled') continue;
    if (lec.lectureDate !== candidate.lectureDate) continue;

    const lecStart = timeToMinutes(lec.startTime);
    const lecEnd = timeToMinutes(lec.endTime);
    const overlaps = startMin < lecEnd && endMin > lecStart;
    if (!overlaps) continue;

    if (lec.classroom.trim().toLowerCase() === candidate.classroom.trim().toLowerCase()) {
      conflicts.push({
        type: 'classroom',
        conflictingId: lec.id,
        messageAr: `تعارض في القاعة الدراسية (${lec.classroom}) مع محاضرة ${lec.subjectNameAr || lec.subjectId}`,
        messageEn: `Classroom conflict (${lec.classroom}) with ${lec.subjectNameEn || lec.subjectId}`,
      });
    }
    if (lec.lecturerId === candidate.lecturerId) {
      conflicts.push({
        type: 'lecturer',
        conflictingId: lec.id,
        messageAr: `تعارض في جدول التدريسي مع محاضرة ${lec.subjectNameAr || lec.subjectId}`,
        messageEn: `Lecturer schedule conflict with ${lec.subjectNameEn || lec.subjectId}`,
      });
    }
    if (candidate.cohortId && lec.cohortId && lec.cohortId === candidate.cohortId) {
      conflicts.push({
        type: 'cohort',
        conflictingId: lec.id,
        messageAr: `تعارض في جدول الدفعة الدراسية مع محاضرة ${lec.subjectNameAr || lec.subjectId}`,
        messageEn: `Cohort schedule conflict with ${lec.subjectNameEn || lec.subjectId}`,
      });
    }
  }

  return conflicts;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
