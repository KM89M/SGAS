import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Search, BarChart3, Sparkles, Database, RotateCcw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useSGAS } from '../context/SGASContext';
import { runNonAiFallbackQuery } from '../../server/analyticsEngine';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  toolsCalled?: string[];
  toolResults?: Array<{ tool: string; data: unknown }>;
}

export const AIAssistantView: React.FC<{ onOpenReports?: () => void }> = ({ onOpenReports }) => {
  const { lang, currentUser, dataset, getAuthToken, logAiActivity, pushToast } = useSGAS();
  const isAr = lang === 'ar';

  const makeWelcomeTurn = (): ChatTurn => ({
    id: 'welcome',
    role: 'model',
    text: isAr
      ? 'مرحباً بك في المساعد الذكي للدراسات العليا. أستطيع تحليل الحضور والغيابات والساعات المنجزة ومقارنة الأقسام والبرامج بناءً على صلاحياتك المباشرة وبيانات قاعدة البيانات المعتمدة فقط.'
      : 'Welcome to the Graduate AI Assistant. I answer read-only attendance, academic hours, and absence-limit questions using verified database tool queries within your role scope.',
  });

  const [mode, setMode] = useState<'ai' | 'deterministic'>('ai');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([makeWelcomeTurn()]);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, loading]);

  const examplePrompts = isAr
    ? [
        'كم عدد الطلبة الحاضرين اليوم؟',
        'من هم الطلبة الذين تجاوزوا نسبة الغياب المسموح بها؟',
        'اعرض مقارنة الحضور بين طلبة الماجستير والدكتوراه',
        'ما هو معدل الحضور لكل قسم علمي؟',
        'ما هي جلسات الحضور التي بانتظار اعتماد التدريسي؟',
      ]
    : [
        'How many students are present today?',
        'Which students exceeded the allowed absence threshold?',
        "Compare Master's vs PhD attendance summary",
        'Show attendance statistics per scientific department',
        'List sessions pending lecturer approval',
      ];

  const handleSend = async (promptOverride?: string) => {
    const queryText = (promptOverride ?? input).trim();
    if (!queryText || loading) return;

    const historyPayload = turns
      .filter((t) => t.id !== 'welcome' && t.text.trim().length > 0)
      .slice(-6)
      .map((t) => ({ role: t.role, text: t.text }));

    const userTurn: ChatTurn = { id: `u_${Date.now()}`, role: 'user', text: queryText };
    setTurns((prev) => [...prev, userTurn]);
    if (!promptOverride) setInput('');
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const token = await getAuthToken();
      const analyticsDataset = {
        departments: dataset.departments,
        programs: dataset.programs,
        students: dataset.students,
        lecturers: dataset.lecturers,
        subjects: dataset.subjects,
        enrollments: dataset.enrollments,
        lectures: dataset.lectures,
        records: dataset.records,
        sessions: dataset.sessions,
        policies: dataset.policies,
      };

      let data: {
        answer?: string;
        modelUsed?: string;
        toolsCalled?: string[];
        toolResults?: Array<{ tool: string; data: unknown }>;
        status?: string;
        error?: string;
      } | null = null;

      try {
        const resp = await fetch('/api/ai/chat', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: queryText,
            history: historyPayload,
            role: currentUser?.role || 'student',
            departmentId: currentUser?.departmentId,
            linkedEntityId: currentUser?.linkedEntityId,
            dataset: analyticsDataset,
            lang,
            deterministicOnly: mode === 'deterministic',
          }),
        });

        const contentType = resp.headers.get('content-type') || '';
        if (resp.status === 404 || resp.status === 405 || !contentType.includes('application/json')) {
          // Static host (e.g. GitHub Pages) has no Express backend; use client-side deterministic engine
          data = null;
        } else {
          const parsed = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            throw new Error(parsed.error || `Assistant request failed (${resp.status})`);
          }
          data = parsed;
        }
      } catch (fetchErr) {
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          throw fetchErr;
        }
        // If API endpoint unreachable (static hosting), fallback locally unless explicit API error
        if (fetchErr instanceof Error && fetchErr.message.startsWith('Assistant request failed')) {
          throw fetchErr;
        }
        data = null;
      }

      if (!data) {
        const fb = runNonAiFallbackQuery(queryText, {
          uid: currentUser?.uid || 'unknown',
          role: currentUser?.role || 'student',
          departmentId: currentUser?.departmentId,
          linkedEntityId: currentUser?.linkedEntityId,
          dataset,
        });
        data = {
          answer: isAr
            ? 'نتائج البحث الإحصائي المباشر من قاعدة البيانات المصرح بها:'
            : 'Direct statistical query results from your authorized database scope:',
          toolsCalled: [fb.tool],
          toolResults: [{ tool: fb.tool, data: fb.data }],
          modelUsed: 'client-deterministic',
          status: 'fallback',
        };
      }

      const modelTurn: ChatTurn = {
        id: `m_${Date.now()}`,
        role: 'model',
        text: data.answer || (isAr ? 'تم استخراج النتائج.' : 'Results retrieved.'),
        modelUsed: data.modelUsed,
        toolsCalled: data.toolsCalled,
        toolResults: data.toolResults,
      };
      setTurns((prev) => [...prev, modelTurn]);

      logAiActivity({
        actorUid: currentUser?.uid || 'unknown',
        actorRole: currentUser?.role || 'student',
        queryText,
        toolsCalled: data.toolsCalled || [],
        modelUsed: data.modelUsed || 'gemini-4-hydrogen',
        status: (data.status as 'success' | 'fallback' | 'denied') || 'success',
      }).catch(() => undefined);
    } catch (err) {
      const errMsg =
        err instanceof Error && err.name === 'AbortError'
          ? isAr
            ? 'انتهت مهلة انتظار الخادم، يمكنك إعادة المحاولة أو التحويل إلى البحث الإحصائي المباشر.'
            : 'Request timed out. You can try again or switch to Direct Stats Search.'
          : err instanceof Error
            ? err.message
            : 'AI query error';
      pushToast('error', errMsg);
      setTurns((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'model',
          text: errMsg,
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header & Mode Switch */}
      <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E3F2FD] text-[#1565C0] flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900">
              {isAr ? 'المساعد الذكي للدراسات العليا' : 'Graduate AI Assistant'}
            </h1>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'استعلامات ذكية للقراءة فقط مرتبطة بوظائف التحليل المعتمدة في قاعدة البيانات'
                : 'Read-only grounded analytics assistant scoped to your institutional role'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTurns([makeWelcomeTurn()])}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'محادثة جديدة' : 'New Chat'}</span>
          </button>

          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setMode('ai')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold ${
                mode === 'ai' ? 'bg-white text-[#1565C0] shadow-xs' : 'text-slate-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAr ? 'المحادثة الذكية' : 'AI Chat'}</span>
            </button>
            <button
              onClick={() => setMode('deterministic')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold ${
                mode === 'deterministic' ? 'bg-white text-[#1565C0] shadow-xs' : 'text-slate-600'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isAr ? 'البحث الإحصائي المباشر' : 'Direct Stats Search'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Example Prompt Suggestions */}
      <div className="flex flex-wrap gap-2">
        {examplePrompts.map((p) => (
          <button
            key={p}
            disabled={loading}
            onClick={() => handleSend(p)}
            className="px-3 py-1.5 rounded-xl bg-white border border-blue-100 text-xs font-medium text-[#1565C0] hover:bg-[#E3F2FD] transition-colors disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Conversation Thread */}
      <div className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4 min-h-[380px] max-h-[580px] overflow-y-auto">
        {turns.map((turn) => (
          <div key={turn.id} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-3xl rounded-2xl p-4 text-xs leading-relaxed space-y-3 ${
                turn.role === 'user'
                  ? 'bg-[#1565C0] text-white'
                  : 'bg-[#F5F9FF] border border-blue-100 text-slate-800 w-full'
              }`}
            >
              <div className="whitespace-pre-wrap">{turn.text}</div>

              {/* Render Structured Tool Output Cards / Mini-Charts */}
              {turn.toolResults?.map((tr, i) => (
                <ToolResultVisualizer
                  key={`${turn.id}_tr_${i}`}
                  tool={tr.tool}
                  data={tr.data}
                  isAr={isAr}
                  onOpenReports={onOpenReports}
                />
              ))}

              {turn.toolsCalled && turn.toolsCalled.length > 0 && (
                <div className="text-[11px] text-slate-500 pt-2 border-t border-blue-100/80 font-mono-num">
                  {turn.modelUsed} · {turn.toolsCalled.join(', ')}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? 'جاري استعلام قاعدة البيانات وتحليل النتائج...' : 'Querying authorized database tools...'}
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isAr
                ? 'اسأل عن الحضور اليومي، نسب الغياب، الساعات المنجزة، أو مقارنة الأقسام...'
                : 'Ask about daily attendance, absence limits, completed hours, or department stats...'
            }
            className="w-full ps-10 pe-4 py-3 rounded-2xl bg-white border border-blue-200 text-sm focus:outline-none focus:border-[#1565C0]"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-3 rounded-2xl bg-[#1565C0] text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 inline-flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          <span>{isAr ? 'إرسال' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
};

const ToolResultVisualizer: React.FC<{
  tool: string;
  data: unknown;
  isAr: boolean;
  onOpenReports?: () => void;
}> = ({ tool, data, isAr, onOpenReports }) => {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  if (tool === 'generate_attendance_report' && onOpenReports) {
    return (
      <div className="p-3 rounded-xl bg-white border border-blue-200 flex items-center justify-between gap-3">
        <span className="font-semibold text-[#1565C0]">
          {isAr ? 'جاهز لتصدير التقرير الرسمي (Excel / PDF / CSV)' : 'Ready to export official report'}
        </span>
        <button
          onClick={onOpenReports}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1565C0] text-white font-semibold"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>{isAr ? 'فتح مركز التقارير' : 'Open Reports Center'}</span>
        </button>
      </div>
    );
  }

  // Array visualization (departments, subjects, lecturers, students)
  const arrayKey = ['departments', 'subjects', 'lecturers', 'students', 'lectures'].find((k) => Array.isArray(obj[k]));
  const rows = arrayKey ? (obj[arrayKey] as Record<string, unknown>[]) : [];

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]).slice(0, 6);
    const chartEligible = tool === 'get_department_statistics' || tool === 'get_subject_attendance';
    return (
      <div className="space-y-3 bg-white border border-blue-100 rounded-xl p-3">
        {chartEligible && (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <XAxis dataKey={isAr ? 'nameAr' : 'nameEn'} tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="attendanceRatePercent" fill="#1565C0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-[#F5F9FF] text-slate-600">
              <tr>
                {keys.map((k) => (
                  <th key={k} className="p-2 text-start font-mono-num">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 12).map((r, idx) => (
                <tr key={idx}>
                  {keys.map((k) => (
                    <td key={k} className="p-2 font-mono-num">{String(r[k] ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Flat summary object display
  const entries = Object.entries(obj).filter(([, v]) => typeof v !== 'object');
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white border border-blue-100 rounded-xl p-3">
      {entries.map(([k, v]) => (
        <div key={k} className="p-2 rounded-lg bg-[#F5F9FF]">
          <div className="text-[10px] text-slate-500 font-mono-num truncate">{k}</div>
          <div className="font-bold text-slate-900 font-mono-num mt-0.5">{String(v)}</div>
        </div>
      ))}
    </div>
  );
};
