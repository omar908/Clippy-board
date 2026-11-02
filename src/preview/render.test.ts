import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPreviewContent } from "./render";
import { textItem } from "./test-support";

class ElementPort {
  children: ElementPort[] = [];
  textContent = "";
  className = "";
  src = "";
  title = "";
  scrollLeft = 0;
  scrollTop = 0;
  private classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name), toggle: (name: string) => {
    if (this.classes.has(name)) this.classes.delete(name); else this.classes.add(name);
  } };
  listeners = new Map<string, (event: MouseEvent) => void>();
  append(...children: ElementPort[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  addEventListener(name: string, callback: (event: MouseEvent) => void) { this.listeners.set(name, callback); }
}
beforeEach(() => {
  vi.stubGlobal("document", { createElement: () => new ElementPort() });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

function targets() {
  const header = new ElementPort(), body = new ElementPort();
  return { header, body, render: (item: Parameters<typeof renderPreviewContent>[2]) =>
    renderPreviewContent(header as unknown as HTMLElement, body as unknown as HTMLElement, item) };
}
describe("preview content rendering", () => {
  it("preserves literal text and caps long content with a notice", () => {
    const { header, body, render } = targets();
    const full = "<b>" + "x".repeat(100_001);
    render({ id: "long", timestamp: 1, type: "text", payload: { text: full, preview: "snippet", char_count: full.length, line_count: 1 } });
    expect(header.children[0].textContent).toBe("text");
    expect(body.children[0].textContent).toBe(full.slice(0, 100_000));
    expect(body.children[1].className).toBe("preview-notice");
    expect(body.children[1].textContent).toContain(full.length.toLocaleString());
    render(textItem("short"));
    expect(body.children).toHaveLength(1);
    expect(body.children[0].textContent).toBe("short");
  });

  it("uses the full image and releases window drag handlers when content is replaced", () => {
    const { body, render } = targets();
    const dispose = render({ id: "image", timestamp: 1, type: "image", payload: {
      data_url: "full-image", thumbnail: "thumbnail", width: 640, height: 480, byte_size: 2048,
    } });
    const wrap = body.children[0];
    expect(wrap.children[0].src).toBe("full-image");
    wrap.listeners.get("mousedown")!({ button: 0, clientX: 10, clientY: 20, preventDefault: vi.fn() } as unknown as MouseEvent);
    const move = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === "mousemove")![1];
    const up = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === "mouseup")![1];
    dispose();
    expect(window.removeEventListener).toHaveBeenCalledWith("mousemove", move);
    expect(window.removeEventListener).toHaveBeenCalledWith("mouseup", up);
  });

  it("renders every file path, not just the history card's first three", () => {
    const { body, render } = targets();
    const paths = Array.from({ length: 5 }, (_, i) => `C:/file-${i}.txt`);
    render({ id: "files", timestamp: 1, type: "file", payload: { paths, count: paths.length, preview: "files" } });
    expect(body.children[0].children.map(row => row.children[1].textContent)).toEqual(paths);
  });
});
