import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signQrPayload, verifyQrToken } from '../server';
import { getAuthorizedScope, runDeterministicTool, runNonAiFallbackQuery } from '../server/analyticsEngine';
import {
  calculateStudentAttendance,
  computeAcademicHours,
  DEFAULT_POLICY,
  detectScheduleConflicts,
} from '../src/lib/attendanceMath';
import { createIsolatedDemoDataset } from '../src/lib/demoData';
import { AttendanceRecord, Lecture, Student } from '../src/types/sgas';

describe('SGAS Cryptographic QR Signing & Verification', () => {
  it('verifies a freshly signed QR token and computes sha256 tokenHash', () => {
    const now = Date.now();
    const token = signQrPayload({
      sessionId: 'sess_1',
      lectureId: 'lec_1',
      subjectId: 'sub_1',
      issuedAt: now,
      expiresAt: now + 30_000,
      nonce: 'abc123',
    });
    const res = verifyQrToken(token);
    assert.equal(res.valid, true);
    assert.equal(res.payload?.sessionId, 'sess_1');
    assert.equal(res.payload?.lectureId, 'lec_1');
    assert.ok(res.tokenHash && res.tokenHash.length === 64);
  });

  it('rejects tampered QR tokens with INVALID_SIGNATURE', () => {
    const now = Date.now();
    const token = signQrPayload({
      sessionId: 'sess_1',
      lectureId: 'lec_1',
      subjectId: 'sub_1',
      issuedAt: now,
      expiresAt: now + 30_000,
      nonce: 'abc123',
    });
    const tampered = `${token.slice(0, -3)}XYZ`;
    const res = verifyQrToken(tampered);
    assert.equal(res.valid, false);
    assert.equal(res.code, 'INVALID_SIGNATURE');
  });

  it('rejects expired QR tokens with EXPIRED code', () => {
    const past = Date.now() - 60_000;
    const token = signQrPayload({
      sessionId: 'sess_1',
      lectureId: 'lec_1',
      subjectId: 'sub_1',
      issuedAt: past - 30_000,
      expiresAt: past,
      nonce: 'old',
    });
    const res = verifyQrToken(token);
    assert.equal(res.valid, false);
    assert.equal(res.code, 'EXPIRED');
  });
});

describe('SGAS Attendance Math & Policy Calculations', () => {
  const student: Student = {
    id: 'stu_1',
    universityId: 'MTU-001',
    fullNameAr: 'طالب اختبار',
    fullNameEn: 'Test Student',
    email: 'stu@mtu.edu.iq',
    departmentId: 'dept_1',
    programId: 'prog_1',
    enrollmentStatus: 'enrolled',
    accountStatus: 'active',
  };

  it('returns safe zero-division protected metrics when no completed lectures exist', () => {
    const res = calculateStudentAttendance(student, [], [], [], DEFAULT_POLICY);
    assert.equal(res.totalCompletedLectures, 0);
    assert.equal(res.attendancePercentage, 100);
    assert.equal(res.absencePercentage, 0);
    assert.equal(res.warningLevel, 'none');
  });

  it('excludes cancelled lectures and unapproved pending records from official percentages', () => {
    const lectures: Lecture[] = [
      {
        id: 'l1',
        departmentId: 'dept_1',
        programId: 'prog_1',
        subjectId: 'sub_1',
        lecturerId: 'lec_1',
        lectureDate: '2026-11-01',
        startTime: '09:00',
        endTime: '11:00',
        plannedDurationMinutes: 120,
        academicCreditHours: 2,
        classroom: 'Hall 1',
        lectureType: 'regular',
        status: 'approved',
      },
      {
        id: 'l2',
        departmentId: 'dept_1',
        programId: 'prog_1',
        subjectId: 'sub_1',
        lecturerId: 'lec_1',
        lectureDate: '2026-11-02',
        startTime: '09:00',
        endTime: '11:00',
        plannedDurationMinutes: 120,
        academicCreditHours: 2,
        classroom: 'Hall 1',
        lectureType: 'regular',
        status: 'cancelled',
      },
      {
        id: 'l3',
        departmentId: 'dept_1',
        programId: 'prog_1',
        subjectId: 'sub_1',
        lecturerId: 'lec_1',
        lectureDate: '2026-11-03',
        startTime: '09:00',
        endTime: '11:00',
        plannedDurationMinutes: 120,
        academicCreditHours: 2,
        classroom: 'Hall 1',
        lectureType: 'regular',
        status: 'pending_approval',
      },
    ];

    const records: AttendanceRecord[] = [
      {
        id: 'r1',
        sessionId: 's1',
        lectureId: 'l1',
        subjectId: 'sub_1',
        departmentId: 'dept_1',
        programId: 'prog_1',
        studentId: 'stu_1',
        studentUid: 'uid_1',
        lecturerUid: 'lec_uid',
        status: 'present',
        method: 'qr_camera',
        isApproved: true,
      },
      {
        id: 'r2',
        sessionId: 's2',
        lectureId: 'l2',
        subjectId: 'sub_1',
        departmentId: 'dept_1',
        programId: 'prog_1',
        studentId: 'stu_1',
        studentUid: 'uid_1',
        lecturerUid: 'lec_uid',
        status: 'absent',
        method: 'auto_absent',
        isApproved: true,
      },
      {
        id: 'r3',
        sessionId: 's3',
        lectureId: 'l3',
        subjectId: 'sub_1',
        departmentId: 'dept_1',
        programId: 'prog_1',
        studentId: 'stu_1',
        studentUid: 'uid_1',
        lecturerUid: 'lec_uid',
        status: 'absent',
        method: 'auto_absent',
        isApproved: false,
      },
    ];

    const calc = calculateStudentAttendance(student, lectures, records, [], DEFAULT_POLICY);
    assert.equal(calc.totalCompletedLectures, 1);
    assert.equal(calc.totalAttendedHours, 2);
    assert.equal(calc.totalAbsentHours, 0);
    assert.equal(calc.attendancePercentage, 100);
  });

  it('computes academic hours using configured academicHourMinutes', () => {
    assert.equal(computeAcademicHours(90, { ...DEFAULT_POLICY, academicHourMinutes: 45 }), 2);
    assert.equal(computeAcademicHours(120, { ...DEFAULT_POLICY, academicHourMinutes: 60 }), 2);
  });
});

describe('SGAS Schedule Conflict Detection & RBAC Scope', () => {
  it('detects overlapping lecturer and classroom schedules', () => {
    const dataset = createIsolatedDemoDataset();
    const existing = dataset.lectures[0];
    const conflicts = detectScheduleConflicts(
      {
        lectureDate: existing.lectureDate,
        startTime: existing.startTime,
        endTime: existing.endTime,
        lecturerId: existing.lecturerId,
        classroom: existing.classroom,
        programId: existing.programId,
      },
      dataset.lectures,
      dataset.holidays,
    );
    assert.ok(conflicts.length >= 1);
  });

  it('restricts student scope strictly to their own data in analyticsEngine', () => {
    const dataset = createIsolatedDemoDataset();
    const targetStu = dataset.students[0];
    const scope = getAuthorizedScope({
      uid: targetStu.uid || 'demo_stu',
      role: 'student',
      linkedEntityId: targetStu.id,
      dataset,
    });
    assert.equal(scope.students.length, 1);
    assert.equal(scope.students[0].id, targetStu.id);
    assert.ok(scope.records.every((r) => r.studentId === targetStu.id));
  });

  it('executes deterministic AI tools & non-AI fallback cleanly on isolated dataset', () => {
    const dataset = createIsolatedDemoDataset();
    const deptStats = runDeterministicTool('get_department_statistics', {}, {
      uid: 'admin_1',
      role: 'super_admin',
      dataset,
    }) as { departments: unknown[] };
    assert.equal(deptStats.departments.length, dataset.departments.length);

    const fb = runNonAiFallbackQuery('من هم الطلبة الذين تجاوزوا الغياب؟', {
      uid: 'admin_1',
      role: 'super_admin',
      dataset,
    });
    assert.equal(fb.tool, 'get_absence_threshold_students');
  });
});
