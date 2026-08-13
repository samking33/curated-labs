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
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");

const BACKEND_PORT = "4000";
const FRONTEND_PORT = process.env.PORT || "3000";

process.env.API_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;

const backend = spawn(process.execPath, [path.join(__dirname, "backend/dist/src/main.js")], {
  cwd: path.join(__dirname, "backend"),
  env: { ...process.env, PORT: BACKEND_PORT },
  stdio: "inherit",
});
backend.on("exit", (code) => {
  console.error(`backend exited (${code})`);
  process.exit(code ?? 1);
});

const next = require(path.join(__dirname, "frontend/node_modules/next"));
const app = next({ dev: false, dir: path.join(__dirname, "frontend") });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(FRONTEND_PORT, () => {
      console.log(`ready on ${FRONTEND_PORT}`);
    });
  })
  .catch((err) => {
    console.error("next failed to prepare", err);
    process.exit(1);
  });

process.on("SIGTERM", () => {
  backend.kill();
  process.exit();
});
process.on("SIGINT", () => {
  backend.kill();
  process.exit();
});
