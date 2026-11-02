import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import type { ClipboardItem } from "../types";
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
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn(async () => {}),
  listen: vi.fn(async (name, callback) => {
    if (name === "preview-forward-key") runtime.forwarded = callback;
    return vi.fn();
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
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const dispatch = installKeyboardWindow();
  const body = new ElementPort();
  body.tagName = "BODY";
  documentPort = { body, activeElement: body };
  const extra = new ElementPort();
  vi.stubGlobal("document", {
    get activeElement() { return documentPort.activeElement; }, body,
    getElementById: () => extra, querySelector: () => extra,
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
  bindKeyboardEvents(store, elements, history, selection);
  bindWindowControls(store, elements, selection, history.clearView);
  bindSettingsEvents(elements);
  await settleKeyboard();
  vi.mocked(invoke).mockClear();
  return { dispatch, store, ports, settings, selection, history };
}

const callsTo = (command: string) => vi.mocked(invoke).mock.calls.filter(call => call[0] === command);

describe("keyboard integration regression contracts", () => {
  // Known bug: the fallback dispatcher bypasses the manager's typing guard.
  it.fails("does not delete clipboard history while Delete edits the search field", async () => {
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

  // Known bug: the recorder and matcher use different modifier ordering.
  it.fails("matches a multi-modifier combination produced by the settings recorder", async () => {
    const { ports } = await setup();
    const recorded = new TestKeyEvent("keydown", { key: "k", ctrlKey: true, shiftKey: true, altKey: true });
    await ports.shortcutPause.dispatch("keydown", recorded);
    const manager = new ShortcutManager({
      isSettingsOpen: () => false, isSettingsInputActive: () => false,
      isSearchInputActive: () => false, getActiveElement: () => null,
    });
    const action = vi.fn();
    manager.register({ id: "recorded", combo: ports.shortcutPause.value, action });
    await manager.handle(new TestKeyEvent("keydown", { key: "k", ctrlKey: true, shiftKey: true, altKey: true }) as unknown as KeyboardEvent, false);
    expect(action).toHaveBeenCalledOnce();
  });

  // Known bug: hard-coded Ctrl+F interception prevents reassignment.
  it.fails("allows Ctrl+F to be reassigned to another action after search is rebound", async () => {
    const { dispatch, settings, store } = await setup();
    settings.shortcuts.search = "Ctrl+K";
    settings.shortcuts.pause = "Ctrl+F";
    dispatch("f", { ctrlKey: true });
    await settleKeyboard();
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
    expect(store.get().isPaused).toBe(true);
  });

  // Known bug: duplicate dispatch toggles search focus on and then off.
  it.fails("uses a new saved shortcut and deactivates the old one", async () => {
    const { dispatch, settings, ports } = await setup();
    settings.shortcuts.search = "Ctrl+K";
    dispatch("f", { ctrlKey: true });
    await settleKeyboard();
    expect(documentPort.activeElement).toBe(documentPort.body);
    dispatch("k", { ctrlKey: true });
    await settleKeyboard();
    expect(documentPort.activeElement).toBe(ports.searchInput);
  });

  // Known bug: the rebound shortcut toggles pause twice; the button toggles once.
  it.fails("pauses identically through the button and a rebound shortcut", async () => {
    const { dispatch, ports, settings, store } = await setup();
    await ports.pauseBtn.dispatch("click");
    const buttonResult = { paused: store.get().isPaused, active: ports.pauseBtn.classList.contains("active") };
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
    store.set({ isPaused: false });
    ports.pauseBtn.classList.remove("active");
    settings.shortcuts.pause = "Ctrl+K";
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
      () => { void app.history.togglePin("first"); });
    await button.dispatch("click");
    await settleKeyboard();
    expect(callsTo("toggle_pin")).toEqual([["toggle_pin", { id: "first", pinned: true }]]);
    expect(app.store.get().history.find(entry => entry.id === "first")?.pinned).toBe(true);
    await app.ports.pauseBtn.dispatch("click");
    expect(callsTo("set_listening_paused")).toEqual([["set_listening_paused", { paused: true }]]);
    expect(app.store.get().isPaused).toBe(true);
  });

  // Known bug: a single Alt+P press invokes the backend more than once.
  it.fails("pins identically through the card button and its shortcut", async () => {
    const buttonApp = await setup();
    const button = new ElementPort();
    renderPinButton(buttonApp.store.get().history[0], button as unknown as HTMLButtonElement,
      () => { void buttonApp.history.togglePin("first"); });
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
