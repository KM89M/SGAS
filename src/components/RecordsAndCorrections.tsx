import React, { useMemo, useState } from 'react';
import { Lock, ShieldCheck, FileEdit, CheckCircle2, XCircle, Plus, Search } from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { AttendanceCorrection, AttendanceRecord, AttendanceStatus } from '../types/sgas';
import { Modal } from './AcademicModules';

export const RecordsView: React.FC = () => {
  const { lang, t, currentUser, dataset, pushToast, overrideApprovedRecord } = useSGAS();
  const isAr = lang === 'ar';
  const role = currentUser?.role || 'student';
  const canAdminOverride = role === 'super_admin' || role === 'pg_admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState(role === 'dept_admin' ? currentUser?.departmentId || '' : '');
  const [approvalFilter, setApprovalFilter] = useState<'' | 'approved' | 'pending'>('');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [overrideTarget, setOverrideTarget] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatus>('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...dataset.records];

    if (role === 'dept_admin' && currentUser?.departmentId) {
      list = list.filter((r) => r.departmentId === currentUser.departmentId);
    } else if (role === 'lecturer') {
      list = list.filter((r) => r.lecturerUid === currentUser?.uid);
    } else if (role === 'student') {
      list = list.filter((r) => r.studentUid === currentUser?.uid || r.studentId === currentUser?.linkedEntityId);
    }

    return list
      .filter((r) => {
        if (deptFilter && r.departmentId !== deptFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        if (approvalFilter === 'approved' && !r.isApproved) return false;
        if (approvalFilter === 'pending' && r.isApproved) return false;
        if (!q) return true;
        const lec = dataset.lectures.find((l) => l.id === r.lectureId);
        return (
          (r.studentNameAr || '').toLowerCase().includes(q) ||
          (r.studentNameEn || '').toLowerCase().includes(q) ||
          (r.universityId || '').toLowerCase().includes(q) ||
          (lec?.subjectNameAr || '').toLowerCase().includes(q) ||
          (lec?.subjectNameEn || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
  }, [approvalFilter, currentUser, dataset.lectures, dataset.records, deptFilter, role, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleOverride = async () => {
    if (!overrideTarget) return;
    if (!overrideReason.trim()) {
      pushToast('warning', isAr ? 'سبب التعديل الإداري إلزامي للتدقيق' : 'Mandatory audit reason required');
      return;
    }
    setSaving(true);
    try {
      await overrideApprovedRecord(overrideTarget, overrideStatus, overrideReason);
      pushToast('success', isAr ? 'تم تطبيق التعديل الإداري وتوثيقه في سجل التدقيق' : 'Admin override applied and logged');
      setOverrideTarget(null);
      setOverrideReason('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Override failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t.actions.search}
              className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#2196F3]"
            />
          </div>

          {(role === 'super_admin' || role === 'pg_admin') && (
            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="">{isAr ? 'كل الأقسام' : 'All Departments'}</option>
              {dataset.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {isAr ? d.nameAr : d.nameEn}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
            {(['present', 'late', 'excused', 'absent'] as AttendanceStatus[]).map((st) => (
              <option key={st} value={st}>
                {t.statuses[st]}
              </option>
            ))}
          </select>

          <select
            value={approvalFilter}
            onChange={(e) => {
              setApprovalFilter(e.target.value as '' | 'approved' | 'pending');
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="">{isAr ? 'حالة الاعتماد: الكل' : 'Approval: All'}</option>
            <option value="approved">{isAr ? 'معتمد ومقفل' : 'Approved & Locked'}</option>
            <option value="pending">{isAr ? 'بانتظار الاعتماد' : 'Pending Approval'}</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-mono-num">
          {filtered.length} {isAr ? 'سجل' : 'records'}
        </div>
      </div>

      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
              <tr>
                <th className="p-3 text-start">{isAr ? 'الطالب / الرقم الجامعي' : 'Student / ID'}</th>
                <th className="p-3 text-start">{isAr ? 'المادة والتاريخ' : 'Subject & Date'}</th>
                <th className="p-3 text-start">{t.common.status}</th>
                <th className="p-3 text-start">{isAr ? 'الطريقة والتسجيل' : 'Method & Timestamp'}</th>
                <th className="p-3 text-start">{isAr ? 'حالة القفل' : 'Lock Status'}</th>
                {canAdminOverride && <th className="p-3 text-end">{t.common.actions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map((r) => {
                const lec = dataset.lectures.find((l) => l.id === r.lectureId);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">
                        {isAr ? r.studentNameAr || r.studentId : r.studentNameEn || r.studentNameAr || r.studentId}
                      </div>
                      <div className="text-[11px] font-mono-num text-slate-500">{r.universityId || '—'}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-800">
                        {isAr ? lec?.subjectNameAr || r.subjectId : lec?.subjectNameEn || r.subjectId}
                      </div>
                      <div className="text-[11px] font-mono-num text-slate-500">
                        {lec?.lectureDate || '—'} · {lec?.startTime || ''}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-bold ${
                          r.status === 'present'
                            ? 'text-emerald-700'
                            : r.status === 'late'
                              ? 'text-[#1565C0]'
                              : r.status === 'excused'
                                ? 'text-amber-700'
                                : 'text-red-600'
                        }`}
                      >
                        {t.statuses[r.status]}
                      </span>
                      {r.notes && <div className="text-[11px] text-slate-400 mt-0.5 max-w-xs truncate">{r.notes}</div>}
                    </td>
                    <td className="p-3 font-mono-num text-slate-600">
                      <div>{r.method}</div>
                      <div className="text-[11px] text-slate-400">{r.registeredAt ? r.registeredAt.slice(0, 19).replace('T', ' ') : '—'}</div>
                    </td>
                    <td className="p-3">
                      {r.isApproved ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <Lock className="w-3.5 h-3.5" />
                          <span>{isAr ? 'معتمد ومقفل' : 'Approved'}</span>
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">{isAr ? 'بانتظار الاعتماد' : 'Pending'}</span>
                      )}
                    </td>
                    {canAdminOverride && (
                      <td className="p-3 text-end">
                        <button
                          onClick={() => {
                            setOverrideTarget(r);
                            setOverrideStatus(r.status);
                            setOverrideReason('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 text-[#1565C0] hover:bg-[#E3F2FD] font-semibold"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{isAr ? 'تعديل إداري' : 'Admin Override'}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={canAdminOverride ? 6 : 5} className="p-8 text-center text-slate-400">
                    {t.common.noData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="font-mono-num">
            {isAr ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
          </span>
          <div className="flex gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              {isAr ? 'السابق' : 'Prev'}
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              {isAr ? 'التالي' : 'Next'}
            </button>
          </div>
        </div>
      </div>

      {overrideTarget && (
        <Modal
          title={isAr ? 'التعديل الإداري الموثق على سجل الحضور' : 'Audited Admin Attendance Override'}
          onClose={() => setOverrideTarget(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-[#F5F9FF] border border-blue-100">
              <div className="font-bold text-slate-900">
                {isAr ? overrideTarget.studentNameAr : overrideTarget.studentNameEn || overrideTarget.studentNameAr}
              </div>
              <div className="text-slate-500 font-mono-num mt-0.5">
                {overrideTarget.universityId} · {isAr ? 'الحالة الحالية:' : 'Current:'} {t.statuses[overrideTarget.status]}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isAr ? 'الحالة الجديدة' : 'New Status'}
              </label>
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value as AttendanceStatus)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                {(['present', 'late', 'excused', 'absent'] as AttendanceStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {t.statuses[st]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isAr ? 'سبب التعديل الإداري (إلزامي لسجل التدقيق)' : 'Audit Override Reason (Required)'}
              </label>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={isAr ? 'مثال: إجازة مرضية مصادق عليها بكتاب رسمي...' : 'e.g., Official medical leave letter verified...'}
                className="w-full p-3 rounded-xl border border-slate-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setOverrideTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-semibold"
              >
                {t.actions.cancel}
              </button>
              <button
                disabled={saving}
                onClick={handleOverride}
                className="px-4 py-2 rounded-xl bg-[#1565C0] text-white font-semibold hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? t.common.loading : isAr ? 'تأكيد التعديل وتوثيقه' : 'Confirm Override'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export const CorrectionsView: React.FC = () => {
  const {
    lang,
    t,
    currentUser,
    dataset,
    pushToast,
    submitCorrectionRequest,
    reviewCorrectionRequest,
  } = useSGAS();

  const isAr = lang === 'ar';
  const role = currentUser?.role || 'student';
  const isStudent = role === 'student';
  const canReview = role === 'super_admin' || role === 'pg_admin' || role === 'dept_admin' || role === 'lecturer';

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [requestedStatus, setRequestedStatus] = useState<'present' | 'late' | 'excused'>('excused');
  const [reason, setReason] = useState('');
  const [attachmentNote, setAttachmentNote] = useState('');

  const [reviewTarget, setReviewTarget] = useState<AttendanceCorrection | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const myStudentRecords = useMemo(() => {
    if (!isStudent) return [];
    return dataset.records.filter(
      (r) => r.studentUid === currentUser?.uid || r.studentId === currentUser?.linkedEntityId,
    );
  }, [currentUser, dataset.records, isStudent]);

  const visibleCorrections = useMemo(() => {
    let list = [...dataset.corrections];
    if (isStudent) {
      list = list.filter((c) => c.studentUid === currentUser?.uid || c.studentId === currentUser?.linkedEntityId);
    } else if (role === 'dept_admin' && currentUser?.departmentId) {
      list = list.filter((c) => c.departmentId === currentUser.departmentId);
    } else if (role === 'lecturer') {
      const myLecIds = new Set(
        dataset.lectures
          .filter((l) => l.lecturerUid === currentUser?.uid || l.lecturerId === currentUser?.linkedEntityId)
          .map((l) => l.id),
      );
      list = list.filter((c) => myLecIds.has(c.lectureId));
    }
    return list;
  }, [currentUser, dataset.corrections, dataset.lectures, isStudent, role]);

  const handleSubmit = async () => {
    const rec = myStudentRecords.find((r) => r.id === selectedRecordId);
    if (!rec) {
      pushToast('warning', isAr ? 'يرجى اختيار سجل المحاضرة' : 'Please select an attendance record');
      return;
    }
    if (!reason.trim()) {
      pushToast('warning', isAr ? 'يرجى كتابة سبب طلب التصحيح' : 'Please enter correction reason');
      return;
    }
    setSaving(true);
    try {
      await submitCorrectionRequest({
        record: rec,
        requestedStatus,
        reason,
        attachmentNote,
      });
      pushToast('success', isAr ? 'تم إرسال طلب التصحيح للمراجعة' : 'Correction request submitted');
      setCreateOpen(false);
      setReason('');
      setAttachmentNote('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setSaving(true);
    try {
      await reviewCorrectionRequest(reviewTarget, reviewDecision, reviewNote);
      pushToast('success', isAr ? 'تم البت في طلب التصحيح وتحديث السجل' : 'Correction request reviewed');
      setReviewTarget(null);
      setReviewNote('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Review failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <FileEdit className="w-4 h-4 text-[#1565C0]" />
            <span>{t.nav.corrections}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr
              ? 'إدارة طلبات تعديل أو تبرير الغياب مع توثيق القرارات في سجل التدقيق.'
              : 'Manage absence excuse and attendance correction requests with full audit trails.'}
          </p>
        </div>

        {isStudent && (
          <button
            onClick={() => {
              setSelectedRecordId(myStudentRecords[0]?.id || '');
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'تقديم طلب تصحيح' : 'Request Correction'}</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
              <tr>
                <th className="p-3 text-start">{isAr ? 'الطالب' : 'Student'}</th>
                <th className="p-3 text-start">{isAr ? 'المحاضرة' : 'Lecture'}</th>
                <th className="p-3 text-start">{isAr ? 'التغيير المطلوب' : 'Requested Change'}</th>
                <th className="p-3 text-start">{isAr ? 'السبب والمرفق' : 'Reason & Reference'}</th>
                <th className="p-3 text-start">{t.common.status}</th>
                {canReview && <th className="p-3 text-end">{t.common.actions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCorrections.map((c) => {
                const lec = dataset.lectures.find((l) => l.id === c.lectureId);
                return (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="p-3 font-semibold text-slate-900">{c.studentNameAr || c.studentId}</td>
                    <td className="p-3">
                      <div className="font-medium">{isAr ? lec?.subjectNameAr || c.subjectId : lec?.subjectNameEn || c.subjectId}</div>
                      <div className="text-[11px] font-mono-num text-slate-400">{lec?.lectureDate || '—'}</div>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-500">{t.statuses[c.currentStatus as keyof typeof t.statuses] || c.currentStatus}</span>
                      <span className="mx-1.5 text-slate-400">←</span>
                      <span className="font-bold text-[#1565C0]">{t.statuses[c.requestedStatus]}</span>
                    </td>
                    <td className="p-3 max-w-xs">
                      <div className="text-slate-800">{c.reason}</div>
                      {c.attachmentNote && <div className="text-[11px] text-slate-500 mt-0.5">{c.attachmentNote}</div>}
                      {c.reviewNote && <div className="text-[11px] text-[#1565C0] mt-0.5">{isAr ? 'قرار المراجع:' : 'Review:'} {c.reviewNote}</div>}
                    </td>
                    <td className="p-3 font-bold">
                      <span
                        className={
                          c.status === 'approved'
                            ? 'text-emerald-700'
                            : c.status === 'rejected'
                              ? 'text-red-600'
                              : 'text-amber-700'
                        }
                      >
                        {t.statuses[c.status]}
                      </span>
                    </td>
                    {canReview && (
                      <td className="p-3 text-end">
                        {c.status === 'pending' ? (
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => {
                                setReviewTarget(c);
                                setReviewDecision('approved');
                                setReviewNote('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t.actions.approve}</span>
                            </button>
                            <button
                              onClick={() => {
                                setReviewTarget(c);
                                setReviewDecision('rejected');
                                setReviewNote('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-red-600 font-semibold hover:bg-red-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{t.actions.reject}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {visibleCorrections.length === 0 && (
                <tr>
                  <td colSpan={canReview ? 6 : 5} className="p-8 text-center text-slate-400">
                    {t.common.noData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <Modal title={isAr ? 'تقديم طلب تصحيح حضور' : 'Submit Attendance Correction'} onClose={() => setCreateOpen(false)}>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{isAr ? 'السجل المطلوب تصحيحه' : 'Attendance Record'}</label>
              <select
                value={selectedRecordId}
                onChange={(e) => setSelectedRecordId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                {myStudentRecords.map((r) => {
                  const lec = dataset.lectures.find((l) => l.id === r.lectureId);
                  return (
                    <option key={r.id} value={r.id}>
                      {lec?.lectureDate || '—'} · {isAr ? lec?.subjectNameAr : lec?.subjectNameEn} ({t.statuses[r.status]})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">{isAr ? 'الحالة المطلوبة' : 'Requested Status'}</label>
              <select
                value={requestedStatus}
                onChange={(e) => setRequestedStatus(e.target.value as 'present' | 'late' | 'excused')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="excused">{t.statuses.excused}</option>
                <option value="present">{t.statuses.present}</option>
                <option value="late">{t.statuses.late}</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">{isAr ? 'السبب والتفاصيل' : 'Reason'}</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200"
                placeholder={isAr ? 'اشرح سبب التبرير أو الخلل...' : 'Explain your excuse or correction reason...'}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">{isAr ? 'رقم الكتاب / ملاحظة المرفق (اختياري)' : 'Document Reference (Optional)'}</label>
              <input
                value={attachmentNote}
                onChange={(e) => setAttachmentNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
                placeholder={isAr ? 'مثال: إجازة مرضية رقم 412 بتاريخ...' : 'e.g., Medical report #412...'}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold">
                {t.actions.cancel}
              </button>
              <button
                disabled={saving || myStudentRecords.length === 0}
                onClick={handleSubmit}
                className="px-4 py-2 rounded-xl bg-[#1565C0] text-white font-semibold disabled:opacity-50"
              >
                {t.actions.save}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {reviewTarget && (
        <Modal
          title={reviewDecision === 'approved' ? (isAr ? 'الموافقة على طلب التصحيح' : 'Approve Correction') : (isAr ? 'رفض طلب التصحيح' : 'Reject Correction')}
          onClose={() => setReviewTarget(null)}
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-[#F5F9FF] border border-blue-100">
              <div className="font-bold">{reviewTarget.studentNameAr}</div>
              <div className="text-slate-600 mt-1">{reviewTarget.reason}</div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{isAr ? 'ملاحظة المراجع' : 'Review Note'}</label>
              <textarea
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200"
                placeholder={isAr ? 'أدخل سبب القرار...' : 'Enter decision note...'}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReviewTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold">
                {t.actions.cancel}
              </button>
              <button
                disabled={saving}
                onClick={handleReview}
                className={`px-4 py-2 rounded-xl text-white font-semibold ${reviewDecision === 'approved' ? 'bg-emerald-600' : 'bg-red-600'}`}
              >
                {t.actions.confirm}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
