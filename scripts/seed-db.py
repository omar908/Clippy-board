#!/usr/bin/env python3
"""Seed a Clippy-board history database with synthetic items for smoke tests.

The payloads mirror the JSON tags emitted by `ClipboardPayload` in
src-tauri/src/clipboard.rs. The database is cleared first, so this is only
safe against a disposable database (CI runner or a dedicated test path).

Usage:
    python scripts/seed-db.py [path/to/history.db]

Defaults to %APPDATA%\\com.clippy.app\\history.db on Windows.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS history (
    id        TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    payload   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC);
"""

# 1x1 transparent PNG.
PNG_1X1 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4"
    "2mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def text_payload(text: str) -> dict:
    preview = " ".join(text.splitlines()[:2])[:120]
    return {
        "type": "text",
        "payload": {
            "text": text,
            "preview": preview,
            "char_count": len(text),
            "line_count": text.count("\n") + 1,
        },
    }


def main() -> int:
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        appdata = os.environ.get("APPDATA")
        if not appdata:
            print("APPDATA is not set; pass an explicit database path", file=sys.stderr)
            return 2
        db_path = os.path.join(appdata, "com.clippy.app", "history.db")

    parent = os.path.dirname(os.path.abspath(db_path))
    os.makedirs(parent, exist_ok=True)

    long_text = "\n".join(
        [
            "Clippy-board smoke-test sample (synthetic).",
            "",
            "This entry exists only to exercise the hover preview and text",
            "wrapping paths during automated tests. It contains no real data.",
            "",
        ]
        + [
            f"Line {i:02d}: the quick brown fox jumps over the lazy dog "
            f"{i * 7 % 100:02d}"
            for i in range(1, 61)
        ]
    )

    now = int(time.time() * 1000)
    items = [
        # Newest first: the smoke test hovers the top card.
        ("smoke-text-long", now, text_payload(long_text)),
        (
            "smoke-text-short",
            now - 60_000,
            text_payload("Hello from the Clippy-board smoke test."),
        ),
        (
            "smoke-image",
            now - 120_000,
            {
                "type": "image",
                "payload": {
                    "data_url": f"data:image/png;base64,{PNG_1X1}",
                    "width": 1,
                    "height": 1,
                    "byte_size": 68,
                },
            },
        ),
        (
            "smoke-file",
            now - 180_000,
            {
                "type": "file",
                "payload": {
                    "paths": [
                        "C:\\Users\\Example\\Documents\\quarterly-report.pdf",
                        "C:\\Users\\Example\\Pictures\\sample.png",
                    ],
                    "count": 2,
                    "preview": "quarterly-report.pdf, sample.png",
                },
            },
        ),
    ]

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.execute("DELETE FROM history")
        conn.executemany(
            "INSERT INTO history (id, timestamp, payload) VALUES (?, ?, ?)",
            [
                (item_id, timestamp, json.dumps(payload, separators=(",", ":")))
                for item_id, timestamp, payload in items
            ],
        )
        conn.commit()

    print(f"Seeded {len(items)} synthetic items into {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
