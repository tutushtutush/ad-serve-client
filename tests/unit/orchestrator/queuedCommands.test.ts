import { applyQueuedCommand, isQueuedCommand } from "../../../src/orchestrator/queuedCommands";

describe("isQueuedCommand", () => {
  it("is true for arrays and false for callbacks and other values", () => {
    expect(isQueuedCommand(["setContext", {}])).toBe(true);
    expect(isQueuedCommand(() => undefined)).toBe(false);
    expect(isQueuedCommand("setContext")).toBe(false);
    expect(isQueuedCommand(null)).toBe(false);
  });
});

describe("applyQueuedCommand", () => {
  it("calls the handler registered under the command name with the payload", () => {
    const setContext = jest.fn();

    applyQueuedCommand(["setContext", { categories: ["music"] }], { setContext });

    expect(setContext).toHaveBeenCalledWith({ categories: ["music"] });
  });

  it("ignores an unknown command name", () => {
    const setContext = jest.fn();

    expect(() => applyQueuedCommand(["somethingElse", {}], { setContext })).not.toThrow();
    expect(setContext).not.toHaveBeenCalled();
  });

  it("ignores a command whose name is not a string", () => {
    const setContext = jest.fn();

    applyQueuedCommand([42, {}] as never, { setContext });

    expect(setContext).not.toHaveBeenCalled();
  });

  it("does not match names inherited from Object.prototype", () => {
    expect(() => applyQueuedCommand(["toString", {}], {})).not.toThrow();
    expect(() => applyQueuedCommand(["constructor", {}], {})).not.toThrow();
  });

  it("swallows an error thrown by the handler", () => {
    const setContext = jest.fn(() => {
      throw new Error("boom");
    });

    expect(() => applyQueuedCommand(["setContext", {}], { setContext })).not.toThrow();
  });
});
