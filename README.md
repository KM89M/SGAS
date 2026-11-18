# SGAS — Smart Graduate Attendance System
### نظام إدارة حضور طلبة الدراسات العليا الذكي

**Middle Technical University (MTU) – Technical College of Management – Baghdad – Postgraduate Studies Department**  
**الجامعة التقنية الوسطى – الكلية التقنية الإدارية – بغداد – شعبة الدراسات العليا (العراق)**

---

## Free Hosting & Deployment Options (الاستضافة المجانية)

### Option 1: Direct Free Sharing via Google AI Studio (الأسرع — مجاني وجاهز فوراً)
- Your app is already running on Google Cloud Run behind AI Studio.
- Click **Share App** in AI Studio to publish the live Shared App URL for students, lecturers, and admins with zero extra server setup.
- All Firebase Auth, Firestore (`ai-studio-43998458-b1b4-4055-979f-40009ea411b0`), Dynamic QR, and Gemini AI routes work automatically.

### Option 2: Render Free Web Service (`render.yaml` included)
1. Push this project to a GitHub repository.
2. In **Render.com** → **New +** → **Blueprint** (or **Web Service**) and select the repository (`render.yaml` configures `plan: free`, `buildCommand: npm install && npm run build`, `startCommand: npm start`).
3. Set `GEMINI_API_KEY` in Environment Variables (and keep the auto-generated `QR_HMAC_SECRET`).
4. **Important**: Add your `https://your-app.onrender.com` domain inside **Firebase Console → Authentication → Settings → Authorized domains** so Google Sign-In works.

### Option 3: Vercel Free Hobby Tier (`vercel.json` + `api/index.ts` included)
1. Push this repository to GitHub and import it on **Vercel.com** (Free Hobby Plan).
2. `vercel.json` builds the Vite PWA frontend (`dist/`) and deploys Express `/api/*` routes (`api/index.ts`) as serverless functions.
3. Add Environment Variables in Vercel Project Settings:
   - `QR_HMAC_SECRET`: a fixed 64-character hex string (critical so QR verification shares the same HMAC key across serverless invocations).
   - `GEMINI_API_KEY`: your Gemini API key (optional; deterministic fallback works even without it).
4. Add your `https://your-app.vercel.app` domain in **Firebase Console → Authentication → Settings → Authorized domains**.

---

## Architecture & Core Capabilities
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 (Arabic RTL default with instant English LTR switching, `Asia/Baghdad` timezone, PWA installable via `vite-plugin-pwa`).
- **Authentication & RBAC**: Firebase Authentication (Google Sign-In provisioned) + invite-only institutional access (`/userInvites`). Bootstrapped Super Admin: `abawybaghdad@gmail.com`.
- **Database**: Cloud Firestore (`firebase-applet-config.json` + `firebase-blueprint.json` + linted/deployed `firestore.rules`). Production initializes cleanly with zero synthetic student/lecturer/schedule records.
- **Isolated Demo Sandbox Mode**: Accessible from the login screen (`sgas_demo_sandbox_v1` in `localStorage`) with preloaded synthetic Iraqi postgraduate data and role switcher, completely isolated from production Firestore.

---

## Setup & Commands
```bash
npm install
npm test        # Runs tests/sgas.test.ts (QR crypto, math, conflicts, RBAC, AI tools)
npm run lint    # TypeScript validation
npm run build   # Production Vite + PWA bundle
npm start       # Runs production Express server on port 3000
```

### Optional Email/Password & MFA in Firebase Console
1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **Email/Password** and/or **Multi-factor Authentication (MFA)** for `super_admin` and `pg_admin` accounts.
3. No code change to `firestore.rules` is required—rules enforce `request.auth.token.email_verified == true`.
