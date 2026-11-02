import { vi } from "vitest";

export class TestKeyEvent {
  key: string;
  ctrlKey = false;
  metaKey = false;
  altKey = false;
  shiftKey = false;
  defaultPrevented = false;
  propagationStopped = false;
  immediateStopped = false;

  constructor(_type: string, options: KeyboardEventInit) {
    this.key = options.key ?? "";
    Object.assign(this, options);
  }

  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
  stopImmediatePropagation() {
    this.immediateStopped = true;
    this.propagationStopped = true;
  }
}

type Listener = (event: TestKeyEvent) => unknown;

/** Dispatch synchronously, as the browser does: promises cannot delay bubbling.
 * This models window listeners around a focused child, not a full DOM.
 */
export function installKeyboardWindow() {
  const listeners: { name: string; callback: Listener; capture: boolean }[] = [];
  vi.stubGlobal("KeyboardEvent", TestKeyEvent);
  vi.stubGlobal("window", {
    addEventListener(name: string, callback: Listener, options?: boolean | AddEventListenerOptions) {
      listeners.push({ name, callback, capture: typeof options === "boolean" ? options : Boolean(options?.capture) });
    },
    removeEventListener(name: string, callback: Listener) {
      const index = listeners.findIndex(listener => listener.name === name && listener.callback === callback);
      if (index >= 0) listeners.splice(index, 1);
    },
  });

  return (key: string, options: KeyboardEventInit = {}) => {
    const event = new TestKeyEvent("keydown", { ...options, key });
    for (const capture of [true, false]) {
      if (!capture && event.propagationStopped) break;
      for (const listener of listeners.filter(l => l.name === "keydown" && l.capture === capture)) {
        if (event.immediateStopped) break;
        listener.callback(event);
      }
    }
    return event;
  };
}

// A macrotask boundary lets the real asynchronous dispatch chains settle.
export const settleKeyboard = () => new Promise<void>(resolve => setTimeout(resolve, 0));
