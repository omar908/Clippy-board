//! Clipboard identity is independent of selection and history capture/pause.
use crate::clipboard::{ClipboardPayload, ClipboardState};
use tauri::{AppHandle, Emitter, Manager};

fn same_content(left: &ClipboardPayload, right: &ClipboardPayload) -> bool {
    match (left, right) {
        (ClipboardPayload::Text { text: a, .. }, ClipboardPayload::Text { text: b, .. }) => a == b,
        (ClipboardPayload::File { paths: a, .. }, ClipboardPayload::File { paths: b, .. }) => {
            a == b
        }
        (
            ClipboardPayload::Image {
                data_url: a,
                width: aw,
                height: ah,
                ..
            },
            ClipboardPayload::Image {
                data_url: b,
                width: bw,
                height: bh,
                ..
            },
        ) => a == b && aw == bw && ah == bh,
        _ => false,
    }
}

pub fn item_id(state: &ClipboardState, now: u64) -> Option<String> {
    let current = state.current_payload.lock().unwrap();
    let payload = current.as_ref()?;
    {
        let history = state.history.lock().unwrap();
        if let Some(item) = history
            .iter()
            .find(|item| same_content(&item.payload, payload))
        {
            return Some(item.id.clone());
        }
    }
    state
        .deleted
        .lock()
        .unwrap()
        .iter()
        .find(|item| item.deleted_at > now && same_content(&item.payload, payload))
        .map(|item| item.id.clone())
}

pub fn publish(app: &AppHandle) {
    let state = app.state::<ClipboardState>();
    let _ = app.emit(
        "current-clipboard-changed",
        item_id(&state, crate::now_ms()),
    );
}

pub fn update(app: &AppHandle, payload: Option<ClipboardPayload>, sequence: u32) {
    let state = app.state::<ClipboardState>();
    let mut current = state.current_payload.lock().unwrap();
    // A copy may finish while the monitor captures an older clipboard read.
    // Check under the cache lock so old data cannot replace the new identity.
    if crate::clipboard::sequence_number() != sequence {
        return;
    }
    *current = payload;
    drop(current);
    publish(app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::{ClipboardItem, DeletedItem};

    fn text(value: &str) -> ClipboardPayload {
        ClipboardPayload::Text {
            text: value.into(),
            preview: "presentation only".into(),
            char_count: 0,
            line_count: 0,
        }
    }

    #[test]
    fn matches_content_not_selection_or_metadata_and_clears_when_unmatched() {
        let state = ClipboardState::new();
        state.history.lock().unwrap().push(ClipboardItem {
            id: "one".into(),
            timestamp: 1,
            pinned: false,
            payload: text("first"),
        });
        assert_eq!(item_id(&state, 10), None);
        *state.current_payload.lock().unwrap() = Some(text("untracked"));
        assert_eq!(item_id(&state, 10), None);
        let mut payload = text("first");
        if let ClipboardPayload::Text {
            preview,
            char_count,
            ..
        } = &mut payload
        {
            *preview = "different".into();
            *char_count = 5;
        }
        *state.current_payload.lock().unwrap() = Some(payload);
        assert_eq!(item_id(&state, 10).as_deref(), Some("one"));
        state.history.lock().unwrap().clear();
        assert_eq!(item_id(&state, 10), None);
    }

    #[test]
    fn follows_soft_delete_and_restore_but_excludes_expired_entries() {
        let state = ClipboardState::new();
        *state.current_payload.lock().unwrap() = Some(text("first"));
        state.deleted.lock().unwrap().push(DeletedItem {
            id: "one".into(),
            original_timestamp: 1,
            deleted_at: 100,
            payload: text("first"),
        });
        assert_eq!(item_id(&state, 10).as_deref(), Some("one"));
        assert_eq!(item_id(&state, 100), None);
        state.deleted.lock().unwrap().clear();
        state.history.lock().unwrap().push(ClipboardItem {
            id: "one".into(),
            timestamp: 1,
            pinned: false,
            payload: text("first"),
        });
        assert_eq!(item_id(&state, 101).as_deref(), Some("one"));
    }

    #[test]
    fn images_ignore_thumbnail_metadata_and_files_match_the_full_path_list() {
        let image = ClipboardPayload::Image {
            data_url: "png".into(),
            width: 2,
            height: 3,
            byte_size: 1,
            thumbnail: None,
        };
        let mut thumb = image.clone();
        if let ClipboardPayload::Image {
            thumbnail,
            byte_size,
            ..
        } = &mut thumb
        {
            *thumbnail = Some("thumb".into());
            *byte_size = 2;
        }
        assert!(same_content(&image, &thumb));
        let files = ClipboardPayload::File {
            paths: vec!["C:/a".into(), "C:/b".into()],
            count: 2,
            preview: "a".into(),
        };
        let different = ClipboardPayload::File {
            paths: vec!["C:/a".into()],
            count: 1,
            preview: "a".into(),
        };
        assert!(!same_content(&files, &different));
        assert!(!same_content(&text("png"), &image));
    }
}
