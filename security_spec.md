# SGAS Firestore Security Specification (Phase 0: Payload-First Security TDD)

## 1. Core Data Invariants
1. **Master Admin Authority**: Only the bootstrapped Super Admin (`abawybaghdad@gmail.com`, verified email) or explicitly registered `/admins/{uid}` documents with `super_admin`/`pg_admin` role may manage institutional structure, policies, and user invitations.
2. **No Self-Assigned Privileges**: A user creating or reading their profile in `/users/{uid}` cannot assign or escalate their own `role` unless they match the bootstrapped Super Admin email or claim an active admin-created `/userInvites` record matching their verified email.
3. **PII Isolation**: Collections containing personal emails or phone numbers (`/users`, `/students`, `/lecturers`, `/userInvites`) forbid blanket reads (`allow read: if isSignedIn()`). Students may only read their own record (`uid == request.auth.uid`), while authorized department/postgraduate/super admins can manage authorized records.
4. **Deterministic Anti-Duplicate Attendance**: Every `/attendanceRecords/{recordId}` created by a student must bind `studentUid == request.auth.uid`, enforce `isApproved == false` on initial scan, verify the parent `/attendanceSessions/{sessionId}` exists and has `status == 'open'`, and use deterministic ID `${sessionId}_${studentId}` so duplicate submissions are rejected at the database layer.
5. **Approved Record Immutability**: Once `attendanceRecords/{recordId}.isApproved == true`, lecturers and students cannot edit it directly. Only authorized admins (`super_admin`, `pg_admin`) or an approved correction workflow may modify an approved record (with an accompanying audit log).
6. **Immutable Audit Trail**: `/auditLogs/{logId}` is strictly append-only (`allow update, delete: if false`).
7. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`.
8. **Path Hardening & Size Bounds**: Every single-document operation validates `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars), and all strings/lists enforce strict `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Role Escalation on User Create**: Authenticated student attempts `POST /users/{uid}` with `role: "super_admin"` without matching admin email or invite -> `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: Request with `email: "abawybaghdad@gmail.com"` and `email_verified: false` attempts admin write -> `PERMISSION_DENIED`.
3. **Ghost Field Shadow Injection**: Student submits valid attendance record with extra field `isApproved: true` or `shadowAdmin: true` -> `PERMISSION_DENIED` (`hasOnly` + schema check).
4. **Duplicate / Spoofed Student Attendance**: Student A tries to create `/attendanceRecords/sess1_studentB` with `studentUid: "studentB"` -> `PERMISSION_DENIED`.
5. **Closed Session Attendance Injection**: Student attempts to create `/attendanceRecords/{id}` when `/attendanceSessions/{sessionId}.status == "closed"` -> `PERMISSION_DENIED`.
6. **Direct Approval Bypass by Student**: Student updates own attendance record setting `isApproved: true` or `status: "present"` -> `PERMISSION_DENIED`.
7. **Post-Approval Tampering by Lecturer**: Lecturer attempts to modify `/attendanceRecords/{id}` after `existing().isApproved == true` -> `PERMISSION_DENIED`.
8. **Audit Log Deletion / Tampering**: Even a Super Admin attempts `DELETE /auditLogs/{logId}` or `UPDATE /auditLogs/{logId}` -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Attacker attempts `CREATE /departments/<200-char-junk-id!@#>` -> `PERMISSION_DENIED` (`isValidId`).
10. **PII Scraping List Query**: Student executes unbounded `list /students` without matching `uid == request.auth.uid` -> `PERMISSION_DENIED`.
11. **Backdated Timestamp Spoofing**: User attempts to set `createdAt` to `"2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
12. **Unbounded Array Exhaustion**: Admin/Lecturer writes `subjects/{id}` with `lecturerIds` containing 500 items or non-string element -> `PERMISSION_DENIED`.
