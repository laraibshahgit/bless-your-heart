import type { Handler, HandlerEvent } from '@netlify/functions';

// Health endpoint. Two modes:
//
//   GET /api/health?mode=live      Liveness only — proves the lambda is
//                                  warm and responding. Zero I/O. Cheap.
//                                  Use for uptime monitors that page on
//                                  outage of the function itself.
//
//   GET /api/health (default)      Readiness — verifies the lambda can
//                                  actually serve a `/generate` request:
//                                  required env vars present, Firestore
//                                  reachable. Returns 200 ok / 200
//                                  degraded / 503 unhealthy.
//
// Why not call Anthropic in readiness: every probe would burn ~$0.001 of
// Sonnet input. Readiness cares whether the *lambda* can serve traffic,
// not whether the upstream provider is up. Anthropic outages are observed
// via the existing `gen_anthropic_error` log + the runbook in
// `docs/RUNBOOKS.md`.
//
// Why not check the photo CDN: the photo URL is built client-side from
// `VITE_FIREBASE_STORAGE_BASE_URL`; the lambda never fetches photos. A
// photo-CDN outage is a client-visible problem the server can't observe.
//
// Cost: One Firestore read per readiness probe. Aggregator probes (e.g.
// uptime-monitor every 60s = 1440/day = 43 200/month) cost <<1¢ in Firestore
// reads at the free tier's 50 000 doc-reads/day quota.
//
// SECURITY:
//   - Never returns env-var values. Only presence/absence.
//   - Never returns Firestore credentials or stack traces.
//   - Never returns the IP-salt, API key, or any secret material.
//   - Wraps Firestore errors in a generic message. The full error goes to
//     the structured log only.
//
// The check has its own per-component timeout so a hung Firestore can't
// hang the whole probe — readiness either succeeds within ~2s or returns
// degraded with the failed component named.
//
// Audit run 40/001.

const FIRESTORE_PROBE_TIMEOUT_MS = 2_000;

// Probe document. Reading a single, known document is the cheapest way to
// verify Firestore connectivity + auth. We read the special `__health__`
// doc inside the same `rateLimits` collection used by the rate limiter —
// no schema change needed and no separate collection ACL to manage. The
// doc may not exist; we only care that the read SUCCEEDS, not what it
// returns. A missing-doc result still proves auth + network + read perms.
const HEALTH_COLLECTION = 'rateLimits';
const HEALTH_PROBE_DOC = '__health__';

interface ConfigCheck {
  name: 'config';
  status: 'ok' | 'fail';
  latency_ms: 0;
  message?: string;
}

interface FirestoreCheck {
  name: 'firestore';
  status: 'ok' | 'fail' | 'skipped';
  latency_ms: number;
  message?: string;
}

type HealthCheck = ConfigCheck | FirestoreCheck;

interface HealthBody {
  status: 'ok' | 'degraded' | 'unhealthy';
  mode: 'live' | 'ready';
  timestamp: string;
  // Cumulative wall-clock duration of the probe itself. Cheap to compute,
  // useful for the on-call dashboards: a probe that suddenly takes 1500ms
  // instead of 50ms is itself a signal.
  duration_ms: number;
  checks: HealthCheck[];
}

const baseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

// Production-required env vars MUST match `REQUIRED_PROD_VARS` in
// `src/server/configValidation.ts`. We check presence-only here (never
// values) — the validator already logs missing vars at cold-start; this
// surface lets a probe verify the same contract without grepping logs.
const REQUIRED_FOR_READINESS = [
  'ANTHROPIC_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  // IP_SALT_BASE and ALLOWED_ORIGINS are required-in-production but the
  // lambda still serves traffic without them (degraded behavior). We log
  // them as the validator does, but don't fail readiness on them — a probe
  // failing readiness should mean "the lambda CANNOT serve a request,"
  // not "the lambda is misconfigured." Same triage axis the validator
  // applies. Adjust if ops policy changes.
] as const;

function checkConfig(): ConfigCheck {
  const missing = REQUIRED_FOR_READINESS.filter((name) => {
    const v = process.env[name];
    return v === undefined || v.trim() === '';
  });
  if (missing.length === 0) {
    return { name: 'config', status: 'ok', latency_ms: 0 };
  }
  return {
    name: 'config',
    status: 'fail',
    latency_ms: 0,
    // Names only — never values. Same shape as the
    // config_validation_failed log line.
    message: `missing: ${missing.join(',')}`,
  };
}

async function checkFirestore(): Promise<FirestoreCheck> {
  const start = Date.now();

  // If Firebase config is missing, the Firestore client init throws —
  // skip the probe rather than producing a misleading "fail" with a
  // credential error in the message. The config check above already
  // surfaces the underlying problem.
  const firebaseMissing = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']
    .some((name) => {
      const v = process.env[name];
      return v === undefined || v.trim() === '';
    });
  if (firebaseMissing) {
    return {
      name: 'firestore',
      status: 'skipped',
      latency_ms: 0,
      message: 'firebase config missing',
    };
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    // Lazy import keeps the cold-start cost off the liveness path. Only
    // readiness pulls firebase-admin into memory.
    const { getDb } = await import('../../src/server/firebaseAdmin');
    const db = getDb();
    const docRef = db.collection(HEALTH_COLLECTION).doc(HEALTH_PROBE_DOC);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error('firestore probe timeout')),
        FIRESTORE_PROBE_TIMEOUT_MS
      );
    });

    // We don't care what the doc contains. The .get() either succeeds
    // (proving auth + network + read perms) or throws.
    await Promise.race([docRef.get(), timeoutPromise]);

    return { name: 'firestore', status: 'ok', latency_ms: Date.now() - start };
  } catch (err) {
    // Generic message to the consumer; the full error goes to the
    // structured log for ops.
    const elapsed = Date.now() - start;
    console.error(JSON.stringify({
      event: 'health_firestore_probe_failed',
      error: String(err),
      latency_ms: elapsed,
    }));
    return {
      name: 'firestore',
      status: 'fail',
      latency_ms: elapsed,
      message: 'firestore unreachable',
    };
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

function aggregateStatus(checks: HealthCheck[]): 'ok' | 'degraded' | 'unhealthy' {
  const failures = checks.filter((c) => c.status === 'fail');
  if (failures.length === 0) return 'ok';
  // Config failures = unhealthy (lambda fundamentally broken). Firestore
  // failures alone = degraded (rate-limit fails open; generation still
  // works). Mirrors the existing fail-open posture in `generate.ts`.
  const configFailed = failures.some((c) => c.name === 'config');
  return configFailed ? 'unhealthy' : 'degraded';
}

function statusCode(status: 'ok' | 'degraded' | 'unhealthy'): number {
  // Convention: 200 for serving, 503 only when the lambda CANNOT serve a
  // request. Degraded is still 200 because the user-visible behavior is
  // "generations succeed, rate-limit may fail open" — load balancers
  // should not pull this instance out of rotation for that.
  return status === 'unhealthy' ? 503 : 200;
}

const handler: Handler = async (event: HandlerEvent) => {
  const startedAt = Date.now();

  // GET (and HEAD for CDN/uptime probes that don't want the body) only.
  // Anything else returns 405 — same convention as `generate.ts`.
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return {
      statusCode: 405,
      headers: { ...baseHeaders, Allow: 'GET, HEAD' },
      body: JSON.stringify({
        status: 'error',
        message: 'Method not allowed. Use GET or HEAD.',
      }),
    };
  }

  const mode = (event.queryStringParameters?.mode ?? 'ready').toLowerCase();

  if (mode === 'live') {
    // Liveness: zero I/O, zero deps. Proves the lambda is reachable and
    // executing JS. Use this from cheap uptime monitors where you only
    // want to page on lambda-down events, not transient Firestore blips.
    const body: HealthBody = {
      status: 'ok',
      mode: 'live',
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      checks: [],
    };
    return {
      statusCode: 200,
      headers: baseHeaders,
      body: event.httpMethod === 'HEAD' ? '' : JSON.stringify(body),
    };
  }

  // Readiness path — check config + Firestore in parallel. Both have their
  // own timeouts, so the worst-case probe duration is bounded by the
  // longer of the two (config is sync; Firestore = 2000ms cap).
  const [configResult, firestoreResult] = await Promise.all([
    Promise.resolve(checkConfig()),
    checkFirestore(),
  ]);

  const checks: HealthCheck[] = [configResult, firestoreResult];
  const aggregate = aggregateStatus(checks);

  const body: HealthBody = {
    status: aggregate,
    mode: 'ready',
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    checks,
  };

  return {
    statusCode: statusCode(aggregate),
    headers: baseHeaders,
    body: event.httpMethod === 'HEAD' ? '' : JSON.stringify(body),
  };
};

export { handler };
