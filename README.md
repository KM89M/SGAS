# SGAS — Smart Graduate Attendance System
### نظام إدارة حضور طلبة الدراسات العليا الذكي

**Middle Technical University (MTU) – Technical College of Management – Baghdad – Postgraduate Studies Department**  
**الجامعة التقنية الوسطى – الكلية التقنية الإدارية – بغداد – شعبة الدراسات العليا (العراق)**

---

## Architecture & Core Capabilities
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 (Arabic RTL default with instant English LTR switching, `Asia/Baghdad` timezone, PWA installable via `vite-plugin-pwa`).
- **Authentication & RBAC**: Firebase Authentication (Google Sign-In provisioned) + invite-only institutional access (`/userInvites`). Roles enforced at both UI and `firestore.rules` levels:
  - `super_admin` (Bootstrapped Super Admin: `abawybaghdad@gmail.com`)
  - `pg_admin` (Postgraduate Studies Administration)
  - `dept_admin` (Department Administrator, scoped strictly to assigned `departmentId`)
  - `lecturer` (Academic Lecturer)
  - `student` (Postgraduate Student)
- **Database**: Cloud Firestore (`firebase-applet-config.json` + `firebase-blueprint.json` + linted/deployed `firestore.rules`). Production initializes cleanly with zero synthetic student/lecturer/schedule records.
- **Isolated Demo Sandbox Mode**: Accessible from the login screen (`sgas_demo_sandbox_v1` in `localStorage`) with preloaded synthetic Iraqi postgraduate data and an instant role switcher, completely isolated from production Firestore.
- **Server (`server.ts`)**: Express + Vite middleware on port `3000`:
  - `POST /api/qr/sign` & `POST /api/qr/verify`: Cryptographic HMAC-SHA256 dynamic QR tokens (30s default rotation), server-side expiry verification, rate limiting, and SHA-256 token hashing.
  - `POST /api/ai/chat`: Server-side Gemini (`gemini-4-hydrogen` via `@google/genai`) with 11 read-only deterministic analytics tools + RBAC scope filtering + prompt-injection defense + automatic non-AI deterministic fallback.

---

## Setup & Deployment Guide

### 1. Prerequisites
- Node.js 20+
- Firebase project (`firebase-applet-config.json` provisioned)
- `GEMINI_API_KEY` configured in runtime environment / Secrets panel

### 2. Environment Variables (`.env.example`)
```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
QR_HMAC_SECRET="OPTIONAL_32_BYTE_SECRET"
```

### 3. Install, Test, Lint, Build
```bash
npm install
npm test        # Runs tests/sgas.test.ts (QR crypto, math, conflicts, RBAC, AI tools)
npm run lint    # TypeScript validation
npm run build   # Production Vite + PWA bundle
npm start       # Runs production Express server on port 3000
```

### 4. First Super Admin Bootstrap & Invitations
1. Sign in via Google on the login screen using `abawybaghdad@gmail.com`.
2. SGAS automatically initializes `users/{uid}`, `admins/{uid}`, `systemSettings/default`, and `attendancePolicies/default`.
3. Open **Settings (الإعدادات)** to:
   - Upload/configure official University & College Logo URLs.
   - Configure absence thresholds (`maxAbsencePercent`, warning tiers, `academicHourMinutes`, `defaultQrRotationSeconds`).
   - Issue **Institutional Invites (`userInvites`)** for `pg_admin`, `dept_admin`, `lecturer`, and `student` accounts. Public self-registration is blocked by `firestore.rules`.

### 5. Optional Email/Password & MFA in Firebase Console
Google Sign-In is enabled by default. To optionally allow institutional Email/Password sign-in or Multi-Factor Authentication (SMS/TOTP):
1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **Email/Password** and/or **Multi-factor Authentication (MFA)** for `super_admin` and `pg_admin` accounts.
3. No code change to `firestore.rules` is required—rules enforce `request.auth.token.email_verified == true`.

### 6. Backup & Restore
- Open **Import & Export Center (الاستيراد والتصدير)** to export or restore full institutional JSON snapshots, or download Excel (`.xlsx`) templates for all 7 core entities with pre-commit validation and duplicate checking.
