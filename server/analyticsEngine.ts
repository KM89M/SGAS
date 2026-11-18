import {
  AttendancePolicy,
  AttendanceRecord,
  Department,
  Lecture,
  Lecturer,
  SGASDataset,
  Student,
  Subject,
  UserRole,
} from '../src/types/sgas';
import {
  calculateStudentAttendance,
  DEFAULT_POLICY,
  getBaghdadDateString,
} from '../src/lib/attendanceMath';

export interface ScopedContext {
  uid: string;
  role: UserRole;
  departmentId?: string;
  linkedEntityId?: string;
  dataset: SGASDataset;
}

/**
 * Enforces strict RBAC filtering BEFORE any AI tool or analytics calculation executes.
 */
export function getAuthorizedScope(ctx: ScopedContext) {
  const { role, departmentId, uid, linkedEntityId, dataset } = ctx;
  const policy: AttendancePolicy = dataset.policies[0] || DEFAULT_POLICY;

  let departments = dataset.departments;
  let students = dataset.students;
  let lecturers = dataset.lecturers;
  let subjects = dataset.subjects;
  let lectures = dataset.lectures;
  let records = dataset.records;
  let sessions = dataset.sessions;

  if (role === 'dept_admin' && departmentId) {
    departments = departments.filter((d) => d.id === departmentId);
    students = students.filter((s) => s.departmentId === departmentId);
    lecturers = lecturers.filter((l) => l.departmentId === departmentId);
    subjects = subjects.filter((s) => s.departmentId === departmentId);
    lectures = lectures.filter((l) => l.departmentId === departmentId);
    records = records.filter((r) => r.departmentId === departmentId);
    sessions = sessions.filter((s) => s.departmentId === departmentId);
  } else if (role === 'lecturer') {
    const lecSubjects = new Set(
      subjects
        .filter((s) => s.lecturerUids?.includes(uid) || (linkedEntityId && s.lecturerIds?.includes(linkedEntityId)))
        .map((s) => s.id),
    );
    lectures = lectures.filter(
      (l) => l.lecturerUid === uid || (linkedEntityId && l.lecturerId === linkedEntityId) || lecSubjects.has(l.subjectId),
    );
    const lecIds = new Set(lectures.map((l) => l.id));
    records = records.filter((r) => r.lecturerUid === uid || lecIds.has(r.lectureId));
    subjects = subjects.filter((s) => lecSubjects.has(s.id));
    const enrolledStuIds = new Set(
      dataset.enrollments.filter((e) => lecSubjects.has(e.subjectId)).map((e) => e.studentId),
    );
    students = students.filter((s) => enrolledStuIds.has(s.id));
    sessions = sessions.filter((s) => s.lecturerUid === uid);
  } else if (role === 'student') {
    students = students.filter((s) => s.uid === uid || (linkedEntityId && s.id === linkedEntityId));
    const stuIds = new Set(students.map((s) => s.id));
    records = records.filter((r) => r.studentUid === uid || stuIds.has(r.studentId));
    const mySubIds = new Set(
      dataset.enrollments.filter((e) => stuIds.has(e.studentId)).map((e) => e.subjectId),
    );
    subjects = subjects.filter((s) => mySubIds.has(s.id));
    lectures = lectures.filter((l) => mySubIds.has(l.subjectId));
    sessions = [];
  }

  return {
    policy,
    departments,
    programs: dataset.programs,
    students,
    lecturers,
    subjects,
    enrollments: dataset.enrollments,
    lectures,
    records,
    sessions,
  };
}

export function runDeterministicTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ScopedContext,
) {
  const scope = getAuthorizedScope(ctx);
  const today = getBaghdadDateString();

  switch (toolName) {
    case 'get_attendance_summary': {
      const dateFilter = typeof args.date === 'string' && args.date ? args.date : undefined;
      const targetLectures = dateFilter
        ? scope.lectures.filter((l) => l.lectureDate === dateFilter && l.status !== 'cancelled')
        : scope.lectures.filter((l) => l.status !== 'cancelled');
      const approvedLectures = targetLectures.filter((l) => l.status === 'approved' || l.status === 'completed');
      const pendingLectures = targetLectures.filter((l) => l.status === 'pending_approval' || l.status === 'attendance_open');
      const lecIds = new Set(targetLectures.map((l) => l.id));
      const relevantRecords = scope.records.filter((r) => lecIds.has(r.lectureId));
      const approvedRecords = relevantRecords.filter((r) => r.isApproved);
      const presentCount = approvedRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
      const absentCount = approvedRecords.filter((r) => r.status === 'absent').length;
      const excusedCount = approvedRecords.filter((r) => r.status === 'excused').length;
      const pendingCount = relevantRecords.filter((r) => !r.isApproved).length;
      const finalizedTotal = presentCount + absentCount + excusedCount;
      const attendanceRate = finalizedTotal > 0 ? Number(((presentCount / finalizedTotal) * 100).toFixed(1)) : 0;

      const mastersStudents = scope.students.filter((s) => {
        const prog = scope.programs.find((p) => p.id === s.programId);
        return prog?.degreeType === 'masters';
      }).length;
      const phdStudents = scope.students.filter((s) => {
        const prog = scope.programs.find((p) => p.id === s.programId);
        return prog?.degreeType === 'phd';
      }).length;

      return {
        reportingPeriod: dateFilter || 'All Authorized Records',
        timezone: 'Asia/Baghdad',
        totalActiveStudents: scope.students.filter((s) => s.enrollmentStatus === 'enrolled').length,
        mastersStudents,
        phdStudents,
        totalLectures: targetLectures.length,
        approvedLecturesCount: approvedLectures.length,
        pendingApprovalLecturesCount: pendingLectures.length,
        finalizedPresentCount: presentCount,
        finalizedAbsentCount: absentCount,
        finalizedExcusedCount: excusedCount,
        unapprovedPendingRecordsCount: pendingCount,
        finalizedAttendanceRatePercent: attendanceRate,
      };
    }

    case 'get_daily_attendance': {
      const targetDate = typeof args.date === 'string' && args.date ? args.date : today;
      const dayLectures = scope.lectures.filter((l) => l.lectureDate === targetDate && l.status !== 'cancelled');
      const dayLecIds = new Set(dayLectures.map((l) => l.id));
      const dayRecords = scope.records.filter((r) => dayLecIds.has(r.lectureId));
      const finalized = dayRecords.filter((r) => r.isApproved);
      const pending = dayRecords.filter((r) => !r.isApproved);
      return {
        date: targetDate,
        timezone: 'Asia/Baghdad',
        scheduledLecturesToday: dayLectures.length,
        approvedPresent: finalized.filter((r) => r.status === 'present' || r.status === 'late').length,
        approvedAbsent: finalized.filter((r) => r.status === 'absent').length,
        approvedExcused: finalized.filter((r) => r.status === 'excused').length,
        pendingApprovalRegistrations: pending.length,
        lectures: dayLectures.map((l) => ({
          id: l.id,
          subject: l.subjectNameAr || l.subjectNameEn || l.subjectId,
          time: `${l.startTime}-${l.endTime}`,
          status: l.status,
        })),
      };
    }

    case 'get_date_range_attendance': {
      const startDate = typeof args.startDate === 'string' ? args.startDate : '2000-01-01';
      const endDate = typeof args.endDate === 'string' ? args.endDate : today;
      const rangeLectures = scope.lectures.filter(
        (l) => l.lectureDate >= startDate && l.lectureDate <= endDate && l.status !== 'cancelled',
      );
      const lecIds = new Set(rangeLectures.map((l) => l.id));
      const rangeRecords = scope.records.filter((r) => lecIds.has(r.lectureId) && r.isApproved);
      const totalHours = rangeLectures
        .filter((l) => l.status === 'approved' || l.status === 'completed')
        .reduce((acc, l) => acc + (l.academicCreditHours || 1), 0);
      const present = rangeRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
      const absent = rangeRecords.filter((r) => r.status === 'absent').length;
      return {
        startDate,
        endDate,
        totalLectures: rangeLectures.length,
        completedAcademicHours: Number(totalHours.toFixed(2)),
        finalizedPresentRecords: present,
        finalizedAbsentRecords: absent,
        attendanceRatePercent: present + absent > 0 ? Number(((present / (present + absent)) * 100).toFixed(1)) : 0,
      };
    }

    case 'get_student_attendance': {
      const query = String(args.studentQuery || '').trim().toLowerCase();
      const matched = scope.students.filter(
        (s) =>
          !query ||
          s.universityId.toLowerCase().includes(query) ||
          s.fullNameAr.toLowerCase().includes(query) ||
          s.fullNameEn.toLowerCase().includes(query) ||
          s.id.toLowerCase() === query,
      );
      return {
        matchedCount: matched.length,
        students: matched.slice(0, 15).map((s, idx) => {
          const calc = calculateStudentAttendance(s, scope.lectures, scope.records, scope.enrollments, scope.policy);
          return {
            // Pseudonymized alias if super/pg admin query; keeps universityId accurate without leaking extra PII
            referenceCode: s.universityId,
            label: ctx.role === 'student' ? s.fullNameAr : `Student #${idx + 1} (${s.universityId})`,
            programType: scope.programs.find((p) => p.id === s.programId)?.degreeType || 'masters',
            ...calc,
          };
        }),
      };
    }

    case 'get_subject_attendance': {
      const query = String(args.subjectQuery || '').trim().toLowerCase();
      const matched = scope.subjects.filter(
        (sub) =>
          !query ||
          sub.code.toLowerCase().includes(query) ||
          sub.nameAr.toLowerCase().includes(query) ||
          sub.nameEn.toLowerCase().includes(query),
      );
      return {
        subjects: matched.map((sub) => {
          const subLectures = scope.lectures.filter((l) => l.subjectId === sub.id && l.status !== 'cancelled');
          const subLecIds = new Set(subLectures.map((l) => l.id));
          const subRecords = scope.records.filter((r) => subLecIds.has(r.lectureId) && r.isApproved);
          const present = subRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
          const total = subRecords.length;
          return {
            code: sub.code,
            nameAr: sub.nameAr,
            nameEn: sub.nameEn,
            completedLectures: subLectures.filter((l) => l.status === 'approved' || l.status === 'completed').length,
            finalizedPresent: present,
            finalizedRecords: total,
            attendanceRatePercent: total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0,
          };
        }),
      };
    }

    case 'get_department_statistics': {
      return {
        departments: scope.departments.map((dept) => {
          const deptStudents = scope.students.filter((s) => s.departmentId === dept.id);
          const deptLectures = scope.lectures.filter((l) => l.departmentId === dept.id && l.status !== 'cancelled');
          const deptRecords = scope.records.filter((r) => r.departmentId === dept.id && r.isApproved);
          const present = deptRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
          const total = deptRecords.length;
          const mastersCount = deptStudents.filter(
            (s) => scope.programs.find((p) => p.id === s.programId)?.degreeType === 'masters',
          ).length;
          const phdCount = deptStudents.filter(
            (s) => scope.programs.find((p) => p.id === s.programId)?.degreeType === 'phd',
          ).length;
          return {
            code: dept.code,
            nameAr: dept.nameAr,
            nameEn: dept.nameEn,
            studentsCount: deptStudents.length,
            mastersCount,
            phdCount,
            lecturesCount: deptLectures.length,
            attendanceRatePercent: total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0,
          };
        }),
      };
    }

    case 'get_lecturer_statistics': {
      return {
        lecturers: scope.lecturers.map((lec) => {
          const lecLectures = scope.lectures.filter((l) => l.lecturerId === lec.id && l.status !== 'cancelled');
          const completed = lecLectures.filter((l) => l.status === 'approved' || l.status === 'completed');
          const pending = lecLectures.filter((l) => l.status === 'pending_approval' || l.status === 'attendance_open');
          const totalHours = completed.reduce((acc, l) => acc + (l.academicCreditHours || 1), 0);
          return {
            lecturerCode: lec.lecturerCode,
            titleAr: lec.academicTitleAr,
            nameAr: lec.fullNameAr,
            scheduledLectures: lecLectures.length,
            approvedLectures: completed.length,
            pendingApprovalLectures: pending.length,
            deliveredHours: Number(totalHours.toFixed(2)),
          };
        }),
      };
    }

    case 'get_absence_threshold_students': {
      const flagged = scope.students
        .map((s) => {
          const summary = calculateStudentAttendance(s, scope.lectures, scope.records, scope.enrollments, scope.policy);
          return {
            universityId: s.universityId,
            departmentId: s.departmentId,
            absencePercentage: summary.absencePercentage,
            totalAbsentHours: summary.totalAbsentHours,
            warningLevel: summary.warningLevel,
          };
        })
        .filter((item) => item.warningLevel !== 'none');

      return {
        policyMaxAbsencePercent: scope.policy.maxAbsencePercent,
        flaggedCount: flagged.length,
        exceededCount: flagged.filter((f) => f.warningLevel === 'exceeded').length,
        students: flagged,
      };
    }

    case 'get_pending_approvals': {
      const pendingLectures = scope.lectures.filter(
        (l) => l.status === 'pending_approval' || l.status === 'attendance_open',
      );
      return {
        pendingCount: pendingLectures.length,
        lectures: pendingLectures.map((l) => ({
          id: l.id,
          date: l.lectureDate,
          time: `${l.startTime}-${l.endTime}`,
          subject: l.subjectNameAr || l.subjectNameEn || l.subjectId,
          lecturer: l.lecturerNameAr || l.lecturerId,
          status: l.status,
        })),
      };
    }

    case 'get_lecture_history': {
      const limit = Math.min(Number(args.limit) || 20, 50);
      const sorted = [...scope.lectures]
        .sort((a, b) => b.lectureDate.localeCompare(a.lectureDate))
        .slice(0, limit);
      return {
        count: sorted.length,
        lectures: sorted.map((l) => ({
          id: l.id,
          date: l.lectureDate,
          subject: l.subjectNameAr || l.subjectId,
          lecturer: l.lecturerNameAr || l.lecturerId,
          hours: l.academicCreditHours,
          status: l.status,
        })),
      };
    }

    case 'generate_attendance_report': {
      const reportType = String(args.reportType || 'summary');
      const period = String(args.period || 'current');
      return {
        action: 'OPEN_REPORT_CENTER',
        reportType,
        period,
        message: 'Report configuration prepared for export in Excel/PDF/CSV.',
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Deterministic Non-AI Search Fallback when Gemini API key is absent or quota is exhausted.
 */
export function runNonAiFallbackQuery(queryText: string, ctx: ScopedContext) {
  const q = queryText.toLowerCase();
  if (q.includes('غائب') || q.includes('تجاوز') || q.includes('threshold') || q.includes('exceed') || q.includes('warning')) {
    return {
      tool: 'get_absence_threshold_students',
      data: runDeterministicTool('get_absence_threshold_students', {}, ctx),
    };
  }
  if (q.includes('اعتماد') || q.includes('pending') || q.includes('approve')) {
    return {
      tool: 'get_pending_approvals',
      data: runDeterministicTool('get_pending_approvals', {}, ctx),
    };
  }
  if (q.includes('قسم') || q.includes('department') || q.includes('ماجستير') || q.includes('دكتوراه')) {
    return {
      tool: 'get_department_statistics',
      data: runDeterministicTool('get_department_statistics', {}, ctx),
    };
  }
  if (q.includes('تدريسي') || q.includes('أستاذ') || q.includes('استاذ') || q.includes('lecturer')) {
    return {
      tool: 'get_lecturer_statistics',
      data: runDeterministicTool('get_lecturer_statistics', {}, ctx),
    };
  }
  if (q.includes('مادة') || q.includes('إحصاء') || q.includes('subject') || q.includes('course')) {
    return {
      tool: 'get_subject_attendance',
      data: runDeterministicTool('get_subject_attendance', {}, ctx),
    };
  }
  if (q.includes('اليوم') || q.includes('today')) {
    return {
      tool: 'get_daily_attendance',
      data: runDeterministicTool('get_daily_attendance', {}, ctx),
    };
  }
  return {
    tool: 'get_attendance_summary',
    data: runDeterministicTool('get_attendance_summary', {}, ctx),
  };
}
