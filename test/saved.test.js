// test/saved.test.js — Tests for the saved-jobs feature.
// Uses Node's built-in test runner (node:test + node:assert/strict).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { createApp } from "../server.js";
import { loadSaved, saveJob, removeSaved } from "../lib/saved.js";
import { loadJobs } from "../lib/jobs.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const SAVED_PATH = new URL("../saved.json", import.meta.url);
const SAVED_FILE = fileURLToPath(SAVED_PATH);

async function resetSaved(initial = []) {
  await writeFile(SAVED_FILE, JSON.stringify(initial, null, 2), "utf8");
}

// ── Live server ───────────────────────────────────────────────────────────────

const PORT = 3777;
let server;

before(async () => {
  server = createApp();
  await new Promise((resolve) => server.listen(PORT, resolve));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// Reset saved.json before every test so tests are fully isolated.
beforeEach(() => resetSaved([]));

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpReq(method, urlPath, payload) {
  return new Promise((resolve, reject) => {
    const rawBody = payload !== undefined ? JSON.stringify(payload) : null;
    const opts = {
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: { "content-type": "application/json" },
    };
    if (rawBody) opts.headers["content-length"] = Buffer.byteLength(rawBody);

    const r = httpRequest(opts, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", reject);
    if (rawBody) r.write(rawBody);
    r.end();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Unit tests — lib/saved.js  (pure functions, no HTTP needed)
// ═════════════════════════════════════════════════════════════════════════════

test("loadSaved returns [] when the file does not exist", async () => {
  const tempPath = new URL("../saved_tmp_test.json", import.meta.url);
  try { await unlink(fileURLToPath(tempPath)); } catch { /* file may not exist */ }
  const result = await loadSaved(tempPath);
  assert.deepEqual(result, []);
});

test("saveJob adds a valid job to the list and is idempotent", async () => {
  const allJobs = await loadJobs();
  const saved = [];

  const job = await saveJob(allJobs, saved, "j1");
  assert.equal(job.id, "j1");
  assert.equal(saved.length, 1);

  // Saving the same job again must NOT create a duplicate
  await saveJob(allJobs, saved, "j1");
  assert.equal(saved.length, 1, "duplicate save must keep exactly one copy");
});

test("saveJob throws NOT_FOUND for an unknown job id", async () => {
  const allJobs = await loadJobs();
  await assert.rejects(
    () => saveJob(allJobs, [], "does-not-exist"),
    (err) => err.code === "NOT_FOUND"
  );
});

test("removeSaved removes a job and returns it", async () => {
  const allJobs = await loadJobs();
  const saved = [];
  await saveJob(allJobs, saved, "j2");

  const removed = removeSaved(saved, "j2");
  assert.equal(removed.id, "j2");
  assert.equal(saved.length, 0);
});

test("removeSaved throws NOT_FOUND when job is not in the list", () => {
  assert.throws(
    () => removeSaved([], "j99"),
    (err) => err.code === "NOT_FOUND"
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration tests — HTTP API
// ═════════════════════════════════════════════════════════════════════════════

test("GET /api/saved returns 200 and an empty array when nothing is saved", async () => {
  const { status, body } = await httpReq("GET", "/api/saved");
  assert.equal(status, 200);
  assert.deepEqual(body, []);
});

test("POST /api/saved saves a valid job and returns the full job object", async () => {
  const { status, body } = await httpReq("POST", "/api/saved", { jobId: "j1" });
  assert.equal(status, 200);
  assert.equal(body.id, "j1");
  assert.ok(body.title, "returned job should include a title");

  // Confirm it was persisted to disk
  const saved = await loadSaved();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "j1");
});

test("POST /api/saved saving the same job twice keeps only one copy", async () => {
  await httpReq("POST", "/api/saved", { jobId: "j2" });
  const { status } = await httpReq("POST", "/api/saved", { jobId: "j2" });
  assert.equal(status, 200);

  const saved = await loadSaved();
  assert.equal(
    saved.filter((j) => j.id === "j2").length,
    1,
    "must have exactly one copy after two saves"
  );
});

test("POST /api/saved returns 404 for an unknown jobId", async () => {
  const { status, body } = await httpReq("POST", "/api/saved", { jobId: "xyz-not-real" });
  assert.equal(status, 404);
  assert.ok(body.error, "response should include an error message");
});

test("POST /api/saved returns 400 when jobId field is missing", async () => {
  const { status, body } = await httpReq("POST", "/api/saved", {});
  assert.equal(status, 400);
  assert.ok(body.error);
});

test("POST /api/saved returns 400 for an invalid (non-JSON) body", async () => {
  const result = await new Promise((resolve, reject) => {
    const raw = "not-valid-json!!";
    const r = httpRequest(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/api/saved",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(raw),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => resolve({ status: res.statusCode }));
      }
    );
    r.on("error", reject);
    r.write(raw);
    r.end();
  });
  assert.equal(result.status, 400);
});

test("GET /api/saved returns all saved jobs after multiple saves", async () => {
  await httpReq("POST", "/api/saved", { jobId: "j3" });
  await httpReq("POST", "/api/saved", { jobId: "j4" });
  const { status, body } = await httpReq("GET", "/api/saved");
  assert.equal(status, 200);
  assert.equal(body.length, 2);
  assert.deepEqual(body.map((j) => j.id).sort(), ["j3", "j4"]);
});

test("DELETE /api/saved/:jobId removes the job and returns it", async () => {
  await httpReq("POST", "/api/saved", { jobId: "j5" });
  const { status, body } = await httpReq("DELETE", "/api/saved/j5");
  assert.equal(status, 200);
  assert.equal(body.id, "j5");

  // Confirm removed from disk
  const saved = await loadSaved();
  assert.equal(saved.length, 0);
});

test("DELETE /api/saved/:jobId returns 404 when job is not in saved list", async () => {
  const { status, body } = await httpReq("DELETE", "/api/saved/j99");
  assert.equal(status, 404);
  assert.ok(body.error);
});

test("Full flow: save two jobs, reload, remove one — state correct at each step", async () => {
  await httpReq("POST", "/api/saved", { jobId: "j6" });
  await httpReq("POST", "/api/saved", { jobId: "j7" });

  // Simulate a page reload
  const { body: afterSave } = await httpReq("GET", "/api/saved");
  assert.equal(afterSave.length, 2);

  // Remove one
  await httpReq("DELETE", "/api/saved/j6");

  // Verify final state
  const { body: final } = await httpReq("GET", "/api/saved");
  assert.equal(final.length, 1);
  assert.equal(final[0].id, "j7");
});

test("existing GET /api/jobs route is unaffected", async () => {
  const { status, body } = await httpReq("GET", "/api/jobs");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 8);
});
