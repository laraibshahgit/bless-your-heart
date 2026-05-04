// Production environment validator. Fires at handler module-load (cold-start)
// so a misconfigured production deploy emits a structured, greppable error
// line BEFORE the first request lands and produces silent-default behavior.
//
// Why this exists: prior audits (20/001 #5, 20/002 #1, 24/001 #D1, 33/001 #3)
// repeatedly flagged that two production-required env vars silently fall back
// to weak defaults when unset:
//
//   - `IP_SALT_BASE` falls back to the literal string `'byh-default-salt'`
//     in `src/server/rateLimit.ts:39`. The daily-date suffix still rotates,
//     so this isn't a critical bypass — but the deploy team has no signal
//     that the secret is missing until someone reverse-engineers the hash.
//   - `ALLOWED_ORIGINS`, when unset, makes `isOriginAllowed()` in
//     `netlify/functions/generate.ts:108` a no-op (back-compat for dev).
//     In production this disables the CSRF / cross-origin cost-amplification
//     shield entirely — and the operator has no signal that it happened.
//
// Each prior audit deferred the validator because the test suite was thought
// to need reordering. Verified in 38/001: no test currently sets
// `process.env.CONTEXT = 'production'`, so a CONTEXT-gated validator is a
// safe drop-in. Tests already inject `IP_SALT_BASE = 'test-salt'` and either
// leave `ALLOWED_ORIGINS` unset (default — back-compat path) or set it
// explicitly inside per-block setup (CSRF tests in generate-contract.test.ts).
//
// Behavior:
//   - When `process.env.CONTEXT !== 'production'`, this is a no-op. Local
//     dev (CONTEXT undefined), Netlify deploy previews (CONTEXT='deploy-preview'),
//     and branch deploys (CONTEXT='branch-deploy') all skip the check —
//     they're allowed to ship without prod-only secrets.
//   - When `process.env.CONTEXT === 'production'`, missing/empty values for
//     ANY of the required vars below trigger a single structured log line
//     listing the variables. The log uses `console.error` so it routes to
//     Netlify's error log feed; ops see the line within seconds of the
//     cold-start.
//   - We DO NOT throw. Throwing at module load crashes the lambda container
//     and produces a 502 to the user, which is a worse failure mode than
//     "the salt rotated to a known string" or "the CSRF shield is open."
//     The right operational response is "fix the env var and redeploy" —
//     loud-but-non-fatal logging gets that signal in front of ops without
//     producing user-visible downtime during the fix window.

const REQUIRED_PROD_VARS = [
  // Without this the IP-rate-limit hash uses the published `'byh-default-salt'`
  // literal — daily date still rotates, but the salt is no longer per-deploy.
  'IP_SALT_BASE',
  // Without this the CSRF / Origin-allowlist shield in `generate.ts` no-ops.
  // CLAUDE.md is explicit: "MUST be set in production deploys."
  'ALLOWED_ORIGINS',
  // Without this every Anthropic call returns 401 and the user sees
  // safe_fallback for every generation. Loud at request-time but worth
  // catching at cold-start before the first user request.
  'ANTHROPIC_API_KEY',
  // Without these the Firestore client init throws, the rate-limit
  // try/catch falls open, and the limiter is silently disabled.
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
] as const;

export interface ConfigValidationResult {
  ok: boolean;
  missing: string[];
}

export function validateProdEnv(env: NodeJS.ProcessEnv = process.env): ConfigValidationResult {
  if (env.CONTEXT !== 'production') {
    return { ok: true, missing: [] };
  }

  const missing = REQUIRED_PROD_VARS.filter((name) => {
    const v = env[name];
    return v === undefined || v.trim() === '';
  });

  if (missing.length > 0) {
    // Single structured line so ops can grep for `config_validation_failed`
    // and get the full list instead of one event per missing var. Same
    // log-shape convention as the rest of the server (event + context).
    console.error(JSON.stringify({
      event: 'config_validation_failed',
      missing,
      context: env.CONTEXT,
    }));
  }

  return { ok: missing.length === 0, missing };
}
