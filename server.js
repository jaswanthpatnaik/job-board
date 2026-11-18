// A small job board: a JSON API and one page. Run with `npm start`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadJobs, searchJobs } from "./lib/jobs.js";
import { loadSaved, writeSaved, saveJob, removeSaved } from "./lib/saved.js";

const PORT = Number(process.env.PORT ?? 3000);

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** Collect the request body as a UTF-8 string. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/jobs") {
        const jobs = await loadJobs();
        return sendJson(res, 200, searchJobs(jobs, url.searchParams.get("q")));
      }
      // ── GET /api/saved ────────────────────────────────────────────────────
      if (req.method === "GET" && url.pathname === "/api/saved") {
        const saved = await loadSaved();
        return sendJson(res, 200, saved);
      }

      // ── POST /api/saved ───────────────────────────────────────────────────
      if (req.method === "POST" && url.pathname === "/api/saved") {
        const body = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return sendJson(res, 400, { error: "Request body must be valid JSON." });
        }
        const { jobId } = parsed ?? {};
        if (!jobId || typeof jobId !== "string") {
          return sendJson(res, 400, { error: "jobId (string) is required." });
        }
        const [allJobs, saved] = await Promise.all([loadJobs(), loadSaved()]);
        try {
          const job = await saveJob(allJobs, saved, jobId);
          await writeSaved(saved);
          return sendJson(res, 200, job);
        } catch (err) {
          if (err.code === "NOT_FOUND") return sendJson(res, 404, { error: err.message });
          throw err;
        }
      }

      // ── DELETE /api/saved/:jobId ──────────────────────────────────────────
      const deleteMatch = url.pathname.match(/^\/api\/saved\/([^/]+)$/);
      if (req.method === "DELETE" && deleteMatch) {
        const jobId = decodeURIComponent(deleteMatch[1]);
        const saved = await loadSaved();
        try {
          const removed = removeSaved(saved, jobId);
          await writeSaved(saved);
          return sendJson(res, 200, removed);
        } catch (err) {
          if (err.code === "NOT_FOUND") return sendJson(res, 404, { error: err.message });
          throw err;
        }
      }

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js")) {
        const file = url.pathname === "/" ? "index.html" : "app.js";
        const type = file.endsWith(".html") ? "text/html" : "text/javascript";
        const body = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
        return res.end(body);
      }
      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "Something went wrong" });
    }
  });
}

// Started directly (npm start), not imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(PORT, () => console.log(`Job board on http://localhost:${PORT}`));
}
