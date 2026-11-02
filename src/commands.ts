export type CommandDefinition<Args extends unknown[]> = {
  execute: (...args: Args) => void | Promise<void>;
  enabled?: (...args: Args) => boolean;
  /** Drop repeat invocations while a state-changing operation is in flight. */
  exclusive?: boolean;
};

/** Shared by buttons, shortcuts and menus. Temporary overrides unwind safely
 * even when scopes are disposed out of order.
 */
export class CommandRegistry<Commands extends { [K in keyof Commands]: unknown[] }> {
  private defaults = new Map<keyof Commands, unknown>();
  private overrides = new Map<keyof Commands, unknown[]>();
  private running = new Set<keyof Commands>();

  constructor(private onError: (error: unknown, id: keyof Commands) => void =
    (error, id) => console.error(`Command ${String(id)} failed:`, error)) { }

  register<K extends keyof Commands>(id: K, definition: CommandDefinition<Commands[K]>) {
    this.defaults.set(id, definition);
    return () => {
      if (this.defaults.get(id) === definition) this.defaults.delete(id);
    };
  }

  override<K extends keyof Commands>(id: K, definition: CommandDefinition<Commands[K]>) {
    const entry = { definition };
    this.overrides.set(id, [...(this.overrides.get(id) ?? []), entry]);
    return () => {
      const remaining = this.overrides.get(id)?.filter(value => value !== entry) ?? [];
      if (remaining.length) this.overrides.set(id, remaining);
      else this.overrides.delete(id);
    };
  }

  private resolve<K extends keyof Commands>(id: K): CommandDefinition<Commands[K]> | undefined {
    const scopes = this.overrides.get(id);
    const override = scopes?.[scopes.length - 1] as { definition: CommandDefinition<Commands[K]> } | undefined;
    return override?.definition ?? (this.defaults.get(id) as CommandDefinition<Commands[K]> | undefined);
  }

  canExecute<K extends keyof Commands>(id: K, ...args: Commands[K]) {
    const command = this.resolve(id);
    return Boolean(command && (!command.enabled || command.enabled(...args)));
  }

  async execute<K extends keyof Commands>(id: K, ...args: Commands[K]): Promise<boolean> {
    const command = this.resolve(id);
    if (!command || (command.exclusive && this.running.has(id))) return false;
    let acquired = false;
    try {
      if (command.enabled && !command.enabled(...args)) return false;
      if (command.exclusive) { this.running.add(id); acquired = true; }
      await command.execute(...args);
      return true;
    } catch (error) {
      this.onError(error, id);
      return false;
    } finally {
      if (acquired) this.running.delete(id);
    }
  }
}
