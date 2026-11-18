import React, { useMemo, useState } from 'react';
import { Plus, Search, Edit2, Archive, Download, Users, X, ArrowUpDown } from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { exportToExcel } from '../lib/exportUtils';
import {
  AcademicProgram,
  Department,
  Holiday,
  Lecturer,
  Student,
  Subject,
} from '../types/sgas';

export type AcademicViewTab = 'departments' | 'programs' | 'students' | 'lecturers' | 'subjects' | 'calendar';

export const AcademicModules: React.FC<{ view: AcademicViewTab }> = ({ view }) => {
  const {
    lang,
    t,
    currentUser,
    dataset,
    pushToast,
    saveDepartment,
    saveProgram,
    saveStudent,
    saveLecturer,
    saveSubject,
    saveEnrollment,
    saveAcademicYear,
    saveSemester,
    saveCohort,
    saveHoliday,
  } = useSGAS();

  const isAr = lang === 'ar';
  const canEdit = currentUser?.role === 'super_admin' || currentUser?.role === 'pg_admin';

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState(
    currentUser?.role === 'dept_admin' ? currentUser.departmentId || '' : '',
  );
  const [progFilter, setProgFilter] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modal States
  const [deptModal, setDeptModal] = useState<Partial<Department> | null>(null);
  const [progModal, setProgModal] = useState<Partial<AcademicProgram> | null>(null);
  const [stuModal, setStuModal] = useState<Partial<Student> | null>(null);
  const [lecModal, setLecModal] = useState<Partial<Lecturer> | null>(null);
  const [subModal, setSubModal] = useState<Partial<Subject> | null>(null);
  const [enrollSubject, setEnrollSubject] = useState<Subject | null>(null);
  const [calSubTab, setCalSubTab] = useState<'years' | 'semesters' | 'cohorts' | 'holidays'>('years');
  const [yearModal, setYearModal] = useState<{ id?: string; label: string; startDate: string; endDate: string; isCurrent: boolean } | null>(null);
  const [semModal, setSemModal] = useState<{ id?: string; academicYearId: string; nameAr: string; nameEn: string; semesterNumber: number; startDate: string; endDate: string; isCurrent: boolean } | null>(null);
  const [cohortModal, setCohortModal] = useState<{ id?: string; nameAr: string; nameEn: string; departmentId: string; programId: string; academicYearId: string; admissionYear: string } | null>(null);
  const [holidayModal, setHolidayModal] = useState<Partial<Holiday> | null>(null);
  const [saving, setSaving] = useState(false);

  const deptName = (id: string) => {
    const d = dataset.departments.find((x) => x.id === id);
    return d ? (isAr ? d.nameAr : d.nameEn) : id;
  };
  const progName = (id: string) => {
    const p = dataset.programs.find((x) => x.id === id);
    return p ? (isAr ? p.nameAr : p.nameEn) : id;
  };

  // Filtered & paginated lists
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: any[] = [];

    if (view === 'departments') {
      list = dataset.departments.filter(
        (d) => (!q || d.nameAr.toLowerCase().includes(q) || d.nameEn.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)),
      );
    } else if (view === 'programs') {
      list = dataset.programs.filter(
        (p) =>
          (!deptFilter || p.departmentId === deptFilter) &&
          (!q || p.nameAr.toLowerCase().includes(q) || p.nameEn.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)),
      );
    } else if (view === 'students') {
      list = dataset.students.filter(
        (s) =>
          (!deptFilter || s.departmentId === deptFilter) &&
          (!progFilter || s.programId === progFilter) &&
          (!q ||
            s.fullNameAr.toLowerCase().includes(q) ||
            s.fullNameEn.toLowerCase().includes(q) ||
            s.universityId.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q)),
      );
    } else if (view === 'lecturers') {
      list = dataset.lecturers.filter(
        (l) =>
          (!deptFilter || l.departmentId === deptFilter) &&
          (!q || l.fullNameAr.toLowerCase().includes(q) || l.fullNameEn.toLowerCase().includes(q) || l.lecturerCode.toLowerCase().includes(q)),
      );
    } else if (view === 'subjects') {
      list = dataset.subjects.filter(
        (s) =>
          (!deptFilter || s.departmentId === deptFilter) &&
          (!progFilter || s.programId === progFilter) &&
          (!q || s.nameAr.toLowerCase().includes(q) || s.nameEn.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)),
      );
    }

    list = [...list].sort((a, b) => {
      const av = String(a.nameAr || a.fullNameAr || a.code || '');
      const bv = String(b.nameAr || b.fullNameAr || b.code || '');
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list as Array<Record<string, unknown>>;
  }, [dataset, deptFilter, progFilter, search, sortAsc, view]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const handleSave = async (fn: () => Promise<void>, close: () => void) => {
    setSaving(true);
    try {
      await fn();
      pushToast('success', isAr ? 'تم الحفظ بنجاح' : 'Saved successfully');
      close();
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (view === 'calendar') {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-slate-900">{t.nav.calendar}</h1>
          <div className="flex items-center gap-1 p-1 bg-white border border-blue-100 rounded-xl text-xs">
            {(['years', 'semesters', 'cohorts', 'holidays'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setCalSubTab(tab)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  calSubTab === tab ? 'bg-[#E3F2FD] text-[#1565C0]' : 'text-slate-600'
                }`}
              >
                {tab === 'years'
                  ? isAr ? 'السنوات الدراسية' : 'Academic Years'
                  : tab === 'semesters'
                    ? isAr ? 'الفصول الدراسية' : 'Semesters'
                    : tab === 'cohorts'
                      ? isAr ? 'الدفعات' : 'Cohorts'
                      : isAr ? 'العطل الرسمية' : 'Holidays'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-blue-100 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold text-slate-800">
              {calSubTab === 'years' && (isAr ? 'السنوات الأكاديمية' : 'Academic Years')}
              {calSubTab === 'semesters' && (isAr ? 'الفصول الدراسية' : 'Semesters')}
              {calSubTab === 'cohorts' && (isAr ? 'الدفعات الدراسية' : 'Student Cohorts')}
              {calSubTab === 'holidays' && (isAr ? 'العطل الرسمية والأكاديمية' : 'Official & Academic Holidays')}
            </div>
            {canEdit && (
              <button
                onClick={() => {
                  if (calSubTab === 'years') setYearModal({ label: '2026-2027', startDate: '2026-09-15', endDate: '2027-06-30', isCurrent: true });
                  if (calSubTab === 'semesters') setSemModal({ academicYearId: dataset.academicYears[0]?.id || '', nameAr: 'الفصل الأول', nameEn: 'First Semester', semesterNumber: 1, startDate: '2026-09-15', endDate: '2027-01-30', isCurrent: true });
                  if (calSubTab === 'cohorts') setCohortModal({ nameAr: '', nameEn: '', departmentId: dataset.departments[0]?.id || '', programId: dataset.programs[0]?.id || '', academicYearId: dataset.academicYears[0]?.id || '', admissionYear: '2026' });
                  if (calSubTab === 'holidays') setHolidayModal({ titleAr: '', titleEn: '', startDate: '2026-12-01', endDate: '2026-12-01', type: 'official', isActive: true });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800"
              >
                <Plus className="w-4 h-4" />
                <span>{t.actions.add}</span>
              </button>
            )}
          </div>

          {calSubTab === 'years' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dataset.academicYears.map((y) => (
                <div key={y.id} className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 font-mono-num">{y.label}</div>
                    <div className="text-xs text-slate-500 font-mono-num mt-1">{y.startDate} → {y.endDate}</div>
                  </div>
                  <div className="text-xs font-semibold text-[#1565C0]">
                    {y.isCurrent ? (isAr ? 'السنة الحالية' : 'Current') : (isAr ? 'مؤرشفة' : 'Inactive')}
                  </div>
                </div>
              ))}
              {dataset.academicYears.length === 0 && <EmptyNote isAr={isAr} />}
            </div>
          )}

          {calSubTab === 'semesters' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dataset.semesters.map((s) => (
                <div key={s.id} className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{isAr ? s.nameAr : s.nameEn}</div>
                    <div className="text-xs text-slate-500 font-mono-num mt-1">{s.startDate} → {s.endDate}</div>
                  </div>
                  <div className="text-xs font-semibold text-emerald-700">{s.isCurrent ? (isAr ? 'حالي' : 'Current') : ''}</div>
                </div>
              ))}
              {dataset.semesters.length === 0 && <EmptyNote isAr={isAr} />}
            </div>
          )}

          {calSubTab === 'cohorts' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dataset.cohorts.map((c) => (
                <div key={c.id} className="p-4 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-900">{isAr ? c.nameAr : c.nameEn}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {deptName(c.departmentId)} · {progName(c.programId)}
                  </div>
                </div>
              ))}
              {dataset.cohorts.length === 0 && <EmptyNote isAr={isAr} />}
            </div>
          )}

          {calSubTab === 'holidays' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dataset.holidays.map((h) => (
                <div key={h.id} className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{isAr ? h.titleAr : h.titleEn}</div>
                    <div className="text-xs text-slate-500 font-mono-num mt-1">{h.startDate} → {h.endDate}</div>
                  </div>
                  <span className="text-xs text-amber-700 font-semibold">{h.type}</span>
                </div>
              ))}
              {dataset.holidays.length === 0 && <EmptyNote isAr={isAr} />}
            </div>
          )}
        </div>

        {/* Calendar Modals */}
        {yearModal && (
          <Modal title={isAr ? 'إضافة سنة دراسية' : 'Add Academic Year'} onClose={() => setYearModal(null)}>
            <div className="space-y-3 text-sm">
              <Input label={isAr ? 'تسمية السنة (مثال 2026-2027)' : 'Year Label'} value={yearModal.label} onChange={(v) => setYearModal({ ...yearModal, label: v })} />
              <Input label={isAr ? 'تاريخ البداية' : 'Start Date'} type="date" value={yearModal.startDate} onChange={(v) => setYearModal({ ...yearModal, startDate: v })} />
              <Input label={isAr ? 'تاريخ النهاية' : 'End Date'} type="date" value={yearModal.endDate} onChange={(v) => setYearModal({ ...yearModal, endDate: v })} />
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={yearModal.isCurrent} onChange={(e) => setYearModal({ ...yearModal, isCurrent: e.target.checked })} />
                <span>{isAr ? 'تعيين كسنة دراسية حالية' : 'Set as Current Year'}</span>
              </label>
              <ModalFooter saving={saving} isAr={isAr} onCancel={() => setYearModal(null)} onSave={() => handleSave(() => saveAcademicYear({ ...yearModal, isActive: true }), () => setYearModal(null))} />
            </div>
          </Modal>
        )}
        {semModal && (
          <Modal title={isAr ? 'إضافة فصل دراسي' : 'Add Semester'} onClose={() => setSemModal(null)}>
            <div className="space-y-3 text-sm">
              <Select label={isAr ? 'السنة الدراسية' : 'Academic Year'} value={semModal.academicYearId} onChange={(v) => setSemModal({ ...semModal, academicYearId: v })} options={dataset.academicYears.map((y) => ({ value: y.id, label: y.label }))} />
              <Input label={isAr ? 'الاسم بالعربية' : 'Arabic Name'} value={semModal.nameAr} onChange={(v) => setSemModal({ ...semModal, nameAr: v })} />
              <Input label={isAr ? 'الاسم بالإنجليزية' : 'English Name'} value={semModal.nameEn} onChange={(v) => setSemModal({ ...semModal, nameEn: v })} />
              <Input label={isAr ? 'تاريخ البداية' : 'Start Date'} type="date" value={semModal.startDate} onChange={(v) => setSemModal({ ...semModal, startDate: v })} />
              <Input label={isAr ? 'تاريخ النهاية' : 'End Date'} type="date" value={semModal.endDate} onChange={(v) => setSemModal({ ...semModal, endDate: v })} />
              <ModalFooter saving={saving} isAr={isAr} onCancel={() => setSemModal(null)} onSave={() => handleSave(() => saveSemester({ ...semModal, isActive: true }), () => setSemModal(null))} />
            </div>
          </Modal>
        )}
        {cohortModal && (
          <Modal title={isAr ? 'إضافة دفعة دراسية' : 'Add Cohort'} onClose={() => setCohortModal(null)}>
            <div className="space-y-3 text-sm">
              <Input label={isAr ? 'اسم الدفعة بالعربية' : 'Arabic Name'} value={cohortModal.nameAr} onChange={(v) => setCohortModal({ ...cohortModal, nameAr: v })} />
              <Input label={isAr ? 'اسم الدفعة بالإنجليزية' : 'English Name'} value={cohortModal.nameEn} onChange={(v) => setCohortModal({ ...cohortModal, nameEn: v })} />
              <Select label={isAr ? 'القسم' : 'Department'} value={cohortModal.departmentId} onChange={(v) => setCohortModal({ ...cohortModal, departmentId: v })} options={dataset.departments.map((d) => ({ value: d.id, label: isAr ? d.nameAr : d.nameEn }))} />
              <Select label={isAr ? 'البرنامج' : 'Program'} value={cohortModal.programId} onChange={(v) => setCohortModal({ ...cohortModal, programId: v })} options={dataset.programs.map((p) => ({ value: p.id, label: isAr ? p.nameAr : p.nameEn }))} />
              <Select label={isAr ? 'السنة الدراسية' : 'Academic Year'} value={cohortModal.academicYearId} onChange={(v) => setCohortModal({ ...cohortModal, academicYearId: v })} options={dataset.academicYears.map((y) => ({ value: y.id, label: y.label }))} />
              <ModalFooter saving={saving} isAr={isAr} onCancel={() => setCohortModal(null)} onSave={() => handleSave(() => saveCohort({ ...cohortModal, isActive: true }), () => setCohortModal(null))} />
            </div>
          </Modal>
        )}
        {holidayModal && (
          <Modal title={isAr ? 'إضافة عطلة رسمية' : 'Add Holiday'} onClose={() => setHolidayModal(null)}>
            <div className="space-y-3 text-sm">
              <Input label={isAr ? 'العنوان بالعربية' : 'Arabic Title'} value={holidayModal.titleAr || ''} onChange={(v) => setHolidayModal({ ...holidayModal, titleAr: v })} />
              <Input label={isAr ? 'العنوان بالإنجليزية' : 'English Title'} value={holidayModal.titleEn || ''} onChange={(v) => setHolidayModal({ ...holidayModal, titleEn: v })} />
              <Input label={isAr ? 'من تاريخ' : 'Start Date'} type="date" value={holidayModal.startDate || ''} onChange={(v) => setHolidayModal({ ...holidayModal, startDate: v })} />
              <Input label={isAr ? 'إلى تاريخ' : 'End Date'} type="date" value={holidayModal.endDate || ''} onChange={(v) => setHolidayModal({ ...holidayModal, endDate: v })} />
              <ModalFooter saving={saving} isAr={isAr} onCancel={() => setHolidayModal(null)} onSave={() => handleSave(() => saveHoliday({ titleAr: holidayModal.titleAr || '', titleEn: holidayModal.titleEn || '', startDate: holidayModal.startDate || '', endDate: holidayModal.endDate || '', type: holidayModal.type || 'official', isActive: true }), () => setHolidayModal(null))} />
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header & Primary Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t.nav[view]}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr ? `إجمالي السجلات المطابقة: ${filteredRows.length}` : `Matching records: ${filteredRows.length}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === 'students' && (
            <button
              onClick={() => exportToExcel('sgas_students', 'Students', filteredRows)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
              <span>{t.actions.exportXlsx}</span>
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
                if (view === 'departments') setDeptModal({ code: '', nameAr: '', nameEn: '', adminName: '', isActive: true });
                if (view === 'programs') setProgModal({ code: '', nameAr: '', nameEn: '', degreeType: 'masters', departmentId: dataset.departments[0]?.id || '', totalRequiredHours: 180, isActive: true });
                if (view === 'students') setStuModal({ universityId: '', fullNameAr: '', fullNameEn: '', email: '', phone: '', departmentId: dataset.departments[0]?.id || '', programId: dataset.programs[0]?.id || '', enrollmentStatus: 'enrolled', accountStatus: 'active' });
                if (view === 'lecturers') setLecModal({ lecturerCode: '', fullNameAr: '', fullNameEn: '', academicTitleAr: 'أستاذ مساعد دكتور', email: '', departmentId: dataset.departments[0]?.id || '', accountStatus: 'active' });
                if (view === 'subjects') setSubModal({ code: '', nameAr: '', nameEn: '', departmentId: dataset.departments[0]?.id || '', programId: dataset.programs[0]?.id || '', subjectType: 'mandatory', weeklyHours: 3, totalPlannedHours: 45, lecturerIds: [], isActive: true });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800"
            >
              <Plus className="w-4 h-4" />
              <span>{t.actions.add}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-2.5 start-3" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t.actions.search}
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#2196F3]"
          />
        </div>
        {view !== 'departments' && (
          <select
            value={deptFilter}
            disabled={currentUser?.role === 'dept_admin'}
            onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="">{isAr ? 'جميع الأقسام' : 'All Departments'}</option>
            {dataset.departments.map((d) => <option key={d.id} value={d.id}>{isAr ? d.nameAr : d.nameEn}</option>)}
          </select>
        )}
        {(view === 'students' || view === 'subjects') && (
          <select
            value={progFilter}
            onChange={(e) => { setProgFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="">{isAr ? 'جميع البرامج' : 'All Programs'}</option>
            {dataset.programs.map((p) => <option key={p.id} value={p.id}>{isAr ? p.nameAr : p.nameEn}</option>)}
          </select>
        )}
        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>{isAr ? 'ترتيب أبجدي' : 'Sort'}</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
              {view === 'departments' && (
                <tr>
                  <th className="p-3 text-start">{isAr ? 'الرمز' : 'Code'}</th>
                  <th className="p-3 text-start">{isAr ? 'الاسم بالعربية' : 'Arabic Name'}</th>
                  <th className="p-3 text-start">{isAr ? 'الاسم بالإنجليزية' : 'English Name'}</th>
                  <th className="p-3 text-start">{isAr ? 'مشرف القسم' : 'Dept Admin'}</th>
                  <th className="p-3 text-start">{t.common.status}</th>
                  {canEdit && <th className="p-3 text-end">{t.common.actions}</th>}
                </tr>
              )}
              {view === 'programs' && (
                <tr>
                  <th className="p-3 text-start">{isAr ? 'الرمز' : 'Code'}</th>
                  <th className="p-3 text-start">{isAr ? 'البرنامج' : 'Program'}</th>
                  <th className="p-3 text-start">{isAr ? 'الدرجة' : 'Degree'}</th>
                  <th className="p-3 text-start">{isAr ? 'القسم' : 'Department'}</th>
                  <th className="p-3 text-start">{isAr ? 'الساعات المطلوبة' : 'Req. Hours'}</th>
                  {canEdit && <th className="p-3 text-end">{t.common.actions}</th>}
                </tr>
              )}
              {view === 'students' && (
                <tr>
                  <th className="p-3 text-start">{isAr ? 'الرقم الجامعي' : 'Univ. ID'}</th>
                  <th className="p-3 text-start">{isAr ? 'الاسم الكامل' : 'Full Name'}</th>
                  <th className="p-3 text-start">{isAr ? 'القسم والبرنامج' : 'Dept & Program'}</th>
                  <th className="p-3 text-start">{isAr ? 'البريد الجامعي' : 'Email'}</th>
                  <th className="p-3 text-start">{t.common.status}</th>
                  {canEdit && <th className="p-3 text-end">{t.common.actions}</th>}
                </tr>
              )}
              {view === 'lecturers' && (
                <tr>
                  <th className="p-3 text-start">{isAr ? 'الرمز' : 'Code'}</th>
                  <th className="p-3 text-start">{isAr ? 'اللقب والاسم' : 'Title & Name'}</th>
                  <th className="p-3 text-start">{isAr ? 'القسم' : 'Department'}</th>
                  <th className="p-3 text-start">{isAr ? 'البريد الجامعي' : 'Email'}</th>
                  <th className="p-3 text-start">{isAr ? 'بانتظار الاعتماد' : 'Pending'}</th>
                  {canEdit && <th className="p-3 text-end">{t.common.actions}</th>}
                </tr>
              )}
              {view === 'subjects' && (
                <tr>
                  <th className="p-3 text-start">{isAr ? 'الرمز' : 'Code'}</th>
                  <th className="p-3 text-start">{isAr ? 'المادة الدراسية' : 'Subject'}</th>
                  <th className="p-3 text-start">{isAr ? 'القسم والبرنامج' : 'Dept & Program'}</th>
                  <th className="p-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="p-3 text-start">{isAr ? 'ساعات أسبوعية / كلية' : 'Weekly / Total Hrs'}</th>
                  <th className="p-3 text-end">{t.common.actions}</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    {t.common.noData}
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  if (view === 'departments') {
                    const d = row as unknown as Department;
                    return (
                      <tr key={d.id} className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono-num font-semibold text-[#1565C0]">{d.code}</td>
                        <td className="p-3 font-semibold">{d.nameAr}</td>
                        <td className="p-3 text-slate-600">{d.nameEn}</td>
                        <td className="p-3 text-slate-600">{d.adminName || '—'}</td>
                        <td className="p-3">{d.isActive ? t.common.active : t.common.inactive}</td>
                        {canEdit && (
                          <td className="p-3 text-end">
                            <button onClick={() => setDeptModal(d)} className="p-1.5 text-[#1565C0] hover:bg-blue-50 rounded-lg">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }
                  if (view === 'programs') {
                    const p = row as unknown as AcademicProgram;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono-num font-semibold text-[#1565C0]">{p.code}</td>
                        <td className="p-3 font-semibold">{isAr ? p.nameAr : p.nameEn}</td>
                        <td className="p-3">{t.common[p.degreeType]}</td>
                        <td className="p-3 text-slate-600">{deptName(p.departmentId)}</td>
                        <td className="p-3 font-mono-num">{p.totalRequiredHours || 180}</td>
                        {canEdit && (
                          <td className="p-3 text-end">
                            <button onClick={() => setProgModal(p)} className="p-1.5 text-[#1565C0] hover:bg-blue-50 rounded-lg">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }
                  if (view === 'students') {
                    const s = row as unknown as Student;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono-num font-semibold text-[#1565C0]">{s.universityId}</td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-900">{isAr ? s.fullNameAr : s.fullNameEn}</div>
                          <div className="text-[11px] text-slate-400">{isAr ? s.fullNameEn : s.fullNameAr}</div>
                        </td>
                        <td className="p-3 text-slate-600">
                          {deptName(s.departmentId)} · {progName(s.programId)}
                        </td>
                        <td className="p-3 font-mono-num text-slate-600">{s.email}</td>
                        <td className="p-3">{s.enrollmentStatus}</td>
                        {canEdit && (
                          <td className="p-3 text-end space-x-1">
                            <button onClick={() => setStuModal(s)} className="p-1.5 text-[#1565C0] hover:bg-blue-50 rounded-lg" title={t.actions.edit}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => saveStudent({ ...s, enrollmentStatus: 'archived', accountStatus: 'disabled' })}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                              title={t.actions.archive}
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }
                  if (view === 'lecturers') {
                    const l = row as unknown as Lecturer;
                    const pendingCount = dataset.lectures.filter((lec) => lec.lecturerId === l.id && lec.status === 'pending_approval').length;
                    return (
                      <tr key={l.id} className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono-num font-semibold text-[#1565C0]">{l.lecturerCode}</td>
                        <td className="p-3">
                          <div className="font-semibold">{l.academicTitleAr} {isAr ? l.fullNameAr : l.fullNameEn}</div>
                        </td>
                        <td className="p-3 text-slate-600">{deptName(l.departmentId)}</td>
                        <td className="p-3 font-mono-num text-slate-600">{l.email}</td>
                        <td className="p-3 font-mono-num font-bold text-amber-700">{pendingCount}</td>
                        {canEdit && (
                          <td className="p-3 text-end">
                            <button onClick={() => setLecModal(l)} className="p-1.5 text-[#1565C0] hover:bg-blue-50 rounded-lg">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }
                  const sub = row as unknown as Subject;
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono-num font-semibold text-[#1565C0]">{sub.code}</td>
                      <td className="p-3 font-semibold">{isAr ? sub.nameAr : sub.nameEn}</td>
                      <td className="p-3 text-slate-600">{deptName(sub.departmentId)} · {progName(sub.programId)}</td>
                      <td className="p-3">{t.common[sub.subjectType]}</td>
                      <td className="p-3 font-mono-num">{sub.weeklyHours} / {sub.totalPlannedHours}</td>
                      <td className="p-3 text-end space-x-1">
                        {canEdit && (
                          <>
                            <button onClick={() => setEnrollSubject(sub)} className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg" title={isAr ? 'تسجيل الطلبة' : 'Enroll Students'}>
                              <Users className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setSubModal(sub)} className="p-1.5 text-[#1565C0] hover:bg-blue-50 rounded-lg" title={t.actions.edit}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-blue-100 flex items-center justify-between text-xs text-slate-600">
            <span>{isAr ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}</span>
            <div className="flex gap-1.5">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">
                {isAr ? 'السابق' : 'Prev'}
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Entity Modals */}
      {deptModal && (
        <Modal title={deptModal.id ? (isAr ? 'تعديل قسم علمي' : 'Edit Department') : (isAr ? 'إضافة قسم علمي' : 'Add Department')} onClose={() => setDeptModal(null)}>
          <div className="space-y-3 text-sm">
            <Input label={isAr ? 'رمز القسم (أحرف وأرقام إنجليزية)' : 'Department Code'} value={deptModal.code || ''} onChange={(v) => setDeptModal({ ...deptModal, code: v })} />
            <Input label={isAr ? 'اسم القسم بالعربية' : 'Arabic Name'} value={deptModal.nameAr || ''} onChange={(v) => setDeptModal({ ...deptModal, nameAr: v })} />
            <Input label={isAr ? 'اسم القسم بالإنجليزية' : 'English Name'} value={deptModal.nameEn || ''} onChange={(v) => setDeptModal({ ...deptModal, nameEn: v })} />
            <Input label={isAr ? 'اسم مشرف القسم' : 'Department Admin Name'} value={deptModal.adminName || ''} onChange={(v) => setDeptModal({ ...deptModal, adminName: v })} />
            <ModalFooter saving={saving} isAr={isAr} onCancel={() => setDeptModal(null)} onSave={() => handleSave(() => saveDepartment({ ...deptModal, code: deptModal.code || '', nameAr: deptModal.nameAr || '', nameEn: deptModal.nameEn || '' }), () => setDeptModal(null))} />
          </div>
        </Modal>
      )}

      {progModal && (
        <Modal title={isAr ? 'بيانات البرنامج الدراسي' : 'Academic Program'} onClose={() => setProgModal(null)}>
          <div className="space-y-3 text-sm">
            <Input label={isAr ? 'رمز البرنامج' : 'Program Code'} value={progModal.code || ''} onChange={(v) => setProgModal({ ...progModal, code: v })} />
            <Input label={isAr ? 'الاسم بالعربية' : 'Arabic Name'} value={progModal.nameAr || ''} onChange={(v) => setProgModal({ ...progModal, nameAr: v })} />
            <Input label={isAr ? 'الاسم بالإنجليزية' : 'English Name'} value={progModal.nameEn || ''} onChange={(v) => setProgModal({ ...progModal, nameEn: v })} />
            <Select label={isAr ? 'القسم العلمي' : 'Department'} value={progModal.departmentId || ''} onChange={(v) => setProgModal({ ...progModal, departmentId: v })} options={dataset.departments.map((d) => ({ value: d.id, label: isAr ? d.nameAr : d.nameEn }))} />
            <Select label={isAr ? 'الدرجة العلمية' : 'Degree Type'} value={progModal.degreeType || 'masters'} onChange={(v) => setProgModal({ ...progModal, degreeType: v as AcademicProgram['degreeType'] })} options={[{ value: 'masters', label: t.common.masters }, { value: 'phd', label: t.common.phd }, { value: 'diploma', label: t.common.diploma }]} />
            <Input label={isAr ? 'إجمالي الساعات المطلوبة' : 'Total Required Hours'} type="number" value={String(progModal.totalRequiredHours || 180)} onChange={(v) => setProgModal({ ...progModal, totalRequiredHours: Number(v) })} />
            <ModalFooter saving={saving} isAr={isAr} onCancel={() => setProgModal(null)} onSave={() => handleSave(() => saveProgram({ ...progModal, code: progModal.code || '', nameAr: progModal.nameAr || '', nameEn: progModal.nameEn || '', degreeType: progModal.degreeType || 'masters', departmentId: progModal.departmentId || '' }), () => setProgModal(null))} />
          </div>
        </Modal>
      )}

      {stuModal && (
        <Modal title={isAr ? 'بيانات طالب الدراسات العليا' : 'Graduate Student'} onClose={() => setStuModal(null)}>
          <div className="space-y-3 text-sm">
            <Input label={isAr ? 'الرقم الجامعي الفريد' : 'University Registration ID'} value={stuModal.universityId || ''} onChange={(v) => setStuModal({ ...stuModal, universityId: v })} />
            <Input label={isAr ? 'الاسم الكامل بالعربية' : 'Full Arabic Name'} value={stuModal.fullNameAr || ''} onChange={(v) => setStuModal({ ...stuModal, fullNameAr: v })} />
            <Input label={isAr ? 'الاسم الكامل بالإنجليزية' : 'Full English Name'} value={stuModal.fullNameEn || ''} onChange={(v) => setStuModal({ ...stuModal, fullNameEn: v })} />
            <Input label={isAr ? 'البريد الإلكتروني الجامعي' : 'University Email'} type="email" value={stuModal.email || ''} onChange={(v) => setStuModal({ ...stuModal, email: v })} />
            <Input label={isAr ? 'رقم الهاتف (اختياري)' : 'Phone (Optional)'} value={stuModal.phone || ''} onChange={(v) => setStuModal({ ...stuModal, phone: v })} />
            <Select label={isAr ? 'القسم العلمي' : 'Department'} value={stuModal.departmentId || ''} onChange={(v) => setStuModal({ ...stuModal, departmentId: v })} options={dataset.departments.map((d) => ({ value: d.id, label: isAr ? d.nameAr : d.nameEn }))} />
            <Select label={isAr ? 'البرنامج الدراسي' : 'Program'} value={stuModal.programId || ''} onChange={(v) => setStuModal({ ...stuModal, programId: v })} options={dataset.programs.map((p) => ({ value: p.id, label: isAr ? p.nameAr : p.nameEn }))} />
            <ModalFooter saving={saving} isAr={isAr} onCancel={() => setStuModal(null)} onSave={() => handleSave(() => saveStudent({ ...stuModal, universityId: stuModal.universityId || '', fullNameAr: stuModal.fullNameAr || '', fullNameEn: stuModal.fullNameEn || '', email: stuModal.email || '', departmentId: stuModal.departmentId || '', programId: stuModal.programId || '' }), () => setStuModal(null))} />
          </div>
        </Modal>
      )}

      {lecModal && (
        <Modal title={isAr ? 'بيانات التدريسي' : 'Lecturer'} onClose={() => setLecModal(null)}>
          <div className="space-y-3 text-sm">
            <Input label={isAr ? 'رمز التدريسي' : 'Lecturer Code'} value={lecModal.lecturerCode || ''} onChange={(v) => setLecModal({ ...lecModal, lecturerCode: v })} />
            <Input label={isAr ? 'اللقب العلمي' : 'Academic Title'} value={lecModal.academicTitleAr || ''} onChange={(v) => setLecModal({ ...lecModal, academicTitleAr: v })} />
            <Input label={isAr ? 'الاسم بالعربية' : 'Full Arabic Name'} value={lecModal.fullNameAr || ''} onChange={(v) => setLecModal({ ...lecModal, fullNameAr: v })} />
            <Input label={isAr ? 'الاسم بالإنجليزية' : 'Full English Name'} value={lecModal.fullNameEn || ''} onChange={(v) => setLecModal({ ...lecModal, fullNameEn: v })} />
            <Input label={isAr ? 'البريد الإلكتروني الجامعي' : 'University Email'} type="email" value={lecModal.email || ''} onChange={(v) => setLecModal({ ...lecModal, email: v })} />
            <Select label={isAr ? 'القسم العلمي' : 'Department'} value={lecModal.departmentId || ''} onChange={(v) => setLecModal({ ...lecModal, departmentId: v })} options={dataset.departments.map((d) => ({ value: d.id, label: isAr ? d.nameAr : d.nameEn }))} />
            <ModalFooter saving={saving} isAr={isAr} onCancel={() => setLecModal(null)} onSave={() => handleSave(() => saveLecturer({ ...lecModal, lecturerCode: lecModal.lecturerCode || '', fullNameAr: lecModal.fullNameAr || '', fullNameEn: lecModal.fullNameEn || '', academicTitleAr: lecModal.academicTitleAr || '', email: lecModal.email || '', departmentId: lecModal.departmentId || '' }), () => setLecModal(null))} />
          </div>
        </Modal>
      )}

      {subModal && (
        <Modal title={isAr ? 'بيانات المادة الدراسية' : 'Academic Subject'} onClose={() => setSubModal(null)}>
          <div className="space-y-3 text-sm">
            <Input label={isAr ? 'رمز المادة' : 'Subject Code'} value={subModal.code || ''} onChange={(v) => setSubModal({ ...subModal, code: v })} />
            <Input label={isAr ? 'اسم المادة بالعربية' : 'Arabic Name'} value={subModal.nameAr || ''} onChange={(v) => setSubModal({ ...subModal, nameAr: v })} />
            <Input label={isAr ? 'اسم المادة بالإنجليزية' : 'English Name'} value={subModal.nameEn || ''} onChange={(v) => setSubModal({ ...subModal, nameEn: v })} />
            <Select label={isAr ? 'القسم العلمي' : 'Department'} value={subModal.departmentId || ''} onChange={(v) => setSubModal({ ...subModal, departmentId: v })} options={dataset.departments.map((d) => ({ value: d.id, label: isAr ? d.nameAr : d.nameEn }))} />
            <Select label={isAr ? 'البرنامج' : 'Program'} value={subModal.programId || ''} onChange={(v) => setSubModal({ ...subModal, programId: v })} options={dataset.programs.map((p) => ({ value: p.id, label: isAr ? p.nameAr : p.nameEn }))} />
            <Select label={isAr ? 'نوع المادة' : 'Subject Type'} value={subModal.subjectType || 'mandatory'} onChange={(v) => setSubModal({ ...subModal, subjectType: v as Subject['subjectType'] })} options={[{ value: 'mandatory', label: t.common.mandatory }, { value: 'elective', label: t.common.elective }]} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={isAr ? 'الساعات الأسبوعية' : 'Weekly Hours'} type="number" value={String(subModal.weeklyHours || 3)} onChange={(v) => setSubModal({ ...subModal, weeklyHours: Number(v) })} />
              <Input label={isAr ? 'إجمالي الساعات المخططة' : 'Total Planned Hours'} type="number" value={String(subModal.totalPlannedHours || 45)} onChange={(v) => setSubModal({ ...subModal, totalPlannedHours: Number(v) })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{isAr ? 'التدريسيون المكلفون' : 'Assigned Lecturers'}</label>
              <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
                {dataset.lecturers.map((l) => {
                  const checked = subModal.lecturerIds?.includes(l.id) || false;
                  return (
                    <label key={l.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const cur = new Set(subModal.lecturerIds || []);
                          if (e.target.checked) cur.add(l.id);
                          else cur.delete(l.id);
                          const ids = Array.from(cur);
                          const uids = dataset.lecturers.filter((x) => cur.has(x.id) && x.uid).map((x) => x.uid as string);
                          setSubModal({ ...subModal, lecturerIds: ids, lecturerUids: uids });
                        }}
                      />
                      <span>{l.academicTitleAr} {l.fullNameAr}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <ModalFooter saving={saving} isAr={isAr} onCancel={() => setSubModal(null)} onSave={() => handleSave(() => saveSubject({ ...subModal, code: subModal.code || '', nameAr: subModal.nameAr || '', nameEn: subModal.nameEn || '', departmentId: subModal.departmentId || '', programId: subModal.programId || '' }), () => setSubModal(null))} />
          </div>
        </Modal>
      )}

      {/* Enrollment Modal */}
      {enrollSubject && (
        <Modal title={`${isAr ? 'تسجيل الطلبة في مادة:' : 'Subject Enrollments:'} ${isAr ? enrollSubject.nameAr : enrollSubject.nameEn}`} onClose={() => setEnrollSubject(null)}>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {dataset.students
              .filter((s) => s.departmentId === enrollSubject.departmentId)
              .map((stu) => {
                const enrolled = dataset.enrollments.find((e) => e.studentId === stu.id && e.subjectId === enrollSubject.id && e.status === 'active');
                return (
                  <div key={stu.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <div className="font-bold text-slate-800">{isAr ? stu.fullNameAr : stu.fullNameEn}</div>
                      <div className="text-slate-400 font-mono-num">{stu.universityId}</div>
                    </div>
                    <button
                      onClick={() =>
                        saveEnrollment({
                          id: enrolled?.id,
                          studentId: stu.id,
                          studentUid: stu.uid || '',
                          subjectId: enrollSubject.id,
                          departmentId: enrollSubject.departmentId,
                          programId: enrollSubject.programId,
                          status: enrolled ? 'dropped' : 'active',
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg font-semibold ${
                        enrolled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[#1565C0] text-white'
                      }`}
                    >
                      {enrolled ? (isAr ? 'مسجل (انقر للإلغاء)' : 'Enrolled') : (isAr ? 'تسجيل بالمادة' : 'Enroll')}
                    </button>
                  </div>
                );
              })}
          </div>
        </Modal>
      )}
    </div>
  );
};

const EmptyNote: React.FC<{ isAr: boolean }> = ({ isAr }) => (
  <div className="col-span-full p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
    {isAr ? 'لا توجد عناصر مسجلة حالياً' : 'No entries recorded yet'}
  </div>
);

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
    <div className="bg-white rounded-2xl border border-blue-100 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
        <h3 className="font-bold text-base text-slate-900">{title}</h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
      </div>
      {children}
    </div>
  </div>
);

const Input: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#2196F3]"
    />
  </div>
);

const Select: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white">
      <option value="">—</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const ModalFooter: React.FC<{ saving: boolean; isAr: boolean; onCancel: () => void; onSave: () => void }> = ({ saving, isAr, onCancel, onSave }) => (
  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
    <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
      {isAr ? 'إلغاء' : 'Cancel'}
    </button>
    <button disabled={saving} onClick={onSave} className="px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50">
      {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
    </button>
  </div>
);
