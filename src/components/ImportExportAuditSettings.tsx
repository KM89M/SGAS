import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Download,
  Bell,
  ShieldCheck,
  Settings,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  DatabaseBackup,
} from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { calculateStudentAttendance, DEFAULT_POLICY } from '../lib/attendanceMath';
import { downloadTemplateExcel, exportToExcel } from '../lib/exportUtils';
import { INSTITUTION } from '../lib/i18n';
import { AttendancePolicy, SystemSetting, UserAccount, UserRole } from '../types/sgas';

export const ImportExportView: React.FC = () => {
  const {
    lang,
    t,
    dataset,
    pushToast,
    saveDepartment,
    saveProgram,
    bulkSaveStudents,
    saveLecturer,
    saveSubject,
    saveEnrollment,
    bulkCreateLectures,
    restoreFromBackup,
  } = useSGAS();

  const isAr = lang === 'ar';
  const [entityType, setEntityType] = useState<'students' | 'departments' | 'programs' | 'lecturers' | 'subjects' | 'enrollments' | 'schedules'>('students');
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    setRawRows(rows);

    const errors: string[] = [];
    const seenIds = new Set(dataset.students.map((s) => s.universityId.toLowerCase()));
    rows.forEach((r, idx) => {
      if (entityType === 'students') {
        const uid = String(r.universityId || '').trim();
        if (!uid) errors.push(`${isAr ? 'صف' : 'Row'} ${idx + 2}: Missing universityId`);
        else if (seenIds.has(uid.toLowerCase())) errors.push(`${isAr ? 'صف' : 'Row'} ${idx + 2}: Duplicate universityId (${uid})`);
        if (!r.fullNameAr) errors.push(`${isAr ? 'صف' : 'Row'} ${idx + 2}: Missing fullNameAr`);
      }
    });
    setValidationErrors(errors);
  };

  const commitImport = async () => {
    if (rawRows.length === 0) return;
    setImporting(true);
    try {
      let imported = 0;
      if (entityType === 'departments') {
        for (const r of rawRows) {
          await saveDepartment({
            code: String(r.code || ''),
            nameAr: String(r.nameAr || ''),
            nameEn: String(r.nameEn || r.nameAr || ''),
            adminName: String(r.adminName || ''),
          });
          imported++;
        }
      } else if (entityType === 'programs') {
        for (const r of rawRows) {
          const dept = dataset.departments.find((d) => d.code === String(r.departmentCode || '')) || dataset.departments[0];
          if (!dept) continue;
          await saveProgram({
            code: String(r.code || ''),
            nameAr: String(r.nameAr || ''),
            nameEn: String(r.nameEn || ''),
            degreeType: (String(r.degreeType || 'masters') as 'masters' | 'phd' | 'diploma'),
            departmentId: dept.id,
            totalRequiredHours: Number(r.totalRequiredHours) || 180,
          });
          imported++;
        }
      } else if (entityType === 'students') {
        const validPayload = rawRows
          .filter((r) => r.universityId && r.fullNameAr)
          .map((r) => {
            const dept = dataset.departments.find((d) => d.code === String(r.departmentCode || '')) || dataset.departments[0];
            const prog = dataset.programs.find((p) => p.code === String(r.programCode || '')) || dataset.programs[0];
            return {
              universityId: String(r.universityId),
              fullNameAr: String(r.fullNameAr),
              fullNameEn: String(r.fullNameEn || r.fullNameAr),
              email: String(r.email || `${r.universityId}@mtu.edu.iq`),
              phone: String(r.phone || ''),
              departmentId: dept?.id || '',
              programId: prog?.id || '',
            };
          });
        imported = await bulkSaveStudents(validPayload);
      } else if (entityType === 'lecturers') {
        for (const r of rawRows) {
          const dept = dataset.departments.find((d) => d.code === String(r.departmentCode || '')) || dataset.departments[0];
          if (!dept || !r.lecturerCode || !r.fullNameAr) continue;
          await saveLecturer({
            lecturerCode: String(r.lecturerCode),
            fullNameAr: String(r.fullNameAr),
            fullNameEn: String(r.fullNameEn || r.fullNameAr),
            academicTitleAr: String(r.academicTitleAr || 'مدرس'),
            email: String(r.email || `${r.lecturerCode}@mtu.edu.iq`),
            departmentId: dept.id,
          });
          imported++;
        }
      } else if (entityType === 'subjects') {
        for (const r of rawRows) {
          const dept = dataset.departments.find((d) => d.code === String(r.departmentCode || '')) || dataset.departments[0];
          const prog = dataset.programs.find((p) => p.code === String(r.programCode || '')) || dataset.programs[0];
          if (!dept || !prog || !r.code || !r.nameAr) continue;
          await saveSubject({
            code: String(r.code),
            nameAr: String(r.nameAr),
            nameEn: String(r.nameEn || r.nameAr),
            departmentId: dept.id,
            programId: prog.id,
            weeklyHours: Number(r.weeklyHours) || 2,
            totalPlannedHours: Number(r.totalPlannedHours) || 30,
          });
          imported++;
        }
      } else if (entityType === 'enrollments') {
        for (const r of rawRows) {
          const stu = dataset.students.find((s) => s.universityId === String(r.universityId || ''));
          const sub = dataset.subjects.find((s) => s.code === String(r.subjectCode || ''));
          if (!stu || !sub) continue;
          await saveEnrollment({
            studentId: stu.id,
            studentUid: stu.uid || '',
            subjectId: sub.id,
            departmentId: stu.departmentId,
            programId: stu.programId,
            status: 'active',
          });
          imported++;
        }
      } else if (entityType === 'schedules') {
        const items = rawRows
          .map((r) => {
            const sub = dataset.subjects.find((s) => s.code === String(r.subjectCode || ''));
            const lec = dataset.lecturers.find((l) => l.lecturerCode === String(r.lecturerCode || ''));
            if (!sub || !lec) return null;
            return {
              departmentId: sub.departmentId,
              programId: sub.programId,
              subjectId: sub.id,
              lecturerId: lec.id,
              lectureDate: String(r.lectureDate || ''),
              startTime: String(r.startTime || '09:00'),
              endTime: String(r.endTime || '11:00'),
              classroom: String(r.classroom || 'قاعة 1'),
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));
        imported = await bulkCreateLectures(items);
      }

      pushToast('success', isAr ? `تم استيراد ${imported} سجل بنجاح` : `Successfully imported ${imported} records`);
      setRawRows([]);
      setValidationErrors([]);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadJsonBackup = () => {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sgas_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('success', isAr ? 'تم تنزيل النسخة الاحتياطية الكاملة (JSON)' : 'Full JSON backup downloaded');
  };

  const handleRestoreJson = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await restoreFromBackup(parsed);
      pushToast('success', isAr ? 'تمت استعادة البيانات من النسخة الاحتياطية' : 'Backup restored successfully');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Invalid backup JSON');
    }
  };

  return (
    <div className="space-y-6">
      {/* Excel / CSV Import Section */}
      <div className="bg-white border border-blue-100 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t.nav.import_export}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr
                ? 'استيراد وتصدير البيانات الأكاديمية عبر Excel / CSV مع التحقق المسبق وكشف التكرار.'
                : 'Bulk import & export via Excel/CSV templates with pre-commit validation and duplicate checking.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadTemplateExcel(entityType)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 text-[#1565C0] text-xs font-semibold hover:bg-[#E3F2FD]"
            >
              <Download className="w-4 h-4" />
              <span>{isAr ? 'تحميل قالب Excel' : 'Download Template'}</span>
            </button>
            <button
              onClick={() => exportToExcel(`sgas_students_export`, 'Students', dataset.students, isAr)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
            >
              <Download className="w-4 h-4" />
              <span>{isAr ? 'تصدير جميع الطلبة' : 'Export All Students'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">{isAr ? 'اختر نوع البيانات (7 قوالب)' : 'Entity Template (7)'}</label>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as typeof entityType);
                setRawRows([]);
                setValidationErrors([]);
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
            >
              <option value="students">{t.nav.students}</option>
              <option value="departments">{t.nav.departments}</option>
              <option value="programs">{t.nav.programs}</option>
              <option value="lecturers">{t.nav.lecturers}</option>
              <option value="subjects">{t.nav.subjects}</option>
              <option value="enrollments">{isAr ? 'تسجيل الطلبة بالمواد' : 'Student Enrollments'}</option>
              <option value="schedules">{t.nav.schedules}</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">{isAr ? 'رفع ملف XLSX أو CSV' : 'Upload XLSX or CSV'}</label>
            <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-blue-200 bg-[#F5F9FF] text-[#1565C0] font-semibold cursor-pointer hover:bg-blue-50">
              <Upload className="w-4 h-4" />
              <span>{isAr ? 'اختر ملف الاستيراد للمعاينة' : 'Choose Excel/CSV file to preview'}</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>

        {validationErrors.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{isAr ? 'ملاحظات التحقق قبل الاستيراد:' : 'Pre-Import Validation Notes:'}</span>
            </div>
            {validationErrors.slice(0, 8).map((err, i) => (
              <div key={i} className="font-mono-num">{err}</div>
            ))}
          </div>
        )}

        {rawRows.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-700">
              {isAr ? `معاينة الصفوف المقروءة (${rawRows.length} صف):` : `Parsed Preview (${rawRows.length} rows):`}
            </div>
            <div className="overflow-x-auto max-h-56 border border-slate-200 rounded-xl">
              <table className="w-full text-[11px]">
                <thead className="bg-[#F5F9FF] text-slate-600">
                  <tr>
                    {Object.keys(rawRows[0]).map((k) => <th key={k} className="p-2 text-start font-mono-num">{k}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rawRows.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      {Object.keys(rawRows[0]).map((k) => <td key={k} className="p-2">{String(r[k] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                disabled={importing}
                onClick={commitImport}
                className="px-5 py-2.5 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
              >
                {importing ? t.common.loading : isAr ? 'تأكيد وحفظ السجلات الصالحة' : 'Confirm & Commit Valid Rows'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* JSON Backup & Restore */}
      <div className="bg-white border border-blue-100 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <DatabaseBackup className="w-6 h-6 text-[#1565C0]" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'النسخ الاحتياطي والاستعادة الكاملة للنظام (JSON)' : 'Full Institutional JSON Backup & Restore'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAr ? 'حفظ نسخة احتياطية كاملة أو استعادتها بأمان.' : 'Download full dataset snapshot or restore academic catalogs.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={downloadJsonBackup} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800">
            {isAr ? 'تنزيل نسخة احتياطية JSON' : 'Download JSON Backup'}
          </button>
          <label className="px-4 py-2 rounded-xl border border-slate-300 font-semibold text-slate-700 cursor-pointer hover:bg-slate-50">
            <span>{isAr ? 'استعادة من JSON' : 'Restore JSON'}</span>
            <input type="file" accept=".json" className="hidden" onChange={(e) => handleRestoreJson(e.target.files?.[0] || null)} />
          </label>
        </div>
      </div>
    </div>
  );
};

export const NotificationsView: React.FC = () => {
  const { lang, t, currentUser, dataset, activePolicy, markNotificationRead } = useSGAS();
  const isAr = lang === 'ar';
  const role = currentUser?.role || 'student';

  const thresholdAlerts = useMemo(() => {
    let targetStudents = dataset.students;
    if (role === 'student') {
      targetStudents = targetStudents.filter((s) => s.uid === currentUser?.uid || s.id === currentUser?.linkedEntityId);
    } else if (role === 'dept_admin' && currentUser?.departmentId) {
      targetStudents = targetStudents.filter((s) => s.departmentId === currentUser.departmentId);
    }
    return targetStudents
      .map((stu) => ({
        stu,
        calc: calculateStudentAttendance(stu, dataset.lectures, dataset.records, dataset.enrollments, activePolicy),
      }))
      .filter((x) => x.calc.warningLevel !== 'none');
  }, [activePolicy, currentUser, dataset.enrollments, dataset.lectures, dataset.records, dataset.students, role]);

  const notifications = useMemo(() => {
    if (role === 'super_admin' || role === 'pg_admin') return dataset.notifications;
    return dataset.notifications.filter((n) => n.recipientUid === currentUser?.uid);
  }, [currentUser?.uid, dataset.notifications, role]);

  return (
    <div className="space-y-5">
      {/* Automatic Absence Threshold Warnings */}
      <div className="bg-white border border-blue-100 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>{isAr ? 'تنبيهات تجاوز حدود الغياب الآلية' : 'Automated Absence Threshold Warnings'}</span>
        </h2>
        {thresholdAlerts.length === 0 ? (
          <div className="text-xs text-slate-400">{isAr ? 'لا توجد تنبيهات غياب حالياً' : 'No active absence threshold warnings'}</div>
        ) : (
          <div className="space-y-2">
            {thresholdAlerts.map(({ stu, calc }) => (
              <div key={stu.id} className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-slate-900">{isAr ? stu.fullNameAr : stu.fullNameEn}</span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="font-mono-num text-slate-600">{stu.universityId}</span>
                </div>
                <div className="font-bold text-red-700 font-mono-num">
                  {calc.absencePercentage}% ({calc.totalAbsentHours}h {isAr ? 'غياب' : 'absent'})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stored Notifications Feed */}
      <div className="bg-white border border-blue-100 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#1565C0]" />
          <span>{t.nav.notifications}</span>
        </h2>
        {notifications.length === 0 ? (
          <div className="text-xs text-slate-400 py-4">{t.common.noData}</div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                  n.isRead ? 'bg-white border-slate-200 text-slate-600' : 'bg-[#F5F9FF] border-blue-200 text-slate-900'
                }`}
              >
                <div>
                  <div className="font-bold">{isAr ? n.titleAr : n.titleEn}</div>
                  <div className="mt-0.5 text-slate-600">{isAr ? n.bodyAr : n.bodyEn}</div>
                </div>
                {!n.isRead && (
                  <button
                    onClick={() => markNotificationRead(n.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 text-[#1565C0] font-semibold shrink-0 hover:bg-blue-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'مقروء' : 'Mark Read'}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const AuditLogsView: React.FC = () => {
  const { lang, t, dataset } = useSGAS();
  const isAr = lang === 'ar';
  const [subTab, setSubTab] = useState<'audit' | 'ai' | 'reports'>('audit');

  return (
    <div className="space-y-4">
      <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#1565C0]" />
          <span>{t.nav.audit}</span>
        </h1>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-xs">
          <button onClick={() => setSubTab('audit')} className={`px-3 py-1.5 rounded-lg font-semibold ${subTab === 'audit' ? 'bg-white text-[#1565C0]' : 'text-slate-600'}`}>
            {isAr ? `سجل العمليات (${dataset.auditLogs.length})` : `Audit Trail (${dataset.auditLogs.length})`}
          </button>
          <button onClick={() => setSubTab('ai')} className={`px-3 py-1.5 rounded-lg font-semibold ${subTab === 'ai' ? 'bg-white text-[#1565C0]' : 'text-slate-600'}`}>
            {isAr ? `استعلامات المساعد الذكي (${dataset.aiQueryLogs.length})` : `AI Queries (${dataset.aiQueryLogs.length})`}
          </button>
          <button onClick={() => setSubTab('reports')} className={`px-3 py-1.5 rounded-lg font-semibold ${subTab === 'reports' ? 'bg-white text-[#1565C0]' : 'text-slate-600'}`}>
            {isAr ? `تاريخ التقارير (${dataset.reportHistory.length})` : `Report History (${dataset.reportHistory.length})`}
          </button>
        </div>
      </div>

      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          {subTab === 'audit' && (
            <table className="w-full text-xs">
              <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'الإجراء' : 'Action'}</th>
                  <th className="p-3 text-start">{isAr ? 'الهدف' : 'Target'}</th>
                  <th className="p-3 text-start">{isAr ? 'المستخدم والدور' : 'Actor & Role'}</th>
                  <th className="p-3 text-start">{isAr ? 'التفاصيل / السبب' : 'Details / Reason'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.auditLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-mono-num font-bold text-[#1565C0]">{a.action}</td>
                    <td className="p-3 font-mono-num">{a.targetCollection}/{a.targetId}</td>
                    <td className="p-3">{a.actorEmail || a.actorUid} · {a.actorRole}</td>
                    <td className="p-3 text-slate-600 max-w-md truncate">{a.reason || a.newSummary || '—'}</td>
                  </tr>
                ))}
                {dataset.auditLogs.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">{t.common.noData}</td></tr>}
              </tbody>
            </table>
          )}

          {subTab === 'ai' && (
            <table className="w-full text-xs">
              <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'السؤال' : 'Query'}</th>
                  <th className="p-3 text-start">{isAr ? 'النموذج' : 'Model'}</th>
                  <th className="p-3 text-start">{isAr ? 'الوظائف المستدعاة' : 'Tools Called'}</th>
                  <th className="p-3 text-start">{t.common.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.aiQueryLogs.map((q) => (
                  <tr key={q.id}>
                    <td className="p-3 font-medium">{q.queryText}</td>
                    <td className="p-3 font-mono-num">{q.modelUsed}</td>
                    <td className="p-3 font-mono-num text-slate-600">{q.toolsCalled?.join(', ') || '—'}</td>
                    <td className="p-3 font-bold">{q.status}</td>
                  </tr>
                ))}
                {dataset.aiQueryLogs.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">{t.common.noData}</td></tr>}
              </tbody>
            </table>
          )}

          {subTab === 'reports' && (
            <table className="w-full text-xs">
              <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'التقرير' : 'Report'}</th>
                  <th className="p-3 text-start">{isAr ? 'الصيغة' : 'Format'}</th>
                  <th className="p-3 text-start">{isAr ? 'الفترة' : 'Period'}</th>
                  <th className="p-3 text-start">{isAr ? 'عدد الصفوف' : 'Rows'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.reportHistory.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-semibold">{isAr ? r.titleAr : r.titleEn || r.titleAr}</td>
                    <td className="p-3 font-mono-num uppercase">{r.format}</td>
                    <td className="p-3 font-mono-num">{r.periodLabel || '—'}</td>
                    <td className="p-3 font-mono-num">{r.recordCount}</td>
                  </tr>
                ))}
                {dataset.reportHistory.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">{t.common.noData}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const {
    lang,
    t,
    dataset,
    activePolicy,
    pushToast,
    saveSystemSettings,
    saveAttendancePolicy,
    createUserInvite,
    updateUserAccountStatus,
  } = useSGAS();

  const isAr = lang === 'ar';

  const [sysForm, setSysForm] = useState<SystemSetting>({
    id: 'default',
    universityNameAr: dataset.settings?.universityNameAr || INSTITUTION.universityAr,
    universityNameEn: dataset.settings?.universityNameEn || INSTITUTION.universityEn,
    collegeNameAr: dataset.settings?.collegeNameAr || INSTITUTION.collegeAr,
    collegeNameEn: dataset.settings?.collegeNameEn || INSTITUTION.collegeEn,
    departmentTitleAr: dataset.settings?.departmentTitleAr || INSTITUTION.departmentAr,
    departmentTitleEn: dataset.settings?.departmentTitleEn || INSTITUTION.departmentEn,
    universityLogoUrl: dataset.settings?.universityLogoUrl || '',
    collegeLogoUrl: dataset.settings?.collegeLogoUrl || '',
    timezone: 'Asia/Baghdad',
    defaultLanguage: dataset.settings?.defaultLanguage || 'ar',
  });

  const [policyForm, setPolicyForm] = useState<AttendancePolicy>({ ...DEFAULT_POLICY, ...activePolicy });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('student');
  const [inviteNameAr, setInviteNameAr] = useState('');
  const [inviteDeptId, setInviteDeptId] = useState('');
  const [inviteLinkedId, setInviteLinkedId] = useState('');

  const handleSaveSettings = async () => {
    await saveSystemSettings(sysForm);
    pushToast('success', isAr ? 'تم حفظ إعدادات المؤسسة والشعارات' : 'Institutional settings saved');
  };

  const handleSavePolicy = async () => {
    await saveAttendancePolicy(policyForm);
    pushToast('success', isAr ? 'تم تحديث سياسة الغياب والساعات الأكاديمية' : 'Attendance policy updated');
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteNameAr.trim()) {
      pushToast('warning', isAr ? 'البريد الإلكتروني والاسم مطلوبان' : 'Email and Arabic name required');
      return;
    }
    await createUserInvite({
      email: inviteEmail,
      role: inviteRole,
      displayNameAr: inviteNameAr,
      departmentId: inviteDeptId || undefined,
      linkedEntityId: inviteLinkedId || undefined,
    });
    setInviteEmail('');
    setInviteNameAr('');
    setInviteLinkedId('');
    pushToast('success', isAr ? 'تم إنشاء الدعوة المؤسسية وتخصيص الصلاحية' : 'Institutional invite created');
  };

  return (
    <div className="space-y-6">
      {/* Institutional Branding */}
      <div className="bg-white border border-blue-100 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#1565C0]" />
            <span>{isAr ? 'الهوية المؤسسية والشعارات الرسمية القابلة للرفع' : 'Institutional Branding & Configurable Logos'}</span>
          </h2>
          <button onClick={handleSaveSettings} className="px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800">
            {t.actions.save}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <Field label={isAr ? 'اسم الجامعة (عربي)' : 'University Name (AR)'} value={sysForm.universityNameAr} onChange={(v) => setSysForm({ ...sysForm, universityNameAr: v })} />
          <Field label={isAr ? 'اسم الجامعة (إنجليزي)' : 'University Name (EN)'} value={sysForm.universityNameEn} onChange={(v) => setSysForm({ ...sysForm, universityNameEn: v })} />
          <Field label={isAr ? 'اسم الكلية (عربي)' : 'College Name (AR)'} value={sysForm.collegeNameAr} onChange={(v) => setSysForm({ ...sysForm, collegeNameAr: v })} />
          <Field label={isAr ? 'اسم الكلية (إنجليزي)' : 'College Name (EN)'} value={sysForm.collegeNameEn} onChange={(v) => setSysForm({ ...sysForm, collegeNameEn: v })} />
          <Field label={isAr ? 'رابط شعار الجامعة الرسمي (اختياري)' : 'Official University Logo URL'} value={sysForm.universityLogoUrl || ''} onChange={(v) => setSysForm({ ...sysForm, universityLogoUrl: v })} />
          <Field label={isAr ? 'رابط شعار الكلية الرسمي (اختياري)' : 'Official College Logo URL'} value={sysForm.collegeLogoUrl || ''} onChange={(v) => setSysForm({ ...sysForm, collegeLogoUrl: v })} />
        </div>
      </div>

      {/* Absence Policy & Academic Hour Configuration */}
      <div className="bg-white border border-blue-100 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900">
            {isAr ? 'سياسة الغياب والساعات الأكاديمية ومؤقت QR' : 'Absence Threshold Policy & Academic Hours'}
          </h2>
          <button onClick={handleSavePolicy} className="px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800">
            {t.actions.save}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <NumField label={isAr ? 'الحد الأقصى للغياب (%)' : 'Max Absence (%)'} value={policyForm.maxAbsencePercent} onChange={(v) => setPolicyForm({ ...policyForm, maxAbsencePercent: v })} />
          <NumField label={isAr ? 'الإنذار الأول (%)' : '1st Warning (%)'} value={policyForm.firstWarningPercent} onChange={(v) => setPolicyForm({ ...policyForm, firstWarningPercent: v })} />
          <NumField label={isAr ? 'الإنذار الثاني (%)' : '2nd Warning (%)'} value={policyForm.secondWarningPercent} onChange={(v) => setPolicyForm({ ...policyForm, secondWarningPercent: v })} />
          <NumField label={isAr ? 'الحد الحرج (%)' : 'Critical (%)'} value={policyForm.criticalWarningPercent} onChange={(v) => setPolicyForm({ ...policyForm, criticalWarningPercent: v })} />
          <NumField label={isAr ? 'مدة الساعة الأكاديمية (دقيقة)' : 'Academic Hour (mins)'} value={policyForm.academicHourMinutes} onChange={(v) => setPolicyForm({ ...policyForm, academicHourMinutes: v })} />
          <NumField label={isAr ? 'تبديل رمز QR (ثانية)' : 'QR Rotation (secs)'} value={policyForm.defaultQrRotationSeconds} onChange={(v) => setPolicyForm({ ...policyForm, defaultQrRotationSeconds: v })} />
          <NumField label={isAr ? 'وزن التأخير (0.5 أو 1)' : 'Late Fraction (0.5 / 1)'} value={policyForm.lateCountsAsFraction ?? 1} step="0.5" onChange={(v) => setPolicyForm({ ...policyForm, lateCountsAsFraction: v })} />
          <label className="flex items-center gap-2 p-3 rounded-xl bg-[#F5F9FF] border border-blue-100 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(policyForm.excusedCountsTowardAttendance)}
              onChange={(e) => setPolicyForm({ ...policyForm, excusedCountsTowardAttendance: e.target.checked })}
            />
            <span>{isAr ? 'احتساب الغياب بعذر كحضور' : 'Excused Counts Attended'}</span>
          </label>
        </div>
      </div>

      {/* RBAC & Institutional User Invitations */}
      <div className="bg-white border border-blue-100 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#1565C0]" />
          <span>{isAr ? 'إدارة الصلاحيات ودعوات الحسابات المؤسسية' : 'RBAC & Admin-Provisioned User Invites'}</span>
        </h2>

        <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs items-end">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'البريد الجامعي / Google' : 'Institutional Email'}</label>
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="user@mtu.edu.iq" className="w-full px-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'الاسم الكامل' : 'Display Name'}</label>
            <input value={inviteNameAr} onChange={(e) => setInviteNameAr(e.target.value)} placeholder={isAr ? 'الاسم الكامل' : 'Full Name'} className="w-full px-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'الدور الوظيفي' : 'Assigned Role'}</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="pg_admin">{t.roles.pg_admin}</option>
              <option value="dept_admin">{t.roles.dept_admin}</option>
              <option value="lecturer">{t.roles.lecturer}</option>
              <option value="student">{t.roles.student}</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'ربط بسجل طالب / تدريسي' : 'Link Student/Lecturer'}</label>
            <select value={inviteLinkedId} onChange={(e) => setInviteLinkedId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">{isAr ? 'بدون ربط محدد' : 'Optional Entity Link'}</option>
              {inviteRole === 'student' && dataset.students.map((s) => <option key={s.id} value={s.id}>{s.universityId} · {s.fullNameAr}</option>)}
              {inviteRole === 'lecturer' && dataset.lecturers.map((l) => <option key={l.id} value={l.id}>{l.lecturerCode} · {l.fullNameAr}</option>)}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl bg-[#1565C0] text-white font-semibold hover:bg-blue-800">
            {isAr ? 'إصدار دعوة' : 'Send Invite'}
          </button>
        </form>

        {/* Active Users & Pending Invites */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
          <div>
            <h3 className="font-bold text-slate-800 mb-2">{isAr ? `الدعوات الصادرة (${dataset.invites.length})` : `Issued Invites (${dataset.invites.length})`}</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {dataset.invites.map((inv) => (
                <div key={inv.id} className="p-2.5 rounded-xl bg-[#F5F9FF] border border-blue-100 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{inv.displayNameAr} ({t.roles[inv.role]})</div>
                    <div className="text-[11px] font-mono-num text-slate-500">{inv.email}</div>
                  </div>
                  <span className="font-bold text-[#1565C0]">{inv.status}</span>
                </div>
              ))}
              {dataset.invites.length === 0 && <div className="text-slate-400">{t.common.noData}</div>}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-800 mb-2">{isAr ? `الحسابات المفعلة (${dataset.users.length})` : `Active Accounts (${dataset.users.length})`}</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {dataset.users.map((u: UserAccount) => (
                <div key={u.id} className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{u.displayNameAr} · {t.roles[u.role]}</div>
                    <div className="text-[11px] font-mono-num text-slate-500">{u.email}</div>
                  </div>
                  {u.role !== 'super_admin' && (
                    <button
                      onClick={() => updateUserAccountStatus(u, u.status === 'active' ? 'disabled' : 'active')}
                      className={`px-2.5 py-1 rounded-lg font-semibold ${
                        u.status === 'active' ? 'border border-red-200 text-red-600' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {u.status === 'active' ? (isAr ? 'تعطيل' : 'Disable') : (isAr ? 'تفعيل' : 'Activate')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block font-semibold text-slate-600 mb-1">{label}</label>
    <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200" />
  </div>
);

const NumField: React.FC<{ label: string; value: number; step?: string; onChange: (v: number) => void }> = ({ label, value, step = '1', onChange }) => (
  <div>
    <label className="block font-semibold text-slate-600 mb-1">{label}</label>
    <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono-num" />
  </div>
);
