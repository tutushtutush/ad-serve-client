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
});
