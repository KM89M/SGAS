import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Download, Printer, Filter } from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { calculateStudentAttendance, getBaghdadDateString } from '../lib/attendanceMath';
import { exportInstitutionalPdf, exportToCsv, exportToExcel } from '../lib/exportUtils';

type ReportTypeKey =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'student'
  | 'department'
  | 'subject'
  | 'lecturer'
  | 'masters'
  | 'phd'
  | 'absence'
  | 'exceeding_limit'
  | 'completed_lectures'
  | 'pending_approvals'
  | 'academic_hours'
  | 'corrections';

type PeriodKey = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'semester' | 'academic_year' | 'custom';

export const ReportsCenter: React.FC = () => {
  const { lang, t, currentUser, dataset, activePolicy, pushToast, logReportGeneration } = useSGAS();
  const isAr = lang === 'ar';
  const role = currentUser?.role || 'student';
  const today = getBaghdadDateString();

  const [reportType, setReportType] = useState<ReportTypeKey>('student');
  const [period, setPeriod] = useState<PeriodKey>('semester');

  // All 11 Report Filters
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [deptId, setDeptId] = useState(role === 'dept_admin' ? currentUser?.departmentId || '' : '');
  const [programId, setProgramId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [lecturerId, setLecturerId] = useState(role === 'lecturer' ? currentUser?.linkedEntityId || '' : '');
  const [subjectId, setSubjectId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  const reportTypes: { key: ReportTypeKey; ar: string; en: string }[] = [
    { key: 'daily', ar: 'تقرير الحضور اليومي', en: 'Daily Attendance Report' },
    { key: 'weekly', ar: 'تقرير الحضور الأسبوعي', en: 'Weekly Attendance Report' },
    { key: 'biweekly', ar: 'تقرير نصف شهري (أسبوعان)', en: 'Bi-Weekly Attendance Report' },
    { key: 'monthly', ar: 'تقرير الحضور الشهري', en: 'Monthly Attendance Report' },
    { key: 'student', ar: 'تقرير طالب فردي شامل', en: 'Student-Wise Report' },
    { key: 'department', ar: 'تقرير الأقسام العلمية', en: 'Department-Wise Report' },
    { key: 'subject', ar: 'تقرير المواد الدراسية', en: 'Subject-Wise Report' },
    { key: 'lecturer', ar: 'تقرير التدريسيين والساعات', en: 'Lecturer-Wise Report' },
    { key: 'masters', ar: 'تقرير طلبة الماجستير', en: "Master's Program Report" },
    { key: 'phd', ar: 'تقرير طلبة الدكتوراه', en: 'PhD Program Report' },
    { key: 'absence', ar: 'تقرير الغيابات التفصيلي', en: 'Absence Report' },
    { key: 'exceeding_limit', ar: 'تقرير المتجاوزين لنسبة الغياب', en: 'Students Exceeding Absence Limit' },
    { key: 'completed_lectures', ar: 'تقرير المحاضرات المنجزة', en: 'Completed Lectures Report' },
    { key: 'pending_approvals', ar: 'تقرير بانتظار اعتماد التدريسي', en: 'Pending Approvals Report' },
    { key: 'academic_hours', ar: 'تقرير الساعات الأكاديمية المنجزة', en: 'Completed Academic Hours Report' },
    { key: 'corrections', ar: 'تقرير طلبات التصحيح والإجازات', en: 'Corrections & Excuses Report' },
  ];

  // Resolve effective date boundaries from period + custom dates
  const effectiveDates = useMemo(() => {
    const baseDate = new Date();
    const shiftDays = (d: number) => {
      const copy = new Date(baseDate.getTime() - d * 86_400_000);
      return copy.toISOString().slice(0, 10);
    };
    if (startDate || endDate) return { from: startDate || '2000-01-01', to: endDate || '2099-12-31' };
    if (period === 'daily' || reportType === 'daily') return { from: today, to: today };
    if (period === 'weekly' || reportType === 'weekly') return { from: shiftDays(7), to: today };
    if (period === 'biweekly' || reportType === 'biweekly') return { from: shiftDays(14), to: today };
    if (period === 'monthly' || reportType === 'monthly') return { from: shiftDays(30), to: today };
    return { from: '2000-01-01', to: '2099-12-31' };
  }, [endDate, period, reportType, startDate, today]);

  const filteredLectures = useMemo(() => {
    return dataset.lectures.filter((l) => {
      if (yearId && l.academicYearId && l.academicYearId !== yearId) return false;
      if (semesterId && l.semesterId && l.semesterId !== semesterId) return false;
      if (deptId && l.departmentId !== deptId) return false;
      if (programId && l.programId !== programId) return false;
      if (cohortId && l.cohortId && l.cohortId !== cohortId) return false;
      if (lecturerId && l.lecturerId !== lecturerId) return false;
      if (subjectId && l.subjectId !== subjectId) return false;
      if (l.lectureDate < effectiveDates.from || l.lectureDate > effectiveDates.to) return false;
      return true;
    });
  }, [cohortId, dataset.lectures, deptId, effectiveDates.from, effectiveDates.to, lecturerId, programId, semesterId, subjectId, yearId]);

  const filteredStudents = useMemo(() => {
    return dataset.students.filter((s) => {
      if (deptId && s.departmentId !== deptId) return false;
      if (programId && s.programId !== programId) return false;
      if (cohortId && s.cohortId && s.cohortId !== cohortId) return false;
      if (studentId && s.id !== studentId) return false;
      const prog = dataset.programs.find((p) => p.id === s.programId);
      if (reportType === 'masters' && prog?.degreeType !== 'masters') return false;
      if (reportType === 'phd' && prog?.degreeType !== 'phd') return false;
      return true;
    });
  }, [cohortId, dataset.programs, dataset.students, deptId, programId, reportType, studentId]);

  const reportPayload = useMemo(() => {
    const lecIds = new Set(filteredLectures.map((l) => l.id));
    const scopedRecords = dataset.records.filter(
      (r) => lecIds.has(r.lectureId) && (!statusFilter || r.status === statusFilter),
    );

    if (reportType === 'department') {
      const columns = [
        { key: 'code', label: isAr ? 'الرمز' : 'Code' },
        { key: 'name', label: isAr ? 'القسم العلمي' : 'Department' },
        { key: 'students', label: isAr ? 'عدد الطلبة' : 'Students' },
        { key: 'lectures', label: isAr ? 'المحاضرات' : 'Lectures' },
        { key: 'attendedHours', label: isAr ? 'ساعات الحضور' : 'Attended Hrs' },
        { key: 'rate', label: isAr ? 'نسبة الحضور %' : 'Rate %' },
      ];
      const rows = dataset.departments
        .filter((d) => !deptId || d.id === deptId)
        .map((d) => {
          const dStus = filteredStudents.filter((s) => s.departmentId === d.id);
          const dLecs = filteredLectures.filter((l) => l.departmentId === d.id && l.status !== 'cancelled');
          const dRecs = scopedRecords.filter((r) => r.departmentId === d.id && r.isApproved);
          const pres = dRecs.filter((r) => r.status === 'present' || r.status === 'late').length;
          const rate = dRecs.length > 0 ? Number(((pres / dRecs.length) * 100).toFixed(1)) : 0;
          const hrs = dLecs.filter((l) => l.status === 'approved' || l.status === 'completed').reduce((a, b) => a + (b.academicCreditHours || 1), 0);
          return {
            code: d.code,
            name: isAr ? d.nameAr : d.nameEn,
            students: dStus.length,
            lectures: dLecs.length,
            attendedHours: Number(hrs.toFixed(1)),
            rate: `${rate}%`,
          };
        });
      return { columns, rows, attendedHours: 0, absentHours: 0, avgRate: 0 };
    }

    if (reportType === 'subject' || reportType === 'academic_hours') {
      const columns = [
        { key: 'code', label: isAr ? 'رمز المادة' : 'Code' },
        { key: 'name', label: isAr ? 'المادة الدراسية' : 'Subject' },
        { key: 'plannedHours', label: isAr ? 'الساعات المخططة' : 'Planned Hrs' },
        { key: 'completedHours', label: isAr ? 'الساعات المنجزة' : 'Completed Hrs' },
        { key: 'approvedLectures', label: isAr ? 'المحاضرات المعتمدة' : 'Approved Lectures' },
        { key: 'rate', label: isAr ? 'نسبة الحضور' : 'Attendance %' },
      ];
      const rows = dataset.subjects
        .filter((s) => (!deptId || s.departmentId === deptId) && (!programId || s.programId === programId) && (!subjectId || s.id === subjectId))
        .map((sub) => {
          const sLecs = filteredLectures.filter((l) => l.subjectId === sub.id && l.status !== 'cancelled');
          const completed = sLecs.filter((l) => l.status === 'approved' || l.status === 'completed');
          const hrs = completed.reduce((a, l) => a + (l.academicCreditHours || 1), 0);
          const sRecs = scopedRecords.filter((r) => r.subjectId === sub.id && r.isApproved);
          const pres = sRecs.filter((r) => r.status === 'present' || r.status === 'late').length;
          const rate = sRecs.length > 0 ? `${((pres / sRecs.length) * 100).toFixed(1)}%` : '0%';
          return {
            code: sub.code,
            name: isAr ? sub.nameAr : sub.nameEn,
            plannedHours: sub.totalPlannedHours,
            completedHours: Number(hrs.toFixed(2)),
            approvedLectures: completed.length,
            rate,
          };
        });
      return { columns, rows, attendedHours: 0, absentHours: 0, avgRate: 0 };
    }

    if (reportType === 'lecturer') {
      const columns = [
        { key: 'code', label: isAr ? 'الرمز' : 'Code' },
        { key: 'name', label: isAr ? 'التدريسي' : 'Lecturer' },
        { key: 'scheduled', label: isAr ? 'المجدولة' : 'Scheduled' },
        { key: 'approved', label: isAr ? 'المعتمدة' : 'Approved' },
        { key: 'pending', label: isAr ? 'بانتظار الاعتماد' : 'Pending' },
        { key: 'hours', label: isAr ? 'الساعات المنجزة' : 'Delivered Hrs' },
      ];
      const rows = dataset.lecturers
        .filter((l) => (!deptId || l.departmentId === deptId) && (!lecturerId || l.id === lecturerId))
        .map((lec) => {
          const lLecs = filteredLectures.filter((x) => x.lecturerId === lec.id && x.status !== 'cancelled');
          const app = lLecs.filter((x) => x.status === 'approved' || x.status === 'completed');
          const pen = lLecs.filter((x) => x.status === 'pending_approval' || x.status === 'attendance_open');
          const hrs = app.reduce((a, b) => a + (b.academicCreditHours || 1), 0);
          return {
            code: lec.lecturerCode,
            name: `${lec.academicTitleAr} ${isAr ? lec.fullNameAr : lec.fullNameEn}`,
            scheduled: lLecs.length,
            approved: app.length,
            pending: pen.length,
            hours: Number(hrs.toFixed(2)),
          };
        });
      return { columns, rows, attendedHours: 0, absentHours: 0, avgRate: 0 };
    }

    if (reportType === 'completed_lectures' || reportType === 'pending_approvals') {
      const targetLecs = filteredLectures.filter((l) =>
        reportType === 'completed_lectures'
          ? l.status === 'approved' || l.status === 'completed'
          : l.status === 'pending_approval' || l.status === 'attendance_open',
      );
      const columns = [
        { key: 'date', label: t.common.date },
        { key: 'time', label: t.common.time },
        { key: 'subject', label: isAr ? 'المادة' : 'Subject' },
        { key: 'lecturer', label: isAr ? 'التدريسي' : 'Lecturer' },
        { key: 'hours', label: t.common.hours },
        { key: 'status', label: t.common.status },
      ];
      const rows = targetLecs.map((l) => ({
        date: l.lectureDate,
        time: `${l.startTime}-${l.endTime}`,
        subject: isAr ? l.subjectNameAr || l.subjectId : l.subjectNameEn || l.subjectId,
        lecturer: isAr ? l.lecturerNameAr || l.lecturerId : l.lecturerNameEn || l.lecturerId,
        hours: l.academicCreditHours,
        status: t.statuses[l.status],
      }));
      return { columns, rows, attendedHours: 0, absentHours: 0, avgRate: 0 };
    }

    if (reportType === 'corrections') {
      const columns = [
        { key: 'student', label: isAr ? 'الطالب' : 'Student' },
        { key: 'current', label: isAr ? 'الحالة السابقة' : 'Previous' },
        { key: 'requested', label: isAr ? 'الحالة المطلوبة' : 'Requested' },
        { key: 'reason', label: isAr ? 'السبب' : 'Reason' },
        { key: 'status', label: t.common.status },
      ];
      const rows = dataset.corrections
        .filter((c) => !deptId || c.departmentId === deptId)
        .map((c) => ({
          student: c.studentNameAr || c.studentId,
          current: c.currentStatus,
          requested: t.statuses[c.requestedStatus],
          reason: c.reason,
          status: t.statuses[c.status],
        }));
      return { columns, rows, attendedHours: 0, absentHours: 0, avgRate: 0 };
    }

    // Student-level comprehensive calculation reports (student, masters, phd, absence, exceeding_limit, daily/weekly/biweekly/monthly)
    const columns = [
      { key: 'universityId', label: isAr ? 'الرقم الجامعي' : 'Univ. ID' },
      { key: 'name', label: isAr ? 'اسم الطالب' : 'Student Name' },
      { key: 'department', label: isAr ? 'القسم' : 'Department' },
      { key: 'program', label: isAr ? 'البرنامج' : 'Program' },
      { key: 'completedHours', label: isAr ? 'الساعات المنجزة' : 'Completed Hrs' },
      { key: 'attendedHours', label: isAr ? 'ساعات الحضور' : 'Attended Hrs' },
      { key: 'absentHours', label: isAr ? 'ساعات الغياب' : 'Absent Hrs' },
      { key: 'attendancePct', label: isAr ? 'نسبة الحضور' : 'Attendance %' },
      { key: 'absencePct', label: isAr ? 'نسبة الغياب' : 'Absence %' },
      { key: 'warning', label: isAr ? 'الإنذار' : 'Warning' },
    ];

    let sumAtt = 0;
    let sumAbs = 0;
    let sumPct = 0;

    const rows = filteredStudents
      .map((stu) => {
        const calc = calculateStudentAttendance(stu, filteredLectures, scopedRecords, dataset.enrollments, activePolicy, subjectId || undefined);
        const dept = dataset.departments.find((d) => d.id === stu.departmentId);
        const prog = dataset.programs.find((p) => p.id === stu.programId);
        return {
          stu,
          calc,
          row: {
            universityId: stu.universityId,
            name: isAr ? stu.fullNameAr : stu.fullNameEn,
            department: dept ? (isAr ? dept.nameAr : dept.nameEn) : '—',
            program: prog ? (isAr ? prog.nameAr : prog.nameEn) : '—',
            completedHours: calc.totalCompletedHours,
            attendedHours: calc.totalAttendedHours,
            absentHours: calc.totalAbsentHours,
            attendancePct: `${calc.attendancePercentage}%`,
            absencePct: `${calc.absencePercentage}%`,
            warning:
              calc.warningLevel === 'exceeded'
                ? isAr ? 'تجاوز الحد' : 'Exceeded'
                : calc.warningLevel === 'critical'
                  ? isAr ? 'حرج' : 'Critical'
                  : calc.warningLevel === 'second'
                    ? isAr ? 'إنذار ثانٍ' : '2nd Warning'
                    : calc.warningLevel === 'first'
                      ? isAr ? 'إنذار أول' : '1st Warning'
                      : isAr ? 'سليم' : 'Clear',
          },
        };
      })
      .filter((item) => {
        if (reportType === 'exceeding_limit') return item.calc.warningLevel === 'exceeded' || item.calc.warningLevel === 'critical';
        if (reportType === 'absence') return item.calc.totalAbsentHours > 0;
        return true;
      })
      .map((item) => {
        sumAtt += item.calc.totalAttendedHours;
        sumAbs += item.calc.totalAbsentHours;
        sumPct += item.calc.attendancePercentage;
        return item.row;
      });

    return {
      columns,
      rows,
      attendedHours: Number(sumAtt.toFixed(1)),
      absentHours: Number(sumAbs.toFixed(1)),
      avgRate: rows.length > 0 ? Number((sumPct / rows.length).toFixed(1)) : 0,
    };
  }, [activePolicy, dataset.corrections, dataset.departments, dataset.enrollments, dataset.lecturers, dataset.programs, dataset.records, dataset.subjects, deptId, filteredLectures, filteredStudents, isAr, lecturerId, programId, reportType, statusFilter, subjectId, t]);

  const currentTypeMeta = reportTypes.find((r) => r.key === reportType) || reportTypes[0];

  const handleExport = async (format: 'xlsx' | 'pdf' | 'csv' | 'print') => {
    const filename = `sgas_${reportType}_${today}`;
    const appliedFilters = `${isAr ? 'الفترة:' : 'Period:'} ${effectiveDates.from} → ${effectiveDates.to}`;

    if (format === 'xlsx') {
      exportToExcel(filename, currentTypeMeta.en.slice(0, 28), reportPayload.rows, isAr);
    } else if (format === 'csv') {
      exportToCsv(filename, reportPayload.rows);
    } else if (format === 'print') {
      window.print();
    } else if (format === 'pdf') {
      setExportingPdf(true);
      try {
        await exportInstitutionalPdf({
          filename,
          titleAr: currentTypeMeta.ar,
          titleEn: currentTypeMeta.en,
          periodLabel: `${effectiveDates.from} — ${effectiveDates.to}`,
          appliedFilters,
          lang,
          settings: dataset.settings,
          summaryItems: [
            { label: isAr ? 'إجمالي الصفوف' : 'Records', value: String(reportPayload.rows.length) },
            { label: isAr ? 'ساعات الحضور' : 'Attended Hrs', value: String(reportPayload.attendedHours) },
            { label: isAr ? 'ساعات الغياب' : 'Absent Hrs', value: String(reportPayload.absentHours) },
            { label: isAr ? 'متوسط النسبة' : 'Avg Rate', value: `${reportPayload.avgRate}%` },
          ],
          columns: reportPayload.columns,
          rows: reportPayload.rows,
        });
      } finally {
        setExportingPdf(false);
      }
    }

    await logReportGeneration({
      reportType,
      titleAr: currentTypeMeta.ar,
      titleEn: currentTypeMeta.en,
      format,
      periodLabel: `${effectiveDates.from}..${effectiveDates.to}`,
      generatedByUid: currentUser?.uid || 'unknown',
      generatedByRole: role,
      recordCount: reportPayload.rows.length,
    });
    pushToast('success', isAr ? 'تم توليد التقرير وتوثيقه' : 'Report generated and logged');
  };

  return (
    <div className="space-y-5">
      {/* Header & Exports */}
      <div className="no-print bg-white border border-blue-100 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">{t.nav.reports}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr ? '16 نوع تقرير رسمي مع ترويسة الجامعة التقنية الوسطى ودعم Excel و PDF العربي و CSV' : '16 official institutional reports with Excel, RTL Arabic PDF & CSV export'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleExport('xlsx')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
              <FileSpreadsheet className="w-4 h-4" />
              <span>{t.actions.exportXlsx}</span>
            </button>
            <button disabled={exportingPdf} onClick={() => handleExport('pdf')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50">
              <FileText className="w-4 h-4" />
              <span>{exportingPdf ? t.common.loading : t.actions.exportPdf}</span>
            </button>
            <button onClick={() => handleExport('csv')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50">
              <Download className="w-4 h-4" />
              <span>{t.actions.exportCsv}</span>
            </button>
            <button onClick={() => handleExport('print')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50">
              <Printer className="w-4 h-4" />
              <span>{t.actions.print}</span>
            </button>
          </div>
        </div>

        {/* Report Type + Period + 11 Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block font-semibold text-slate-600 mb-1 flex items-center gap-1"><Filter className="w-3 h-3" /> {isAr ? 'نوع التقرير (16)' : 'Report Type (16)'}</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportTypeKey)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold">
              {reportTypes.map((r) => <option key={r.key} value={r.key}>{isAr ? r.ar : r.en}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'الفترة الزمنية (7)' : 'Period (7)'}</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="daily">{isAr ? 'يومي' : 'Daily'}</option>
              <option value="weekly">{isAr ? 'أسبوعي' : 'Weekly'}</option>
              <option value="biweekly">{isAr ? 'نصف شهري' : 'Bi-Weekly'}</option>
              <option value="monthly">{isAr ? 'شهري' : 'Monthly'}</option>
              <option value="semester">{isAr ? 'فصل دراسي' : 'Semester'}</option>
              <option value="academic_year">{isAr ? 'سنة دراسية' : 'Academic Year'}</option>
              <option value="custom">{isAr ? 'مخصص' : 'Custom Range'}</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'السنة الدراسية' : 'Academic Year'}</label>
            <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.academicYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'الفصل الدراسي' : 'Semester'}</label>
            <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.semesters.map((s) => <option key={s.id} value={s.id}>{isAr ? s.nameAr : s.nameEn}</option>)}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'القسم العلمي' : 'Department'}</label>
            <select value={deptId} onChange={(e) => setDeptId(e.target.value)} disabled={role === 'dept_admin'} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.departments.map((d) => <option key={d.id} value={d.id}>{isAr ? d.nameAr : d.nameEn}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'البرنامج' : 'Program'}</label>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.programs.map((p) => <option key={p.id} value={p.id}>{isAr ? p.nameAr : p.nameEn}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'الدفعة / الفوج' : 'Cohort'}</label>
            <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.cohorts.map((c) => <option key={c.id} value={c.id}>{isAr ? c.nameAr : c.nameEn}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'الطالب' : 'Student'}</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.students.map((s) => <option key={s.id} value={s.id}>{isAr ? s.fullNameAr : s.fullNameEn}</option>)}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'التدريسي' : 'Lecturer'}</label>
            <select value={lecturerId} onChange={(e) => setLecturerId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.lecturers.map((l) => <option key={l.id} value={l.id}>{isAr ? l.fullNameAr : l.fullNameEn}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'المادة الدراسية' : 'Subject'}</label>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              {dataset.subjects.map((s) => <option key={s.id} value={s.id}>{isAr ? s.nameAr : s.nameEn}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'حالة الحضور' : 'Attendance Status'}</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{t.common.all}</option>
              <option value="present">{t.statuses.present}</option>
              <option value="late">{t.statuses.late}</option>
              <option value="excused">{t.statuses.excused}</option>
              <option value="absent">{t.statuses.absent}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'من تاريخ' : 'From'}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-slate-200 font-mono-num" />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'إلى تاريخ' : 'To'}</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-slate-200 font-mono-num" />
            </div>
          </div>
        </div>
      </div>

      {/* Report Table Preview */}
      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold text-sm text-slate-900">
            {isAr ? currentTypeMeta.ar : currentTypeMeta.en}
          </div>
          <div className="text-xs font-mono-num text-slate-500">
            {effectiveDates.from} → {effectiveDates.to} · {reportPayload.rows.length} {isAr ? 'صف' : 'rows'}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
              <tr>
                {reportPayload.columns.map((c) => (
                  <th key={c.key} className="p-3 text-start whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportPayload.rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  {reportPayload.columns.map((c) => (
                    <td key={c.key} className="p-3 font-mono-num whitespace-nowrap">{String((row as Record<string, unknown>)[c.key] ?? '—')}</td>
                  ))}
                </tr>
              ))}
              {reportPayload.rows.length === 0 && (
                <tr>
                  <td colSpan={reportPayload.columns.length} className="p-8 text-center text-slate-400">
                    {t.common.noData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
