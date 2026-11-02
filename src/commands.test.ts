import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./commands";

type Commands = { toggle: []; open: [id: string] };

describe("CommandRegistry", () => {
  it("replaces a handler by ID and ignores a stale registration disposer", async () => {
    const commands = new CommandRegistry<Commands>();
    const old = vi.fn(), replacement = vi.fn();
    const disposeOld = commands.register("open", { execute: old });
    const disposeNew = commands.register("open", { execute: replacement });
    disposeOld();
    await commands.execute("open", "42");
    expect(old).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledExactlyOnceWith("42");
    disposeNew();
    expect(await commands.execute("open", "42")).toBe(false);
  });

  it("restores nested temporary overrides even when disposed out of order", async () => {
    const commands = new CommandRegistry<Commands>();
    const base = vi.fn(), first = vi.fn(), second = vi.fn();
    commands.register("toggle", { execute: base });
    const disposeFirst = commands.override("toggle", { execute: first });
    const disposeSecond = commands.override("toggle", { execute: second });
    await commands.execute("toggle");
    expect(second).toHaveBeenCalledOnce();
    disposeFirst();
    await commands.execute("toggle");
    expect(second).toHaveBeenCalledTimes(2);
    disposeSecond();
    await commands.execute("toggle");
    expect(base).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("applies availability rules to all callers", async () => {
    const commands = new CommandRegistry<Commands>();
    const execute = vi.fn();
    commands.register("open", { execute, enabled: id => id === "allowed" });
    expect(commands.canExecute("open", "blocked")).toBe(false);
    expect(await commands.execute("open", "blocked")).toBe(false);
    await commands.execute("open", "allowed");
    expect(execute).toHaveBeenCalledExactlyOnceWith("allowed");
  });

  it("drops overlapping exclusive actions and releases the lock after failure", async () => {
    const error = new Error("offline");
    const onError = vi.fn();
    const commands = new CommandRegistry<Commands>(onError);
    let reject!: (error: Error) => void;
    const execute = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    commands.register("toggle", { execute, exclusive: true });
    const pending = commands.execute("toggle");
    expect(await commands.execute("toggle")).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    reject(error);
    expect(await pending).toBe(false);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error, "toggle");
    const replacement = vi.fn();
    commands.register("toggle", { execute: replacement, exclusive: true });
    expect(await commands.execute("toggle")).toBe(true);
    expect(replacement).toHaveBeenCalledOnce();
  });
});
