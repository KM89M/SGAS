import React, { useMemo, useState } from 'react';
import {
  Plus,
  Calendar as CalIcon,
  AlertTriangle,
  QrCode,
  Repeat,
  XCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { useSGAS } from '../context/SGASContext';
import {
  computeAcademicHours,
  detectScheduleConflicts,
  getBaghdadDateString,
  timeToMinutes,
} from '../lib/attendanceMath';
import { Lecture, LectureType } from '../types/sgas';
import { Modal } from './AcademicModules';

export const ScheduleModule: React.FC<{ onOpenSession?: (lecture: Lecture) => void }> = ({ onOpenSession }) => {
  const {
    lang,
    t,
    currentUser,
    dataset,
    activePolicy,
    pushToast,
    saveLecture,
    bulkCreateLectures,
    updateLectureStatus,
  } = useSGAS();

  const isAr = lang === 'ar';
  const role = currentUser?.role || 'student';
  const canSchedule = role === 'super_admin' || role === 'pg_admin';
  const isLecturer = role === 'lecturer';

  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'list'>('weekly');
  const [selectedDate, setSelectedDate] = useState(getBaghdadDateString());
  const [deptFilter, setDeptFilter] = useState(
    role === 'dept_admin' ? currentUser?.departmentId || '' : '',
  );

  // Create / Recurring Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editLecture, setEditLecture] = useState<Partial<Lecture> | null>(null);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [rescheduleTarget, setRescheduleTarget] = useState<Lecture | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', startTime: '', endTime: '', replacementLecturerId: '', reason: '' });

  const visibleLectures = useMemo(() => {
    let list = dataset.lectures;
    if (role === 'dept_admin' && currentUser?.departmentId) {
      list = list.filter((l) => l.departmentId === currentUser.departmentId);
    } else if (role === 'lecturer') {
      list = list.filter(
        (l) => l.lecturerUid === currentUser?.uid || l.lecturerId === currentUser?.linkedEntityId,
      );
    } else if (role === 'student') {
      const myStu = dataset.students.find((s) => s.uid === currentUser?.uid || s.id === currentUser?.linkedEntityId);
      const mySubIds = new Set(
        dataset.enrollments.filter((e) => e.studentId === myStu?.id && e.status !== 'dropped').map((e) => e.subjectId),
      );
      if (mySubIds.size > 0) {
        list = list.filter((l) => mySubIds.has(l.subjectId));
      } else if (myStu) {
        list = list.filter((l) => l.departmentId === myStu.departmentId && l.programId === myStu.programId);
      }
    }
    if (deptFilter) list = list.filter((l) => l.departmentId === deptFilter);

    return [...list].sort((a, b) => `${a.lectureDate} ${a.startTime}`.localeCompare(`${b.lectureDate} ${b.startTime}`));
  }, [currentUser, dataset.enrollments, dataset.lectures, dataset.students, deptFilter, role]);

  const displayedLectures = useMemo(() => {
    if (viewMode === 'daily') {
      return visibleLectures.filter((l) => l.lectureDate === selectedDate);
    }
    if (viewMode === 'weekly') {
      const base = new Date(selectedDate);
      const start = new Date(base);
      start.setDate(base.getDate() - base.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const sStr = start.toISOString().slice(0, 10);
      const eStr = end.toISOString().slice(0, 10);
      return visibleLectures.filter((l) => l.lectureDate >= sStr && l.lectureDate <= eStr);
    }
    if (viewMode === 'monthly') {
      const ym = selectedDate.slice(0, 7);
      return visibleLectures.filter((l) => l.lectureDate.startsWith(ym));
    }
    return visibleLectures;
  }, [selectedDate, viewMode, visibleLectures]);

  const activeConflicts = useMemo(() => {
    if (!editLecture?.lectureDate || !editLecture?.startTime || !editLecture?.endTime) return [];
    return detectScheduleConflicts(
      {
        id: editLecture.id,
        lectureDate: editLecture.lectureDate,
        startTime: editLecture.startTime,
        endTime: editLecture.endTime,
        classroom: editLecture.classroom || '',
        lecturerId: editLecture.lecturerId || '',
        cohortId: editLecture.cohortId,
        programId: editLecture.programId || '',
      },
      dataset.lectures,
      dataset.holidays,
    );
  }, [dataset.holidays, dataset.lectures, editLecture]);

  const handleSaveSchedule = async () => {
    if (!editLecture?.subjectId || !editLecture?.lecturerId || !editLecture?.lectureDate || !editLecture?.classroom) {
      pushToast('warning', isAr ? 'يرجى إكمال الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    const sub = dataset.subjects.find((s) => s.id === editLecture.subjectId);
    const durMin = Math.max(30, timeToMinutes(editLecture.endTime || '11:00') - timeToMinutes(editLecture.startTime || '09:00'));
    const creditHrs = computeAcademicHours(durMin, activePolicy);

    try {
      if (repeatWeeks > 1 && !editLecture.id) {
        const items: Array<Partial<Lecture> & { departmentId: string; programId: string; subjectId: string; lecturerId: string; lectureDate: string; startTime: string; endTime: string; classroom: string }> = [];
        const groupId = `rec_${Date.now().toString(36)}`;
        for (let w = 0; w < repeatWeeks; w++) {
          const d = new Date(editLecture.lectureDate);
          d.setDate(d.getDate() + w * 7);
          const dateStr = d.toISOString().slice(0, 10);
          // Skip official holidays automatically when generating recurring semester schedule
          const isHol = dataset.holidays.some((h) => h.isActive && dateStr >= h.startDate && dateStr <= h.endDate);
          if (isHol) continue;
          items.push({
            ...editLecture,
            departmentId: sub?.departmentId || editLecture.departmentId || '',
            programId: sub?.programId || editLecture.programId || '',
            subjectId: editLecture.subjectId,
            lecturerId: editLecture.lecturerId,
            lectureDate: dateStr,
            startTime: editLecture.startTime || '09:00',
            endTime: editLecture.endTime || '11:00',
            plannedDurationMinutes: durMin,
            academicCreditHours: creditHrs,
            classroom: editLecture.classroom,
            recurrenceGroupId: groupId,
          });
        }
        const created = await bulkCreateLectures(items);
        pushToast('success', isAr ? `تم توليد ${created} محاضرة أسبوعية بنجاح` : `Generated ${created} recurring lectures`);
      } else {
        await saveLecture({
          ...editLecture,
          departmentId: sub?.departmentId || editLecture.departmentId || '',
          programId: sub?.programId || editLecture.programId || '',
          subjectId: editLecture.subjectId,
          lecturerId: editLecture.lecturerId,
          lectureDate: editLecture.lectureDate,
          startTime: editLecture.startTime || '09:00',
          endTime: editLecture.endTime || '11:00',
          plannedDurationMinutes: durMin,
          academicCreditHours: creditHrs,
          classroom: editLecture.classroom,
        });
        pushToast('success', isAr ? 'تم حفظ المحاضرة في الجدول' : 'Lecture saved to schedule');
      }
      setModalOpen(false);
      setEditLecture(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to save lecture');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {role === 'lecturer' || role === 'student' ? t.nav.mySchedule : t.nav.schedules}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr ? 'التقويم الرسمي بتوقيت بغداد (Asia/Baghdad)' : 'Official schedule in Asia/Baghdad time'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-white border border-blue-100 rounded-xl text-xs">
            {(['daily', 'weekly', 'monthly', 'list'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg font-semibold ${viewMode === m ? 'bg-[#E3F2FD] text-[#1565C0]' : 'text-slate-600'}`}
              >
                {m === 'daily' ? (isAr ? 'يومي' : 'Daily') : m === 'weekly' ? (isAr ? 'أسبوعي' : 'Weekly') : m === 'monthly' ? (isAr ? 'شهري' : 'Monthly') : (isAr ? 'الكل' : 'All')}
              </button>
            ))}
          </div>

          {canSchedule && (
            <button
              onClick={() => {
                setRepeatWeeks(1);
                setEditLecture({
                  subjectId: dataset.subjects[0]?.id || '',
                  lecturerId: dataset.lecturers[0]?.id || '',
                  departmentId: dataset.subjects[0]?.departmentId || dataset.departments[0]?.id || '',
                  programId: dataset.subjects[0]?.programId || dataset.programs[0]?.id || '',
                  lectureDate: selectedDate,
                  startTime: '09:00',
                  endTime: '11:00',
                  classroom: '',
                  lectureType: 'regular',
                  status: 'scheduled',
                });
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'جدولة محاضرة' : 'Schedule Lecture'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Date & Dept Filter Bar */}
      <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <CalIcon className="w-4 h-4 text-[#1565C0]" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 font-mono-num"
          />
        </div>
        {(role === 'super_admin' || role === 'pg_admin') && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
            <option value="">{isAr ? 'جميع الأقسام' : 'All Departments'}</option>
            {dataset.departments.map((d) => <option key={d.id} value={d.id}>{isAr ? d.nameAr : d.nameEn}</option>)}
          </select>
        )}
        <span className="text-slate-500 ms-auto font-mono-num">
          {isAr ? `عدد المحاضرات: ${displayedLectures.length}` : `Lectures: ${displayedLectures.length}`}
        </span>
      </div>

      {/* Lecture Cards / Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayedLectures.length === 0 ? (
          <div className="col-span-full bg-white border border-blue-100 rounded-2xl p-10 text-center text-sm text-slate-400">
            {isAr ? 'لا توجد محاضرات مجدولة في هذه الفترة' : 'No lectures scheduled for this period'}
          </div>
        ) : (
          displayedLectures.map((lec) => {
            const canLaunch =
              (isLecturer || canSchedule) &&
              lec.status !== 'cancelled' &&
              lec.status !== 'approved';
            return (
              <div key={lec.id} className="bg-white border border-blue-100 rounded-2xl p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">
                        {isAr ? lec.subjectNameAr || lec.subjectId : lec.subjectNameEn || lec.subjectId}
                      </h3>
                      <div className="text-xs text-slate-500 mt-1">
                        {isAr ? lec.lecturerNameAr : lec.lecturerNameEn || lec.lecturerNameAr} · {lec.classroom}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold whitespace-nowrap ${
                        lec.status === 'approved'
                          ? 'text-emerald-700'
                          : lec.status === 'attendance_open'
                            ? 'text-[#1565C0]'
                            : lec.status === 'cancelled'
                              ? 'text-red-600'
                              : 'text-amber-700'
                      }`}
                    >
                      {t.statuses[lec.status]}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono-num">
                    <span>{lec.lectureDate}</span>
                    <span>·</span>
                    <span>{lec.startTime} – {lec.endTime}</span>
                    <span>·</span>
                    <span>{lec.academicCreditHours} {isAr ? 'ساعة معتمدة' : 'credit hrs'}</span>
                    <span>·</span>
                    <span>{lec.lectureType}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canLaunch && onOpenSession && (
                    <button
                      onClick={() => onOpenSession(lec)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold hover:bg-blue-800"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{lec.status === 'attendance_open' ? (isAr ? 'فتح شاشة الحضور' : 'Open Live Session') : (isAr ? 'بدء جلسة الحضور' : 'Start Attendance')}</span>
                    </button>
                  )}

                  {canSchedule && lec.status !== 'approved' && lec.status !== 'cancelled' && (
                    <>
                      <button
                        onClick={() => {
                          setRescheduleTarget(lec);
                          setRescheduleForm({
                            date: lec.lectureDate,
                            startTime: lec.startTime,
                            endTime: lec.endTime,
                            replacementLecturerId: lec.lecturerId,
                            reason: '',
                          });
                        }}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إعادة جدولة / بديل' : 'Reschedule / Sub'}</span>
                      </button>
                      <button
                        onClick={() => updateLectureStatus(lec.id, 'cancelled', {}, 'Cancelled by administration')}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Recurring Modal */}
      {modalOpen && editLecture && (
        <Modal title={isAr ? 'جدولة محاضرة دراسات عليا' : 'Schedule Postgraduate Lecture'} onClose={() => setModalOpen(false)}>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'المادة الدراسية' : 'Subject'}</label>
              <select
                value={editLecture.subjectId || ''}
                onChange={(e) => {
                  const sub = dataset.subjects.find((s) => s.id === e.target.value);
                  setEditLecture({
                    ...editLecture,
                    subjectId: e.target.value,
                    departmentId: sub?.departmentId || editLecture.departmentId,
                    programId: sub?.programId || editLecture.programId,
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="">—</option>
                {dataset.subjects.map((s) => <option key={s.id} value={s.id}>{s.code} · {isAr ? s.nameAr : s.nameEn}</option>)}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'التدريسي المسؤول' : 'Lecturer'}</label>
              <select
                value={editLecture.lecturerId || ''}
                onChange={(e) => setEditLecture({ ...editLecture, lecturerId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="">—</option>
                {dataset.lecturers.map((l) => <option key={l.id} value={l.id}>{l.academicTitleAr} {isAr ? l.fullNameAr : l.fullNameEn}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'التاريخ' : 'Date'}</label>
                <input type="date" value={editLecture.lectureDate || ''} onChange={(e) => setEditLecture({ ...editLecture, lectureDate: e.target.value })} className="w-full px-2.5 py-2 rounded-xl border border-slate-200" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'من' : 'Start'}</label>
                <input type="time" value={editLecture.startTime || '09:00'} onChange={(e) => setEditLecture({ ...editLecture, startTime: e.target.value })} className="w-full px-2.5 py-2 rounded-xl border border-slate-200" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'إلى' : 'End'}</label>
                <input type="time" value={editLecture.endTime || '11:00'} onChange={(e) => setEditLecture({ ...editLecture, endTime: e.target.value })} className="w-full px-2.5 py-2 rounded-xl border border-slate-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'القاعة الدراسية' : 'Classroom'}</label>
                <input value={editLecture.classroom || ''} onChange={(e) => setEditLecture({ ...editLecture, classroom: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'نوع المحاضرة' : 'Type'}</label>
                <select value={editLecture.lectureType || 'regular'} onChange={(e) => setEditLecture({ ...editLecture, lectureType: e.target.value as LectureType })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                  <option value="regular">{isAr ? 'محاضرة اعتيادية' : 'Regular'}</option>
                  <option value="makeup">{isAr ? 'محاضرة تعويضية' : 'Makeup'}</option>
                  <option value="additional">{isAr ? 'محاضرة إضافية' : 'Additional'}</option>
                  <option value="seminar">{isAr ? 'سمنار بحثي' : 'Seminar'}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 font-semibold text-slate-600 mb-1">
                <Repeat className="w-3.5 h-3.5 text-[#1565C0]" />
                <span>{isAr ? 'توليد تكرار أسبوعي (عدد الأسابيع)' : 'Weekly Recurrence (Weeks)'}</span>
              </label>
              <input type="number" min={1} max={16} value={repeatWeeks} onChange={(e) => setRepeatWeeks(Math.max(1, Math.min(16, Number(e.target.value))))} className="w-full px-3 py-2 rounded-xl border border-slate-200" />
            </div>

            {activeConflicts.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                {activeConflicts.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-amber-800 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{isAr ? c.messageAr : c.messageEn}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600">
                {t.actions.cancel}
              </button>
              <button onClick={handleSaveSchedule} className="px-4 py-2 rounded-xl bg-[#1565C0] text-white font-semibold hover:bg-blue-800">
                {t.actions.save}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reschedule / Replacement Lecturer Modal */}
      {rescheduleTarget && (
        <Modal title={isAr ? 'إعادة جدولة أو تكليف تدريسي بديل' : 'Reschedule or Assign Replacement'} onClose={() => setRescheduleTarget(null)}>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <input type="date" value={rescheduleForm.date} onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })} className="px-2.5 py-2 rounded-xl border border-slate-200" />
              <input type="time" value={rescheduleForm.startTime} onChange={(e) => setRescheduleForm({ ...rescheduleForm, startTime: e.target.value })} className="px-2.5 py-2 rounded-xl border border-slate-200" />
              <input type="time" value={rescheduleForm.endTime} onChange={(e) => setRescheduleForm({ ...rescheduleForm, endTime: e.target.value })} className="px-2.5 py-2 rounded-xl border border-slate-200" />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'التدريسي المكلف / البديل' : 'Responsible / Replacement Lecturer'}</label>
              <select value={rescheduleForm.replacementLecturerId} onChange={(e) => setRescheduleForm({ ...rescheduleForm, replacementLecturerId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                {dataset.lecturers.map((l) => <option key={l.id} value={l.id}>{l.academicTitleAr} {isAr ? l.fullNameAr : l.fullNameEn}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">{isAr ? 'سبب التعديل' : 'Reason'}</label>
              <input value={rescheduleForm.reason} onChange={(e) => setRescheduleForm({ ...rescheduleForm, reason: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200" />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => setRescheduleTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold">{t.actions.cancel}</button>
              <button
                onClick={async () => {
                  const rep = dataset.lecturers.find((l) => l.id === rescheduleForm.replacementLecturerId);
                  await updateLectureStatus(
                    rescheduleTarget.id,
                    'rescheduled',
                    {
                      lectureDate: rescheduleForm.date,
                      startTime: rescheduleForm.startTime,
                      endTime: rescheduleForm.endTime,
                      replacementLecturerId: rep?.id || '',
                      lecturerNameAr: rep?.fullNameAr || rescheduleTarget.lecturerNameAr,
                      lecturerNameEn: rep?.fullNameEn || rescheduleTarget.lecturerNameEn,
                    },
                    rescheduleForm.reason || 'Rescheduled',
                  );
                  pushToast('success', isAr ? 'تم تحديث جدول المحاضرة' : 'Lecture rescheduled');
                  setRescheduleTarget(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#1565C0] text-white font-semibold"
              >
                {t.actions.save}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
