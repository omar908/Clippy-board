// Shared IPC/payload types — imported by both the main window logic (main.ts)
// and the preview module (preview.ts) so the preview can move to its own
// webview entry point later without dragging main.ts along.

export interface TextPayload {
  text: string;
  preview: string;
  char_count: number;
  line_count: number;
}

export interface ImagePayload {
  data_url: string;
  thumbnail?: string | null;
  width: number;
  height: number;
  byte_size: number;
}

export interface FilePayload {
  paths: string[];
  count: number;
  preview: string;
}

export type ClipboardPayload =
  | { type: "text"; payload: TextPayload }
  | { type: "image"; payload: ImagePayload }
  | { type: "file"; payload: FilePayload };

export type ClipboardItem = {
  id: string;
  timestamp: number;
  pinned?: boolean;
} & ClipboardPayload;
