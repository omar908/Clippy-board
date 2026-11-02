import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import type { ClipboardItem } from "../types";
import { createAppCommands } from "../app/commands";
import { Store } from "../state/store";
import { ShortcutManager } from "../shortcuts";
import { createHistoryController } from "../app/history";
import { installKeyboardWindow, settleKeyboard, TestKeyEvent } from "../test/keyboard-harness";
import type { AppElements } from "./elements";
import { bindKeyboardEvents } from "./keyboard";
import { bindWindowControls } from "./controls";
import { bindSettingsEvents } from "./settings";
import { renderPinButton } from "./render/item";

const runtime = vi.hoisted(() => ({
  label: "main",
  forwarded: undefined as undefined | ((event: { payload: { key: string } }) => void),
  command: undefined as undefined | ((event: { payload: { id: string } }) => void),
  updated: undefined as undefined | ((event: { payload: { shortcuts: Record<string, string> } }) => void),
  unlisten: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn(async () => {}),
  listen: vi.fn(async (name, callback) => {
    if (name === "preview-forward-key") runtime.forwarded = callback;
    if (name === "preview-command") runtime.command = callback;
    if (name === "shortcuts-updated") runtime.updated = callback;
    return runtime.unlisten;
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  label: runtime.label, onResized: vi.fn(async () => vi.fn()),
}) }));
vi.mock("../preview", () => ({
  previewRefresh: vi.fn(), previewDismiss: vi.fn(), previewHandleResize: vi.fn(),
  previewNativeDragStart: vi.fn(), previewNativeDragEnd: vi.fn(),
}));

// Small DOM ports for focus, settings recording, and button clicks. The actual
// keyboard bindings, settings handlers, controls, history controller, and store
// run together; only the native/browser boundaries are substituted.
class ElementPort {
  tagName = "BUTTON";
  id = "";
  value = "";
  textContent = "";
  innerHTML = "";
  title = "";
  disabled = false;
  style = { display: "none", flexDirection: "", flex: "", minHeight: "" };
  private classes = new Set<string>();
  classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, enabled: boolean) => enabled ? this.classes.add(name) : this.classes.delete(name),
  };
  onclick?: (event: TestKeyEvent) => unknown;
  private listeners = new Map<string, ((event: TestKeyEvent) => unknown)[]>();
  addEventListener(name: string, listener: (event: TestKeyEvent) => unknown) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  dispatch(name: string, event = new TestKeyEvent(name, {})) {
    const results = (this.listeners.get(name) ?? []).map(listener => listener(event));
    if (name === "click") results.push(this.onclick?.(event));
    return Promise.all(results);
  }
  focus() { documentPort.activeElement = this; }
  blur() { documentPort.activeElement = documentPort.body; }
  setAttribute(_name: string, _value: string) {}
  append(..._children: ElementPort[]) {}
  appendChild(child: ElementPort) { return child; }
}

let documentPort: { activeElement: ElementPort; body: ElementPort };
const item = (id: string, pinned = false): ClipboardItem => ({
  id, pinned, timestamp: 1, type: "text",
  payload: { text: id, preview: id, char_count: id.length, line_count: 1 },
});

beforeEach(() => {
  vi.clearAllMocks();
  runtime.label = "main";
  runtime.forwarded = undefined;
  runtime.command = undefined;
  runtime.updated = undefined;
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup() {
  const dispatch = installKeyboardWindow();
  const body = new ElementPort();
  body.tagName = "BODY";
  documentPort = { body, activeElement: body };
  const extra = new ElementPort();
  const generated: ElementPort[] = [];
  vi.stubGlobal("document", {
    get activeElement() { return documentPort.activeElement; }, body,
    getElementById: (id: string) => generated.find(element => element.id === id) ?? extra, querySelector: () => extra,
    createElement: (tag: string) => {
      const element = new ElementPort(); element.tagName = tag.toUpperCase();
      generated.push(element); return element;
    },
  });
  vi.stubGlobal("alert", vi.fn());
  const keys = [
    "settingsPage", "mainContent", "searchInput", "pauseBtn", "pinBtn", "clearBtn", "closeBtn",
    "countAll", "countPinned", "countText", "countImage", "countFile", "countDeleted",
    "settingsBtn", "settingMaxHistory", "settingDeleteTtl", "shortcutPinItem", "shortcutDelete",
    "shortcutPause", "shortcutSearch", "settingsBackBtn", "settingsSaveBtn", "shortcutsReset",
  ] as const;
  const ports = Object.fromEntries(keys.map(key => [key, new ElementPort()])) as Record<typeof keys[number], ElementPort>;
  ports.searchInput.id = "search-input";
  ports.searchInput.tagName = "INPUT";
  for (const key of ["shortcutPinItem", "shortcutDelete", "shortcutPause", "shortcutSearch"] as const) {
    ports[key].tagName = "INPUT";
    ports[key].classList.add("settings-input");
  }
  let backendHistory = [item("first"), item("second")];
  const settings = { shortcuts: { search: "Ctrl+F", pause: "Ctrl+P", pinItem: "Alt+P", delete: "Delete" } };
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "get_settings") return { shortcuts: { ...settings.shortcuts } };
    if (command === "get_history") return backendHistory.map(entry => ({ ...entry }));
    if (command === "get_deleted") return [];
    if (command === "toggle_pin") {
      const { id, pinned } = args as { id: string; pinned: boolean };
      backendHistory = backendHistory.map(entry => entry.id === id ? { ...entry, pinned } : entry);
    }
    return undefined;
  });
  const store = new Store();
  store.set({ history: backendHistory.map(entry => ({ ...entry })) });
  const elements = ports as unknown as AppElements;
  const history = createHistoryController(store, elements, { renderList: vi.fn(), onSelected: vi.fn() });
  history.filterAndRender();
  const selection = {
    releaseKeyboard: vi.fn(), armHoverResizeGuard: vi.fn(), cycleFilterTab: vi.fn(),
    handleListKey: vi.fn(), hoverCard: vi.fn(), anchorAfterCopy: vi.fn(), isHoverBlocked: () => false,
  };
  const commands = createAppCommands(store, elements, history, selection);
  const keyboard = bindKeyboardEvents(elements, commands);
  bindWindowControls(store, elements, selection, commands);
  bindSettingsEvents(elements, shortcuts => keyboard.updateBindings(shortcuts));
  await keyboard.ready;
  await settleKeyboard();
  vi.mocked(invoke).mockClear();
  return { dispatch, store, ports, settings, selection, history, commands, keyboard, generated };
}

const callsTo = (command: string) => vi.mocked(invoke).mock.calls.filter(call => call[0] === command);

describe("keyboard integration regression contracts", () => {
  it("restores with Ctrl+R only in Deleted, and supports rebinding and disabling", async () => {
    const { dispatch, store, history, keyboard, ports } = await setup();
    dispatch("r", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("restore_from_deleted")).toEqual([]);
    store.set({ currentFilter: "deleted", deletedItems: [{ ...item("trash"), original_timestamp: 1, deleted_at: Date.now() + 60_000 }] });
    history.filterAndRender();
    ports.searchInput.focus();
    dispatch("r", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("restore_from_deleted")).toEqual([]);
    ports.searchInput.blur();
    vi.mocked(invoke).mockResolvedValueOnce(item("trash"));
    dispatch("r", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("restore_from_deleted")).toEqual([["restore_from_deleted", { id: "trash" }]]);
    expect(callsTo("select_item")).toEqual([]);
    expect(store.get().deletedItems).toEqual([]);
    keyboard.updateBindings({ restore: "Ctrl+K" });
    store.set({ deletedItems: [{ ...item("trash"), original_timestamp: 1, deleted_at: Date.now() + 60_000 }] });
    history.filterAndRender();
    dispatch("r", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("restore_from_deleted")).toHaveLength(1);
    vi.mocked(invoke).mockResolvedValueOnce(item("trash"));
    dispatch("k", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("restore_from_deleted")).toHaveLength(2);
    keyboard.updateBindings({ restore: "" });
    store.set({ deletedItems: [{ ...item("trash"), original_timestamp: 1, deleted_at: Date.now() + 60_000 }] });
    history.filterAndRender();
    dispatch("r", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("restore_from_deleted")).toHaveLength(2);
  });

  it("opens the window menu through the shared default and saved override", async () => {
    const { dispatch, keyboard } = await setup();
    dispatch(" ", { altKey: true });
    await settleKeyboard();
    expect(callsTo("show_window_menu")).toHaveLength(1);
    keyboard.updateBindings({ windowMenu: "Ctrl+M" });
    dispatch(" ", { altKey: true });
    dispatch("m", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("show_window_menu")).toHaveLength(2);
    keyboard.updateBindings({ windowMenu: "" });
    dispatch(" ", { altKey: true });
    await settleKeyboard();
    expect(callsTo("show_window_menu")).toHaveLength(2);
  });

  it("opens the preview's own menu while forwarding Restore to the main selection", async () => {
    runtime.label = "preview";
    const { dispatch } = await setup();
    dispatch(" ", { altKey: true });
    await settleKeyboard();
    expect(callsTo("show_window_menu")).toHaveLength(1);
    expect(emitTo).not.toHaveBeenCalledWith("main", "preview-command", { id: "window.menu" });
    dispatch("r", { ctrlKey: true });
    await settleKeyboard();
    expect(emitTo).toHaveBeenCalledWith("main", "preview-command", { id: "item.restore" });
    expect(callsTo("restore_from_deleted")).toEqual([]);
  });

  it("generates both settings fields and saves and resets their bindings", async () => {
    const { ports, generated } = await setup();
    await ports.settingsBtn.dispatch("click");
    await settleKeyboard();
    const restore = generated.find(element => element.id === "shortcut-item-restore")!;
    const menu = generated.find(element => element.id === "shortcut-window-menu")!;
    expect(restore.value).toBe("Ctrl+R");
    expect(menu.value).toBe("Alt+Space");
    restore.value = "Ctrl+K"; menu.value = "Ctrl+M";
    await ports.settingsSaveBtn.dispatch("click");
    expect(callsTo("save_settings_cmd")[0]?.[1]).toMatchObject({ settings: { shortcuts: { restore: "Ctrl+K", windowMenu: "Ctrl+M" } } });
    await ports.shortcutsReset.dispatch("click");
    expect(restore.value).toBe("Ctrl+R"); expect(menu.value).toBe("Alt+Space");
  });
  it("honors the saved Delete override in Deleted and leaves typing alone", async () => {
    const { dispatch, store, history, settings, keyboard, ports } = await setup();
    store.set({ currentFilter: "deleted", deletedItems: [
      { ...item("trash"), original_timestamp: 1, deleted_at: Date.now() + 60_000 },
    ] });
    history.filterAndRender();
    settings.shortcuts.delete = "Ctrl+D";
    await keyboard.refreshSettings();
    dispatch("Delete");
    ports.searchInput.focus();
    dispatch("d", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("delete_permanently_from_deleted")).toEqual([]);
    ports.searchInput.blur();
    dispatch("d", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("delete_permanently_from_deleted")).toEqual([["delete_permanently_from_deleted", { id: "trash" }]]);
  });
  it("copies and permanently deletes Deleted entries through the shared keyboard actions", async () => {
    const { dispatch, store, history } = await setup();
    store.set({ currentFilter: "deleted", deletedItems: [
      { ...item("trash"), original_timestamp: 1, deleted_at: Date.now() + 60_000 },
    ] });
    history.filterAndRender();
    dispatch("Enter");
    await settleKeyboard();
    expect(callsTo("select_item")).toEqual([["select_item", { id: "trash" }]]);
    expect(store.get().deletedItems).toHaveLength(0);
    store.set({ deletedItems: [{ ...item("trash"), original_timestamp: 1, deleted_at: Date.now() + 60_000 }] });
    history.filterAndRender();
    dispatch("Delete");
    await settleKeyboard();
    expect(callsTo("delete_permanently_from_deleted")).toEqual([["delete_permanently_from_deleted", { id: "trash" }]]);
    expect(callsTo("delete_item")).toEqual([]);
    expect(store.get().deletedItems).toEqual([]);
  });
  it("leaves Enter available to activate the compact preview's Back button", async () => {
    const { dispatch } = await setup();
    const back = new ElementPort();
    back.id = "preview-back";
    back.focus();
    const event = dispatch("Enter");
    await settleKeyboard();
    expect(event.defaultPrevented).toBe(false);
    expect(callsTo("select_item")).toEqual([]);
  });

  it("does not fetch settings for individual keypresses", async () => {
    const { dispatch } = await setup();
    dispatch("ArrowDown");
    dispatch("x");
    dispatch("ArrowUp");
    await settleKeyboard();
    expect(callsTo("get_settings")).toEqual([]);
  });

  it("applies a saved binding immediately and broadcasts it to the preview", async () => {
    const { dispatch, ports } = await setup();
    await ports.settingsBtn.dispatch("click");
    await settleKeyboard();
    ports.shortcutSearch.value = "Ctrl+K";
    await ports.settingsSaveBtn.dispatch("click");
    expect(callsTo("save_settings_cmd")).toHaveLength(1);
    expect(emitTo).toHaveBeenCalledWith("preview", "shortcuts-updated", {
      shortcuts: expect.objectContaining({ search: "Ctrl+K" }),
    });
    ports.settingsPage.style.display = "none";
    dispatch("f", { ctrlKey: true });
    expect(documentPort.activeElement).toBe(documentPort.body);
    dispatch("k", { ctrlKey: true });
    expect(documentPort.activeElement).toBe(ports.searchInput);
  });

  it("rejects conflicting saved bindings before calling the backend", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ports } = await setup();
    await ports.settingsBtn.dispatch("click");
    await settleKeyboard();
    ports.shortcutPause.value = "Ctrl+F";
    await ports.settingsSaveBtn.dispatch("click");
    expect(callsTo("save_settings_cmd")).toEqual([]);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("both use Ctrl+F"));
  });

  it("allows a shortcut to be explicitly disabled through settings", async () => {
    const { dispatch, ports } = await setup();
    await ports.settingsBtn.dispatch("click");
    await settleKeyboard();
    ports.shortcutSearch.value = "";
    await ports.settingsSaveBtn.dispatch("click");
    ports.settingsPage.style.display = "none";
    expect(dispatch("f", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(documentPort.activeElement).toBe(documentPort.body);
  });

  it("does not overwrite a saved binding with an older in-flight settings load", async () => {
    const { keyboard, dispatch } = await setup();
    let finish!: (settings: { shortcuts: { search: string } }) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = keyboard.refreshSettings();
    keyboard.updateBindings({ search: "Ctrl+K" });
    finish({ shortcuts: { search: "Ctrl+F" } });
    await pending;
    expect(dispatch("f", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(dispatch("k", { ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it("shares temporary action overrides between buttons and shortcuts", async () => {
    const { commands, dispatch, ports } = await setup();
    const replacement = vi.fn();
    const dispose = commands.override("listening.toggle", { execute: replacement });
    await ports.pauseBtn.dispatch("click");
    dispatch("p", { ctrlKey: true });
    await settleKeyboard();
    expect(replacement).toHaveBeenCalledTimes(2);
    expect(callsTo("set_listening_paused")).toEqual([]);
    dispose();
    await ports.pauseBtn.dispatch("click");
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
  });

  it("keeps pause state unchanged when the backend rejects a command", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, ports } = await setup();
    vi.mocked(invoke).mockRejectedValueOnce(new Error("offline"));
    await ports.pauseBtn.dispatch("click");
    expect(store.get().isPaused).toBe(false);
    expect(ports.pauseBtn.classList.contains("active")).toBe(false);
  });

  it("does not delete clipboard history while Delete edits the search field", async () => {
    const { dispatch, ports } = await setup();
    ports.searchInput.focus();
    dispatch("Delete");
    await settleKeyboard();
    expect(invoke).not.toHaveBeenCalledWith("delete_item", expect.anything());
  });

  it("does not run item actions while recording a settings shortcut", async () => {
    const { dispatch, ports } = await setup();
    ports.settingsPage.style.display = "flex";
    ports.shortcutDelete.focus();
    dispatch("Delete");
    dispatch("p", { altKey: true });
    await settleKeyboard();
    expect(invoke).not.toHaveBeenCalledWith("delete_item", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("toggle_pin", expect.anything());
  });

  it("allows the search-focus shortcut while search is already focused", async () => {
    const { dispatch, ports } = await setup();
    ports.searchInput.focus();
    dispatch("f", { ctrlKey: true });
    await settleKeyboard();
    expect(documentPort.activeElement).toBe(documentPort.body);
  });

  it.each(["ArrowDown", "ArrowRight", "Escape"])("forwards %s from preview without acting locally", async key => {
    runtime.label = "preview";
    const { dispatch, selection } = await setup();
    dispatch(key);
    await settleKeyboard();
    expect(emitTo).toHaveBeenCalledExactlyOnceWith("main", "preview-forward-key", { key });
    expect(selection.handleListKey).not.toHaveBeenCalled();
    expect(selection.cycleFilterTab).not.toHaveBeenCalled();
    expect(callsTo("hide_window")).toEqual([]);
  });

  it("applies a forwarded navigation key once in the main window", async () => {
    const { selection } = await setup();
    runtime.forwarded!({ payload: { key: "ArrowDown" } });
    expect(selection.handleListKey).toHaveBeenCalledExactlyOnceWith("ArrowDown");
  });

  it("keeps forwarded navigation out of settings and closes settings on Escape", async () => {
    const { selection, ports } = await setup();
    ports.settingsPage.style.display = "flex";
    runtime.forwarded!({ payload: { key: "ArrowDown" } });
    expect(selection.handleListKey).not.toHaveBeenCalled();
    runtime.forwarded!({ payload: { key: "Escape" } });
    expect(ports.settingsPage.style.display).toBe("none");
    expect(callsTo("hide_window")).toEqual([]);
  });

  it("updates preview bindings and forwards the command instead of acting locally", async () => {
    runtime.label = "preview";
    const { dispatch } = await setup();
    runtime.updated!({ payload: { shortcuts: { pause: "Ctrl+K" } } });
    dispatch("p", { ctrlKey: true });
    expect(emitTo).not.toHaveBeenCalled();
    dispatch("k", { ctrlKey: true });
    expect(emitTo).toHaveBeenCalledExactlyOnceWith("main", "preview-command", { id: "listening.toggle" });
    expect(callsTo("set_listening_paused")).toEqual([]);
  });

  it("executes forwarded commands in the main registry and rejects unknown IDs", async () => {
    await setup();
    runtime.command!({ payload: { id: "unregistered" } });
    expect(callsTo("set_listening_paused")).toEqual([]);
    runtime.command!({ payload: { id: "listening.toggle" } });
    await settleKeyboard();
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
  });

  it("disposes native listeners and stops handling keys", async () => {
    const { dispatch, keyboard } = await setup();
    keyboard.dispose();
    expect(runtime.unlisten).toHaveBeenCalledTimes(4);
    expect(dispatch("p", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(callsTo("set_listening_paused")).toEqual([]);
  });

  it("matches a multi-modifier combination produced by the settings recorder", async () => {
    const { ports } = await setup();
    const recorded = new TestKeyEvent("keydown", { key: "k", ctrlKey: true, shiftKey: true, altKey: true });
    await ports.shortcutPause.dispatch("keydown", recorded);
    const manager = new ShortcutManager({
      isSettingsOpen: () => false, isSettingsInputActive: () => false,
      isSearchInputActive: () => false, getActiveElement: () => null,
    });
    const action = vi.fn();
    manager.register({ id: "recorded", combo: ports.shortcutPause.value, action });
    await manager.handle(new TestKeyEvent("keydown", { key: "k", ctrlKey: true, shiftKey: true, altKey: true }) as unknown as KeyboardEvent);
    expect(action).toHaveBeenCalledOnce();
  });

  it("allows Ctrl+F to be reassigned to another action after search is rebound", async () => {
    const { dispatch, settings, store, keyboard } = await setup();
    settings.shortcuts.search = "Ctrl+K";
    settings.shortcuts.pause = "Ctrl+F";
    await keyboard.refreshSettings();
    dispatch("f", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
    expect(store.get().isPaused).toBe(true);
  });

  it("uses a new saved shortcut and deactivates the old one", async () => {
    const { dispatch, settings, ports, keyboard } = await setup();
    settings.shortcuts.search = "Ctrl+K";
    await keyboard.refreshSettings();
    dispatch("f", { ctrlKey: true });
    await settleKeyboard();
    expect(documentPort.activeElement).toBe(documentPort.body);
    dispatch("k", { ctrlKey: true });
    await settleKeyboard();
    expect(documentPort.activeElement).toBe(ports.searchInput);
  });

  it("pauses identically through the button and a rebound shortcut", async () => {
    const { dispatch, ports, settings, store, keyboard } = await setup();
    await ports.pauseBtn.dispatch("click");
    const buttonResult = { paused: store.get().isPaused, active: ports.pauseBtn.classList.contains("active") };
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
    store.set({ isPaused: false });
    ports.pauseBtn.classList.remove("active");
    settings.shortcuts.pause = "Ctrl+K";
    await keyboard.refreshSettings();
    vi.mocked(invoke).mockClear();
    dispatch("k", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
    expect({ paused: store.get().isPaused, active: ports.pauseBtn.classList.contains("active") }).toEqual(buttonResult);
  });

  it("card pin and pause buttons each invoke their backend action once", async () => {
    const app = await setup();
    const button = new ElementPort();
    renderPinButton(app.store.get().history[0], button as unknown as HTMLButtonElement,
      () => { void app.commands.execute("item.pin", "first"); });
    await button.dispatch("click");
    await settleKeyboard();
    expect(callsTo("toggle_pin")).toEqual([["toggle_pin", { id: "first", pinned: true }]]);
    expect(app.store.get().history.find(entry => entry.id === "first")?.pinned).toBe(true);
    await app.ports.pauseBtn.dispatch("click");
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
    expect(app.store.get().isPaused).toBe(true);
  });

  it("pins identically through the card button and its shortcut", async () => {
    const buttonApp = await setup();
    const button = new ElementPort();
    renderPinButton(buttonApp.store.get().history[0], button as unknown as HTMLButtonElement,
      () => { void buttonApp.commands.execute("item.pin", "first"); });
    await button.dispatch("click");
    await settleKeyboard();
    expect(callsTo("toggle_pin")).toEqual([["toggle_pin", { id: "first", pinned: true }]]);
    const buttonPinned = buttonApp.store.get().history.find(entry => entry.id === "first")?.pinned;

    const shortcutApp = await setup();
    shortcutApp.dispatch("p", { altKey: true });
    await settleKeyboard();
    expect(callsTo("toggle_pin")).toEqual([["toggle_pin", { id: "first", pinned: true }]]);
    expect(shortcutApp.store.get().history.find(entry => entry.id === "first")?.pinned).toBe(buttonPinned);
  });
});
