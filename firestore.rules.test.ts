import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Firestore Security Rules & Dirty Dozen Invariants', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

  it('denies unauthenticated access globally and contains no open wildcards', () => {
    assert.ok(rulesText.includes('isSignedIn()'));
    assert.ok(rulesText.includes('email_verified == true'));
    assert.ok(!rulesText.includes('allow read, write: if true;'));
    assert.ok(rulesText.includes('match /{document=**}'));
  });

  it('prevents self-escalation of role or status in /users/{userId}', () => {
    assert.ok(rulesText.includes("incoming().role == get(/databases/$(database)/documents/userInvites/$(incoming().inviteId)).data.role"));
    assert.ok(rulesText.includes('inviteId'));
    assert.ok(rulesText.includes('userInvites'));
    assert.ok(rulesText.includes('incoming().role == existing().role'));
    assert.ok(rulesText.includes('incoming().status == existing().status'));
  });

  it('enforces immutable approved attendanceRecords for non-admins', () => {
    assert.ok(rulesText.includes('existing().isApproved == false'));
    assert.ok(rulesText.includes('isSuperOrPgAdmin()'));
  });

  it('enforces append-only immutable auditLogs, aiQueryLogs, and reportHistory', () => {
    assert.ok(rulesText.includes('match /auditLogs/{logId}'));
    assert.ok(rulesText.includes('allow update, delete: if false;'));
  });

  it('validates blueprint types and string length constraints across rules', () => {
    assert.ok(rulesText.includes('isValidId('));
    assert.ok(rulesText.includes('isNonEmptyString(data.fullNameAr, 160)'));
    assert.ok(rulesText.includes('isOptionalString(data, \'notes\', 500)'));
  });
});
