import { withTimeout } from "../../../src/utils/withTimeout";

describe("withTimeout", () => {
  it("resolves with the wrapped promise's value when it settles before the timeout", async () => {
    const result = await withTimeout(1000, async () => "ok");

    expect(result).toBe("ok");
  });

  it("aborts the signal and rejects once the timeout elapses", async () => {
    jest.useFakeTimers();

    const fn = jest.fn((signal: AbortSignal) => {
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });

    const promise = withTimeout(50, fn);
    const assertion = expect(promise).rejects.toThrow("aborted");

    jest.advanceTimersByTime(50);
    await assertion;

    jest.useRealTimers();
  });

  it("clears the timeout once the wrapped promise settles, so it never fires late", async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, "clearTimeout");

    await withTimeout(1000, async () => "done");

    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockRestore();
    jest.useRealTimers();
  });

  it("still clears the timeout when fn throws synchronously instead of returning a promise", async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, "clearTimeout");

    const fn = (): never => {
      throw new Error("synchronous failure");
    };

    await expect(withTimeout(1000, fn)).rejects.toThrow("synchronous failure");
    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockRestore();
    jest.useRealTimers();
  });
});
