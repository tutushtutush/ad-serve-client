import { createViewabilityDetector } from "../../../src/utils/viewabilityDetector";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: ObserverCallback;
  observed: Element | null = null;
  disconnected = false;

  constructor(callback: ObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed = element;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  emit(isIntersecting: boolean, intersectionRatio: number): void {
    // Matches real IntersectionObserver: disconnect() stops further callback invocations.
    if (this.disconnected) {
      return;
    }
    this.callback([{ isIntersecting, intersectionRatio }]);
  }
}

function fakeElement(): Element {
  return {} as Element;
}

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("createViewabilityDetector", () => {
  it("calls onViewable after the element stays continuously above threshold for 1000ms", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    expect(onViewable).not.toHaveBeenCalled();

    jest.advanceTimersByTime(999);
    expect(onViewable).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it("never calls onViewable if it drops below threshold before 1000ms elapses", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(500);
    observer.emit(false, 0.1);
    jest.advanceTimersByTime(1000);

    expect(onViewable).not.toHaveBeenCalled();
  });

  it("a later qualifying period after an interrupted one still fires (Acceptance Scenario 3)", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    // Interrupted first attempt.
    observer.emit(true, 0.6);
    jest.advanceTimersByTime(400);
    observer.emit(false, 0.0);
    expect(onViewable).not.toHaveBeenCalled();

    // Later, fully-qualifying attempt.
    observer.emit(true, 0.75);
    jest.advanceTimersByTime(1000);

    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it("only calls onViewable once even if the element remains visible afterward", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(1000);
    expect(onViewable).toHaveBeenCalledTimes(1);

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(1000);
    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it("disconnects the observer once onViewable fires", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );

    detector.watch(fakeElement(), jest.fn());
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(1000);

    expect(observer.disconnected).toBe(true);
  });

  it("stop() before the timer completes prevents onViewable and disconnects", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    const stop = detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(500);
    stop();
    jest.advanceTimersByTime(1000);

    expect(onViewable).not.toHaveBeenCalled();
    expect(observer.disconnected).toBe(true);
  });

  it("calling stop() twice, or after onViewable already fired, does not throw", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    const stop = detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(1000);
    expect(onViewable).toHaveBeenCalledTimes(1);

    expect(() => stop()).not.toThrow();
    expect(() => stop()).not.toThrow();
  });

  it("an observer callback that throws never propagates", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );

    detector.watch(fakeElement(), () => {
      throw new Error("boom");
    });
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
  });

  describe("unsupported browser (FR-005)", () => {
    it("watch() returns a working no-op stop and never calls onViewable", () => {
      const detector = createViewabilityDetector(undefined);
      const onViewable = jest.fn();

      const stop = detector.watch(fakeElement(), onViewable);
      jest.advanceTimersByTime(5000);

      expect(onViewable).not.toHaveBeenCalled();
      expect(() => stop()).not.toThrow();
    });
  });
});
