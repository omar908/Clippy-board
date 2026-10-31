export type ShortcutContext = {
  isSettingsOpen: () => boolean;
  isSettingsInputActive: () => boolean;
  isSearchInputActive: () => boolean;
  getActiveElement: () => HTMLElement | null;
};

export type ShortcutAction = (e: KeyboardEvent) => void | Promise<void>;

export type ShortcutRegistration = {
  id: string;
  combo: string | (() => string | Promise<string>);
  action: ShortcutAction;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  stopImmediatePropagation?: boolean;
  capture?: boolean;
  allowInSettingsInput?: boolean;
  allowInSearchInput?: boolean;
  allowWhenTyping?: boolean;
};

function normalizeCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push("Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  if (key === "Enter") key = "Enter";
  if (key === "Escape") key = "Escape";
  if (key === "Delete") key = "Delete";
  if (key === "Backspace") key = "Backspace";
  if (key === "ArrowUp") key = "ArrowUp";
  if (key === "ArrowDown") key = "ArrowDown";
  if (key === "ArrowLeft") key = "ArrowLeft";
  if (key === "ArrowRight") key = "ArrowRight";
  if (key === "Tab") key = "Tab";
  if (key.length === 1) key = key.toUpperCase();
  if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") {
    return parts.join("+");
  }
  parts.push(key);
  return parts.join("+");
}

export class ShortcutManager {
  private registrations: ShortcutRegistration[] = [];
  private context: ShortcutContext;

  constructor(context: ShortcutContext) {
    this.context = context;
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "p" || k === "f")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
      }
      this.handle(e, true);
    }, true);
    window.addEventListener("keydown", (e) => this.handle(e, false), false);
  }

  register(reg: ShortcutRegistration) {
    this.registrations.push(reg);
  }

  async handle(e: KeyboardEvent, capture: boolean) {
    let combo = normalizeCombo(e);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") combo = "Ctrl+F";
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") combo = "Ctrl+P";
    if (e.altKey && e.key.toLowerCase() === "p") combo = "Alt+P";
    for (const reg of this.registrations) {
      const regCombo = typeof reg.combo === "function" ? await reg.combo() : reg.combo;
      if (regCombo !== combo) continue;
      const isSettingsOpen = this.context.isSettingsOpen();
      const isSettingsInputActive = this.context.isSettingsInputActive();
      const isSearchInputActive = this.context.isSearchInputActive();
      const activeEl = this.context.getActiveElement();
      if (isSettingsOpen && isSettingsInputActive && !reg.allowInSettingsInput) {
        continue;
      }
      if (isSearchInputActive && !reg.allowInSearchInput) {
        continue;
      }
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") && !reg.allowWhenTyping && !reg.allowInSearchInput && !reg.allowInSettingsInput) {
        if (isSearchInputActive) continue;
        if (isSettingsInputActive) continue;
        continue;
      }
      if (reg.capture !== undefined && reg.capture !== capture) continue;
      if (reg.preventDefault !== false) {
        e.preventDefault();
        (e as any).returnValue = false;
      }
      if (reg.stopPropagation) e.stopPropagation();
      if (reg.stopImmediatePropagation) e.stopImmediatePropagation();
      try {
        await reg.action(e);
      } catch {}
      break;
    }
  }

  update() {
    // placeholder for future dynamic updates
  }
}
