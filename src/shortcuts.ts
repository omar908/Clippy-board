import { normalizeShortcut, shortcutFromEvent } from "./shortcut-combo";

export type ShortcutContext = {
  isSettingsOpen: () => boolean;
  isSettingsInputActive: () => boolean;
  isSearchInputActive: () => boolean;
  getActiveElement: () => HTMLElement | null;
};

export type ShortcutRegistration = {
  id: string;
  combo: string | (() => string);
  action: (event: KeyboardEvent) => unknown;
  when?: () => boolean;
  priority?: number;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  stopImmediatePropagation?: boolean;
  allowInSettingsInput?: boolean;
  allowInSearchInput?: boolean;
  allowWhenTyping?: boolean;
};
export type ShortcutBindings = Record<string, string | null>;

export class ShortcutManager {
  private registrations = new Map<string, ShortcutRegistration>();
  private bindings: ShortcutBindings = {};
  private scopes: { bindings: ShortcutBindings }[] = [];
  private handled = new WeakSet<KeyboardEvent>();
  private disposed = false;
  private listener = (event: KeyboardEvent) => { this.handle(event); };

  constructor(private context: ShortcutContext,
    private onError: (error: unknown) => void = error => console.error("Shortcut failed:", error)) {
    if (typeof window !== "undefined") window.addEventListener("keydown", this.listener, true);
  }

  register(registration: ShortcutRegistration) {
    // Resolve only synchronous, cached bindings during key dispatch.
    if (typeof registration.combo === "string") normalizeShortcut(registration.combo);
    this.registrations.delete(registration.id);
    this.registrations.set(registration.id, registration);
    return () => {
      if (this.registrations.get(registration.id) === registration) this.registrations.delete(registration.id);
    };
  }

  setBindings(bindings: ShortcutBindings) {
    this.bindings = this.normalizeBindings(bindings);
  }

  overrideBindings(bindings: ShortcutBindings) {
    const scope = { bindings: this.normalizeBindings(bindings) };
    this.scopes.push(scope);
    return () => { this.scopes = this.scopes.filter(value => value !== scope); };
  }

  private normalizeBindings(bindings: ShortcutBindings) {
    return Object.fromEntries(Object.entries(bindings).map(([id, combo]) => [id, combo ? normalizeShortcut(combo) : null]));
  }

  private effective(registration: ShortcutRegistration) {
    for (let index = this.scopes.length - 1;index >= 0;index--) {
      if (Object.prototype.hasOwnProperty.call(this.scopes[index].bindings, registration.id)) {
        return { combo: this.scopes[index].bindings[registration.id], layer: 2 + index };
      }
    }
    if (Object.prototype.hasOwnProperty.call(this.bindings, registration.id)) return { combo: this.bindings[registration.id], layer: 1 };
    const combo = typeof registration.combo === "function" ? registration.combo() : registration.combo;
    return { combo: normalizeShortcut(combo), layer: 0 };
  }

  getConflicts() {
    const combinations = new Map<string, string[]>();
    for (const registration of this.registrations.values()) {
      const { combo } = this.effective(registration);
      if (combo) combinations.set(combo, [...(combinations.get(combo) ?? []), registration.id]);
    }
    return [...combinations].filter(([, ids]) => ids.length > 1).map(([combo, ids]) => ({ combo, ids }));
  }

  private allowed(registration: ShortcutRegistration) {
    if (registration.when && !registration.when()) return false;
    if (this.context.isSettingsInputActive()) return Boolean(registration.allowInSettingsInput);
    if (this.context.isSearchInputActive()) return Boolean(registration.allowInSearchInput || registration.allowWhenTyping);
    const active = this.context.getActiveElement();
    const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    return !typing || Boolean(registration.allowWhenTyping);
  }

  handle(event: KeyboardEvent) {
    if (this.disposed || this.handled.has(event) || event.defaultPrevented || event.isComposing) return false;
    const combo = shortcutFromEvent(event);
    if (!combo) return false;
    const matches = [...this.registrations.values()].map((registration, index) => ({
      registration, index, ...this.effective(registration),
    })).filter(value => value.combo === combo && this.allowed(value.registration));
    // Temporary scopes override saved bindings, which override defaults. Within
    // a layer, explicit priority then the latest registration breaks ties.
    matches.sort((a, b) => b.layer - a.layer || (b.registration.priority ?? 0) - (a.registration.priority ?? 0) || b.index - a.index);
    const match = matches[0]?.registration;
    if (!match) return false;
    this.handled.add(event);
    if (match.preventDefault !== false) event.preventDefault();
    if (match.stopPropagation) event.stopPropagation();
    if (match.stopImmediatePropagation) event.stopImmediatePropagation();
    try { Promise.resolve(match.action(event)).catch(this.onError); }
    catch (error) { this.onError(error); }
    return true;
  }

  dispose() {
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener?.("keydown", this.listener, true);
    this.registrations.clear();
    this.scopes = [];
  }
}
