// Local-only production verification. Never loads configured hosted credentials,
// publishes a notice, invokes a collector sweep, or sends a push notification.
// Usage: node scripts/security-local-smoke.mjs --build | --serve | (smoke checks)
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import argon2 from "argon2";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "classstatus-security-smoke-"));
const origin = "http://localhost:4173";
const env = { ...process.env };
// Defined empty values prevent Next's dotenv loader from importing real values.
for (const name of Object.keys(env)) {
  if (/^(CLASSSTATUS_|SUPABASE_|VERCEL|NEXT_PUBLIC_)/.test(name)) env[name] = "";
}
for (const file of fs.readdirSync(root).filter((name) => /^\.env(?:\.|$)/.test(name))) {
  for (const line of fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) env[match[1]] = "";
  }
}
const password = randomBytes(32).toString("base64url");
Object.assign(env, {
  NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  CLASSSTATUS_STORAGE_DRIVER: "local-json", CLASSSTATUS_DATA_DIR: tempRoot,
  CLASSSTATUS_SUPABASE_NAMESPACE: "preview", CLASSSTATUS_PUBLIC_ORIGIN: origin,
  CLASSSTATUS_ADMIN_USERNAME: "audit-local", CLASSSTATUS_ADMIN_PASSWORD_HASH: await argon2.hash(password),
  CLASSSTATUS_SESSION_SECRET: randomBytes(32).toString("base64"),
});
const next = path.join(root, "node_modules/next/dist/bin/next");
let server;
let checks = 0;
const output = fs.openSync(path.join(tempRoot, "server.log"), "a");
function removeFixture() {
  const resolved = fs.realpathSync(tempRoot);
  const allowed = fs.realpathSync(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(allowed) || !path.basename(resolved).startsWith("classstatus-security-smoke-")) throw new Error("Unsafe fixture path");
  fs.rmSync(resolved, { recursive: true, force: true });
}
async function request(route, expected, options = {}) {
  const response = await fetch(origin + route, { ...options, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  if (response.status !== expected) {
    const responseText = (await response.clone().text()).slice(0, 500);
    assert.equal(response.status, expected, `${options.method || "GET"} ${route}: ${responseText}`);
  }
  checks++;
  return response;
}
const jsonHeaders = { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
try {
  if (process.argv.includes("--build")) {
    const child = spawn(process.execPath, [next, "build"], { cwd: root, env, stdio: "inherit", windowsHide: true });
    const [code] = await once(child, "exit");
    assert.equal(code, 0, "production build");
  } else {
    server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "4173"], { cwd: root, env, stdio: ["ignore", output, output], windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error("Local server exited before readiness");
      try { const response = await fetch(origin, { signal: AbortSignal.timeout(1000) }); ready = response.ok; } catch { /* wait for local process */ }
      if (ready) break;
      await delay(250);
    }
    assert.ok(ready, "local server ready");
    if (process.argv.includes("--serve")) {
      console.log("Isolated production server ready at http://localhost:4173 (temporary local data; no hosted credentials).");
      await Promise.race([once(process, "SIGINT"), once(process, "SIGTERM"), once(server, "exit")]);
    } else {
      for (const route of ["/", "/about", "/sources", "/install", "/collector/login", "/manifest.webmanifest", "/sw.js"]) {
        const response = await request(route, 200);
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.equal(response.headers.get("x-frame-options"), "DENY");
        assert.ok(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
        assert.ok(!response.headers.get("content-security-policy")?.includes("unsafe-eval"));
      }
      assert.equal((await request("/collector", 307)).headers.get("location"), "/collector/login");
      const publicRoutes = ["/api/lgus", "/api/suspensions", "/api/schools", "/api/demo-mode", "/api/alerts/config"];
      for (const route of publicRoutes) {
        const body = await (await request(route, 200)).text();
        assert.doesNotMatch(body, /collectorProvenance|csrfToken|tokenDigest|manual_notification|ADMIN_PASSWORD_HASH/);
        await request(route, 405, { method: "PATCH" });
      }
      const lguData = await (await request("/api/lgus", 200)).json();
      assert.equal(lguData.lgus.length, 17);
      for (const route of ["/api/schools?q=%3Cscript%3E&lgu=__proto__", "/api/schools?q=Manila&q=Pasig", "/api/suspensions?lgu=__proto__&status[]=active"]) await request(route, 200);
      await request("/api/share/ncr?date=2026-02-30", 400);
      await request("/api/share/ncr?date=%0d%0aX-Poison%3a1", 400);
      const started = performance.now();
      const share = await request("/api/share/ncr", 200);
      assert.match(share.headers.get("content-type"), /image\/png/);
      const png = Buffer.from(await share.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      console.log(`Local share PNG: ${png.length} bytes, ${Math.round(performance.now() - started)} ms (single request; no load test).`);
      const protectedGets = ["/api/admin/bootstrap", "/api/admin/audit", "/api/admin/live/logs", "/api/collector/logs", "/api/collector/sources"];
      for (const route of protectedGets) await request(route, 401);
      const protectedPosts = ["/api/admin/suspensions", "/api/admin/suspensions/preview", "/api/admin/suspensions/unknown/remove", "/api/admin/suspensions/unknown/undo", "/api/admin/notifications", "/api/admin/notifications/preview", "/api/collector/run", "/api/admin/auth/logout"];
      for (const route of protectedPosts) await request(route, 401, { method: "POST", headers: jsonHeaders, body: "{}" });
      await request("/api/collector/sources", 405, { method: "PUT", headers: jsonHeaders, body: "{}" });
      for (const method of ["GET", "POST"]) await request("/api/cron/collector", 401, { method });
      for (const route of ["/api/admin/auth/login", "/api/alerts/subscribe"]) await request(route, 403, { method: "POST", body: "{}" });
      for (const body of ["{", "[]", "null", '{"username":{}}']) await request("/api/admin/auth/login", 401, { method: "POST", headers: jsonHeaders, body });
      await request("/api/admin/auth/login", 413, { method: "POST", headers: jsonHeaders, body: "x".repeat(4097) });
      await request("/api/admin/auth/login", 403, { method: "POST", headers: { ...jsonHeaders, "Content-Type": "text/plain" }, body: "{}" });
      for (const body of ["{", "[]", "null", "{}", "x".repeat(8193)]) await request("/api/alerts/subscribe", 422, { method: "POST", headers: jsonHeaders, body });
      for (const method of ["PATCH", "DELETE"]) {
        await request("/api/alerts/preferences", 403, { method, body: "{}" });
        await request("/api/alerts/preferences", 422, { method, headers: jsonHeaders, body: "{}" });
      }
      await request("/api/auth/reset-password/authorize", 401, { method: "POST" });
      const challenge = (await (await request("/api/admin/auth/login-challenge", 200)).json()).challenge;
      await request("/api/admin/auth/login", 401, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ username: "audit-local", password: "incorrect", challenge }) });
      const freshChallenge = (await (await request("/api/admin/auth/login-challenge", 200)).json()).challenge;
      const login = await request("/api/admin/auth/login", 200, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ username: "audit-local", password, challenge: freshChallenge }) });
      const setCookie = login.headers.getSetCookie().find((value) => value.startsWith("__Host-classstatus_admin_session="));
      assert.ok(setCookie);
      assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i); assert.match(setCookie, /SameSite=strict/i); assert.match(setCookie, /Path=\//i);
      const cookie = setCookie.split(";")[0];
      const bootstrap = await (await request("/api/admin/bootstrap", 200, { headers: { Cookie: cookie } })).json();
      await request("/collector", 200, { headers: { Cookie: cookie } });
      await request("/api/admin/auth/logout", 403, { method: "POST", headers: { ...jsonHeaders, Cookie: cookie }, body: "{}" });
      const authenticated = { ...jsonHeaders, Cookie: cookie, "X-CSRF-Token": bootstrap.session.csrfToken };
      await request("/api/admin/suspensions/preview", 403, { method: "POST", headers: { ...authenticated, Origin: "https://attacker.example" }, body: "{}" });
      await request("/api/admin/suspensions/preview", 422, { method: "POST", headers: authenticated, body: "{}" });
      await request("/api/admin/auth/logout", 200, { method: "POST", headers: authenticated, body: "{}" });
      await request("/api/admin/bootstrap", 401, { headers: { Cookie: cookie } });
      await request("/collector", 307, { headers: { Cookie: cookie } });
      // Force storage failure only in this freshly-created disposable directory.
      fs.writeFileSync(path.join(tempRoot, "suspensions.json"), "{invalid");
      for (const route of ["/api/lgus", "/api/schools", "/api/share/ncr"]) {
        const response = await request(route, route.includes("share") ? 503 : 500);
        const body = await response.text();
        assert.ok(!body.includes(tempRoot));
        assert.doesNotMatch(body, /SyntaxError|at .*\.(?:js|ts):|node_modules|SUPABASE_|SELECT /);
      }
      console.log(`Local production HTTP checks: ${checks} passed, 0 failed. Synthetic local session revoked; no collector or push send invoked.`);
    }
  }
} catch (error) {
  console.error(`Local verification failed after ${checks} successful HTTP checks: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) { const exited = once(server, "exit"); server.kill(); await exited; }
  fs.closeSync(output);
  removeFixture();
}
