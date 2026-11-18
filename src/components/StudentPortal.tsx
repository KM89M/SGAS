import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCode,
  Camera,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Calendar,
  MapPin,
} from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import { calculateStudentAttendance, getBaghdadDateString } from '../lib/attendanceMath';
import { NavTab } from './LayoutShell';

export const StudentPortal: React.FC<{
  mode: 'home' | 'scan' | 'attendance' | 'profile';
  initialScanToken?: string | null;
  onClearScanToken?: () => void;
  onNavigate?: (tab: NavTab) => void;
}> = ({ mode, initialScanToken, onClearScanToken, onNavigate }) => {
  const {
    lang,
    t,
    currentUser,
    dataset,
    activePolicy,
    pushToast,
    recordStudentQrAttendance,
  } = useSGAS();

  const isAr = lang === 'ar';
  const today = getBaghdadDateString();

  const student = useMemo(
    () =>
      dataset.students.find(
        (s) =>
          s.uid === currentUser?.uid ||
          s.id === currentUser?.linkedEntityId ||
          s.email.toLowerCase() === (currentUser?.email || '').toLowerCase(),
      ),
    [currentUser, dataset.students],
  );

  const summary = useMemo(() => {
    if (!student) return null;
    return calculateStudentAttendance(student, dataset.lectures, dataset.records, dataset.enrollments, activePolicy);
  }, [activePolicy, dataset.enrollments, dataset.lectures, dataset.records, student]);

  const mySubjects = useMemo(() => {
    if (!student) return [];
    const enrolledIds = new Set(
      dataset.enrollments.filter((e) => e.studentId === student.id && e.status !== 'dropped').map((e) => e.subjectId),
    );
    const list =
      enrolledIds.size > 0
        ? dataset.subjects.filter((s) => enrolledIds.has(s.id))
        : dataset.subjects.filter((s) => s.departmentId === student.departmentId && s.programId === student.programId);

    return list.map((sub) => {
      const calc = calculateStudentAttendance(student, dataset.lectures, dataset.records, dataset.enrollments, activePolicy, sub.id);
      const lec = dataset.lecturers.find((l) => sub.lecturerIds?.includes(l.id));
      return { subject: sub, lecturer: lec, calc };
    });
  }, [activePolicy, dataset.enrollments, dataset.lecturers, dataset.lectures, dataset.records, dataset.subjects, student]);

  const myRecords = useMemo(() => {
    if (!student) return [];
    return [...dataset.records]
      .filter((r) => r.studentId === student.id || r.studentUid === currentUser?.uid)
      .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
  }, [currentUser?.uid, dataset.records, student]);

  const todayLectures = useMemo(() => {
    const subIds = new Set(mySubjects.map((x) => x.subject.id));
    return dataset.lectures.filter((l) => subIds.has(l.subjectId) && l.lectureDate === today && l.status !== 'cancelled');
  }, [mySubjects, dataset.lectures, today]);

  const upcomingLectures = useMemo(() => {
    const subIds = new Set(mySubjects.map((x) => x.subject.id));
    return dataset.lectures
      .filter((l) => subIds.has(l.subjectId) && l.lectureDate > today && l.status !== 'cancelled')
      .slice(0, 5);
  }, [mySubjects, dataset.lectures, today]);

  // QR Scanner State
  const [scannerActive, setScannerActive] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scanResult, setScanResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [shareGeo, setShareGeo] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const processToken = async (raw: string, method: 'qr_camera' | 'qr_url' | 'fallback_code') => {
    let token = raw.trim();
    try {
      if (token.includes('scanToken=')) {
        const u = new URL(token);
        token = u.searchParams.get('scanToken') || token;
      }
    } catch {
      // raw token
    }

    let geo: { lat: number; lng: number } | undefined;
    if (shareGeo && navigator.geolocation) {
      const pos = await new Promise<GeolocationPosition | null>((res) =>
        navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 5000 }),
      );
      if (pos) geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }

    const res = await recordStudentQrAttendance(token, method, geo);
    setScanResult(res);
    pushToast(res.ok ? 'success' : 'error', res.message);
  };

  // Auto-process deep-linked native phone camera QR URL (?scanToken=...)
  useEffect(() => {
    if (initialScanToken && mode === 'scan') {
      processToken(initialScanToken, 'qr_url').then(() => {
        onClearScanToken?.();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScanToken, mode]);

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startCameraScanner = async () => {
    setScanResult(null);
    setScannerActive(true);
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode('sgas-qr-reader');
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            await html5Qr.stop().catch(() => {});
            setScannerActive(false);
            await processToken(decodedText, 'qr_camera');
          },
          () => {},
        );
      } catch (err) {
        setScannerActive(false);
        pushToast(
          'warning',
          isAr
            ? 'تعذر تشغيل الكاميرا (تأكد من HTTPS والأذونات). يمكنك استخدام الإدخال اليدوي للرمز أدناه.'
            : 'Camera unavailable (HTTPS/permission required). Use the fallback token box below.',
        );
      }
    }, 150);
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    setScannerActive(false);
  };

  if (mode === 'scan') {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-white border border-blue-100 rounded-2xl p-6 space-y-5">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{t.nav.scanQr}</h1>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'امسح رمز QR المعروض من قبل التدريسي في القاعة عبر الكاميرا أو أدخل رمز الجلسة البديل.'
                : 'Scan the lecturer’s dynamic classroom QR code via camera or enter the fallback code.'}
            </p>
          </div>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[#F5F9FF] border border-blue-100 text-xs cursor-pointer">
            <span className="flex items-center gap-2 font-medium text-slate-700">
              <MapPin className="w-4 h-4 text-[#2196F3]" />
              <span>{isAr ? 'مشاركة الموقع الاختيارية للتحقق من القاعة' : 'Optional consent-based classroom location check'}</span>
            </span>
            <input type="checkbox" checked={shareGeo} onChange={(e) => setShareGeo(e.target.checked)} />
          </label>

          {!scannerActive ? (
            <button
              onClick={startCameraScanner}
              className="w-full py-3.5 px-4 rounded-xl bg-[#1565C0] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-800"
            >
              <Camera className="w-5 h-5" />
              <span>{isAr ? 'تشغيل كاميرا مسح QR' : 'Start Camera QR Scanner'}</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div id="sgas-qr-reader" className="w-full rounded-xl overflow-hidden border border-blue-200" />
              <button
                onClick={stopCameraScanner}
                className="w-full py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                {isAr ? 'إيقاف الكاميرا' : 'Stop Camera'}
              </button>
            </div>
          )}

          {scanResult && (
            <div
              className={`p-4 rounded-xl border text-sm font-semibold flex items-center gap-3 ${
                scanResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {scanResult.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              <span>{scanResult.message}</span>
            </div>
          )}

          {/* Fallback Token Input when Camera Fails */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#2196F3]" />
              <span>{isAr ? 'الطريقة البديلة عند تعذر الكاميرا (إدخال الرمز)' : 'Fallback Submission (Manual Token)'}</span>
            </label>
            <div className="flex gap-2">
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder={isAr ? 'ألصق رمز الجلسة المشفر هنا...' : 'Paste session token here...'}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono-num"
              />
              <button
                onClick={() => manualToken.trim() && processToken(manualToken, 'fallback_code')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                {isAr ? 'إرسال' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'profile') {
    const dept = dataset.departments.find((d) => d.id === student?.departmentId);
    const prog = dataset.programs.find((p) => p.id === student?.programId);
    return (
      <div className="max-w-2xl mx-auto bg-white border border-blue-100 rounded-2xl p-6 space-y-4">
        <h1 className="text-xl font-extrabold text-slate-900">{t.nav.profile}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label={isAr ? 'الاسم الكامل' : 'Full Name'} value={isAr ? student?.fullNameAr || currentUser?.displayNameAr || '' : student?.fullNameEn || currentUser?.displayNameEn || ''} />
          <InfoRow label={isAr ? 'الرقم الجامعي' : 'University ID'} value={student?.universityId || '—'} mono />
          <InfoRow label={isAr ? 'القسم العلمي' : 'Department'} value={dept ? (isAr ? dept.nameAr : dept.nameEn) : '—'} />
          <InfoRow label={isAr ? 'البرنامج الدراسي' : 'Program'} value={prog ? (isAr ? prog.nameAr : prog.nameEn) : '—'} />
          <InfoRow label={isAr ? 'البريد الجامعي' : 'Email'} value={student?.email || currentUser?.email || ''} mono />
          <InfoRow label={isAr ? 'حالة القيد' : 'Enrollment Status'} value={student?.enrollmentStatus || 'active'} />
        </div>
      </div>
    );
  }

  if (mode === 'attendance') {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-extrabold text-slate-900">{t.nav.myAttendance}</h1>

        {/* Subject-level breakdown */}
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-blue-100 font-bold text-sm text-slate-900">
            {isAr ? 'تفاصيل الحضور والساعات حسب المادة الدراسية' : 'Subject-Level Attendance & Hours'}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'المادة' : 'Subject'}</th>
                  <th className="p-3 text-start">{isAr ? 'التدريسي' : 'Lecturer'}</th>
                  <th className="p-3 text-start">{isAr ? 'المنجزة / الحاضرة / الفائتة' : 'Done / Att / Miss'}</th>
                  <th className="p-3 text-start">{isAr ? 'الساعات (منجزة / حضور / غياب)' : 'Hours (Done / Att / Abs)'}</th>
                  <th className="p-3 text-start">{isAr ? 'نسبة الحضور' : 'Attendance %'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mySubjects.map(({ subject, lecturer, calc }) => (
                  <tr key={subject.id}>
                    <td className="p-3 font-semibold">{isAr ? subject.nameAr : subject.nameEn}</td>
                    <td className="p-3 text-slate-600">{lecturer ? (isAr ? lecturer.fullNameAr : lecturer.fullNameEn) : '—'}</td>
                    <td className="p-3 font-mono-num">{calc.totalCompletedLectures} / {calc.totalAttendedLectures} / {calc.totalMissedLectures}</td>
                    <td className="p-3 font-mono-num">{calc.totalCompletedHours} / {calc.totalAttendedHours} / {calc.totalAbsentHours}</td>
                    <td className="p-3 font-mono-num font-bold text-[#1565C0]">{calc.attendancePercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Historical records by date */}
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-blue-100 font-bold text-sm text-slate-900">
            {isAr ? 'السجل التاريخي للمحاضرات' : 'Historical Attendance Log'}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F5F9FF] border-b border-blue-100 text-slate-600">
                <tr>
                  <th className="p-3 text-start">{t.common.date}</th>
                  <th className="p-3 text-start">{isAr ? 'المادة' : 'Subject'}</th>
                  <th className="p-3 text-start">{t.common.status}</th>
                  <th className="p-3 text-start">{isAr ? 'الاعتماد' : 'Approval'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myRecords.map((r) => {
                  const lec = dataset.lectures.find((l) => l.id === r.lectureId);
                  return (
                    <tr key={r.id}>
                      <td className="p-3 font-mono-num">{lec?.lectureDate || '—'}</td>
                      <td className="p-3 font-semibold">{isAr ? lec?.subjectNameAr : lec?.subjectNameEn || r.subjectId}</td>
                      <td className="p-3 font-bold">{t.statuses[r.status]}</td>
                      <td className="p-3">{r.isApproved ? (isAr ? 'معتمد' : 'Approved') : (isAr ? 'بانتظار الاعتماد' : 'Pending')}</td>
                    </tr>
                  );
                })}
                {myRecords.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-slate-400">{t.common.noData}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Student Home Dashboard (Mobile-first)
  return (
    <div className="space-y-6">
      {/* Welcome & QR CTA */}
      <div className="bg-white border border-blue-100 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {isAr ? `مرحباً، ${student?.fullNameAr || currentUser?.displayNameAr}` : `Welcome, ${student?.fullNameEn || currentUser?.displayNameEn}`}
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono-num">
            {student?.universityId || ''} · {dataset.departments.find((d) => d.id === student?.departmentId)?.[isAr ? 'nameAr' : 'nameEn'] || ''}
          </p>
        </div>

        <button
          onClick={() => onNavigate?.('student_scan')}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#1565C0] text-white text-sm font-semibold hover:bg-blue-800 shadow-sm"
        >
          <QrCode className="w-5 h-5" />
          <span>{t.nav.scanQr}</span>
        </button>
      </div>

      {/* Absence Warning Banner */}
      {summary && summary.warningLevel !== 'none' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold">
              {isAr
                ? `تنبيه غياب (${summary.absencePercentage}% من الساعات المنجزة): `
                : `Absence Warning (${summary.absencePercentage}% of completed hours): `}
            </span>
            <span>
              {summary.warningLevel === 'exceeded'
                ? (isAr ? 'تجاوزت الحد الأعلى المسموح به للغياب.' : 'You have exceeded the maximum allowed absence limit.')
                : (isAr ? 'تقترب من الحد الأعلى المسموح به وفق سياسة الدراسات العليا.' : 'Approaching maximum allowed absence limit.')}
            </span>
          </div>
        </div>
      )}

      {/* Personal Metrics */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MetricBox label={isAr ? 'نسبة الحضور الكلية' : 'Overall Attendance'} value={`${summary.attendancePercentage}%`} tone="text-[#1565C0]" />
          <MetricBox label={isAr ? 'المحاضرات الحاضرة' : 'Attended Lectures'} value={summary.totalAttendedLectures} tone="text-emerald-600" />
          <MetricBox label={isAr ? 'المحاضرات الفائتة' : 'Missed Lectures'} value={summary.totalMissedLectures} tone="text-red-600" />
          <MetricBox label={isAr ? 'الساعات الحاضرة' : 'Attended Hours'} value={summary.totalAttendedHours} tone="text-emerald-600" />
          <MetricBox label={isAr ? 'ساعات الغياب' : 'Absent Hours'} value={summary.totalAbsentHours} tone="text-red-600" />
        </div>
      )}

      {/* Today's & Upcoming Lectures */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-blue-100 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1565C0]" />
            <span>{isAr ? 'محاضرات اليوم' : "Today's Lectures"}</span>
          </h3>
          {todayLectures.length === 0 ? (
            <div className="text-xs text-slate-400 py-4">{isAr ? 'لا توجد محاضرات مجدولة اليوم' : 'No lectures scheduled today'}</div>
          ) : (
            todayLectures.map((l) => (
              <div key={l.id} className="p-3 rounded-xl bg-[#F5F9FF] border border-blue-100 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-900">{isAr ? l.subjectNameAr : l.subjectNameEn}</div>
                  <div className="text-slate-500 mt-0.5 font-mono-num">{l.startTime}–{l.endTime} · {l.classroom}</div>
                </div>
                <span className="font-bold text-[#1565C0]">{t.statuses[l.status]}</span>
              </div>
            ))
          )}
        </div>

        <div className="bg-white border border-blue-100 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">{isAr ? 'أحدث تأكيدات الحضور والمحاضرات القادمة' : 'Latest Confirmation & Upcoming'}</h3>
          {myRecords[0] && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              <div className="font-bold">{isAr ? 'آخر تسجيل حضور:' : 'Latest Attendance:'} {t.statuses[myRecords[0].status]}</div>
              <div className="mt-0.5 font-mono-num">{myRecords[0].registeredAt || '—'} · {myRecords[0].isApproved ? (isAr ? 'معتمد' : 'Approved') : (isAr ? 'بانتظار الاعتماد' : 'Pending')}</div>
            </div>
          )}
          {upcomingLectures.map((l) => (
            <div key={l.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-slate-900">{isAr ? l.subjectNameAr : l.subjectNameEn}</div>
                <div className="text-slate-500 font-mono-num">{l.lectureDate} · {l.startTime}</div>
              </div>
              <span className="text-slate-500">{l.classroom}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MetricBox: React.FC<{ label: string; value: string | number; tone?: string }> = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="bg-white border border-blue-100 rounded-2xl p-4">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`text-xl font-extrabold font-mono-num mt-1.5 ${tone}`}>{value}</div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="p-3 rounded-xl bg-[#F5F9FF] border border-blue-100">
    <div className="text-xs text-slate-500">{label}</div>
    <div className={`font-semibold text-slate-900 mt-0.5 ${mono ? 'font-mono-num' : ''}`}>{value}</div>
  </div>
);
