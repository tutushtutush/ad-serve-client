import { createViewableImpressionClient } from "../../../src/client/viewableImpressionClient";

const REPORT = { platformId: "platform-1", adTypeId: "medium-rectangle", adConfigId: "ad-config-1" };

describe("createViewableImpressionClient", () => {
  it("prefers sendBeacon and calls it with the correct URL and params when it returns true", () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    const fetchImpl = jest.fn();
    const client = createViewableImpressionClient("https://api.example.com", sendBeacon, fetchImpl);

    client.reportViewableImpression(REPORT);

    expect(sendBeacon).toHaveBeenCalledWith(
      "https://api.example.com/viewable-impression?platformId=platform-1&adTypeId=medium-rectangle&adConfigId=ad-config-1",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to fetch with keepalive when sendBeacon is absent", () => {
    const fetchImpl = jest.fn();
    const client = createViewableImpressionClient("https://api.example.com", undefined, fetchImpl);

    client.reportViewableImpression(REPORT);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/viewable-impression?platformId=platform-1&adTypeId=medium-rectangle&adConfigId=ad-config-1",
      { method: "POST", keepalive: true },
    );
  });

  it("falls back to fetch when sendBeacon returns false", () => {
    const sendBeacon = jest.fn().mockReturnValue(false);
    const fetchImpl = jest.fn();
    const client = createViewableImpressionClient("https://api.example.com", sendBeacon, fetchImpl);

    client.reportViewableImpression(REPORT);

    expect(sendBeacon).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("a throwing sendBeacon does not propagate and does not stop the fetch fallback path from being safe", () => {
    const sendBeacon = jest.fn(() => {
      throw new Error("boom");
    });
    const fetchImpl = jest.fn();
    const client = createViewableImpressionClient("https://api.example.com", sendBeacon, fetchImpl);

    expect(() => client.reportViewableImpression(REPORT)).not.toThrow();
  });

  it("a throwing fetch does not propagate", () => {
    const fetchImpl = jest.fn(() => {
      throw new Error("boom");
    });
    const client = createViewableImpressionClient("https://api.example.com", undefined, fetchImpl);

    expect(() => client.reportViewableImpression(REPORT)).not.toThrow();
  });

  it("a rejecting fetch promise does not become an unhandled rejection (caught in code review)", async () => {
    const fetchImpl = jest.fn(() => Promise.reject(new Error("network down")));
    const client = createViewableImpressionClient("https://api.example.com", undefined, fetchImpl);

    client.reportViewableImpression(REPORT);

    // If the rejection isn't caught internally, this surfaces as a test-process unhandled
    // rejection failure even though nothing here awaits or asserts on the promise directly —
    // exactly the symptom that would otherwise hit a real host page's own listeners.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("a blank baseUrl attempts neither transport", () => {
    const sendBeacon = jest.fn();
    const fetchImpl = jest.fn();
    const client = createViewableImpressionClient("", sendBeacon, fetchImpl);

    client.reportViewableImpression(REPORT);

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("neither transport available does not throw", () => {
    const client = createViewableImpressionClient("https://api.example.com", undefined, undefined);

    expect(() => client.reportViewableImpression(REPORT)).not.toThrow();
  });

  it("includes impressionId in the reported URL when provided (feature 007, US2)", () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    const client = createViewableImpressionClient("https://api.example.com", sendBeacon, undefined);

    client.reportViewableImpression({ ...REPORT, impressionId: "imp-1" });

    expect(sendBeacon).toHaveBeenCalledWith(
      "https://api.example.com/viewable-impression?platformId=platform-1&adTypeId=medium-rectangle&adConfigId=ad-config-1&impressionId=imp-1",
    );
  });

  it("omits impressionId from the reported URL when absent, unchanged from before this feature", () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    const client = createViewableImpressionClient("https://api.example.com", sendBeacon, undefined);

    client.reportViewableImpression(REPORT);

    expect(sendBeacon).toHaveBeenCalledWith(
      "https://api.example.com/viewable-impression?platformId=platform-1&adTypeId=medium-rectangle&adConfigId=ad-config-1",
    );
  });

  it("includes sessionId in the reported URL when provided (feature 008)", () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    const client = createViewableImpressionClient("https://api.example.com", sendBeacon, undefined);

    client.reportViewableImpression({ ...REPORT, sessionId: "sess-1" });

    expect(sendBeacon).toHaveBeenCalledWith(
      "https://api.example.com/viewable-impression?platformId=platform-1&adTypeId=medium-rectangle&adConfigId=ad-config-1&sessionId=sess-1",
    );
  });

  it("omits sessionId from the reported URL when absent, unchanged from before this feature", () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    const client = createViewableImpressionClient("https://api.example.com", sendBeacon, undefined);

    client.reportViewableImpression(REPORT);

    expect(sendBeacon).toHaveBeenCalledWith(
      "https://api.example.com/viewable-impression?platformId=platform-1&adTypeId=medium-rectangle&adConfigId=ad-config-1",
    );
  });
});
