import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  Lock,
  Copy,
  MapPin,
  ShieldAlert,
  UserCheck,
  Clock,
} from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { AttendanceSession, AttendanceStatus, Lecture } from '../types/sgas';
import { Modal } from './AcademicModules';

export const AttendanceSessionView: React.FC<{ initialLecture?: Lecture | null }> = ({ initialLecture }) => {
  const {
    lang,
    t,
    currentUser,
    dataset,
    activePolicy,
    pushToast,
    openOrResumeSession,
    rotateSessionQr,
    setSessionStatus,
    markManualAttendance,
    approveAttendanceSession,
  } = useSGAS();

  const isAr = lang === 'ar';
  const role = currentUser?.role || 'lecturer';

  const eligibleLectures = useMemo(() => {
    let list = dataset.lectures.filter((l) => l.status !== 'cancelled');
    if (role === 'lecturer') {
      list = list.filter((l) => l.lecturerUid === currentUser?.uid || l.lecturerId === currentUser?.linkedEntityId);
    } else if (role === 'dept_admin' && currentUser?.departmentId) {
      list = list.filter((l) => l.departmentId === currentUser.departmentId);
    }
    return [...list].sort((a, b) => b.lectureDate.localeCompare(a.lectureDate));
  }, [currentUser, dataset.lectures, role]);

  const [selectedLectureId, setSelectedLectureId] = useState<string>(
    initialLecture?.id || eligibleLectures[0]?.id || '',
  );
  const selectedLecture = eligibleLectures.find((l) => l.id === selectedLectureId) || eligibleLectures[0] || null;

  const activeSession: AttendanceSession | undefined = dataset.sessions.find(
    (s) => s.lectureId === selectedLecture?.id,
  );

  const [qrToken, setQrToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [geofenceEnabled, setGeofenceEnabled] = useState(activePolicy.geofencingEnabledByDefault ?? false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [noteEdit, setNoteEdit] = useState<{ studentId: string; text: string } | null>(null);

  const enrolledStudents = useMemo(() => {
    if (!selectedLecture) return [];
    const subEnrolledIds = new Set(
      dataset.enrollments
        .filter((e) => e.subjectId === selectedLecture.subjectId && e.status !== 'dropped')
        .map((e) => e.studentId),
    );
    if (subEnrolledIds.size > 0) {
      return dataset.students.filter((s) => subEnrolledIds.has(s.id));
    }
    return dataset.students.filter(
      (s) => s.departmentId === selectedLecture.departmentId && s.programId === selectedLecture.programId && s.enrollmentStatus === 'enrolled',
    );
  }, [dataset.enrollments, dataset.students, selectedLecture]);

  const sessionRecords = useMemo(() => {
    if (!activeSession) return [];
    return dataset.records.filter((r) => r.sessionId === activeSession.id);
  }, [activeSession, dataset.records]);

  const registeredCount = sessionRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
  const remainingCount = Math.max(0, enrolledStudents.length - sessionRecords.length);
  const livePct = enrolledStudents.length > 0 ? Math.round((registeredCount / enrolledStudents.length) * 100) : 0;

  const renderQrImage = useCallback(async (tokenStr: string) => {
    const scanUrl = `${window.location.origin}/?scanToken=${encodeURIComponent(tokenStr)}`;
    const url = await QRCode.toDataURL(scanUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#1565C0', light: '#FFFFFF' },
    });
    setQrDataUrl(url);
  }, []);

  const handleStartSession = async () => {
    if (!selectedLecture) return;
    try {
      let geo: { enabled: boolean; lat?: number; lng?: number; radius?: number } = { enabled: false };
      if (geofenceEnabled && navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 }),
        ).catch(() => null);
        if (pos) {
          geo = { enabled: true, lat: pos.coords.latitude, lng: pos.coords.longitude, radius: 120 };
        }
      }
      const res = await openOrResumeSession(selectedLecture, geo);
      setQrToken(res.qrData.token);
      setQrExpiresAt(res.qrData.expiresAt);
      await renderQrImage(res.qrData.token);
      pushToast('success', isAr ? 'تم فتح جلسة الحضور وتوليد رمز QR الديناميكي' : 'Attendance session opened with dynamic QR');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to start session');
    }
  };

  const handleManualRotate = useCallback(async () => {
    if (!activeSession || activeSession.status !== 'open') return;
    try {
      const next = await rotateSessionQr(activeSession);
      setQrToken(next.token);
      setQrExpiresAt(next.expiresAt);
      await renderQrImage(next.token);
    } catch (err) {
      console.error('QR rotation failed:', err);
    }
  }, [activeSession, renderQrImage, rotateSessionQr]);

  // Dynamic QR Rotation & Countdown Timer
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'open' || !qrExpiresAt) {
      setSecondsLeft(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        handleManualRotate();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession, handleManualRotate, qrExpiresAt]);

  const handleApproveAll = async () => {
    if (!activeSession) return;
    try {
      await approveAttendanceSession(activeSession);
      setConfirmApproveOpen(false);
      pushToast('success', isAr ? 'تم اعتماد الحضور وإقفال السجلات وتسجيل غياب غير المسجلين' : 'Session approved and records locked');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const copyTokenForFallback = () => {
    if (!qrToken) return;
    navigator.clipboard?.writeText(qrToken);
    pushToast('info', isAr ? 'تم نسخ رمز الجلسة المؤقت' : 'Session token copied');
  };

  return (
    <div className="space-y-6">
      {/* Lecture Selector Header */}
      <div className="bg-white border border-blue-100 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-[260px]">
          <label className="text-xs font-bold text-[#1565C0] block">
            {isAr ? 'اختر المحاضرة لإدارة جلسة الحضور' : 'Select Lecture Session'}
          </label>
          <select
            value={selectedLecture?.id || ''}
            onChange={(e) => {
              setSelectedLectureId(e.target.value);
              setQrToken('');
              setQrDataUrl('');
              setQrExpiresAt(0);
            }}
            className="w-full max-w-xl px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white"
          >
            {eligibleLectures.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lectureDate} · {l.startTime}–{l.endTime} · {isAr ? l.subjectNameAr : l.subjectNameEn} ({t.statuses[l.status]})
              </option>
            ))}
          </select>
        </div>

        {selectedLecture && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <div>
              <div className="text-slate-400">{isAr ? 'التدريسي' : 'Lecturer'}</div>
              <div className="font-bold text-slate-900">{isAr ? selectedLecture.lecturerNameAr : selectedLecture.lecturerNameEn}</div>
            </div>
            <div>
              <div className="text-slate-400">{isAr ? 'الساعات المعتمدة' : 'Planned Hours'}</div>
              <div className="font-bold font-mono-num text-[#1565C0]">{selectedLecture.academicCreditHours}</div>
            </div>
            <div>
              <div className="text-slate-400">{isAr ? 'حالة الجلسة' : 'Session Status'}</div>
              <div className="font-bold text-slate-900">
                {activeSession ? t.statuses[activeSession.status] : (isAr ? 'لم تبدأ بعد' : 'Not Started')}
              </div>
            </div>
          </div>
        )}
      </div>

      {!selectedLecture ? (
        <div className="bg-white border border-blue-100 rounded-2xl p-10 text-center text-sm text-slate-400">
          {isAr ? 'لا توجد محاضرات مجدولة متاحة حالياً' : 'No scheduled lectures available'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Dynamic QR Panel */}
          <div className="lg:col-span-5 bg-white border border-blue-100 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
            <div className="w-full flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">{isAr ? 'رمز الحضور الديناميكي (QR)' : 'Dynamic Attendance QR'}</span>
              {activeSession?.status === 'open' && (
                <span className="inline-flex items-center gap-1.5 font-mono-num font-bold text-[#1565C0]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {secondsLeft}s
                </span>
              )}
            </div>

            {qrDataUrl && activeSession?.status === 'open' ? (
              <div className="p-4 rounded-2xl bg-[#F5F9FF] border border-blue-200">
                <img src={qrDataUrl} alt="Dynamic Attendance QR Code" className="w-60 h-60 mx-auto rounded-lg" />
              </div>
            ) : (
              <div className="w-60 h-60 rounded-2xl border-2 border-dashed border-blue-200 bg-[#F5F9FF] flex flex-col items-center justify-center p-4 text-xs text-slate-500">
                {activeSession?.status === 'approved' ? (
                  <>
                    <Lock className="w-10 h-10 text-emerald-600 mb-2" />
                    <span className="font-bold text-emerald-700">{isAr ? 'تم اعتماد الجلسة وإقفالها' : 'Session Approved & Locked'}</span>
                  </>
                ) : activeSession?.status === 'paused' ? (
                  <>
                    <Pause className="w-10 h-10 text-amber-600 mb-2" />
                    <span className="font-bold text-amber-700">{isAr ? 'التسجيل متوقف مؤقتاً' : 'Attendance Paused'}</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-10 h-10 text-[#2196F3] mb-2" />
                    <span>{isAr ? 'اضغط "فتح جلسة الحضور" لتوليد رمز QR مشفر' : 'Click "Open Attendance" to generate cryptographic QR'}</span>
                  </>
                )}
              </div>
            )}

            <div className="w-full text-[11px] text-slate-500 leading-relaxed">
              {isAr
                ? `يتجدد الرمز تلقائياً كل ${activePolicy.defaultQrRotationSeconds} ثانية ولا يحتوي على بيانات شخصية للطلبة.`
                : `Rotates automatically every ${activePolicy.defaultQrRotationSeconds}s with zero student PII embedded.`}
            </div>

            {/* Optional consent-based geofence */}
            {(!activeSession || activeSession.status !== 'approved') && (
              <label className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs cursor-pointer">
                <span className="flex items-center gap-2 font-medium text-slate-700">
                  <MapPin className="w-4 h-4 text-[#2196F3]" />
                  <span>{isAr ? 'تفعيل التحقق الاختياري من موقع القاعة' : 'Optional Classroom Geofence Check'}</span>
                </span>
                <input
                  type="checkbox"
                  checked={geofenceEnabled}
                  onChange={(e) => setGeofenceEnabled(e.target.checked)}
                />
              </label>
            )}

            {/* Session Controls */}
            <div className="w-full flex flex-wrap gap-2 pt-2">
              {(!activeSession || activeSession.status === 'closed') && activeSession?.status !== 'approved' && (
                <button
                  onClick={handleStartSession}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800"
                >
                  <Play className="w-4 h-4" />
                  <span>{isAr ? 'فتح جلسة الحضور' : 'Open Attendance'}</span>
                </button>
              )}

              {activeSession?.status === 'open' && (
                <>
                  <button
                    onClick={handleManualRotate}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#E3F2FD] text-[#1565C0] text-xs font-semibold hover:bg-blue-100"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{isAr ? 'تحديث QR' : 'Regenerate'}</span>
                  </button>
                  <button
                    onClick={() => setSessionStatus(activeSession.id, 'paused')}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-amber-300 text-amber-800 text-xs font-semibold hover:bg-amber-50"
                  >
                    <Pause className="w-4 h-4" />
                    <span>{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                  </button>
                </>
              )}

              {activeSession?.status === 'paused' && (
                <button
                  onClick={handleStartSession}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-[#1565C0] text-white text-xs font-semibold"
                >
                  <Play className="w-4 h-4" />
                  <span>{isAr ? 'استئناف' : 'Resume'}</span>
                </button>
              )}

              {qrToken && activeSession?.status === 'open' && (
                <button
                  onClick={copyTokenForFallback}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  title={isAr ? 'نسخ الرمز البديل' : 'Copy fallback token'}
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>

            {activeSession && activeSession.status !== 'approved' && (
              <div className="w-full flex gap-2 pt-2 border-t border-slate-100">
                {activeSession.status !== 'closed' && (
                  <button
                    onClick={() => setSessionStatus(activeSession.id, 'closed')}
                    className="flex-1 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  >
                    {isAr ? 'إغلاق التسجيل' : 'Close Registration'}
                  </button>
                )}
                <button
                  onClick={() => setConfirmApproveOpen(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? 'اعتماد الحضور النهائي' : 'Approve & Lock'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Live Counters & Student Table */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatMini label={isAr ? 'إجمالي المسجلين' : 'Enrolled'} value={enrolledStudents.length} />
              <StatMini label={isAr ? 'الحاضرون' : 'Registered'} value={registeredCount} tone="text-emerald-600" />
              <StatMini label={isAr ? 'المتبقون' : 'Remaining'} value={remainingCount} tone="text-amber-600" />
              <StatMini label={isAr ? 'نسبة الحضور المباشرة' : 'Live %'} value={`${livePct}%`} tone="text-[#1565C0]" />
            </div>

            <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-blue-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#1565C0]" />
                  <span>{isAr ? 'سجل الطلبة المباشر للجلسة' : 'Real-Time Session Roster'}</span>
                </h3>
                <span className="text-xs text-slate-500">
                  {activeSession?.status === 'approved' ? (isAr ? 'مقفل بعد الاعتماد' : 'Locked') : (isAr ? 'تحديث لحظي' : 'Live Sync')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
                    <tr>
                      <th className="p-3 text-start">{isAr ? 'الطالب' : 'Student'}</th>
                      <th className="p-3 text-start">{isAr ? 'الرقم الجامعي' : 'Univ. ID'}</th>
                      <th className="p-3 text-start">{isAr ? 'الحالة والطريقة' : 'Status & Method'}</th>
                      <th className="p-3 text-end">{isAr ? 'تسجيل / تعديل يدوي' : 'Manual Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {enrolledStudents.map((stu) => {
                      const rec = sessionRecords.find((r) => r.studentId === stu.id);
                      const isLocked = activeSession?.status === 'approved' || rec?.isApproved;
                      return (
                        <tr key={stu.id} className="hover:bg-slate-50/70">
                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{isAr ? stu.fullNameAr : stu.fullNameEn}</div>
                            {rec?.suspiciousFlag && (
                              <div className="text-[11px] text-amber-700 flex items-center gap-1 mt-0.5">
                                <ShieldAlert className="w-3 h-3" />
                                <span>{rec.suspiciousReason}</span>
                              </div>
                            )}
                            {rec?.notes && <div className="text-[11px] text-slate-400 mt-0.5">{rec.notes}</div>}
                          </td>
                          <td className="p-3 font-mono-num text-slate-600">{stu.universityId}</td>
                          <td className="p-3">
                            <div className={`font-bold ${
                              rec?.status === 'present' ? 'text-emerald-700' : rec?.status === 'late' ? 'text-[#1565C0]' : rec?.status === 'absent' ? 'text-red-600' : rec?.status === 'excused' ? 'text-amber-700' : 'text-slate-400'
                            }`}>
                              {rec ? t.statuses[rec.status] : t.statuses.not_recorded}
                            </div>
                            {rec && (
                              <div className="text-[11px] text-slate-400 font-mono-num">
                                {rec.method} · {rec.isApproved ? (isAr ? 'معتمد' : 'Approved') : (isAr ? 'غير معتمد' : 'Pending')}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-end">
                            {!isLocked && activeSession ? (
                              <div className="inline-flex items-center gap-1">
                                {(['present', 'late', 'excused', 'absent'] as AttendanceStatus[]).map((st) => (
                                  <button
                                    key={st}
                                    onClick={() => markManualAttendance(activeSession, stu, st, noteEdit?.studentId === stu.id ? noteEdit.text : undefined)}
                                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                                      rec?.status === st
                                        ? 'bg-[#1565C0] text-white border-[#1565C0]'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                    }`}
                                  >
                                    {t.statuses[st]}
                                  </button>
                                ))}
                                <button
                                  onClick={() => setNoteEdit({ studentId: stu.id, text: rec?.notes || '' })}
                                  className="px-2 py-1 rounded-md border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-100"
                                >
                                  {isAr ? 'ملاحظة' : 'Note'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                {isLocked ? (isAr ? 'مقفل' : 'Locked') : '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Edit Modal */}
      {noteEdit && activeSession && (
        <Modal title={isAr ? 'إضافة ملاحظة للتدريسي' : 'Add Lecturer Note'} onClose={() => setNoteEdit(null)}>
          <div className="space-y-3 text-xs">
            <textarea
              rows={3}
              value={noteEdit.text}
              onChange={(e) => setNoteEdit({ ...noteEdit, text: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200"
              placeholder={isAr ? 'أدخل ملاحظة الحضور...' : 'Enter attendance note...'}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNoteEdit(null)} className="px-4 py-2 rounded-xl border border-slate-200">{t.actions.cancel}</button>
              <button
                onClick={async () => {
                  const stu = enrolledStudents.find((s) => s.id === noteEdit.studentId);
                  const existingRec = sessionRecords.find((r) => r.studentId === noteEdit.studentId);
                  if (stu) {
                    await markManualAttendance(activeSession, stu, existingRec?.status || 'present', noteEdit.text);
                  }
                  setNoteEdit(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#1565C0] text-white font-semibold"
              >
                {t.actions.save}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Summary Modal Before Approval */}
      {confirmApproveOpen && activeSession && (
        <Modal title={isAr ? 'ملخص تأكيد اعتماد الحضور' : 'Attendance Approval Confirmation'} onClose={() => setConfirmApproveOpen(false)}>
          <div className="space-y-4 text-xs text-slate-700">
            <p className="leading-relaxed">
              {isAr
                ? 'عند اعتماد الجلسة سيتم تثبيت حضور الطلبة المسجلين، وتسجيل غير المسجلين كـ "غائب" تلقائياً، وإقفال السجلات ضد التعديل الاعتيادي.'
                : 'Approving this session confirms registered students, automatically marks unregistered enrolled students as Absent, and locks all records against ordinary editing.'}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center bg-[#F5F9FF] p-3 rounded-xl border border-blue-100">
              <div>
                <div className="text-slate-500">{isAr ? 'إجمالي الطلبة' : 'Total Enrolled'}</div>
                <div className="font-bold text-base font-mono-num">{enrolledStudents.length}</div>
              </div>
              <div>
                <div className="text-slate-500">{isAr ? 'الحضور / المتأخر' : 'Present / Late'}</div>
                <div className="font-bold text-base text-emerald-700 font-mono-num">{registeredCount}</div>
              </div>
              <div>
                <div className="text-slate-500">{isAr ? 'سيُحسب غياباً' : 'Auto-Absent'}</div>
                <div className="font-bold text-base text-red-600 font-mono-num">{remainingCount}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmApproveOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold">{t.actions.cancel}</button>
              <button onClick={handleApproveAll} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700">
                {isAr ? 'تأكيد الاعتماد النهائي' : 'Confirm & Approve'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const StatMini: React.FC<{ label: string; value: string | number; tone?: string }> = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="bg-white border border-blue-100 rounded-2xl p-3.5">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`text-xl font-extrabold font-mono-num mt-1 ${tone}`}>{value}</div>
  </div>
);
