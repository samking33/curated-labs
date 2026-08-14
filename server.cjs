// Single-process entry point for hosts that only support one Node app
// (e.g. Hostinger). Hosts like this run Node apps under Phusion Passenger,
// which only recognizes an app as "up" once the process IT directly
// spawned calls http.createServer().listen() - Passenger patches that
// exact call. A supervisor that only spawns child processes never makes
// that call itself, so Passenger considers the app dead and restarts it
// forever, orphaning children that pile up fighting over the same ports.
//
// So Next runs in-process here (its own .listen() is the one Passenger
// sees), and the backend runs as a child process on a fixed internal port,
// reached through the same-origin rewrite proxy already configured in
// frontend/next.config.ts (API_ORIGIN).
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const BACKEND_PORT = "4000";
const FRONTEND_PORT = process.env.PORT || "3000";

process.env.API_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;

// Passenger sets NODE_ENV=production for every Node app by default,
// unconditionally - but next build needs NODE_ENV=production (handled in
// package.json's build script) while the backend refuses to boot with
// ALLOW_DEV_LOGIN=true under NODE_ENV=production (backend/src/config/index.ts).
// Turning on dev login is itself the signal that this isn't real production,
// so it overrides Passenger's default here rather than needing a second
// env var juggled by hand in the host's dashboard.
const backendEnv = { ...process.env, PORT: BACKEND_PORT };
if (backendEnv.ALLOW_DEV_LOGIN === "true" && backendEnv.NODE_ENV === "production") {
  backendEnv.NODE_ENV = "development";
}

/*
 * Cap the backend's thread pools.
 *
 * Prisma's Rust engine sizes its tokio worker pool from the CPU count, and
 * the production host reports 64 CPUs while the account gets a far smaller
 * share of tasks. Measured there: the backend alone held 74 of ~114
 * available tasks, the engine aborted outright ("Aborted (core dumped)")
 * because it could not build that pool, and nothing on the account could
 * fork afterwards (`spawn EAGAIN`) — which is what kept taking the whole
 * site down. With these two caps the same backend starts in 12 threads and
 * serves normally; verified directly on the host, both ways.
 *
 * Set here rather than in the app because libuv reads UV_THREADPOOL_SIZE
 * once at process start, so it has to be in the child's environment. Both
 * defer to a value already set in the environment.
 */
backendEnv.TOKIO_WORKER_THREADS = backendEnv.TOKIO_WORKER_THREADS || "2";
backendEnv.UV_THREADPOOL_SIZE = backendEnv.UV_THREADPOOL_SIZE || "2";

/*
 * This file only ever runs on the hosted, public deployment, so it is the
 * honest place to say so. The backend keys Secure cookies, HSTS and error
 * redaction off this rather than NODE_ENV, because the dev-login workaround
 * above forces NODE_ENV=development — which had silently turned all three
 * off on a public HTTPS site (observed live: a 500 response carrying
 * absolute server paths and query text).
 */
backendEnv.PUBLIC_DEPLOYMENT = "true";

/*
 * Supervise the backend rather than dying with it.
 *
 * Prisma's native query engine panics on this host ("timer has gone away",
 * a tokio timer-thread symptom under CPU/thread pressure) and it surfaces as
 * an unhandled rejection inside the engine, so the backend cannot catch it
 * and simply exits. Exiting the supervisor too turned one child crash into a
 * whole-site outage: Passenger restarts the app, the backend panics again on
 * the next boot, and every request 503s. Restarting just the child, with
 * backoff, keeps the site up and lets a transient panic heal itself.
 */
const RESTART_BASE_MS = 1000;
const RESTART_MAX_MS = 30_000;
const STABLE_MS = 60_000;

let backend = null;
let restarts = 0;
let shuttingDown = false;

function scheduleRestart(reason, startedAt) {
  if (shuttingDown) return;
  // A process that ran a while before dying is a fresh fault, not a boot
  // loop — don't let an old streak inflate its backoff.
  if (Date.now() - startedAt > STABLE_MS) restarts = 0;
  const delay = Math.min(RESTART_BASE_MS * 2 ** restarts, RESTART_MAX_MS);
  restarts += 1;
  console.error(`backend ${reason} — restarting in ${delay}ms (attempt ${restarts})`);
  // Deliberately NOT unref'd: until Next is listening there is nothing else
  // holding the event loop open, so an unref'd timer here lets the whole
  // supervisor exit the moment the backend dies during startup — the exact
  // outage this is meant to prevent.
  setTimeout(startBackend, delay);
}

function startBackend() {
  const startedAt = Date.now();
  let settled = false;
  const settle = (reason) => {
    if (settled) return;
    settled = true;
    scheduleRestart(reason, startedAt);
  };

  let child;
  try {
    child = spawn(process.execPath, [path.join(__dirname, "backend/dist/src/main.js")], {
      cwd: path.join(__dirname, "backend"),
      env: backendEnv,
      stdio: "inherit",
    });
  } catch (err) {
    // spawn can throw synchronously as well as emit "error".
    settle(`could not be spawned (${err.code || err.message})`);
    return;
  }
  backend = child;

  /*
   * An unhandled "error" event on a ChildProcess THROWS, which would kill
   * this supervisor and take the site down with it — the exact outage it
   * exists to prevent. Seen in production as `spawn ... EAGAIN`: the shared
   * host refused to fork because the account was at its process limit, the
   * error event went unhandled, and the whole app died. A failed spawn is
   * just another reason to back off and retry.
   */
  child.on("error", (err) => settle(`failed to spawn (${err.code || err.message})`));
  child.on("exit", (code) => settle(`exited (${code})`));
}

startBackend();

/**
 * Resolves once the backend answers, or after `timeoutMs` regardless.
 *
 * The timeout is the important half: Next only calls listen() after this
 * resolves, and that listen() is the single thing Passenger watches to
 * decide the app is up. Waiting forever for a backend that keeps panicking
 * therefore took the entire site down — including every page that needs no
 * database at all. Starting Next anyway degrades the API only.
 */
function waitForBackend(timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      if (Date.now() > deadline) return resolve(false);
      const req = http.get({ host: "127.0.0.1", port: BACKEND_PORT, path: "/api/v1/health/live" }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else setTimeout(attempt, 500);
      });
      req.on("error", () => setTimeout(attempt, 500));
    };
    attempt();
  });
}

// Letting the backend settle first also keeps its Prisma connect from
// competing with Next's own CPU-heavy startup, which is what provoked the
// panic in the first place.
waitForBackend(60_000).then((healthy) => {
  if (!healthy) console.error("backend not healthy yet — starting frontend anyway so the site serves");

  const next = require(path.join(__dirname, "frontend/node_modules/next"));
  const app = next({ dev: false, dir: path.join(__dirname, "frontend") });
  const handle = app.getRequestHandler();

  app
    .prepare()
    .then(() => {
      http.createServer((req, res) => handle(req, res)).listen(FRONTEND_PORT, () => {
        console.log(`ready on ${FRONTEND_PORT}`);
      });
    })
    .catch((err) => {
      // Next failing to prepare is not recoverable by retrying here, and
      // without it there is nothing to serve — let Passenger restart us.
      console.error("next failed to prepare", err);
      process.exit(1);
    });
});

function shutdown() {
  shuttingDown = true;
  if (backend) backend.kill();
  process.exit();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/*
 * A child does not die with its parent on POSIX. Whenever this supervisor
 * went away without killing it — an uncaught throw, Passenger tearing the
 * app down — the backend was left orphaned still holding the internal port,
 * so the next boot's backend could not bind and the app never recovered.
 * Seen live with a backend from a previous version still running hours
 * later. "exit" covers every path that unwinds normally; SIGKILL cannot be
 * trapped by anything, here or elsewhere.
 */
process.on("exit", () => {
  shuttingDown = true;
  if (backend) backend.kill();
});
