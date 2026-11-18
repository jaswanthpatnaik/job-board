// lib/saved.js  — read/write saved jobs, pure-ish functions around a JSON file.
// No packages. Uses ESM to match the rest of the project.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { findJob } from "./jobs.js";

/** Default path to the persistence file (next to jobs.json). */
export const DEFAULT_PATH = new URL("../saved.json", import.meta.url);

/**
 * Read the saved-jobs list.
 * Returns [] if the file does not exist yet (first run).
 */
export async function loadSaved(path = DEFAULT_PATH) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Persist the saved-jobs list atomically-ish (write to same file).
 */
export async function writeSaved(saved, path = DEFAULT_PATH) {
  await writeFile(path instanceof URL ? fileURLToPath(path) : path, JSON.stringify(saved, null, 2), "utf8");
}

/**
 * Save a job by id. Returns the saved job object.
 * Throws { code: "NOT_FOUND" } if the id is unknown.
 * Deduplicates silently if already saved.
 */
export async function saveJob(allJobs, savedList, jobId) {
  const job = findJob(allJobs, jobId);
  if (!job) {
    const err = new Error(`No job with id "${jobId}"`);
    err.code = "NOT_FOUND";
    throw err;
  }
  const alreadySaved = savedList.some((j) => j.id === jobId);
  if (alreadySaved) return job;           // idempotent — return the job, don't duplicate
  savedList.push(job);
  return job;
}

/**
 * Remove a saved job by id. Returns the removed job.
 * Throws { code: "NOT_FOUND" } if it wasn't saved.
 */
export function removeSaved(savedList, jobId) {
  const index = savedList.findIndex((j) => j.id === jobId);
  if (index === -1) {
    const err = new Error(`No saved job with id "${jobId}"`);
    err.code = "NOT_FOUND";
    throw err;
  }
  return savedList.splice(index, 1)[0];
}
