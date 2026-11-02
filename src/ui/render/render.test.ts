import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTextContent } from "./content";
import { renderEmptyState } from "./empty";
import { updateCountsUI } from "./header";
import { renderActions, renderItemMeta } from "./item";

const element = () => ({ textContent: "", innerHTML: "", style: {} }) as HTMLElement;

afterEach(() => vi.unstubAllGlobals());

describe("extracted renderers", () => {
  it("keeps previews as literal text and supports flattened deleted items", () => {
    const target = element();
    renderTextContent({ payload: { preview: "<b>preview</b>", text: "full text" } }, target);
    expect(target.textContent).toBe("<b>preview</b>");
    expect(target.innerHTML).toBe("");
    const text = "x".repeat(300);
    renderTextContent({ text }, target);
    expect(target.textContent).toBe(text);
  });

  it("keeps detailed metadata for nested and flattened payloads", () => {
    const target = element();
    renderItemMeta({ type: "text", payload: { char_count: 0, line_count: 1 } }, target);
    expect(target.textContent).toBe("0 chars • 1 line");
    renderItemMeta({ type: "image", width: 640, height: 480, byte_size: 2048 }, target);
    expect(target.textContent).toBe("640×480px • 2 KB");
    renderItemMeta({ type: "file", paths: ["a", "b"], count: 2 }, target);
    expect(target.textContent).toBe("2 files");
  });

  it("restores the default empty state after search and deleted views", () => {
    const state = element(), title = element(), desc = element();
    const options = { hasSearch: true, searchQuery: "needle", currentFilter: "deleted",
      emptyTitleDefault: "Copy something", emptyDescDefault: "Use <b>Ctrl+C</b>" };
    renderEmptyState(state, title, desc, options);
    expect(title.textContent).toBe("No matches found");
    renderEmptyState(state, title, desc, { ...options, hasSearch: false });
    expect(title.textContent).toBe("No deleted items");
    renderEmptyState(state, title, desc, { ...options, hasSearch: false, currentFilter: "all" });
    expect(title.textContent).toBe("Copy something");
    expect(desc.innerHTML).toBe(options.emptyDescDefault);
  });

  it("updates all six counts including pinned items in their type totals", () => {
    const counts = { all: element(), pinned: element(), text: element(), image: element(), file: element(), deleted: element() };
    updateCountsUI(counts, [
      { id: "1", timestamp: 0, pinned: true, type: "text", payload: { text: "a", preview: "a", char_count: 1, line_count: 1 } },
      { id: "2", timestamp: 0, type: "file", payload: { paths: ["a"], count: 1, preview: "a" } },
    ], 3);
    expect(Object.values(counts).map(e => e.textContent)).toEqual(["2", "1", "1", "0", "1", "3"]);
  });

  it("blocks pinned deletion and routes deleted actions without selecting a card", () => {
    // Only the button API used by the renderer is needed for callback checks.
    const buttons: HTMLButtonElement[] = [];
    vi.stubGlobal("document", { createElement: () => {
      const button = { setAttribute: vi.fn() } as unknown as HTMLButtonElement;
      buttons.push(button);
      return button;
    } });
    const actions = { innerHTML: "", appendChild: vi.fn() } as unknown as HTMLElement;
    const toggle = vi.fn(), remove = vi.fn(), restore = vi.fn(), permanent = vi.fn();
    const event = { stopPropagation: vi.fn() } as unknown as PointerEvent;
    renderActions({ pinned: true }, actions, "all", toggle, remove, restore, permanent);
    expect(buttons[1].disabled).toBe(true);
    buttons[1].onclick!.call(buttons[1], event);
    expect(remove).not.toHaveBeenCalled();
    buttons[0].onclick!.call(buttons[0], event);
    expect(toggle).toHaveBeenCalledOnce();
    renderActions({}, actions, "deleted", toggle, remove, restore, permanent);
    buttons[2].onclick!.call(buttons[2], event);
    buttons[3].onclick!.call(buttons[3], event);
    expect(restore).toHaveBeenCalledOnce();
    expect(permanent).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledTimes(4);
  });
});
