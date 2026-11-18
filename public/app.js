// app.js — Job board front-end. ESM module, no build step.

const jobList   = document.getElementById("jobs");
const savedList = document.getElementById("saved-jobs");
const searchEl  = document.getElementById("search");
const toast     = document.getElementById("toast");

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Escape text so it is safe to place in HTML. */
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

// Track which job IDs are currently saved (so Save buttons reflect state).
let savedIds = new Set();

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiJson(method, path, body) {
  const opts = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

// ── Render ────────────────────────────────────────────────────────────────────

/** Build one job card for the All Jobs list. */
function makeJobItem(job) {
  const li = document.createElement("li");
  li.dataset.id = job.id;

  const info = document.createElement("span");
  info.className = "job-info";
  info.innerHTML =
    `<strong>${esc(job.title)}</strong> at ${esc(job.company)}, ${esc(job.location)}.` +
    ` ₹\u200b${job.stipend.toLocaleString("en-IN")} / month.`;

  const btn = document.createElement("button");
  const isSaved = savedIds.has(job.id);
  btn.className = isSaved ? "btn-save saved" : "btn-save";
  btn.textContent = isSaved ? "✓ Saved" : "Save";
  btn.disabled = isSaved;
  btn.setAttribute("aria-label", `Save ${job.title}`);

  if (!isSaved) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await apiJson("POST", "/api/saved", { jobId: job.id });
        savedIds.add(job.id);
        btn.textContent = "✓ Saved";
        btn.classList.add("saved");
        renderSaved();
        showToast(`"${job.title}" saved!`);
      } catch (err) {
        btn.disabled = false;
        showToast(`Error: ${err.message}`);
      }
    });
  }

  li.append(info, btn);
  return li;
}

/** Build one card for the Saved Jobs list. */
function makeSavedItem(job) {
  const li = document.createElement("li");
  li.dataset.id = job.id;

  const info = document.createElement("span");
  info.className = "job-info";
  info.innerHTML =
    `<strong>${esc(job.title)}</strong> at ${esc(job.company)}, ${esc(job.location)}.` +
    ` ₹\u200b${job.stipend.toLocaleString("en-IN")} / month.`;

  const btn = document.createElement("button");
  btn.className = "btn-remove";
  btn.textContent = "Remove";
  btn.setAttribute("aria-label", `Remove ${job.title} from saved`);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await apiJson("DELETE", `/api/saved/${encodeURIComponent(job.id)}`);
      savedIds.delete(job.id);
      li.remove();
      // Re-enable Save button in the jobs list
      const jobBtn = jobList.querySelector(`li[data-id="${job.id}"] button`);
      if (jobBtn) {
        jobBtn.textContent = "Save";
        jobBtn.classList.remove("saved");
        jobBtn.disabled = false;
      }
      if (!savedList.querySelector("li")) renderEmptySaved();
      showToast(`"${job.title}" removed.`);
    } catch (err) {
      btn.disabled = false;
      showToast(`Error: ${err.message}`);
    }
  });

  li.append(info, btn);
  return li;
}

function renderEmptySaved() {
  savedList.innerHTML = `<li class="empty-note">No saved jobs yet — click <strong>Save</strong> on any listing above.</li>`;
}

/** Fetch saved jobs from the server and re-render the saved panel. */
async function renderSaved() {
  const saved = await apiJson("GET", "/api/saved");
  savedIds = new Set(saved.map((j) => j.id));
  savedList.innerHTML = "";
  if (saved.length === 0) {
    renderEmptySaved();
  } else {
    saved.forEach((j) => savedList.append(makeSavedItem(j)));
  }
}

/** Fetch and display the jobs list. */
async function show(query = "") {
  const jobs = await apiJson("GET", `/api/jobs?q=${encodeURIComponent(query)}`);
  jobList.innerHTML = "";
  for (const job of jobs) {
    jobList.append(makeJobItem(job));
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

searchEl.addEventListener("input", () => show(searchEl.value));

// Load saved first so savedIds is populated before rendering job cards.
renderSaved().then(() => show());
