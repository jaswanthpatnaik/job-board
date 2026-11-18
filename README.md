# Job board starter

A small job board for an insiderOne work sample. It is made up: the jobs and
companies are not real.

## Run it

You need Node 20 or newer. There are no packages to install.

```
npm start      # then open http://localhost:3000
npm test       # runs the tests in test/
```

## What is here

- `server.js`: the web server. `GET /api/jobs?q=` lists jobs, `GET /` serves the page.
- `lib/jobs.js`: reading and searching the jobs. Pure functions.
- `jobs.json`: the jobs.
- `public/`: the page and its script.
- `test/`: tests, using Node's built-in test runner.

## What was built

### Saved Jobs feature

Students can now save jobs they like and come back to them — even after a page reload.

**What was added:**

| Area | Detail |
|------|--------|
| `GET /api/saved` | Returns the list of saved job objects |
| `POST /api/saved` | Accepts `{ "jobId": "..." }`, validates, deduplicates, persists |
| `DELETE /api/saved/:jobId` | Removes a saved job; returns `404` with a clear message if not found |
| `saved.json` | Flat JSON file used for persistence — no database needed |
| `lib/saved.js` | Pure functions: `loadSaved`, `writeSaved`, `saveJob`, `removeSaved` |
| UI — Save button | Every job card now has a **Save** button; it switches to ✓ Saved (disabled) once clicked |
| UI — Saved panel | A **Saved jobs** section below the listings shows all saved jobs |
| UI — Remove button | Each saved card has a **Remove** button to unsave it |
| `test/saved.test.js` | 16 new tests (5 unit + 11 integration) covering all endpoints and edge cases |

### How to run it

```
npm start      # then open http://localhost:3000
npm test       # runs all 19 tests (3 starter + 16 new) — all pass
```

### One decision I made and why

I keep **full job objects** in `saved.json` rather than just IDs.

The alternative (storing only IDs and joining against `jobs.json` on every read) adds a cross-file lookup on `GET /api/saved`. Storing full objects makes that endpoint a single file read — simpler code, one fewer point of failure. The trade-off is that if a job's details later change in `jobs.json`, saved copies become stale; but for a file-based board of this scale that is acceptable and straightforward to fix.

### What I would do next

1. **Per-user saved lists** — right now "saved" is global. A session cookie would give each student their own list.
2. **Atomic writes** — write to a `.tmp` file then rename, to prevent corruption if the process crashes mid-write.
3. **Search on saved jobs** — let students filter their saved list the same way they filter all jobs.
4. **Pagination** — add `limit`/`offset` query params to `GET /api/jobs` for when the job count grows.
5. **Input validation on `jobs.json`** — validate field types at startup and surface a clear error rather than a runtime crash.
