import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiApp, signQrPayload, verifyQrToken } from '../server';
import { getAuthorizedScope, runDeterministicTool, runNonAiFallbackQuery } from '../server/analyticsEngine';
import {
  calculateStudentAttendance,
  computeAcademicHours,
  DEFAULT_POLICY,
  detectScheduleConflicts,
} from '../src/lib/attendanceMath';
import { createIsolatedDemoDataset } from '../src/lib/demoData';
import { AttendanceRecord, Lecture, Student } from '../src/types/sgas';
import {
  buildOfficialDocumentRef,
  buildOfficialReportHtmlPage,
  paginateReportRows,
} from '../src/lib/exportUtils';

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

describe('SGAS Official University PDF Export Formatting', () => {
  it('paginates rows across first and subsequent pages without slicing records', () => {
    assert.deepEqual(paginateReportRows([], 12, 18), [[]]);
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
    const pages = paginateReportRows(rows, 12, 18);
    assert.equal(pages.length, 2);
    assert.equal(pages[0].length, 12);
    assert.equal(pages[1].length, 13);
    assert.equal(pages[1][0].id, 13);
  });

  it('generates structured official document references matching MTU-TCM convention', () => {
    const ref = buildOfficialDocumentRef('student', '2026-11-18');
    assert.match(ref, /^MTU-TCM-STUDEN-20261118-[A-Z0-9]{4}$/);
  });

  it('builds official RTL university documentation HTML with letterhead, remarks, signatures, and XSS escaping', () => {
    const html = buildOfficialReportHtmlPage(
      {
        filename: 'test_report',
        titleAr: 'تقرير الحضور الرسمي',
        titleEn: 'Official Attendance Report',
        periodLabel: '2026-11-01 -> 2026-11-18',
        appliedFilters: 'الكل',
        lang: 'ar',
        settings: null,
        summaryItems: [{ label: 'الطلبة', value: '12' }],
        columns: [
          { key: 'student', label: 'الطالب' },
          { key: 'pct', label: 'النسبة' },
        ],
        rows: [{ student: '<script>alert(1)</script>', pct: '95%' }],
        documentRef: 'MTU-TCM-STUDEN-20261118-ABCD',
        officialNotes: 'وثيقة معتمدة لأغراض الدراسات العليا',
        generatedBy: 'شعبة الدراسات العليا',
        includeSignatures: true,
      },
      [{ student: '<script>alert(1)</script>', pct: '95%' }],
      0,
      1,
      0,
    );
    assert.ok(html.includes('direction:rtl'));
    assert.ok(html.includes('الجامعة التقنية الوسطى'));
    assert.ok(html.includes('MTU-TCM-STUDEN-20261118-ABCD'));
    assert.ok(html.includes('وثيقة معتمدة لأغراض الدراسات العليا'));
    assert.ok(html.includes('مكان الختم الرسمي للكلية / الشعبة'));
    assert.ok(html.includes('صفحة 1 من 1'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });
});

describe('SGAS Multi-turn AI Assistant API', () => {
  it('handles consecutive turns cleanly without stalling or rejecting valid history', async () => {
    const app = createApiApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const dataset = createIsolatedDemoDataset();
      const postTurn = async (message: string, history: Array<{ role: 'user' | 'model'; text: string }>) => {
        const resp = await fetch(`${baseUrl}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer DEMO_SANDBOX_super_admin',
          },
          body: JSON.stringify({
            message,
            history,
            role: 'super_admin',
            dataset,
            lang: 'ar',
            deterministicOnly: true,
          }),
        });
        assert.equal(resp.status, 200);
        return (await resp.json()) as {
          answer: string;
          toolsCalled: string[];
          modelUsed: string;
          status: string;
        };
      };

      const turn1 = await postTurn('كم عدد الطلبة الحاضرين اليوم؟', [{ role: 'model', text: 'welcome' }]);
      assert.equal(turn1.status, 'success');
      assert.deepEqual(turn1.toolsCalled, ['get_daily_attendance']);

      const turn2 = await postTurn('ما هو معدل الحضور لكل قسم علمي؟', [
        { role: 'user', text: 'كم عدد الطلبة الحاضرين اليوم؟' },
        { role: 'model', text: turn1.answer },
      ]);
      assert.equal(turn2.status, 'success');
      assert.deepEqual(turn2.toolsCalled, ['get_department_statistics']);

      const turn3 = await postTurn('من هم الطلبة الذين تجاوزوا الغياب؟', [
        { role: 'user', text: 'كم عدد الطلبة الحاضرين اليوم؟' },
        { role: 'model', text: turn1.answer },
        { role: 'user', text: 'ما هو معدل الحضور لكل قسم علمي؟' },
        { role: 'model', text: turn2.answer },
      ]);
      assert.equal(turn3.status, 'success');
      assert.deepEqual(turn3.toolsCalled, ['get_absence_threshold_students']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});

