//! Persistent clipboard history storage (SQLite via rusqlite).
//!
//! Schema decisions are recorded in docs/adr/0004-persistent-history-sqlite.md.
//! The database stores the full payload as JSON (the same tagged shape the
//! frontend receives over IPC), so load/insert code stays format-agnostic.

use std::path::Path;

use rusqlite::{params, Connection};

use crate::clipboard::{ClipboardItem, ClipboardPayload, DeletedItem};

/// Maximum number of history items kept (matches the in-memory cap).
pub const MAX_HISTORY: usize = 100;

const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS history (
        id        TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        payload   TEXT NOT NULL,
        pinned    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC);
    CREATE TABLE IF NOT EXISTS deleted_items (
        id             TEXT PRIMARY KEY,
        original_ts    INTEGER NOT NULL,
        deleted_at     INTEGER NOT NULL,
        payload        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deleted_deleted_at ON deleted_items(deleted_at DESC);
";

/// Open (or create) the history database, creating parent directories as needed.
pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create data dir {}: {}", parent.display(), e))?;
    }
    let conn = Connection::open(path)
        .map_err(|e| format!("failed to open db {}: {}", path.display(), e))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("failed to create schema: {}", e))?;
    // Migration for existing DBs
    let _ = conn.execute("ALTER TABLE history ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0", []);
    // WAL keeps readers from blocking the writer; adequate for a single-process app
    conn.pragma_update(None, "journal_mode", "WAL").ok();
    Ok(conn)
}

/// Load all history items, newest first.
///
/// If the DB contains duplicate payloads (possible from builds that only
/// deduped against the previous item), the newest occurrence wins and older
/// copies are dropped — the in-memory history is always duplicate-free.
pub fn load(conn: &Connection) -> Vec<ClipboardItem> {
    let mut items = Vec::new();
    let mut stmt = match conn.prepare("SELECT id, timestamp, payload, pinned FROM history ORDER BY timestamp DESC") {
        Ok(s) => s,
        Err(e) => {
            // Try without pinned column for old DBs
            let mut stmt2 = match conn.prepare("SELECT id, timestamp, payload FROM history ORDER BY timestamp DESC") {
                Ok(s) => s,
                Err(e2) => {
                    crate::app_log(&format!("storage: failed to prepare load: {}", e2));
                    return items;
                }
            };
            let rows = match stmt2.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            }) {
                Ok(r) => r,
                Err(e2) => {
                    crate::app_log(&format!("storage: failed to query history: {}", e2));
                    return items;
                }
            };
            let mut seen_payloads: Vec<String> = Vec::new();
            for row in rows.flatten() {
                let (id, timestamp, payload_json) = row;
                if seen_payloads.contains(&payload_json) {
                    crate::app_log(&format!("storage: dropping duplicate payload row {}", id));
                    continue;
                }
                match serde_json::from_str::<ClipboardPayload>(&payload_json) {
                    Ok(payload) => {
                        seen_payloads.push(payload_json);
                        items.push(ClipboardItem {
                            id,
                            timestamp: timestamp as u64,
                            pinned: false,
                            payload,
                        })
                    }
                    Err(e2) => crate::app_log(&format!("storage: skipping corrupt item {}: {}", id, e2)),
                }
            }
            return items;
        }
    };
    let rows = match stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i32>(3)?,
        ))
    }) {
        Ok(r) => r,
        Err(e) => {
            crate::app_log(&format!("storage: failed to query history: {}", e));
            return items;
        }
    };
    let mut seen_payloads: Vec<String> = Vec::new();
    for row in rows.flatten() {
        let (id, timestamp, payload_json, pinned) = row;
        // Rows are newest-first; skip any payload we've already accepted.
        if seen_payloads.contains(&payload_json) {
            crate::app_log(&format!("storage: dropping duplicate payload row {}", id));
            continue;
        }
        match serde_json::from_str::<ClipboardPayload>(&payload_json) {
            Ok(payload) => {
                seen_payloads.push(payload_json);
                items.push(ClipboardItem {
                    id,
                    timestamp: timestamp as u64,
                    pinned: pinned != 0,
                    payload,
                })
            }
            Err(e) => crate::app_log(&format!("storage: skipping corrupt item {}: {}", id, e)),
        }
    }
    items
}

/// Insert or replace a single item.
pub fn insert(conn: &Connection, item: &ClipboardItem) -> Result<(), String> {
    let payload_json = serde_json::to_string(&item.payload)
        .map_err(|e| format!("failed to serialize payload: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO history (id, timestamp, payload, pinned) VALUES (?1, ?2, ?3, ?4)",
        params![item.id, item.timestamp as i64, payload_json, if item.pinned { 1i32 } else { 0i32 }],
    )
    .map_err(|e| format!("failed to insert item: {}", e))?;
    Ok(())
}

/// Delete one item by id.
pub fn delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| format!("failed to delete item: {}", e))?;
    Ok(())
}

/// Delete all history.
pub fn clear(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM history", [])
        .map_err(|e| format!("failed to clear history: {}", e))?;
    Ok(())
}

/// Trim history to `keep` items, dropping the oldest (respecting pins).
pub fn trim(conn: &Connection, keep: usize) -> Result<(), String> {
    // Delete unpinned items beyond keep limit, always keep all pinned items
    if keep == 0 {
        conn.execute("DELETE FROM history WHERE pinned = 0", [])
            .map_err(|e| format!("failed to trim history: {}", e))?;
        return Ok(());
    }
    conn.execute(
        "DELETE FROM history WHERE pinned = 0 AND id NOT IN (
             SELECT id FROM (SELECT id FROM history WHERE pinned = 0 ORDER BY timestamp DESC LIMIT ?1)
         )",
        params![keep as i64],
    )
    .map_err(|e| format!("failed to trim history: {}", e))?;
    Ok(())
}

/// Load soft-deleted entries, most recent deletion first.
pub fn load_deleted(conn: &Connection) -> Vec<DeletedItem> {
    let mut items = Vec::new();
    let mut stmt = match conn.prepare(
        "SELECT id, original_ts, deleted_at, payload FROM deleted_items ORDER BY deleted_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => {
            crate::app_log(&format!("storage: failed to prepare load_deleted: {}", e));
            return items;
        }
    };
    let rows = match stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, String>(3)?,
        ))
    }) {
        Ok(r) => r,
        Err(e) => {
            crate::app_log(&format!("storage: failed to query deleted: {}", e));
            return items;
        }
    };
    for row in rows.flatten() {
        let (id, original_ts, deleted_at, payload_json) = row;
        match serde_json::from_str::<crate::clipboard::ClipboardPayload>(&payload_json) {
            Ok(payload) => items.push(crate::clipboard::DeletedItem {
                id,
                original_timestamp: original_ts as u64,
                deleted_at: deleted_at as u64,
                payload,
            }),
            Err(e) => crate::app_log(&format!("storage: skipping corrupt deleted item {}: {}", id, e)),
        }
    }
    items
}

/// Persist a soft-deleted entry.
pub fn insert_deleted(conn: &Connection, item: &crate::clipboard::DeletedItem) -> Result<(), String> {
    let payload_json = serde_json::to_string(&item.payload)
        .map_err(|e| format!("failed to serialize payload: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO deleted_items (id, original_ts, deleted_at, payload) VALUES (?1, ?2, ?3, ?4)",
        params![item.id, item.original_timestamp as i64, item.deleted_at as i64, payload_json],
    )
    .map_err(|e| format!("failed to insert deleted item: {}", e))?;
    Ok(())
}

/// Remove a soft-deleted entry (used by Undo / permanent delete).
pub fn delete_deleted(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM deleted_items WHERE id = ?1", params![id])
        .map_err(|e| format!("failed to delete deleted item: {}", e))?;
    Ok(())
}

/// Purge deleted entries whose TTL has elapsed.
pub fn purge_deleted_before(conn: &Connection, before_ms: u64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM deleted_items WHERE deleted_at < ?1",
        params![before_ms as i64],
    )
    .map_err(|e| format!("failed to purge deleted items: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::{ClipboardItem, ClipboardPayload, DeletedItem};
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in memory");
        conn.execute_batch(SCHEMA).expect("schema");
        conn
    }

    fn text_item(id: &str, ts: u64, text: &str) -> ClipboardItem {
        let preview = text.chars().take(80).collect::<String>();
        ClipboardItem {
            id: id.to_string(),
            timestamp: ts,
            pinned: false,
            payload: ClipboardPayload::Text {
                text: text.to_string(),
                preview,
                char_count: text.len(),
                line_count: text.lines().count().max(1),
            },
        }
    }

    fn deleted_item(id: &str, original_ts: u64, deleted_at: u64, text: &str) -> DeletedItem {
        let preview = text.chars().take(80).collect::<String>();
        DeletedItem {
            id: id.to_string(),
            original_timestamp: original_ts,
            deleted_at,
            payload: ClipboardPayload::Text {
                text: text.to_string(),
                preview,
                char_count: text.len(),
                line_count: text.lines().count().max(1),
            },
        }
    }

    #[test]
    fn load_empty_returns_empty() {
        let conn = test_conn();
        assert!(load(&conn).is_empty());
    }

    #[test]
    fn insert_and_load_roundtrip() {
        let conn = test_conn();
        let item = text_item("1", 1000, "hello");
        insert(&conn, &item).unwrap();
        let items = load(&conn);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "1");
        assert_eq!(items[0].timestamp, 1000);
        match &items[0].payload {
            ClipboardPayload::Text { text, .. } => assert_eq!(text, "hello"),
            _ => panic!("wrong payload"),
        }
    }

    #[test]
    fn load_deduplicates_payloads_newest_wins() {
        let conn = test_conn();
        // Insert older duplicate first, then newer duplicate with different id/timestamp.
        let old = text_item("old", 1000, "dup");
        let new = text_item("new", 2000, "dup");
        insert(&conn, &old).unwrap();
        insert(&conn, &new).unwrap();
        let items = load(&conn);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "new");
        assert_eq!(items[0].timestamp, 2000);
    }

    #[test]
    fn reinsert_same_payload_moves_to_top_via_dedup() {
        let conn = test_conn();
        insert(&conn, &text_item("a", 1000, "same")).unwrap();
        insert(&conn, &text_item("b", 2000, "other")).unwrap();
        // Re-copy/move-to-top: insert new row with same payload but newer timestamp/new id
        insert(&conn, &text_item("a2", 3000, "same")).unwrap();
        let items = load(&conn);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "a2");
        assert_eq!(items[1].id, "b");
    }

    #[test]
    fn delete_removes_item() {
        let conn = test_conn();
        insert(&conn, &text_item("1", 1000, "x")).unwrap();
        insert(&conn, &text_item("2", 2000, "y")).unwrap();
        delete(&conn, "1").unwrap();
        let items = load(&conn);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "2");
    }

    #[test]
    fn clear_empties() {
        let conn = test_conn();
        insert(&conn, &text_item("1", 1000, "x")).unwrap();
        insert(&conn, &text_item("2", 2000, "y")).unwrap();
        clear(&conn).unwrap();
        assert!(load(&conn).is_empty());
    }

    #[test]
    fn trim_keeps_newest_n() {
        let conn = test_conn();
        for i in 1..=5 {
            insert(&conn, &text_item(&format!("i{i}"), i as u64, &format!("t{i}"))).unwrap();
        }
        trim(&conn, 2).unwrap();
        let items = load(&conn);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "i5");
        assert_eq!(items[1].id, "i4");
    }

    #[test]
    fn trim_zero_keeps_none() {
        let conn = test_conn();
        insert(&conn, &text_item("1", 1000, "x")).unwrap();
        trim(&conn, 0).unwrap();
        assert!(load(&conn).is_empty());
    }

    #[test]
    fn corrupt_row_skipped() {
        let conn = test_conn();
        insert(&conn, &text_item("good", 2000, "ok")).unwrap();
        conn.execute(
            "INSERT INTO history (id, timestamp, payload) VALUES (?1, ?2, ?3)",
            params!["bad", 1000i64, "{not json"],
        )
        .unwrap();
        let items = load(&conn);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "good");
    }

    #[test]
    fn load_ordered_newest_first() {
        let conn = test_conn();
        insert(&conn, &text_item("1", 1000, "a")).unwrap();
        insert(&conn, &text_item("2", 3000, "b")).unwrap();
        insert(&conn, &text_item("3", 2000, "c")).unwrap();
        let items = load(&conn);
        let ids: Vec<_> = items.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, vec!["2", "3", "1"]);
    }

    #[test]
    fn load_deleted_empty_returns_empty() {
        let conn = test_conn();
        let items = load_deleted(&conn);
        assert!(items.is_empty());
    }

    #[test]
    fn insert_and_load_deleted() {
        let conn = test_conn();
        let d = deleted_item("d1", 1000, 2000, "deleted text");
        insert_deleted(&conn, &d).unwrap();
        let items = load_deleted(&conn);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "d1");
        assert_eq!(items[0].original_timestamp, 1000);
        assert_eq!(items[0].deleted_at, 2000);
        match &items[0].payload {
            ClipboardPayload::Text { text, .. } => assert_eq!(text, "deleted text"),
            _ => panic!("wrong payload"),
        }
    }

    #[test]
    fn delete_deleted_removes_item() {
        let conn = test_conn();
        insert_deleted(&conn, &deleted_item("d1", 1000, 2000, "x")).unwrap();
        insert_deleted(&conn, &deleted_item("d2", 1000, 3000, "y")).unwrap();
        delete_deleted(&conn, "d1").unwrap();
        let items = load_deleted(&conn);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "d2");
    }

    #[test]
    fn purge_deleted_before_removes_expired() {
        let conn = test_conn();
        insert_deleted(&conn, &deleted_item("d1", 1000, 1500, "x")).unwrap();
        insert_deleted(&conn, &deleted_item("d2", 1000, 2500, "y")).unwrap();
        purge_deleted_before(&conn, 2000).unwrap();
        let items = load_deleted(&conn);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "d2");
    }

    #[test]
    fn load_deleted_orders_by_deleted_at_desc() {
        let conn = test_conn();
        insert_deleted(&conn, &deleted_item("d1", 1000, 1500, "x")).unwrap();
        insert_deleted(&conn, &deleted_item("d2", 1000, 3000, "y")).unwrap();
        insert_deleted(&conn, &deleted_item("d3", 1000, 2000, "z")).unwrap();
        let items = load_deleted(&conn);
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].id, "d2");
        assert_eq!(items[1].id, "d3");
        assert_eq!(items[2].id, "d1");
    }
}
