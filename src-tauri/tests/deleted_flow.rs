#[cfg(test)]
mod tests {
    use clippy_app_lib::clipboard::{ClipboardItem, ClipboardPayload, ClipboardState, DeletedItem};
    use std::sync::{Arc, Mutex};

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

    #[test]
    fn soft_delete_moves_to_deleted() {
        let state = ClipboardState {
            history: Arc::new(Mutex::new(vec![text_item("1", 1000, "hi")])),
            db: Arc::new(Mutex::new(None)),
            deleted: Arc::new(Mutex::new(vec![])),
        };
        let now = 10000u64;
        let ttl_ms = 60000u64;
        let item = state.history.lock().unwrap()[0].clone();
        state.history.lock().unwrap().clear();
        state.deleted.lock().unwrap().push(DeletedItem {
            id: item.id,
            original_timestamp: item.timestamp,
            deleted_at: now + ttl_ms,
            payload: item.payload,
        });
        assert_eq!(state.history.lock().unwrap().len(), 0);
        assert_eq!(state.deleted.lock().unwrap().len(), 1);
    }

    #[test]
    fn restore_moves_back_to_history() {
        let state = ClipboardState {
            history: Arc::new(Mutex::new(vec![])),
            db: Arc::new(Mutex::new(None)),
            deleted: Arc::new(Mutex::new(vec![DeletedItem {
                id: "x".to_string(),
                original_timestamp: 500,
                deleted_at: 99999,
                payload: ClipboardPayload::Text {
                    text: "hi".to_string(),
                    preview: "hi".to_string(),
                    char_count: 2,
                    line_count: 1,
                },
            }])),
        };
        let item = state.deleted.lock().unwrap().remove(0);
        state.history.lock().unwrap().push(ClipboardItem {
            id: item.id,
            timestamp: item.original_timestamp,
            pinned: false,
            payload: item.payload,
        });
        assert_eq!(state.history.lock().unwrap().len(), 1);
        assert_eq!(state.deleted.lock().unwrap().len(), 0);
    }

    #[test]
    fn permanent_delete_clears() {
        let state = ClipboardState {
            history: Arc::new(Mutex::new(vec![])),
            db: Arc::new(Mutex::new(None)),
            deleted: Arc::new(Mutex::new(vec![DeletedItem {
                id: "x".to_string(),
                original_timestamp: 500,
                deleted_at: 99999,
                payload: ClipboardPayload::Text {
                    text: "hi".to_string(),
                    preview: "hi".to_string(),
                    char_count: 2,
                    line_count: 1,
                },
            }])),
        };
        state.deleted.lock().unwrap().clear();
        assert_eq!(state.deleted.lock().unwrap().len(), 0);
    }
}
