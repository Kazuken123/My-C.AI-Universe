# CI and backend layers

The backend has routes/controllers, services, and repositories. For example,
authentication follows auth.route.js -> auth.controller.js -> auth.service.js ->
UserRepository / PasswordResetRepository -> SQLite or Turso.

This is a layered codebase, but it is not a strict three-layer implementation:
several controllers call repositories directly, and storage.service.js accesses
database statistics. The CI improvements do not claim those dependencies have
been refactored or that layer boundaries are statically enforced.

## Required checks

The workflow in ../.github/workflows/ci-cd.yml runs on pushes to main, pull
requests targeting main, and manual dispatch. Feature-branch pushes do not run
it separately, avoiding duplicate push/PR checks. Backend and frontend checks
share one **CI status** job on Node 24, suitable for a required branch check.
Node 22 can be selected for a manual compatibility run. Superseded CI jobs on
the same ref are cancelled; deployment requests remain serialized separately.

Adding a required branch check in repository settings is a separate operation.

- Backend: install from the lockfile, check all project JavaScript syntax, parse
  the optional Python memory service, and execute every top-level
  tests/*.test.js and tests/*.test.mjs file.
- Frontend: install its own lockfile, run unit tests, ESLint, TypeScript, and a
  complete Next.js production build.
- Every test file runs in a separate process with a fresh temporary SQLite
  database and directory. Dotenv does not load the developer's .env; Turso,
  SMTP, and AI credentials are cleared. Each file has a two-minute timeout.
  Failures do not prevent the remaining test files from running.
- API tests own their server on an OS-assigned port. HTTP routing, authentication,
  SQLite persistence, and SSE formatting remain real; only the external AI
  provider is replaced by a deterministic fixture in the test process.
- Backend JSON reports list test-file results and are retained as CI artifacts
  for seven days, including when a test fails. These are file-level results,
  not a code-coverage percentage.
- The memory-service check validates Python syntax and existing source
  regressions; it does not install or execute the optional embedding model.
- Manual scripts such as live-character-validation.js, proxy-empirical.mjs, and
  tests/e2e are not auto-discovered. Live-provider checks need separate setup.

## Run locally

From the repository root:

```powershell
npm ci
npm run check
npm test
# Smaller selections:
npm run test:unit
npm run test:api
node scripts/run-tests.js --list
```

test:unit includes existing source/structure regressions and direct SQLite
tests, in addition to unit tests; test:api runs only the HTTP integration suite.
Run the API suite through npm so its temporary environment is provisioned.
It cannot reuse an existing developer or production HTTP server.

From nextjs-frontend:

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Set TEST_REPORT_PATH to an output JSON path when a local test-file report is
needed. A failing or timed-out file returns a nonzero overall status.

## Deployment gate

Only a push to main can request deployment, after all backend and frontend
checks pass. The existing RENDER_DEPLOY_HOOK repository secret is used;
no live AI, email, or database secrets are required by the test jobs.

If the hook is absent, the workflow explicitly records that no deployment was
requested. It does not infer Render dashboard settings or claim auto-deployment.
The job checks that main has not advanced and sends the tested commit SHA as
Render's ref parameter. Requests are serialized. A successful hook response
means Render accepted the request; the workflow does not poll runtime health
or certify a successful rollout.

Render documents that deploying a specific commit via a hook disables its
automatic deploys. With the hook configured, this workflow becomes the deploy
trigger. See https://render.com/docs/deploys and
https://render.com/docs/deploy-hooks before configuring the hook.

GitHub Actions are pinned to verified release commit SHAs. The current versions
are noted beside each action for intentional future updates.

GitHub-managed CodeQL runs appear separately in Actions. They are security
analysis, not duplicate application test jobs, and this workflow does not
change or disable that repository setting.
