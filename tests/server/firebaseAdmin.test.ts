/**
 * Boundary test — Firebase Admin SDK initialization.
 *
 * `firebaseAdmin.ts` is the lazy-init bridge between Netlify env vars and the
 * Firestore SDK. Three things in there can silently break Firestore connectivity
 * in production with no clear error:
 *
 *   1. `FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')` — the env var arrives with
 *      LITERAL "\n" sequences (Netlify dashboard encoding); the replacement
 *      converts them to real newlines so `cert()` accepts the PEM. If a future
 *      refactor drops the replace, every Firestore request fails authn.
 *
 *   2. `getApps().length > 0` short-circuit — Netlify functions reuse the same
 *      Lambda container; double-init crashes the SDK on the second invocation.
 *
 *   3. `_db` memoization in `getDb()` — repeated calls must return the SAME
 *      Firestore instance, not re-init.
 *
 * No existing test covers any of these. They aren't theoretical: the newline
 * encoding has been the #1 most common Firebase Admin deploy bug for years
 * (see firebase-admin issues #687, #1067).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { certMock, initializeAppMock, getAppsMock, getFirestoreMock } = vi.hoisted(() => ({
  certMock: vi.fn(),
  initializeAppMock: vi.fn(),
  getAppsMock: vi.fn(),
  getFirestoreMock: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: initializeAppMock,
  cert: certMock,
  getApps: getAppsMock,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: getFirestoreMock,
}));

beforeEach(() => {
  // Each test re-imports firebaseAdmin so the module-level `_db` cache is fresh.
  vi.resetModules();
  certMock.mockReset();
  initializeAppMock.mockReset();
  getAppsMock.mockReset();
  getFirestoreMock.mockReset();
  // Default: no apps initialized yet (cold start).
  getAppsMock.mockReturnValue([]);
  // Default: getFirestore returns a sentinel object so we can identity-compare.
  getFirestoreMock.mockReturnValue({ __id: 'firestore-instance' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('firebaseAdmin — private key newline transformation', () => {
  it('converts literal "\\n" sequences in FIREBASE_PRIVATE_KEY to real newlines before cert()', async () => {
    // The exact format Netlify dashboards produce: PEM with \n escaped as
    // backslash-n. Without the replace, cert() rejects this with
    // "Invalid PEM formatted message".
    const escapedKey =
      '-----BEGIN PRIVATE KEY-----\\nMIIEv...\\nQwIDAQAB\\n-----END PRIVATE KEY-----\\n';
    const expectedKey =
      '-----BEGIN PRIVATE KEY-----\nMIIEv...\nQwIDAQAB\n-----END PRIVATE KEY-----\n';

    process.env.FIREBASE_PRIVATE_KEY = escapedKey;
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'sa@test.iam.gserviceaccount.com';

    const { getDb } = await import('@/server/firebaseAdmin');
    getDb();

    expect(certMock).toHaveBeenCalledOnce();
    const certArg = certMock.mock.calls[0][0];
    expect(certArg.privateKey).toBe(expectedKey);
    expect(certArg.privateKey).not.toContain('\\n'); // mutation-kill: ensure replace actually ran
  });

  it('handles a private key WITHOUT escaped newlines (already in raw form)', async () => {
    // Some local-dev setups store the key raw. The replace is a no-op in this
    // case — the regex matches nothing — and the raw key passes through.
    const rawKey = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n';
    process.env.FIREBASE_PRIVATE_KEY = rawKey;
    process.env.FIREBASE_PROJECT_ID = 'p';
    process.env.FIREBASE_CLIENT_EMAIL = 'c';

    const { getDb } = await import('@/server/firebaseAdmin');
    getDb();

    expect(certMock.mock.calls[0][0].privateKey).toBe(rawKey);
  });

  it('passes undefined privateKey through when env var is unset (lets cert() throw a clear error)', async () => {
    delete process.env.FIREBASE_PRIVATE_KEY;
    process.env.FIREBASE_PROJECT_ID = 'p';
    process.env.FIREBASE_CLIENT_EMAIL = 'c';

    const { getDb } = await import('@/server/firebaseAdmin');
    getDb();

    expect(certMock.mock.calls[0][0].privateKey).toBeUndefined();
  });
});

describe('firebaseAdmin — credential and storage bucket forwarding', () => {
  it('forwards projectId, clientEmail, and storageBucket from env to cert/initializeApp', async () => {
    process.env.FIREBASE_PROJECT_ID = 'bless-your-heart-prod';
    process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk@bless-your-heart.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = 'key';
    process.env.FIREBASE_STORAGE_BUCKET = 'bless-your-heart-prod.appspot.com';

    const { getDb } = await import('@/server/firebaseAdmin');
    getDb();

    expect(certMock.mock.calls[0][0]).toMatchObject({
      projectId: 'bless-your-heart-prod',
      clientEmail: 'firebase-adminsdk@bless-your-heart.iam.gserviceaccount.com',
    });
    expect(initializeAppMock.mock.calls[0][0]).toMatchObject({
      storageBucket: 'bless-your-heart-prod.appspot.com',
    });
  });
});

describe('firebaseAdmin — initialization idempotency', () => {
  it('skips initializeApp when getApps reports an existing app (Lambda warm-start)', async () => {
    // Netlify Functions reuse the Lambda container across requests. On the
    // second invocation, `getApps().length > 0` so we MUST NOT init twice —
    // double-init throws "The default Firebase app already exists".
    getAppsMock.mockReturnValue([{ name: '[DEFAULT]' }]);
    process.env.FIREBASE_PROJECT_ID = 'p';
    process.env.FIREBASE_CLIENT_EMAIL = 'c';
    process.env.FIREBASE_PRIVATE_KEY = 'k';

    const { getDb } = await import('@/server/firebaseAdmin');
    getDb();

    expect(initializeAppMock).not.toHaveBeenCalled();
    expect(certMock).not.toHaveBeenCalled();
    expect(getFirestoreMock).toHaveBeenCalledOnce();
  });

  it('caches the Firestore instance — repeated getDb() calls return the SAME object', async () => {
    process.env.FIREBASE_PROJECT_ID = 'p';
    process.env.FIREBASE_CLIENT_EMAIL = 'c';
    process.env.FIREBASE_PRIVATE_KEY = 'k';

    const { getDb } = await import('@/server/firebaseAdmin');
    const first = getDb();
    const second = getDb();
    const third = getDb();

    expect(first).toBe(second);
    expect(second).toBe(third);
    // initializeApp called once (cold start), getFirestore called once (cache miss).
    // getDb() invocations 2 and 3 must NOT re-call either.
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    expect(getFirestoreMock).toHaveBeenCalledTimes(1);
  });
});
