import { describe, expect, it, vi } from "vitest";
import {
  disposeViewportDisposables,
  registerViewportDisposables,
} from "./disposables";

describe("viewport disposables", () => {
  it("registers nested disposable lists and disposes them in reverse order", () => {
    const disposed: string[] = [];
    const first = { dispose: () => disposed.push("first") };
    const second = { dispose: () => disposed.push("second") };
    const third = { dispose: () => disposed.push("third") };
    const disposables: Array<{ dispose: () => void }> = [];

    registerViewportDisposables(disposables, first, [second, third]);
    disposeViewportDisposables(disposables, "test resource");

    expect(disposed).toEqual(["third", "second", "first"]);
    expect(disposables).toHaveLength(0);
  });

  it("continues disposing after an error", () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const disposed: string[] = [];
    const disposables = [
      {
        dispose: () => {
          disposed.push("first");
        },
      },
      {
        dispose: () => {
          throw new Error("boom");
        },
      },
      {
        dispose: () => {
          disposed.push("third");
        },
      },
    ];

    disposeViewportDisposables(disposables, "test resource");

    expect(disposed).toEqual(["third", "first"]);
    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    consoleWarnSpy.mockRestore();
  });
});
