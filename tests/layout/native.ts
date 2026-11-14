import type { ClipboardItem, DeletedItem } from "../../src/types";
import type { AppSettings, CustomTheme } from "../../src/api/settings";

// Deterministic native boundary for a real browser. These tests do not model
// OS focus, physical monitor switching, native IPC, or a second native window.
const params = new URLSearchParams(location.search);
const label = params.get("mode") === "preview" ? "preview" : "main";
const subscriptions = new Map<string, Set<(payload: unknown) => void>>();
let copyCount = 0;
document.documentElement.dataset.copyCount = "0";
document.documentElement.dataset.menuCount = "0";
let menuCount = 0;
let savedShortcuts: Record<string, string> = {};
let startupEnabled = false;
let startupWrites = 0;
let maxHistory = 100;
let deleteTtl = 60;
let compactMode = params.has("density-compact");
let theme = params.get("theme") ?? "system";
let customThemes: CustomTheme[] = [];
let customThemeId: string | null = null;
let textSize = params.get("text-size") ?? "100";
let font = params.get("font") ?? "system";
let automaticUpdateChecks = true;
let saveFailures = 0;
let saveDelay = 0;
let loadFailures = 0;
let settingsWrites = 0;
let hideCount = 0;
document.documentElement.dataset.hideCount = "0";
document.documentElement.dataset.settingsWrites = "0";
window.addEventListener("test-settings-save", event => {
  const control = (event as CustomEvent<{ failures?: number; delay?: number; loadFailures?: number }>).detail;
  saveFailures = control.failures ?? 0;
  saveDelay = control.delay ?? 0;
  loadFailures = control.loadFailures ?? 0;
});
let showPinnedInAll = !params.has("hide-pinned");
document.documentElement.dataset.startupWrites = "0";
window.addEventListener("test-startup-state", event => { startupEnabled = (event as CustomEvent<boolean>).detail; });
let currentClipboardId: string | null = params.get("clipboard");
window.addEventListener("test-native-menu-key", () => dispatch("native-menu-key", null));
window.addEventListener("test-current-clipboard", event => {
  currentClipboardId = (event as CustomEvent<string | null>).detail;
  dispatch("current-clipboard-changed", currentClipboardId);
});

function sample(id: string): ClipboardItem {
  const timestamp = 1_700_000_000_000;
  if (params.get("content") === "image") {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#3b82f6"/></svg>';
    return { id, timestamp, type: "image", payload: { data_url: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: 1600, height: 1000, byte_size: 2048 } };
  }
  if (params.get("content") === "files") {
    const paths = Array.from({ length: 6 }, (_, i) => `C:/very-long-directory/${"nested-folder/".repeat(10)}file-${i}.txt`);
    return { id, timestamp, type: "file", payload: { paths, count: paths.length, preview: paths[0] } };
  }
  const text = params.get("content") === "long"
    ? `<b>Literal text</b>\n${"UnbrokenText".repeat(400)}\n${"A full line of clipboard content.\n".repeat(150)}`
    : "Readable clipboard content.";
  return { id, timestamp, type: "text", payload: { text, preview: text.slice(0, 80), char_count: text.length, line_count: text.split("\n").length } };
}

function dispatch(name: string, payload: unknown) {
  for (const callback of subscriptions.get(name) ?? []) callback(payload);
}
let deleted: DeletedItem[] = params.has("deleted") ? ["trash-first", "trash-second"].map(id => ({
  ...sample(id), original_timestamp: 1000, deleted_at: Date.now() + 600_000,
})) : [];
let history = params.has("many") ? Array.from({ length: 30 }, (_, i) => sample(`item-${i}`)) : [sample("first"), sample("second")];
if (params.has("pinned")) history[0].pinned = true;
if (params.has("only-pinned")) history.forEach(item => { item.pinned = true; });
export async function listen<T>(name: string, callback: (event: { payload: T }) => void) {
  const handler = (payload: unknown) => callback({ payload: payload as T });
  const set = subscriptions.get(name) ?? new Set<(payload: unknown) => void>();
  set.add(handler); subscriptions.set(name, set);
  return () => { set.delete(handler); };
}
export async function emitTo(target: string, name: string, payload: unknown) {
  if (target === label) dispatch(name, payload);
  if (label === "preview" && name === "preview-ready") dispatch("preview-content", sample("preview"));
}
const physicalSize = () => ({ width: Math.round(innerWidth * devicePixelRatio), height: Math.round(innerHeight * devicePixelRatio) });
export const currentMonitor = async () => ({ workArea: { position: { x: 0, y: 0 }, size: physicalSize() } });
export const getCurrentWindow = () => ({
  label,
  scaleFactor: async () => devicePixelRatio,
  outerPosition: async () => ({ x: 0, y: 0 }),
  outerSize: async () => physicalSize(),
  onMoved: async (_callback: () => void) => () => {},
  onResized: async (callback: () => void) => {
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
  },
  startResizeDragging: async () => {}, startDragging: async () => {}, toggleMaximize: async () => {},
});

export async function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  let result: unknown;
  switch (command) {
    case "get_history": result = history; break;
    case "get_current_clipboard_item_id": result = currentClipboardId; break;
    case "get_deleted": result = deleted; break;
    case "restore_from_deleted": {
      const restored = deleted.find(item => item.id === args?.id);
      if (!restored) throw new Error("Deleted item not found");
      result = { ...sample(restored.id), timestamp: restored.original_timestamp };
      deleted = deleted.filter(item => item.id !== restored.id);
      history = [...history, result as ClipboardItem];
      break;
    }
    case "delete_permanently_from_deleted": deleted = deleted.filter(item => item.id !== args?.id); break;
    case "get_settings":
      if (loadFailures > 0) { loadFailures--; throw new Error("Could not read settings file"); }
      result = { max_history: maxHistory, delete_immediately: deleteTtl === 0, delete_ttl_seconds: deleteTtl, shortcuts: savedShortcuts, start_on_login: startupEnabled, show_pinned_in_all: showPinnedInAll, compact_mode: compactMode, automatic_update_checks: automaticUpdateChecks, theme, font, text_size: textSize, custom_themes: customThemes, custom_theme_id: customThemeId }; break;
    case "save_settings_cmd": {
      document.documentElement.dataset.settingsWrites = String(++settingsWrites);
      const fail = saveFailures > 0;
      if (fail) saveFailures--;
      if (saveDelay) await new Promise(resolve => setTimeout(resolve, saveDelay));
      if (fail) throw "Could not write settings in C:/a-very-long-installation-directory/settings.json. Check the folder permissions and try again.";
      const settings = args?.settings as AppSettings;
      savedShortcuts = settings.shortcuts;
      showPinnedInAll = settings.show_pinned_in_all;
      compactMode = settings.compact_mode;
      theme = settings.theme;
      customThemes = settings.custom_themes;
      customThemeId = settings.custom_theme_id;
      font = settings.font;
      textSize = settings.text_size;
      automaticUpdateChecks = settings.automatic_update_checks;
      maxHistory = settings.max_history; deleteTtl = settings.delete_ttl_seconds;
      if (args?.updateStartup) {
        startupEnabled = settings.start_on_login;
        document.documentElement.dataset.startupWrites = String(++startupWrites);
      }
      result = { ...settings, start_on_login: startupEnabled };
      break;
    }
    case "signed_update_available": result = params.has("signed-update"); break;
    case "install_signed_update":
      document.documentElement.dataset.installVersion = String(args?.version);
      throw "Invalid update signature";
    case "plugin:opener|open_url": document.documentElement.dataset.openedUrl = String(args?.url); break;
    case "show_window_menu": document.documentElement.dataset.menuCount = String(++menuCount); break;
    case "is_pointer_held": result = false; break;
    case "select_item":
      {
        const restored = deleted.find(item => item.id === args?.id);
        if (restored) {
          deleted = deleted.filter(item => item.id !== restored.id);
          history = [{ ...sample(restored.id), timestamp: Date.now() }, ...history];
        }
      }
      document.documentElement.dataset.copyCount = String(++copyCount);
      document.documentElement.dataset.lastCopyId = String(args?.id);
      currentClipboardId = String(args?.id);
      dispatch("current-clipboard-changed", currentClipboardId);
      break;
    case "set_pinned": result = args?.pinned; break;
    case "set_listening_paused": result = args?.paused; break;
    case "set_interacting":
      document.documentElement.dataset.interacting = String(args?.interacting);
      result = args?.interacting;
      break;
    case "save_theme_file": {
      const root = document.documentElement;
      if (root.dataset.themeExportOutcome === "cancel") { result = null; break; }
      if (root.dataset.themeExportOutcome === "error") throw new Error("Access denied.");
      root.dataset.themeExportContents = String(args?.contents);
      result = `C:\\Users\\Tester\\Downloads\\${args?.filename}`;
      break;
    }
    case "preview_hide": case "preview_show": case "preview_update": case "preview_position": case "preview_set_size":
    case "hide_window": document.documentElement.dataset.hideCount = String(++hideCount); break;
    case "preview_set_interactive": case "purge_expired_deleted": case "show_window": break;
    default: throw new Error(`Unexpected native command in browser layout test: ${command}`);
  }
  return result as T;
}
