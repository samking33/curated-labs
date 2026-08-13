// Single-process entry point for hosts that only support one Node app
// (e.g. Hostinger). Runs the backend internally on a fixed local port and
// serves the frontend on the port the host assigns, reusing the existing
// same-origin rewrite proxy (frontend/next.config.ts) to reach it.
const { spawn } = require("node:child_process");
const path = require("node:path");

const BACKEND_PORT = "4000";
const FRONTEND_PORT = process.env.PORT || "3000";

const backend = spawn(process.execPath, [path.join(__dirname, "backend/dist/src/main.js")], {
  cwd: path.join(__dirname, "backend"),
  env: { ...process.env, PORT: BACKEND_PORT },
  stdio: "inherit",
});

const frontend = spawn(
  path.join(__dirname, "frontend/node_modules/.bin/next"),
  ["start", "-p", FRONTEND_PORT],
  {
    cwd: path.join(__dirname, "frontend"),
    env: { ...process.env, PORT: FRONTEND_PORT, API_ORIGIN: `http://127.0.0.1:${BACKEND_PORT}` },
    stdio: "inherit",
  },
);

function shutdown() {
  backend.kill();
  frontend.kill();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// If either child dies, the app is broken - exit so the host restarts us.
backend.on("exit", (code) => {
  console.error(`backend exited (${code})`);
  frontend.kill();
  process.exit(code ?? 1);
});
frontend.on("exit", (code) => {
  console.error(`frontend exited (${code})`);
  backend.kill();
  process.exit(code ?? 1);
});
