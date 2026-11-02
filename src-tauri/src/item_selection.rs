use crate::clipboard::{self, ClipboardItem, ClipboardPayload, ClipboardState};

pub struct Selection {
    pub payload: ClipboardPayload,
    pub from_history: bool,
}

/// Resolve before writing so expired entries cannot be copied or restored.
fn resolve(state: &ClipboardState, id: &str, now: u64) -> Option<Selection> {
    {
        let history = state.history.lock().unwrap();
        if let Some(item) = history.iter().find(|item| item.id == id) {
            return Some(Selection {
                payload: item.payload.clone(),
                from_history: true,
            });
        }
    }
    let deleted = state.deleted.lock().unwrap();
    deleted
        .iter()
        .find(|item| item.id == id && item.deleted_at > now)
        .map(|item| Selection {
            payload: item.payload.clone(),
            from_history: false,
        })
}

/// Copy first: a failed clipboard write must leave Deleted untouched.
pub fn copy(
    state: &ClipboardState,
    id: &str,
    now: u64,
    write: impl FnOnce(&ClipboardPayload) -> Result<(), String>,
) -> Result<ClipboardItem, String> {
    let selected = resolve(state, id, now).ok_or("Item not found")?;
    write(&selected.payload)?;
    if selected.from_history {
        return clipboard::bump_on_select(state, id).ok_or("Item not found".into());
    }
    let mut deleted = state.deleted.lock().unwrap();
    if !deleted.iter().any(|item| item.id == id) {
        return Err("Item no longer in Deleted".into());
    }
    let item = ClipboardItem {
        id: id.into(),
        timestamp: now,
        pinned: false,
        payload: selected.payload,
    };
    // Persist both sides together before publishing the restored in-memory item.
    let db = state.db.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        let transaction = conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        crate::storage::insert(&transaction, &item)?;
        crate::storage::delete_deleted(&transaction, id)?;
        transaction.commit().map_err(|error| error.to_string())?;
    }
    drop(db);
    deleted.retain(|item| item.id != id);
    drop(deleted);
    let mut history = state.history.lock().unwrap();
    history.retain(|item| item.id != id);
    history.insert(0, item.clone());
    Ok(item)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::{ClipboardItem, DeletedItem};

    fn text() -> ClipboardPayload {
        ClipboardPayload::Text {
            text: "text".into(),
            preview: "text".into(),
            char_count: 4,
            line_count: 1,
        }
    }

    #[test]
    fn history_copies_keep_the_existing_bump_behavior() {
        let state = ClipboardState::new();
        state.history.lock().unwrap().push(ClipboardItem {
            id: "one".into(),
            timestamp: 1,
            pinned: false,
            payload: text(),
        });
        assert!(resolve(&state, "one", 100).unwrap().from_history);
        assert!(resolve(&state, "missing", 100).is_none());
    }

    #[test]
    fn deleted_copies_restore_every_payload_at_a_new_timestamp() {
        let payloads = [
            text(),
            ClipboardPayload::File {
                paths: vec!["C:/sample.txt".into()],
                count: 1,
                preview: "sample.txt".into(),
            },
            ClipboardPayload::Image {
                data_url: "data:image/png;base64,sample".into(),
                thumbnail: None,
                width: 1,
                height: 1,
                byte_size: 1,
            },
        ];
        for payload in payloads {
            let state = ClipboardState::new();
            state.deleted.lock().unwrap().push(DeletedItem {
                id: "trash".into(),
                original_timestamp: 1,
                deleted_at: 200,
                payload: payload.clone(),
            });
            let selected = resolve(&state, "trash", 100).unwrap();
            assert!(!selected.from_history);
            assert_eq!(selected.payload, payload);
            assert!(state.history.lock().unwrap().is_empty());
            let deleted = state.deleted.lock().unwrap();
            assert_eq!(deleted.len(), 1);
            assert_eq!(deleted[0].deleted_at, 200);
            drop(deleted);
            let copied = copy(&state, "trash", 100, |value| {
                assert_eq!(value, &payload);
                Ok(())
            })
            .unwrap();
            assert_eq!(copied.timestamp, 100);
            assert_eq!(copied.payload, payload);
            assert!(state.deleted.lock().unwrap().is_empty());
            assert_eq!(state.history.lock().unwrap()[0].id, "trash");
        }
    }

    #[test]
    fn expired_or_missing_deleted_entries_cannot_be_copied() {
        let state = ClipboardState::new();
        state.deleted.lock().unwrap().push(DeletedItem {
            id: "trash".into(),
            original_timestamp: 1,
            deleted_at: 200,
            payload: text(),
        });
        assert!(resolve(&state, "trash", 200).is_none());
        assert!(resolve(&state, "trash", 201).is_none());
        assert!(resolve(&state, "missing", 100).is_none());
    }

    #[test]
    fn copy_restores_the_same_entry_at_the_top_after_a_successful_write() {
        let state = ClipboardState::new();
        state.history.lock().unwrap().push(ClipboardItem {
            id: "newer".into(),
            timestamp: 50,
            pinned: false,
            payload: text(),
        });
        state.deleted.lock().unwrap().push(DeletedItem {
            id: "trash".into(),
            original_timestamp: 1,
            deleted_at: 200,
            payload: text(),
        });
        let restored = copy(&state, "trash", 100, |payload| {
            assert_eq!(payload, &text());
            assert_eq!(state.deleted.lock().unwrap().len(), 1);
            Ok(())
        })
        .unwrap();
        assert_eq!(restored.id, "trash");
        assert_eq!(restored.timestamp, 100);
        assert!(state.deleted.lock().unwrap().is_empty());
        let history = state.history.lock().unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, "trash");
        assert_eq!(history[1].id, "newer");
    }

    #[test]
    fn failed_copy_leaves_deleted_and_history_intact() {
        let state = ClipboardState::new();
        state.deleted.lock().unwrap().push(DeletedItem {
            id: "trash".into(),
            original_timestamp: 1,
            deleted_at: 200,
            payload: text(),
        });
        assert!(copy(&state, "trash", 100, |_| Err("Clipboard busy".into())).is_err());
        assert!(state.history.lock().unwrap().is_empty());
        assert_eq!(state.deleted.lock().unwrap()[0].deleted_at, 200);
        assert!(copy(&state, "trash", 200, |_| panic!(
            "Expired entries must not be written"
        ))
        .is_err());
    }

    #[test]
    fn restore_and_copy_persists_both_sides_and_rolls_back_a_failed_move() {
        let state = ClipboardState::new();
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE history (id TEXT PRIMARY KEY, timestamp INTEGER, payload TEXT, pinned INTEGER);
            CREATE TABLE deleted_items (id TEXT PRIMARY KEY, original_ts INTEGER, deleted_at INTEGER, payload TEXT);").unwrap();
        for id in ["one", "two"] {
            let item = DeletedItem {
                id: id.into(),
                original_timestamp: 1,
                deleted_at: 200,
                payload: text(),
            };
            crate::storage::insert_deleted(&conn, &item).unwrap();
            state.deleted.lock().unwrap().push(item);
        }
        *state.db.lock().unwrap() = Some(conn);
        copy(&state, "one", 100, |_| Ok(())).unwrap();
        {
            let db = state.db.lock().unwrap();
            let conn = db.as_ref().unwrap();
            assert_eq!(crate::storage::load(conn)[0].timestamp, 100);
            assert_eq!(crate::storage::load_deleted(conn)[0].id, "two");
            conn.execute_batch("CREATE TRIGGER deny_delete BEFORE DELETE ON deleted_items BEGIN SELECT RAISE(ABORT, 'blocked'); END;").unwrap();
        }
        assert!(copy(&state, "two", 101, |_| Ok(())).is_err());
        assert_eq!(state.deleted.lock().unwrap()[0].id, "two");
        assert_eq!(state.history.lock().unwrap().len(), 1);
        let db = state.db.lock().unwrap();
        assert_eq!(crate::storage::load(db.as_ref().unwrap()).len(), 1);
        assert_eq!(
            crate::storage::load_deleted(db.as_ref().unwrap())[0].id,
            "two"
        );
    }
}
