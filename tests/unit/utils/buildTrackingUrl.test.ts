import { buildTrackingUrl } from "../../../src/utils/buildTrackingUrl";

describe("buildTrackingUrl", () => {
  it("builds a URL with the path and all three params in order", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
      }),
    ).toBe("https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1");
  });

  it("URL-encodes param values", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "viewable-impression", {
        platformId: "p 1",
        adTypeId: "a&b",
        adConfigId: "c1",
      }),
    ).toBe("https://api.example.com/viewable-impression?platformId=p+1&adTypeId=a%26b&adConfigId=c1");
  });

  it("includes impressionId in the query string when provided", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
        impressionId: "imp-1",
      }),
    ).toBe(
      "https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1&impressionId=imp-1",
    );
  });

  it("omits impressionId entirely when not provided, unchanged from before this param existed", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
        impressionId: undefined,
      }),
    ).toBe("https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1");
  });

  it("omits impressionId when it's an empty string", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
        impressionId: "",
      }),
    ).toBe("https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1");
  });

  it("includes sessionId in the query string when provided (008)", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
        sessionId: "sess-1",
      }),
    ).toBe(
      "https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1&sessionId=sess-1",
    );
  });

  it("omits sessionId entirely when not provided", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
        sessionId: undefined,
      }),
    ).toBe("https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1");
  });

  it("omits sessionId when it's an empty string", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
        sessionId: "",
      }),
    ).toBe("https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1");
  });

  it("includes both impressionId and sessionId together, in order, when both are provided", () => {
    expect(
      buildTrackingUrl("https://api.example.com", "click", {
        platformId: "p1",
        adTypeId: "medium-rectangle",
        adConfigId: "c1",
        impressionId: "imp-1",
        sessionId: "sess-1",
      }),
    ).toBe(
      "https://api.example.com/click?platformId=p1&adTypeId=medium-rectangle&adConfigId=c1&impressionId=imp-1&sessionId=sess-1",
    );
  });
});
