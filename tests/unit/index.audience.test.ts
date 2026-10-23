// Loads src/index.ts the way a browser does: it reads document.currentScript when it is evaluated, so each test
// defines one, puts slots on the page, stubs fetch, and evaluates a fresh copy of the module (feature 021).
import { makeAdWithResolvedRender } from "./fixtures/adCreative";

interface LoadOptions {
  slots?: number;
  queue?: unknown[];
  // Answer every ad request with a filled ad (single and batch) instead of "no ad".
  filled?: boolean;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function loadSdk({ slots = 1, queue, filled = false }: LoadOptions = {}) {
  document.body.innerHTML = "";
  for (let i = 0; i < slots; i++) {
    const el = document.createElement("div");
    el.setAttribute("data-ad-serve-slot", "");
    el.setAttribute("data-ad-type-id", "banner");
    document.body.append(el);
  }
  const script = document.createElement("script");
  script.setAttribute("data-api-base-url", "https://ads.example.com");
  script.setAttribute("data-platform-id", "plat-1");
  Object.defineProperty(document, "currentScript", { value: script, configurable: true });

  const requests: { url: string; body?: Record<string, unknown> }[] = [];
  const ad = { ...makeAdWithResolvedRender(), adConfigId: "ad-1", impressionId: "imp-1" };
  window.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url: String(url), body });
    if (body?.placements) {
      return {
        ok: true,
        json: async () => ({
          results: (body.placements as { platformId: string; adTypeId: string }[]).map((p) =>
            filled ? { ...p, outcome: "found", ad } : { ...p, outcome: "no-ad" },
          ),
        }),
      } as Response;
    }
    return { ok: true, json: async () => ({ ad: filled ? ad : null }) } as Response;
  }) as typeof window.fetch;
  (window as unknown as { adServe?: unknown }).adServe = queue ? { q: queue } : undefined;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../../src/index");
  });
  return { requests };
}

type AdServeWindow = { adServe: { setAudience: (...args: unknown[]) => void; refresh: () => void; q: unknown[] } };
const adServe = () => (window as unknown as AdServeWindow).adServe;

function addSlot() {
  const extra = document.createElement("div");
  extra.setAttribute("data-ad-serve-slot", "");
  extra.setAttribute("data-ad-type-id", "banner");
  document.body.append(extra);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(document, "currentScript", { value: null, configurable: true });
  delete (window as unknown as { adServe?: unknown }).adServe;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("a page that never calls setAudience (021)", () => {
  it("makes requests with no audience, in the query or the body, and exposes setAudience", async () => {
    const single = loadSdk();
    await flush();
    expect(single.requests).toHaveLength(1);
    expect(single.requests[0].url).not.toContain("audience");
    expect(typeof adServe().setAudience).toBe("function");

    const batch = loadSdk({ slots: 2 });
    await flush();
    expect(batch.requests).toHaveLength(1);
    expect(batch.requests[0].body).not.toHaveProperty("audience");
  });
});

describe("labels queued before the SDK loaded (021, US2)", () => {
  it("are on the very first single request", async () => {
    const { requests } = loadSdk({ queue: [["setAudience", ["follows-team-x"]]] });
    await flush();

    expect(requests[0].url).toContain("audience=follows-team-x");
  });

  it("are on the very first batch request", async () => {
    const { requests } = loadSdk({ slots: 2, queue: [["setAudience", ["Follows-Team-X", "age-25-34"]]] });
    await flush();

    expect(requests).toHaveLength(1);
    expect(requests[0].body?.audience).toEqual(["follows-team-x", "age-25-34"]);
  });

  it("the last of several queued entries wins", async () => {
    const { requests } = loadSdk({ queue: [["setAudience", ["a"]], ["setAudience", ["b"]]] });
    await flush();

    expect(requests[0].url).toContain("audience=b");
    expect(requests[0].url).not.toContain("audience=a");
  });

  it("a refused queued entry does not replace an earlier valid one", async () => {
    const { requests } = loadSdk({ queue: [["setAudience", ["a"]], ["setAudience", "oops"]] });
    await flush();

    expect(requests[0].url).toContain("audience=a");
  });
});

describe("window.adServe.setAudience (021, US1 and US3)", () => {
  it("applies to requests made after it and can be cleared", async () => {
    const { requests } = loadSdk();
    await flush();

    adServe().setAudience(["follows-team-x"]);
    addSlot();
    adServe().refresh();
    await flush();
    adServe().setAudience(null);
    addSlot();
    adServe().refresh();
    await flush();

    expect(requests).toHaveLength(3);
    expect(requests[0].url).not.toContain("audience");
    expect(requests[1].url).toContain("audience=follows-team-x");
    expect(requests[2].url).not.toContain("audience");
  });

  it("refuses a call with no argument or with several, warning and changing nothing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { requests } = loadSdk();
    await flush();

    adServe().setAudience(["a"]);
    adServe().setAudience();
    adServe().setAudience(["b"], ["c"]);
    addSlot();
    adServe().refresh();
    await flush();

    expect(warn.mock.calls.filter(([m]) => String(m).includes("setAudience ignored"))).toHaveLength(2);
    expect(requests[1].url).toContain("audience=a");
  });
});

describe("labels are kept in memory and shown nowhere else (021, US4, SC-005)", () => {
  it("writes nothing to storage or cookies and puts no label in the page or in any non-ad request", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    const { requests } = loadSdk({ slots: 2, filled: true, queue: [["setAudience", ["secret-label"]]] });
    await flush();
    await flush();

    // The ad requests carry it; nothing else does.
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      const isAdRequest = request.url.includes("/ads");
      expect(JSON.stringify(request).includes("secret-label")).toBe(isAdRequest);
    }
    expect(setItem.mock.calls.some(([, value]) => String(value).includes("secret-label"))).toBe(false);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("secret-label");
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain("secret-label");
    expect(document.cookie).not.toContain("secret-label");
    expect(document.body.innerHTML).not.toContain("secret-label");
    expect(document.body.innerHTML).toContain("Summer Sale");
  });
});
