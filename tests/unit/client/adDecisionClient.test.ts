import { createAdDecisionClient, type FetchLike, type FetchResponseLike } from "../../../src/client/adDecisionClient";
import { makeAdCreative } from "../fixtures/adCreative";

const creative = makeAdCreative();

function jsonResponse(ok: boolean, body: unknown): FetchResponseLike {
  return { ok, json: async () => body };
}

describe("createAdDecisionClient", () => {
  const baseUrl = "https://ads.example.com";

  it("builds the query string from required and optional fields", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(true, { ad: null }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    await client.requestAd({
      platformId: "plat-1",
      adTypeId: "banner",
      country: "US",
      deviceType: "desktop",
    });

    const [url] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe(`${baseUrl}/ads?platformId=plat-1&adTypeId=banner&country=US&deviceType=desktop`);
  });

  it("omits optional fields from the query string when absent", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(true, { ad: null }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    const [url] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe(`${baseUrl}/ads?platformId=plat-1&adTypeId=banner`);
  });

  it("returns filled when ad-serve-api returns a winning ad", async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(true, { ad: { creative, width: 300, height: 250 } }),
    );
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "filled", ad: { creative, width: 300, height: 250 } });
  });

  it("returns empty when ad-serve-api returns {ad: null}", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(true, { ad: null }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "empty" });
  });

  it("returns empty on a 404 (unknown placement)", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(false, { error: "not found" }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "empty" });
  });

  it("returns empty on a 400 (malformed request)", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(false, { error: "bad request" }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "", adTypeId: "banner" });

    expect(result).toEqual({ status: "empty" });
  });

  it("returns empty on a network error", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => {
      throw new Error("network down");
    });
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "empty" });
  });

  it("returns empty when the request times out", async () => {
    jest.useFakeTimers();

    const fetchImpl: FetchLike = jest.fn(
      (_url, init) =>
        new Promise<FetchResponseLike>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const client = createAdDecisionClient(fetchImpl, baseUrl, 50);

    const resultPromise = client.requestAd({ platformId: "plat-1", adTypeId: "banner" });
    jest.advanceTimersByTime(50);
    const result = await resultPromise;

    expect(result).toEqual({ status: "empty" });

    jest.useRealTimers();
  });

  it("returns empty when the response body doesn't match the expected shape", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(true, { unexpected: true }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "empty" });
  });

  it("accepts a creative with only some fields set — ad-serve-api only includes fields a campaign actually set", async () => {
    // Real ad-serve-api responses omit unset fields entirely rather than
    // backfilling every AdCreative field with a default (see types.ts).
    const sparseCreative = { headline: "Sale", ctaText: "Go", linkUrl: "https://example.com", altText: "" };
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(true, { ad: { creative: sparseCreative, width: 300, height: 250 } }),
    );
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "filled", ad: { creative: sparseCreative, width: 300, height: 250 } });
  });

  it("accepts a creative with an unexpectedly-typed field — per-field safety is the Renderer's job, not the Client's", async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(true, { ad: { creative: { ...creative, headline: null }, width: 300, height: 250 } }),
    );
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result.status).toBe("filled");
  });

  it("returns empty when width or height is zero or negative", async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(true, { ad: { creative, width: -1, height: 250 } }),
    );
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "empty" });
  });

  it("returns empty when the response body isn't valid JSON", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({ status: "empty" });
  });
});
