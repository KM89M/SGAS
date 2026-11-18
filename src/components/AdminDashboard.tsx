import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Filter, RotateCcw, Calendar, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { calculateStudentAttendance, getBaghdadDateString } from '../lib/attendanceMath';

export const AdminDashboard: React.FC<{ onNavigate?: (tab: 'sessions' | 'records' | 'schedules' | 'students') => void }> = ({ onNavigate }) => {
  const { lang, currentUser, dataset, activePolicy } = useSGAS();
  const isAr = lang === 'ar';
  const today = getBaghdadDateString();

  // 8 Dashboard Filters
  const [academicYearId, setAcademicYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [departmentId, setDepartmentId] = useState(
    currentUser?.role === 'dept_admin' ? currentUser.departmentId || '' : '',
  );
  const [programId, setProgramId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [lecturerId, setLecturerId] = useState(
    currentUser?.role === 'lecturer' ? currentUser.linkedEntityId || '' : '',
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [trendMode, setTrendMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const filteredData = useMemo(() => {
    const departments = departmentId
      ? dataset.departments.filter((d) => d.id === departmentId)
      : dataset.departments;
    const programs = dataset.programs.filter(
      (p) => (!departmentId || p.departmentId === departmentId) && (!programId || p.id === programId),
    );
    const students = dataset.students.filter(
      (s) =>
        (!departmentId || s.departmentId === departmentId) &&
        (!programId || s.programId === programId) &&
        (!academicYearId || !s.academicYearId || s.academicYearId === academicYearId) &&
        (!semesterId || !s.semesterId || s.semesterId === semesterId) &&
        (!cohortId || s.cohortId === cohortId),
    );
    const lecturers = dataset.lecturers.filter(
      (l) => (!departmentId || l.departmentId === departmentId) && (!lecturerId || l.id === lecturerId),
    );
    const subjects = dataset.subjects.filter(
      (s) =>
        (!departmentId || s.departmentId === departmentId) &&
        (!programId || s.programId === programId) &&
        (!subjectId || s.id === subjectId),
    );
    const lectures = dataset.lectures.filter(
      (l) =>
        (!academicYearId || !l.academicYearId || l.academicYearId === academicYearId) &&
        (!semesterId || !l.semesterId || l.semesterId === semesterId) &&
        (!departmentId || l.departmentId === departmentId) &&
        (!programId || l.programId === programId) &&
        (!cohortId || !l.cohortId || l.cohortId === cohortId) &&
        (!subjectId || l.subjectId === subjectId) &&
        (!lecturerId || l.lecturerId === lecturerId) &&
        (!startDate || l.lectureDate >= startDate) &&
        (!endDate || l.lectureDate <= endDate),
    );
    const lecIds = new Set(lectures.map((l) => l.id));
    const records = dataset.records.filter((r) => lecIds.has(r.lectureId));

    return { departments, programs, students, lecturers, subjects, lectures, records };
  }, [
    academicYearId,
    cohortId,
    dataset,
    departmentId,
    endDate,
    lecturerId,
    programId,
    semesterId,
    startDate,
    subjectId,
  ]);

  // 14 Real Dynamic KPI Calculations
  const kpis = useMemo(() => {
    const activeStudents = filteredData.students.filter((s) => s.enrollmentStatus === 'enrolled');
    const progMap = new Map(dataset.programs.map((p) => [p.id, p]));
    const mastersCount = activeStudents.filter((s) => progMap.get(s.programId)?.degreeType === 'masters').length;
    const phdCount = activeStudents.filter((s) => progMap.get(s.programId)?.degreeType === 'phd').length;

    const todayLectures = filteredData.lectures.filter((l) => l.lectureDate === today && l.status !== 'cancelled');
    const todayCompleted = todayLectures.filter((l) => l.status === 'approved' || l.status === 'completed');
    const todayApprovedSessions = filteredData.lectures.filter((l) => l.lectureDate === today && l.status === 'approved');
    const pendingApprovalLectures = filteredData.lectures.filter(
      (l) => l.status === 'pending_approval' || l.status === 'attendance_open',
    );

    const todayLecIds = new Set(todayLectures.map((l) => l.id));
    const todayApprovedRecords = filteredData.records.filter((r) => todayLecIds.has(r.lectureId) && r.isApproved);
    const todayPresent = todayApprovedRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
    const todayAbsent = todayApprovedRecords.filter((r) => r.status === 'absent').length;
    const todayTotal = todayPresent + todayAbsent;
    const todayAttendancePct = todayTotal > 0 ? Number(((todayPresent / todayTotal) * 100).toFixed(1)) : 0;
    const todayAbsencePct = todayTotal > 0 ? Number(((todayAbsent / todayTotal) * 100).toFixed(1)) : 0;

    let approachingLimit = 0;
    let exceedingLimit = 0;
    for (const stu of activeStudents) {
      const calc = calculateStudentAttendance(stu, filteredData.lectures, filteredData.records, dataset.enrollments, activePolicy);
      if (calc.warningLevel === 'exceeded') exceedingLimit++;
      else if (calc.warningLevel !== 'none') approachingLimit++;
    }

    return {
      totalActiveStudents: activeStudents.length,
      mastersCount,
      phdCount,
      totalLecturers: filteredData.lecturers.length,
      totalDepartments: filteredData.departments.length,
      totalSubjects: filteredData.subjects.length,
      todayScheduled: todayLectures.length,
      todayCompleted: todayCompleted.length,
      todayApproved: todayApprovedSessions.length,
      pendingApprovals: pendingApprovalLectures.length,
      todayAttendancePct,
      todayAbsencePct,
      approachingLimit,
      exceedingLimit,
    };
  }, [activePolicy, dataset.enrollments, dataset.programs, filteredData, today]);

  // Chart Datasets
  const trendData = useMemo(() => {
    const groups = new Map<string, { label: string; present: number; absent: number }>();
    for (const lec of filteredData.lectures) {
      if (lec.status === 'cancelled') continue;
      let key = lec.lectureDate;
      if (trendMode === 'monthly') key = lec.lectureDate.slice(0, 7);
      else if (trendMode === 'weekly') {
        const d = new Date(lec.lectureDate);
        const weekStart = new Date(d.setDate(d.getDate() - d.getDay()));
        key = weekStart.toISOString().slice(0, 10);
      }
      const cur = groups.get(key) || { label: key, present: 0, absent: 0 };
      const lecRecs = filteredData.records.filter((r) => r.lectureId === lec.id && r.isApproved);
      cur.present += lecRecs.filter((r) => r.status === 'present' || r.status === 'late').length;
      cur.absent += lecRecs.filter((r) => r.status === 'absent').length;
      groups.set(key, cur);
    }
    return Array.from(groups.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((g) => ({
        ...g,
        rate: g.present + g.absent > 0 ? Number(((g.present / (g.present + g.absent)) * 100).toFixed(1)) : 0,
      }));
  }, [filteredData.lectures, filteredData.records, trendMode]);

  const deptChartData = useMemo(() => {
    return filteredData.departments.map((d) => {
      const recs = filteredData.records.filter((r) => r.departmentId === d.id && r.isApproved);
      const present = recs.filter((r) => r.status === 'present' || r.status === 'late').length;
      const total = recs.length;
      const hours = filteredData.lectures
        .filter((l) => l.departmentId === d.id && (l.status === 'approved' || l.status === 'completed'))
        .reduce((acc, l) => acc + (l.academicCreditHours || 1), 0);
      return {
        name: isAr ? d.nameAr.slice(0, 22) : d.code,
        rate: total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0,
        hours: Number(hours.toFixed(1)),
      };
    });
  }, [filteredData.departments, filteredData.lectures, filteredData.records, isAr]);

  const programComparison = useMemo(() => {
    const types: Array<{ key: 'masters' | 'phd'; label: string }> = [
      { key: 'masters', label: isAr ? 'الماجستير' : "Master's" },
      { key: 'phd', label: isAr ? 'الدكتوراه' : 'PhD' },
    ];
    return types.map((t) => {
      const progIds = new Set(dataset.programs.filter((p) => p.degreeType === t.key).map((p) => p.id));
      const recs = filteredData.records.filter((r) => progIds.has(r.programId) && r.isApproved);
      const present = recs.filter((r) => r.status === 'present' || r.status === 'late').length;
      const absent = recs.filter((r) => r.status === 'absent').length;
      return {
        name: t.label,
        present,
        absent,
        rate: present + absent > 0 ? Number(((present / (present + absent)) * 100).toFixed(1)) : 0,
      };
    });
  }, [dataset.programs, filteredData.records, isAr]);

  const subjectChartData = useMemo(() => {
    return filteredData.subjects.slice(0, 8).map((s) => {
      const recs = filteredData.records.filter((r) => r.subjectId === s.id && r.isApproved);
      const present = recs.filter((r) => r.status === 'present' || r.status === 'late').length;
      const total = recs.length;
      return {
        name: s.code,
        rate: total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0,
      };
    });
  }, [filteredData.records, filteredData.subjects]);

  const lecturerChartData = useMemo(() => {
    return filteredData.lecturers.slice(0, 8).map((lec) => {
      const lecs = filteredData.lectures.filter((l) => l.lecturerId === lec.id && l.status !== 'cancelled');
      const approved = lecs.filter((l) => l.status === 'approved' || l.status === 'completed').length;
      return {
        name: isAr ? lec.fullNameAr.slice(0, 18) : lec.lecturerCode,
        scheduled: lecs.length,
        approved,
      };
    });
  }, [filteredData.lectures, filteredData.lecturers, isAr]);

  const absenceDistribution = useMemo(() => {
    const approvedRecs = filteredData.records.filter((r) => r.isApproved);
    const present = approvedRecs.filter((r) => r.status === 'present').length;
    const late = approvedRecs.filter((r) => r.status === 'late').length;
    const excused = approvedRecs.filter((r) => r.status === 'excused').length;
    const absent = approvedRecs.filter((r) => r.status === 'absent').length;
    return [
      { name: isAr ? 'حاضر' : 'Present', value: present, color: '#22C55E' },
      { name: isAr ? 'متأخر' : 'Late', value: late, color: '#2196F3' },
      { name: isAr ? 'بعذر' : 'Excused', value: excused, color: '#F59E0B' },
      { name: isAr ? 'غائب' : 'Absent', value: absent, color: '#EF4444' },
    ].filter((x) => x.value > 0);
  }, [filteredData.records, isAr]);

  const resetFilters = () => {
    setAcademicYearId('');
    setSemesterId('');
    if (currentUser?.role !== 'dept_admin') setDepartmentId('');
    setProgramId('');
    setCohortId('');
    setSubjectId('');
    if (currentUser?.role !== 'lecturer') setLecturerId('');
    setStartDate('');
    setEndDate('');
  };

  const kpiCards = [
    { label: isAr ? 'الطلبة النشطون' : 'Active Students', value: kpis.totalActiveStudents, tone: 'text-[#1565C0]' },
    { label: isAr ? 'طلبة الماجستير' : "Master's Students", value: kpis.mastersCount, tone: 'text-[#2196F3]' },
    { label: isAr ? 'طلبة الدكتوراه' : 'PhD Candidates', value: kpis.phdCount, tone: 'text-[#1565C0]' },
    { label: isAr ? 'التدريسيون' : 'Lecturers', value: kpis.totalLecturers, tone: 'text-slate-900' },
    { label: isAr ? 'الأقسام العلمية' : 'Departments', value: kpis.totalDepartments, tone: 'text-slate-900' },
    { label: isAr ? 'المواد الدراسية' : 'Subjects', value: kpis.totalSubjects, tone: 'text-slate-900' },
    { label: isAr ? 'محاضرات اليوم المجدولة' : "Today's Scheduled", value: kpis.todayScheduled, tone: 'text-[#1565C0]' },
    { label: isAr ? 'محاضرات اليوم المنجزة' : "Today's Completed", value: kpis.todayCompleted, tone: 'text-emerald-600' },
    { label: isAr ? 'جلسات اليوم المعتمدة' : "Today's Approved", value: kpis.todayApproved, tone: 'text-emerald-600' },
    { label: isAr ? 'بانتظار الاعتماد' : 'Pending Approval', value: kpis.pendingApprovals, tone: 'text-amber-600' },
    { label: isAr ? 'نسبة حضور اليوم' : "Today's Attendance %", value: `${kpis.todayAttendancePct}%`, tone: 'text-emerald-600' },
    { label: isAr ? 'نسبة غياب اليوم' : "Today's Absence %", value: `${kpis.todayAbsencePct}%`, tone: 'text-red-600' },
    { label: isAr ? 'يقتربون من حد الغياب' : 'Approaching Limit', value: kpis.approachingLimit, tone: 'text-amber-600' },
    { label: isAr ? 'تجاوزوا حد الغياب' : 'Exceeded Limit', value: kpis.exceedingLimit, tone: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            {isAr ? 'لوحة المؤشرات والتحليلات الأكاديمية' : 'Academic Attendance Analytics'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isAr
              ? `إحصاءات فورية محسوبة من السجلات المعتمدة · توقيت بغداد (${today})`
              : `Real-time deterministic metrics from finalized records · Baghdad (${today})`}
          </p>
        </div>

        {onNavigate && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigate('sessions')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800 transition-colors"
            >
              <Clock className="w-4 h-4" />
              <span>{isAr ? 'إدارة جلسات الحضور' : 'Attendance Sessions'}</span>
            </button>
            <button
              onClick={() => onNavigate('schedules')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-blue-200 text-[#1565C0] text-xs font-semibold hover:bg-[#E3F2FD] transition-colors"
            >
              <Calendar className="w-4 h-4" />
              <span>{isAr ? 'جدول المحاضرات' : 'Lecture Schedule'}</span>
            </button>
          </div>
        )}
      </div>

      {/* 8 Dashboard Filters */}
      <div className="bg-white border border-blue-100 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#1565C0]">
            <Filter className="w-4 h-4" />
            <span>{isAr ? 'عوامل تصفية لوحة التحكم' : 'Dashboard Filters'}</span>
          </div>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <option value="">{isAr ? 'السنة الدراسية: الكل' : 'Academic Year: All'}</option>
            {dataset.academicYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>

          <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <option value="">{isAr ? 'الفصل الدراسي: الكل' : 'Semester: All'}</option>
            {dataset.semesters.map((s) => <option key={s.id} value={s.id}>{isAr ? s.nameAr : s.nameEn}</option>)}
          </select>

          <select
            value={departmentId}
            disabled={currentUser?.role === 'dept_admin'}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"
          >
            <option value="">{isAr ? 'القسم العلمي: الكل' : 'Department: All'}</option>
            {dataset.departments.map((d) => <option key={d.id} value={d.id}>{isAr ? d.nameAr : d.nameEn}</option>)}
          </select>

          <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <option value="">{isAr ? 'البرنامج الدراسي: الكل' : 'Program: All'}</option>
            {dataset.programs.map((p) => <option key={p.id} value={p.id}>{isAr ? p.nameAr : p.nameEn}</option>)}
          </select>

          <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <option value="">{isAr ? 'الدفعة: الكل' : 'Cohort: All'}</option>
            {dataset.cohorts.map((c) => <option key={c.id} value={c.id}>{isAr ? c.nameAr : c.nameEn}</option>)}
          </select>

          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <option value="">{isAr ? 'المادة الدراسية: الكل' : 'Subject: All'}</option>
            {dataset.subjects.map((s) => <option key={s.id} value={s.id}>{isAr ? s.nameAr : s.nameEn}</option>)}
          </select>

          <select
            value={lecturerId}
            disabled={currentUser?.role === 'lecturer'}
            onChange={(e) => setLecturerId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-50"
          >
            <option value="">{isAr ? 'التدريسي: الكل' : 'Lecturer: All'}</option>
            {dataset.lecturers.map((l) => <option key={l.id} value={l.id}>{isAr ? l.fullNameAr : l.fullNameEn}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-1/2 px-2 py-2 rounded-xl border border-slate-200 bg-white" title={isAr ? 'من تاريخ' : 'Start Date'} />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-1/2 px-2 py-2 rounded-xl border border-slate-200 bg-white" title={isAr ? 'إلى تاريخ' : 'End Date'} />
          </div>
        </div>
      </div>

      {/* 14 KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {kpiCards.map((card, i) => (
          <div key={i} className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-col justify-between">
            <div className="text-xs text-slate-500 font-medium leading-snug">{card.label}</div>
            <div className={`text-2xl font-extrabold font-mono-num mt-2 ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Alerts Summary Row if pending or threshold students exist */}
      {(kpis.pendingApprovals > 0 || kpis.exceedingLimit > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpis.pendingApprovals > 0 && (
            <div className="bg-white border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {isAr ? `يوجد ${kpis.pendingApprovals} محاضرة بانتظار اعتماد الحضور` : `${kpis.pendingApprovals} lecture(s) pending attendance approval`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {isAr ? 'الحسابات النهائية تستثني الجلسات غير المعتمدة.' : 'Finalized metrics exclude unapproved sessions.'}
                  </div>
                </div>
              </div>
              {onNavigate && (
                <button onClick={() => onNavigate('sessions')} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 whitespace-nowrap">
                  {isAr ? 'مراجعة الآن' : 'Review'}
                </button>
              )}
            </div>
          )}
          {kpis.exceedingLimit > 0 && (
            <div className="bg-white border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {isAr ? `${kpis.exceedingLimit} طالب تجاوز الحد الأعلى للغياب (${activePolicy.maxAbsencePercent}%)` : `${kpis.exceedingLimit} student(s) exceeded max absence limit (${activePolicy.maxAbsencePercent}%)`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {isAr ? 'وفق سياسة الغياب المعتمدة حالياً.' : 'Calculated per configured institutional absence policy.'}
                  </div>
                </div>
              </div>
              {onNavigate && (
                <button onClick={() => onNavigate('records')} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 whitespace-nowrap">
                  {isAr ? 'عرض السجلات' : 'View Records'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart (Daily / Weekly / Monthly) */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'اتجاه نسبة الحضور' : 'Attendance Trend'}
            </h3>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              {(['daily', 'weekly', 'monthly'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setTrendMode(m)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    trendMode === m ? 'bg-white text-[#1565C0] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {m === 'daily' ? (isAr ? 'يومي' : 'Daily') : m === 'weekly' ? (isAr ? 'أسبوعي' : 'Weekly') : (isAr ? 'شهري' : 'Monthly')}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {trendData.length === 0 ? (
              <EmptyChart isAr={isAr} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="rate" name={isAr ? 'نسبة الحضور %' : 'Attendance %'} stroke="#1565C0" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Attendance by Department & Academic Hours */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAr ? 'نسبة الحضور والساعات المنجزة حسب القسم' : 'Attendance Rate & Hours by Department'}
          </h3>
          <div className="h-64">
            {deptChartData.length === 0 ? (
              <EmptyChart isAr={isAr} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="rate" name={isAr ? 'نسبة الحضور %' : 'Attendance %'} fill="#2196F3" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="hours" name={isAr ? 'الساعات المنجزة' : 'Completed Hours'} fill="#1565C0" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Masters vs PhD Comparison & Status Distribution */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAr ? 'مقارنة الحضور حسب البرنامج الدراسي (ماجستير / دكتوراه)' : "Attendance by Program (Master's vs PhD)"}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={programComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="present" name={isAr ? 'حضور' : 'Present'} fill="#22C55E" radius={[6, 6, 0, 0]} />
                <Bar dataKey="absent" name={isAr ? 'غياب' : 'Absent'} fill="#EF4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attendance vs Absence Distribution Pie */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAr ? 'توزيع حالات الحضور والغياب المعتمدة' : 'Approved Attendance vs Absence Distribution'}
          </h3>
          <div className="h-64">
            {absenceDistribution.length === 0 ? (
              <EmptyChart isAr={isAr} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={absenceDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                    {absenceDistribution.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Attendance by Subject */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAr ? 'نسبة الحضور حسب المادة الدراسية' : 'Attendance Rate by Subject'}
          </h3>
          <div className="h-64">
            {subjectChartData.length === 0 ? (
              <EmptyChart isAr={isAr} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="rate" name={isAr ? 'الحضور %' : 'Attendance %'} fill="#2196F3" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Lectures by Lecturer */}
        <div className="bg-white border border-blue-100 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAr ? 'إحصاءات المحاضرات حسب التدريسي' : 'Lectures by Lecturer'}
          </h3>
          <div className="h-64">
            {lecturerChartData.length === 0 ? (
              <EmptyChart isAr={isAr} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lecturerChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="scheduled" name={isAr ? 'المجدولة' : 'Scheduled'} fill="#93C5FD" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="approved" name={isAr ? 'المعتمدة' : 'Approved'} fill="#1565C0" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Empty Production Prompt Helper */}
      {dataset.departments.length === 0 && (
        <div className="bg-white border border-blue-200 rounded-2xl p-6 flex items-center gap-4">
          <CheckCircle2 className="w-6 h-6 text-[#1565C0] shrink-0" />
          <div className="text-sm text-slate-700">
            {isAr
              ? 'قاعدة بيانات الإنتاج جاهزة ونظيفة. يمكنك البدء بإضافة الأقسام العلمية والبرامج الدراسية والطلبة يدوياً أو عبر مركز الاستيراد (Excel / CSV).'
              : 'Production Firestore database is initialized and clean. Start adding departments, programs, lecturers, and students manually or via the Import & Export Center.'}
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyChart: React.FC<{ isAr: boolean }> = ({ isAr }) => (
  <div className="h-full flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
    {isAr ? 'لا توجد بيانات معتمدة كافية لعرض الرسم البياني' : 'No finalized records available for chart'}
  </div>
);
