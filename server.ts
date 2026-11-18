import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import { runDeterministicTool, runNonAiFallbackQuery, ScopedContext } from './server/analyticsEngine';
import { getBaghdadDateString, getBaghdadTimeString } from './src/lib/attendanceMath';
import { SGASDataset, UserRole } from './src/types/sgas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = fs.existsSync(firebaseConfigPath)
  ? JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'))
  : { projectId: '' };

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

// Server-side cryptographic secret for HMAC-SHA256 QR tokens (ephemeral fallback in dev if env unset)
const QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || crypto.randomBytes(32).toString('hex');

// Sliding window rate limiter for QR verification & AI calls
const rateBucket = new Map<string, number[]>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateBucket.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    rateBucket.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBucket.set(key, timestamps);
  return true;
}

export function signQrPayload(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', QR_HMAC_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyQrToken(token: string): {
  valid: boolean;
  code?: 'INVALID_FORMAT' | 'INVALID_SIGNATURE' | 'EXPIRED';
  payload?: {
    sessionId: string;
    lectureId: string;
    subjectId: string;
    issuedAt: number;
    expiresAt: number;
    nonce: string;
  };
  tokenHash?: string;
} {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, code: 'INVALID_FORMAT' };
  }
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', QR_HMAC_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, code: 'INVALID_SIGNATURE' };
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (!parsed.expiresAt || Date.now() > Number(parsed.expiresAt)) {
      return { valid: false, code: 'EXPIRED', payload: parsed };
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return { valid: true, payload: parsed, tokenHash };
  } catch {
    return { valid: false, code: 'INVALID_FORMAT' };
  }
}

async function verifyAuthHeader(req: express.Request): Promise<{
  uid: string;
  email?: string;
  isDemo?: boolean;
} | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // Explicit isolated demo token (never grants access to Firestore)
  if (token.startsWith('DEMO_SANDBOX_')) {
    return { uid: token.replace('DEMO_SANDBOX_', ''), isDemo: true };
  }

  if (!firebaseConfig.projectId) return null;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      audience: firebaseConfig.projectId,
    });
    if (!payload.sub) return null;
    return {
      uid: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      isDemo: false,
    };
  } catch {
    return null;
  }
}

const GEMINI_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_attendance_summary',
    description: 'Get overall attendance and student summary statistics for the authorized scope.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: 'Optional YYYY-MM-DD date filter in Asia/Baghdad.' },
      },
    },
  },
  {
    name: 'get_daily_attendance',
    description: 'Get attendance numbers and lecture statuses for a specific day (defaults to today in Baghdad).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: 'YYYY-MM-DD date in Asia/Baghdad.' },
      },
    },
  },
  {
    name: 'get_date_range_attendance',
    description: 'Get attendance and completed academic hours across a custom date range.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: { type: Type.STRING, description: 'Start date YYYY-MM-DD' },
        endDate: { type: Type.STRING, description: 'End date YYYY-MM-DD' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_student_attendance',
    description: 'Retrieve deterministic attendance percentage, attended/absent hours, and warning status for students matching a query.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        studentQuery: { type: Type.STRING, description: 'University ID or name fragment' },
      },
    },
  },
  {
    name: 'get_subject_attendance',
    description: 'Retrieve attendance rate and completed lecture counts per subject.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        subjectQuery: { type: Type.STRING, description: 'Optional subject code or name fragment' },
      },
    },
  },
  {
    name: 'get_department_statistics',
    description: 'Compare attendance rates, Masters vs PhD counts, and lecture volume across authorized academic departments.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_lecturer_statistics',
    description: 'Get lecture counts, delivered academic hours, and pending approvals per lecturer.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_absence_threshold_students',
    description: 'List pseudonymized student IDs approaching or exceeding the configured absence limit.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_pending_approvals',
    description: 'List lectures whose attendance sessions are open or awaiting lecturer approval.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_lecture_history',
    description: 'List recent scheduled and completed lectures.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.NUMBER, description: 'Max items (up to 50)' },
      },
    },
  },
  {
    name: 'generate_attendance_report',
    description: 'Prepare an actionable link to generate an official Excel/PDF/CSV report.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportType: { type: Type.STRING, description: 'Type of report (daily, weekly, department, student, absence)' },
        period: { type: Type.STRING, description: 'Reporting period label' },
      },
      required: ['reportType'],
    },
  },
];

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'SGAS',
      timezone: 'Asia/Baghdad',
      baghdadDate: getBaghdadDateString(),
      baghdadTime: getBaghdadTimeString(),
    });
  });

  // Dynamic Cryptographic QR Token Signing
  app.post('/api/qr/sign', async (req, res) => {
    const caller = await verifyAuthHeader(req);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!checkRateLimit(`sign:${caller.uid}`, 60, 60_000)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const { sessionId, lectureId, subjectId, rotationSeconds } = req.body || {};
    if (!sessionId || !lectureId || !subjectId) {
      return res.status(400).json({ error: 'Missing sessionId, lectureId, or subjectId' });
    }

    const rotSec = Math.min(Math.max(Number(rotationSeconds) || 30, 10), 300);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + rotSec * 1000;
    const nonce = crypto.randomBytes(16).toString('hex');

    const token = signQrPayload({
      sessionId,
      lectureId,
      subjectId,
      issuedAt,
      expiresAt,
      nonce,
    });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    res.json({
      token,
      tokenHash,
      issuedAt,
      expiresAt,
      rotationSeconds: rotSec,
    });
  });

  // Server-Side QR Token Verification with Rate Limiting & Expiration Check
  app.post('/api/qr/verify', async (req, res) => {
    const caller = await verifyAuthHeader(req);
    const rateKey = caller ? `verify:${caller.uid}` : `verify:${req.ip}`;
    if (!checkRateLimit(rateKey, 15, 60_000)) {
      return res.status(429).json({
        valid: false,
        code: 'RATE_LIMITED',
        message: 'تم تجاوز الحد المسموح لمحاولات مسح الرمز. يرجى الانتظار دقيقة.',
      });
    }
    if (!caller) {
      return res.status(401).json({ valid: false, code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const { token } = req.body || {};
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ valid: false, code: 'INVALID_FORMAT', message: 'Missing QR token' });
    }

    const result = verifyQrToken(token.trim());
    if (!result.valid) {
      const status = result.code === 'EXPIRED' ? 410 : 400;
      return res.status(status).json({
        valid: false,
        code: result.code,
        message:
          result.code === 'EXPIRED'
            ? 'انتهت صلاحية رمز QR. يرجى مسح الرمز المحدّث على الشاشة.'
            : 'رمز QR غير صالح أو تم التلاعب به.',
      });
    }

    return res.json({
      valid: true,
      ...result.payload,
      tokenHash: result.tokenHash,
      serverTimeBaghdad: `${getBaghdadDateString()}T${getBaghdadTimeString()}+03:00`,
    });
  });

  // Graduate AI Assistant (Gemini Function Calling + Deterministic Fallback)
  app.post('/api/ai/chat', async (req, res) => {
    const caller = await verifyAuthHeader(req);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!checkRateLimit(`ai:${caller.uid}`, 20, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit exceeded' });
    }

    const { message, history, role, departmentId, linkedEntityId, dataset, lang } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const safeRole: UserRole = ['super_admin', 'pg_admin', 'dept_admin', 'lecturer', 'student'].includes(role)
      ? role
      : 'student';

    const scopedCtx: ScopedContext = {
      uid: caller.uid,
      role: safeRole,
      departmentId: typeof departmentId === 'string' ? departmentId : undefined,
      linkedEntityId: typeof linkedEntityId === 'string' ? linkedEntityId : undefined,
      dataset: dataset as SGASDataset,
    };

    // Prompt injection guard: never allow instruction override or arbitrary SQL/mutations
    const lowerMsg = message.toLowerCase();
    if (
      lowerMsg.includes('drop table') ||
      lowerMsg.includes('ignore previous instructions') ||
      lowerMsg.includes('reveal api key') ||
      lowerMsg.includes('system prompt')
    ) {
      return res.json({
        answer:
          lang === 'en'
            ? 'For security reasons, I can only answer authorized read-only postgraduate attendance and academic statistics queries.'
            : 'لأسباب أمنية، أستطيع فقط الإجابة عن استفسارات الحضور والإحصاءات الأكاديمية المصرح بها للقراءة فقط.',
        toolsCalled: [],
        toolResults: [],
        modelUsed: 'security-guard',
        status: 'denied',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fb = runNonAiFallbackQuery(message, scopedCtx);
      return res.json({
        answer:
          lang === 'en'
            ? 'AI service key is not configured. Showing deterministic statistics from the authorized database:'
            : 'مفتاح خدمة الذكاء الاصطناعي غير مضبوط حالياً. إليك النتائج المحسوبة مباشرة من قاعدة البيانات المصرح بها:',
        toolsCalled: [fb.tool],
        toolResults: [{ tool: fb.tool, data: fb.data }],
        modelUsed: 'deterministic-fallback',
        status: 'fallback',
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `You are "Graduate AI Assistant" (المساعد الذكي للدراسات العليا) for Middle Technical University – Technical College of Management – Baghdad (الجامعة التقنية الوسطى – الكلية التقنية الإدارية – بغداد).
Rules:
1. Respond in the user's language (${lang === 'en' ? 'English' : 'Arabic'}) clearly and professionally.
2. ALWAYS call the provided read-only functions to retrieve real authorized database statistics. NEVER invent or estimate numbers.
3. Explicitly distinguish finalized/approved attendance from pending unapproved attendance, and state the reporting period (${getBaghdadDateString()} Asia/Baghdad).
4. Current user role is "${safeRole}". Do not disclose records outside their scope, and never expose API keys or internal credentials.
5. You are strictly read-only and cannot modify attendance records.`;

      const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-6)) {
          if (h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string') {
            contents.push({ role: h.role, parts: [{ text: h.text }] });
          }
        }
      }
      contents.push({ role: 'user', parts: [{ text: message }] });

      const toolsCalled: string[] = [];
      const toolResults: Array<{ tool: string; data: unknown }> = [];

      let response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: GEMINI_TOOLS }],
        },
      });

      // Up to 3 tool-calling rounds
      for (let round = 0; round < 3; round++) {
        const fCalls = response.functionCalls;
        if (!fCalls || fCalls.length === 0) break;

        const previousContent = response.candidates?.[0]?.content;
        if (previousContent) {
          contents.push(previousContent as unknown as { role: string; parts: Array<Record<string, unknown>> });
        }

        const responseParts: Array<Record<string, unknown>> = [];
        for (const call of fCalls) {
          const fnName = call.name || 'get_attendance_summary';
          toolsCalled.push(fnName);
          const fnResult = runDeterministicTool(fnName, (call.args as Record<string, unknown>) || {}, scopedCtx);
          toolResults.push({ tool: fnName, data: fnResult });
          responseParts.push({
            functionResponse: {
              id: call.id,
              name: fnName,
              response: { result: fnResult },
            },
          });
        }

        contents.push({ role: 'user', parts: responseParts });

        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
          },
        });
      }

      const answerText = response.text || (lang === 'en' ? 'Analysis completed.' : 'تم استخراج التحليل المطلوب.');
      return res.json({
        answer: answerText,
        toolsCalled,
        toolResults,
        modelUsed: 'gemini-4-hydrogen',
        status: 'success',
      });
    } catch (err) {
      console.error('Gemini AI error:', err);
      const fb = runNonAiFallbackQuery(message, scopedCtx);
      return res.json({
        answer:
          lang === 'en'
            ? 'AI service quota or connection is currently unavailable. Showing deterministic database statistics via fallback engine:'
            : 'خدمة الذكاء الاصطناعي غير متاحة حالياً أو تم استنفاد الحصة المجانية. تم عرض الإحصاءات الدقيقة عبر محرك البحث الحتمي البديل:',
        toolsCalled: [fb.tool],
        toolResults: [{ tool: fb.tool, data: fb.data }],
        modelUsed: 'deterministic-fallback',
        status: 'fallback',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SGAS server running on http://0.0.0.0:${PORT}`);
  });
}

// Start server only when executed directly (allows importing verifyQrToken in unit tests)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  createServer().catch((err) => {
    console.error('Failed to start SGAS server:', err);
    process.exit(1);
  });
}
