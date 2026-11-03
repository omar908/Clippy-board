export type SavePhase = "idle" | "pending" | "saving" | "saved" | "error";
type Edit<T> = { phase: SavePhase; message?: string; retryable?: boolean; apply: (saved: T) => T };

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Could not save this change. Try again.";
}

/** Serialize writes from confirmed state, never from unrelated unfinished form edits.
 * Each edit has its own identity so slow responses cannot replace newer drafts. */
export class SettingsAutosave<T> {
  private edits = new Map<string, Edit<T>>();
  private running?: Promise<void>;
  private writing = false;
  constructor(public confirmed: T, private ports: {
    save: (settings: T, key: string) => Promise<T>;
    changed: () => void;
    saved: (settings: T) => void;
  }) {}

  state(key: string) { return this.edits.get(key); }
  get busy() { return this.writing; }
  get unresolved() { return [...this.edits.values()].some(edit => ["pending", "saving", "error"].includes(edit.phase)); }

  edit(key: string, apply: (saved: T) => T, ready = true) {
    this.edits.set(key, { phase: "pending", apply, message: ready ? undefined : "Finish editing to save." });
    this.ports.changed();
    if (ready) void this.flush();
  }

  retry(key: string) {
    const edit = this.edits.get(key);
    if (edit?.phase !== "error") return;
    edit.phase = "pending"; edit.message = undefined;
    this.ports.changed();
    void this.flush();
  }

  discard() {
    if (this.busy) return;
    this.edits.clear();
    this.ports.changed();
  }

  flush(): Promise<void> {
    if (!this.running) this.running = Promise.resolve().then(() => this.drain()).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async drain() {
    for (;;) {
      const next = [...this.edits].find(([, edit]) => edit.phase === "pending" && !edit.message);
      if (!next) return;
      const [key, edit] = next;
      try {
        const candidate = edit.apply(this.confirmed);
        if (JSON.stringify(candidate) === JSON.stringify(this.confirmed)) {
          edit.phase = "idle";
          this.ports.changed();
          continue;
        }
        edit.phase = "saving";
        this.writing = true;
        this.ports.changed();
        const applied = await this.ports.save(candidate, key);
        this.confirmed = applied;
        // A newer draft remains pending even if the old request succeeded.
        if (this.edits.get(key) === edit) edit.phase = "saved";
        this.ports.saved(applied);
      } catch (error) {
        if (this.edits.get(key) === edit) {
          edit.phase = "error";
          edit.message = errorMessage(error);
          edit.retryable = this.writing;
        }
      } finally {
        this.writing = false;
      }
      this.ports.changed();
    }
  }
}
