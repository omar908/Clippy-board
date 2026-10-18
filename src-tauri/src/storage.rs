//! Persistent clipboard history storage (SQLite via rusqlite).
//!
//! Schema decisions are recorded in docs/adr/0004-persistent-history-sqlite.md.
//! The database stores the full payload as JSON (the same tagged shape the
//! frontend receives over IPC), so load/insert code stays format-agnostic.

use std::path::Path;

use rusqlite::{params, Connection};

use crate::clipboard::{ClipboardItem, ClipboardPayload};

/// Maximum number of history items kept (matches the in-memory cap).
pub const MAX_HISTORY: usize = 100;

const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS history (
        id        TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        payload   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC);
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
    // WAL keeps readers from blocking the writer; adequate for a single-process app
    conn.pragma_update(None, "journal_mode", "WAL").ok();
    Ok(conn)
}

/// Load all history items, newest first.
pub fn load(conn: &Connection) -> Vec<ClipboardItem> {
    let mut items = Vec::new();
    let mut stmt = match conn.prepare("SELECT id, timestamp, payload FROM history ORDER BY timestamp DESC") {
        Ok(s) => s,
        Err(e) => {
            crate::app_log(&format!("storage: failed to prepare load: {}", e));
            return items;
        }
    };
    let rows = match stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
        ))
    }) {
        Ok(r) => r,
        Err(e) => {
            crate::app_log(&format!("storage: failed to query history: {}", e));
            return items;
        }
    };
    for row in rows.flatten() {
        let (id, timestamp, payload_json) = row;
        match serde_json::from_str::<ClipboardPayload>(&payload_json) {
            Ok(payload) => items.push(ClipboardItem {
                id,
                timestamp: timestamp as u64,
                payload,
            }),
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
        "INSERT OR REPLACE INTO history (id, timestamp, payload) VALUES (?1, ?2, ?3)",
        params![item.id, item.timestamp as i64, payload_json],
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

/// Trim history to `keep` items, dropping the oldest.
pub fn trim(conn: &Connection, keep: usize) -> Result<(), String> {
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (
             SELECT id FROM history ORDER BY timestamp DESC LIMIT ?1
         )",
        params![keep as i64],
    )
    .map_err(|e| format!("failed to trim history: {}", e))?;
    Ok(())
}
