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

  it("includes category in the query string when present (010)", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(true, { ad: null }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    await client.requestAd({ platformId: "plat-1", adTypeId: "banner", category: "IAB1-6" });

    const [url] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe(`${baseUrl}/ads?platformId=plat-1&adTypeId=banner&category=IAB1-6`);
  });

  it("includes sessionId in the query string when present (008)", async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse(true, { ad: null }));
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    await client.requestAd({
      platformId: "plat-1",
      adTypeId: "banner",
      sessionId: "44444444-4444-4444-4444-444444444444",
    });

    const [url] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe(
      `${baseUrl}/ads?platformId=plat-1&adTypeId=banner&sessionId=44444444-4444-4444-4444-444444444444`,
    );
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

  it("passes adConfigId through when present (feature 004 — used for click-URL construction)", async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(true, { ad: { creative, width: 300, height: 250, adConfigId: "ad-1" } }),
    );
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result).toEqual({
      status: "filled",
      ad: { creative, width: 300, height: 250, adConfigId: "ad-1" },
    });
  });

  it("still accepts the ad when adConfigId is absent (optional — degrades to a direct link, not a rejected ad)", async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse(true, { ad: { creative, width: 300, height: 250 } }),
    );
    const client = createAdDecisionClient(fetchImpl, baseUrl);

    const result = await client.requestAd({ platformId: "plat-1", adTypeId: "banner" });

    expect(result.status).toBe("filled");
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

describe("createAdDecisionClient.requestAdBatch (012)", () => {
  const baseUrl = "https://ads.example.com";
  const requests = [
    { platformId: "plat-1", adTypeId: "leaderboard" },
    { platformId: "plat-1", adTypeId: "medium-rectangle" },
  ];

  function entry(overrides: Record<string, unknown>) {
    return { platformId: "plat-1", adTypeId: "leaderboard", ...overrides };
  }

  function foundEntry(adTypeId: string, adConfigId: string) {
    return entry({
      adTypeId,
      outcome: "found",
      ad: { adConfigId, creative, width: 300, height: 250, impressionId: `imp-${adConfigId}` },
    });
  }

  function batchClient(response: FetchResponseLike | Error) {
    const fetchImpl: FetchLike = jest.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    return { fetchImpl, client: createAdDecisionClient(fetchImpl, baseUrl) };
  }

  it("POSTs the placements, shared fields and dedupe true as JSON", async () => {
    const { fetchImpl, client } = batchClient(jsonResponse(true, { results: [] }));

    await client.requestAdBatch(requests, {
      country: "US",
      deviceType: "mobile",
      category: "comedy",
      sessionId: "session-1",
    });

    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe(`${baseUrl}/ads/batch`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      placements: requests,
      country: "US",
      deviceType: "mobile",
      category: "comedy",
      sessionId: "session-1",
      dedupe: true,
    });
  });

  it("omits absent shared fields and never sends dedupeFallback", async () => {
    const { fetchImpl, client } = batchClient(jsonResponse(true, { results: [] }));

    await client.requestAdBatch(requests, {});

    const body = JSON.parse((fetchImpl as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({ placements: requests, dedupe: true });
  });

  it("maps found, no-ad, not-found, error and invalid entries in order", async () => {
    const three = [...requests, { platformId: "plat-1", adTypeId: "banner" }];
    const { client } = batchClient(
      jsonResponse(true, {
        results: [
          foundEntry("leaderboard", "ad-1"),
          entry({ adTypeId: "medium-rectangle", outcome: "no-ad" }),
          entry({ adTypeId: "banner", outcome: "error", error: "x" }),
        ],
      }),
    );

    const results = await client.requestAdBatch(three, {});

    expect(results).toEqual([
      { status: "filled", ad: expect.objectContaining({ adConfigId: "ad-1", impressionId: "imp-ad-1" }) },
      { status: "empty" },
      { status: "failed" },
    ]);
  });

  it.each(["not-found", "invalid"])("maps a %s entry to empty or failed as documented", async (outcome) => {
    const { client } = batchClient(jsonResponse(true, { results: [entry({ outcome })] }));

    const results = await client.requestAdBatch([requests[0]], {});

    expect(results).toEqual([{ status: outcome === "not-found" ? "empty" : "failed" }]);
  });

  it("treats a found entry without a usable ad as failed", async () => {
    const { client } = batchClient(
      jsonResponse(true, { results: [entry({ outcome: "found", ad: { creative: null } })] }),
    );

    expect(await client.requestAdBatch([requests[0]], {})).toEqual([{ status: "failed" }]);
  });

  it.each([
    ["a network error", new Error("offline")],
    ["a non-OK status", jsonResponse(false, {})],
    ["a malformed body", jsonResponse(true, "nope")],
    ["a body without results", jsonResponse(true, {})],
    ["a result list of the wrong length", jsonResponse(true, { results: [entry({ outcome: "no-ad" })] })],
    [
      "entries that do not echo the requested placements",
      jsonResponse(true, {
        results: [
          entry({ outcome: "no-ad" }),
          entry({ adTypeId: "something-else", outcome: "no-ad" }),
        ],
      }),
    ],
  ])("returns null for %s", async (_label, response) => {
    const { client } = batchClient(response as FetchResponseLike | Error);

    expect(await client.requestAdBatch(requests, {})).toBeNull();
  });

  it("returns null when the response body cannot be parsed", async () => {
    const { client } = batchClient({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    });

    expect(await client.requestAdBatch(requests, {})).toBeNull();
  });

  describe("per-placement category and scaled time limit (013)", () => {
    it("writes each request's category on its placement and omits it when absent", async () => {
      const { fetchImpl, client } = batchClient(jsonResponse(true, { results: [] }));

      await client.requestAdBatch(
        [
          { platformId: "plat-1", adTypeId: "leaderboard", category: "music" },
          { platformId: "plat-1", adTypeId: "leaderboard", category: "comedy" },
          { platformId: "plat-1", adTypeId: "leaderboard" },
        ],
        { country: "US" },
      );

      const body = JSON.parse((fetchImpl as jest.Mock).mock.calls[0][1].body);
      expect(body.placements).toEqual([
        { platformId: "plat-1", adTypeId: "leaderboard", category: "music" },
        { platformId: "plat-1", adTypeId: "leaderboard", category: "comedy" },
        { platformId: "plat-1", adTypeId: "leaderboard" },
      ]);
      expect(body.category).toBeUndefined();
      expect(body.country).toBe("US");
    });

    it("sends the whole-request category only when the caller gives one", async () => {
      const { fetchImpl, client } = batchClient(jsonResponse(true, { results: [] }));

      await client.requestAdBatch(
        [
          { platformId: "plat-1", adTypeId: "leaderboard", category: "music" },
          { platformId: "plat-1", adTypeId: "leaderboard", category: "music" },
        ],
        { category: "music" },
      );

      const body = JSON.parse((fetchImpl as jest.Mock).mock.calls[0][1].body);
      expect(body.category).toBe("music");
      expect(body.placements.map((placement: { category?: string }) => placement.category)).toEqual(["music", "music"]);
    });

    describe("time limit", () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      function hangingClient(baseMs: number) {
        const signals: AbortSignal[] = [];
        const fetchImpl: FetchLike = jest.fn(
          (_url, init) =>
            new Promise<FetchResponseLike>((_resolve, reject) => {
              signals.push(init.signal);
              init.signal.addEventListener("abort", () => reject(new Error("aborted")));
            }),
        );
        return { signals, client: createAdDecisionClient(fetchImpl, "https://ads.example.com", baseMs) };
      }

      const placementsOf = (count: number) =>
        Array.from({ length: count }, () => ({ platformId: "plat-1", adTypeId: "leaderboard" }));

      it("keeps a single request's limit unchanged", async () => {
        const { signals, client } = hangingClient(1000);

        const pending = client.requestAd({ platformId: "plat-1", adTypeId: "leaderboard" });
        jest.advanceTimersByTime(999);
        expect(signals[0].aborted).toBe(false);
        jest.advanceTimersByTime(1);
        expect(signals[0].aborted).toBe(true);
        await pending;
      });

      it("gives a batch of ten placements base + 250 ms for each extra placement", async () => {
        const { signals, client } = hangingClient(1000);

        const pending = client.requestAdBatch(placementsOf(10), {});
        jest.advanceTimersByTime(1000 + 250 * 9 - 1);
        expect(signals[0].aborted).toBe(false);
        jest.advanceTimersByTime(1);
        expect(signals[0].aborted).toBe(true);
        expect(await pending).toBeNull();
      });

      it("keeps the base limit for a batch of one", async () => {
        const { signals, client } = hangingClient(1000);

        const pending = client.requestAdBatch(placementsOf(1), {});
        jest.advanceTimersByTime(1000);
        expect(signals[0].aborted).toBe(true);
        await pending;
      });

      it("caps a very large batch's limit at ten seconds", async () => {
        const { signals, client } = hangingClient(3000);

        const pending = client.requestAdBatch(placementsOf(50), {});
        jest.advanceTimersByTime(9999);
        expect(signals[0].aborted).toBe(false);
        jest.advanceTimersByTime(1);
        expect(signals[0].aborted).toBe(true);
        await pending;
      });

      it("never lowers the limit below the base when the base is already above the cap", async () => {
        const { signals, client } = hangingClient(20000);

        const pending = client.requestAdBatch(placementsOf(5), {});
        jest.advanceTimersByTime(19999);
        expect(signals[0].aborted).toBe(false);
        jest.advanceTimersByTime(1);
        expect(signals[0].aborted).toBe(true);
        await pending;
      });
    });
  });
});
