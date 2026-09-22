import { createViewabilityDetector, MAX_WATCH_DURATION_MS } from "../../../src/utils/viewabilityDetector";

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

  it("stops the observer and never calls onViewable if the IAB threshold is never reached within the max watch duration (ad-serve-client #7)", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    jest.advanceTimersByTime(MAX_WATCH_DURATION_MS);

    expect(onViewable).not.toHaveBeenCalled();
    expect(observer.disconnected).toBe(true);
  });

  it("does not stop early: the max watch duration timer is cleared once onViewable fires", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();

    detector.watch(fakeElement(), onViewable);
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(1000);
    expect(onViewable).toHaveBeenCalledTimes(1);

    // The max-duration timer firing afterward must not do anything further (no throw, no second
    // disconnect side effect worth observing beyond what already happened).
    expect(() => jest.advanceTimersByTime(MAX_WATCH_DURATION_MS)).not.toThrow();
    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it("calls onGiveUp, not onViewable, when the max watch duration elapses (caught in review of #8)", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();
    const onGiveUp = jest.fn();

    detector.watch(fakeElement(), onViewable, onGiveUp);

    jest.advanceTimersByTime(MAX_WATCH_DURATION_MS);

    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onViewable).not.toHaveBeenCalled();
  });

  it("never calls onGiveUp once onViewable has already fired", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();
    const onGiveUp = jest.fn();

    detector.watch(fakeElement(), onViewable, onGiveUp);
    const observer = FakeIntersectionObserver.instances[0];

    observer.emit(true, 0.6);
    jest.advanceTimersByTime(1000);
    expect(onViewable).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(MAX_WATCH_DURATION_MS);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it("never calls onGiveUp once stop() has already been called externally", () => {
    const detector = createViewabilityDetector(
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const onViewable = jest.fn();
    const onGiveUp = jest.fn();

    const stop = detector.watch(fakeElement(), onViewable, onGiveUp);
    stop();

    jest.advanceTimersByTime(MAX_WATCH_DURATION_MS);
    expect(onGiveUp).not.toHaveBeenCalled();
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
