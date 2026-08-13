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

const backend = spawn(process.execPath, [path.join(__dirname, "backend/dist/src/main.js")], {
  cwd: path.join(__dirname, "backend"),
  env: backendEnv,
  stdio: "inherit",
});
backend.on("exit", (code) => {
  console.error(`backend exited (${code})`);
  process.exit(code ?? 1);
});

// Prisma's native query engine has been seen panicking ("timer has gone
// away", a tokio/CPU-starvation symptom) when it connects to the database
// at the same moment Next is doing its own CPU-heavy startup compilation.
// Waiting for the backend to report healthy before starting Next's
// prepare() keeps the two startups from fighting over CPU at once.
function waitForBackend() {
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port: BACKEND_PORT, path: "/api/v1/health/live" }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else setTimeout(attempt, 500);
      });
      req.on("error", () => setTimeout(attempt, 500));
    };
    attempt();
  });
}

waitForBackend().then(() => {
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
      console.error("next failed to prepare", err);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  backend.kill();
  process.exit();
});
process.on("SIGINT", () => {
  backend.kill();
  process.exit();
});
