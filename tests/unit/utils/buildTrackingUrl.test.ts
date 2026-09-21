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
});
