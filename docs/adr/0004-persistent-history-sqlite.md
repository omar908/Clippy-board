# ADR-0004. Persistent history via SQLite, with full image + display thumbnail

**Status:** Accepted
**Date:** 2026-10-18
**Deciders:** Omar Estrada
**Related:** `ASSESSMENT.md` §8 (Next Steps item 1); implemented in `src-tauri/src/storage.rs`, `src-tauri/src/clipboard.rs`

## Context

MVP Phase 1 requires persistent clipboard history — the spike shipped in-memory only (`Arc<Mutex<Vec<ClipboardItem>>>`), so history was wiped on every restart. This was the largest known gap and the first Phase 1 item.

Key constraints from the product definition:

- History cap is 100 items; text and file payloads are small, but **images are full-resolution PNGs** (a screenshot can be several MB as a base64 data URL).
- Writes happen on the clipboard monitor thread (every capture), reads on app startup plus `delete_item` / `clear_history` commands — low concurrency, single process.
- The existing code shape (`ClipboardState` behind `Arc<Mutex>`, payloads serialized as tagged JSON for IPC) should survive as much as possible; persistence should slot in behind that seam rather than reshape it.
- Images must restore to the clipboard at **full fidelity**, but the list UI should stay fast — decoding dozens of multi-MB PNGs per render would jank the "instant search" experience.

Storage growth from screenshot-heavy use was explicitly accepted as acceptable for now (user decision, 2026-10-18).

## Decision

1. **SQLite via `rusqlite` (bundled)** as the history store, at `{app_data_dir}/history.db` (WAL mode).
   - Single table `history(id TEXT PK, timestamp INTEGER, payload TEXT)`, plus an index on `timestamp`.
   - `payload` holds the **same tagged JSON** the frontend receives over IPC (`ClipboardPayload`), so load/insert stays format-agnostic — no column-per-field mapping to maintain as the payload enum evolves.
   - `storage::MAX_HISTORY = 100` is the single cap constant; trims happen in the DB (`DELETE ... NOT IN (SELECT ... LIMIT ?)`) and in memory after each insert.
   - Failure is non-fatal: if the DB can't open, the app logs it and **degrades to in-memory-only** (the `db` handle is `Option<Connection>`); history commands no-op on the storage side.
   - Writes are best-effort with logged errors — the monitor thread must never crash on a storage failure.

2. **Full image in the DB + a small thumbnail for rendering.**
   - `ClipboardPayload::Image` gains `thumbnail: Option<String>` — a PNG data URL fit within 480 px (longest edge), generated at capture time in `read_clipboard`.
   - Full-resolution `data_url` remains the payload stored in the DB and used for clipboard restore; the frontend list renders `thumbnail || data_url` (fallback covers any pre-thumbnail items).
   - Images already ≤480 px skip downscaling (re-encoded as-is).

## Alternatives considered

**Storage:**
- **JSON file store** — rejected: zero new dependencies and fine at 100 items, but every capture rewrites the whole file (with base64 images inside), and retention growth makes that quadratic in cost. No indexed deletes for `delete_item`.
- **Hybrid JSON index + PNG files on disk** — rejected: avoids the giant-file rewrite, but adds orphan-file lifecycle management (deleting the right PNG on item delete/trim/clear), which is exactly the class of bugs a transactional store gives away for free.
- **SQLite via `rusqlite` with system SQLite (no `bundled`)** — rejected for now: avoids the C compile, but makes the build depend on the machine's SQLite version/presence; `bundled` costs ~1 min on first build and is self-contained. Revisit if build time becomes painful.

**Images:**
- **Full-size only** — rejected: exact fidelity, but the UI would decode full screenshots on every render; DB and IPC both balloon.
- **Thumbnail only (store downsampled)** — rejected: loses restore fidelity; "copy this screenshot back" would paste a degraded image. The product promise is exact round-trip.
- **Full + thumbnail (chosen)** — pays ~2× storage for images in exchange for UI responsiveness while keeping exact restore. Accepted per the product decision above.

## Consequences

**Positive**
- History survives restarts; duplicate detection now also works **across sessions** (the monitor dedupes against the preloaded top item — fixed a spike limitation).
- List rendering uses ≤480 px thumbnails regardless of source image size; search/render no longer depends on multi-MB base64 decode.
- Startup loads 100 items from a small indexed table — negligible time (single `SELECT` ordered by timestamp).
- Storage failure can't take the app down; the in-memory behavior from the spike remains the fallback.

**Negative / costs**
- New build dependency: `rusqlite` with `bundled` (adds SQLite C compilation to cold builds; ~2.5 min release builds now).
- Storage growth: full images at capture size, 100-item cap bounds it, but a screenshot-heavy user stores up to 100 full PNGs (~tens/hundreds of MB worst case). Explicitly accepted for now; a future ADR may cap image bytes or re-encode old items.
- Two copies of every image exist in the payload (full + thumbnail) — also accepted.
- DB schema now exists ⇒ future changes need migration handling (currently: `CREATE TABLE IF NOT EXISTS` only; no versioning yet). Introduce `PRAGMA user_version` migrations when the schema first changes.

**Rules for future work**
- All history mutations go through `storage.rs` (insert/delete/clear/trim) — don't hand-write SQL in `lib.rs` or `clipboard.rs`.
- Keep `storage::MAX_HISTORY` as the single cap; frontend's 100-item event cap mirrors it (would ideally share, note if the number changes).
- Writes on the monitor thread stay best-effort (log, don't propagate); user-facing commands (`delete_item`, `clear_history`) may surface errors to the frontend.
- Lock order: history mutex → db mutex, always released before emitting events; never hold one while blocking on the other across threads (see `drop(history)` before `persist(...)` in the monitor).
- When the schema changes, add a migration + bump `PRAGMA user_version` and update this ADR (or supersede it).
