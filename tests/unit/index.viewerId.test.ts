// Loads src/index.ts the way a browser does: it reads document.currentScript when it is evaluated, so each test
// defines one, puts a slot on the page, stubs fetch, and evaluates a fresh copy of the module (feature 017).
const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const GENERATED = "22222222-2222-2222-2222-222222222222";

interface LoadOptions {
  viewerIdStorage?: string;
  slots?: number;
  queue?: unknown[];
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function loadSdk({ viewerIdStorage, slots = 1, queue }: LoadOptions = {}) {
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
  if (viewerIdStorage !== undefined) script.setAttribute("data-viewer-id-storage", viewerIdStorage);
  Object.defineProperty(document, "currentScript", { value: script, configurable: true });

  const requests: { url: string; body?: Record<string, unknown> }[] = [];
  window.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return { ok: true, json: async () => ({ ad: null, results: [] }) } as Response;
  }) as typeof window.fetch;
  (window as unknown as { adServe?: unknown }).adServe = queue ? { q: queue } : undefined;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../../src/index");
  });
  return { requests };
}

type AdServeWindow = { adServe: { setViewerId: (...args: unknown[]) => void; refresh: () => void; q: unknown[] } };
const adServe = () => (window as unknown as AdServeWindow).adServe;

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "crypto", { value: { randomUUID: () => GENERATED }, configurable: true });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(document, "currentScript", { value: null, configurable: true });
  delete (window as unknown as { adServe?: unknown }).adServe;
  window.localStorage.clear();
});

describe("without opt-in nothing is stored or sent (017, US4)", () => {
  it("makes requests without a viewerId, writes nothing to local storage and exposes setViewerId", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    const { requests } = loadSdk();
    await flush();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).not.toContain("viewerId");
    expect(setItem.mock.calls.filter(([key]) => key === "adServeViewerId")).toEqual([]);
    expect(window.localStorage.getItem("adServeViewerId")).toBeNull();
    expect(typeof adServe().setViewerId).toBe("function");
  });

  it.each(["session", "LOCAL", "true", ""])("ignores the attribute value %j", async (value) => {
    const { requests } = loadSdk({ viewerIdStorage: value });
    await flush();

    expect(requests[0].url).not.toContain("viewerId");
    expect(window.localStorage.getItem("adServeViewerId")).toBeNull();
  });
});

describe("platform-supplied identifier through the page (017, US1)", () => {
  it("uses a call queued before the SDK loaded for the very first requests", async () => {
    const { requests } = loadSdk({ queue: [["setViewerId", UUID]] });
    await flush();

    expect(requests[0].url).toContain(`viewerId=${UUID}`);
    expect(window.localStorage.getItem("adServeViewerId")).toBeNull();
  });

  it("uses window.adServe.setViewerId for requests made after it", async () => {
    const { requests } = loadSdk();
    await flush();

    adServe().setViewerId(UUID);
    const extra = document.createElement("div");
    extra.setAttribute("data-ad-serve-slot", "");
    extra.setAttribute("data-ad-type-id", "banner");
    document.body.append(extra);
    adServe().refresh();
    await flush();

    expect(requests[0].url).not.toContain("viewerId");
    expect(requests[requests.length - 1].url).toContain(`viewerId=${UUID}`);
  });

  it("sends a batch's identifier once, in the body", async () => {
    const { requests } = loadSdk({ slots: 2, queue: [["setViewerId", UUID]] });
    await flush();

    const batch = requests.find((request) => request.url.endsWith("/ads/batch"));
    expect(batch?.body).toMatchObject({ viewerId: UUID });
  });

  it("warns once for an invalid value and sends nothing for it", async () => {
    const { requests } = loadSdk({ queue: [["setViewerId", "nope"]] });
    await flush();

    expect(requests[0].url).not.toContain("viewerId");
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe("a setViewerId call with the wrong number of arguments (017 edge case)", () => {
  async function refreshAfter(call: () => void) {
    const { requests } = loadSdk({ queue: [["setViewerId", UUID]] });
    await flush();
    const before = requests.length;
    call();
    const extra = document.createElement("div");
    extra.setAttribute("data-ad-serve-slot", "");
    extra.setAttribute("data-ad-type-id", "banner");
    document.body.append(extra);
    adServe().refresh();
    await flush();
    return requests.slice(before);
  }

  it("refuses an extra argument with one warning and keeps the current identifier", async () => {
    const later = await refreshAfter(() => adServe().setViewerId("11111111-1111-1111-1111-111111111111", "extra"));

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(later[0].url).toContain(`viewerId=${UUID}`);
  });

  it("refuses a call with no argument the same way", async () => {
    const later = await refreshAfter(() => adServe().setViewerId());

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(later[0].url).toContain(`viewerId=${UUID}`);
  });

  it("still accepts exactly one argument, including null to withdraw", async () => {
    const accepted = await refreshAfter(() => adServe().setViewerId("11111111-1111-1111-1111-111111111111"));
    expect(accepted[0].url).toContain("viewerId=11111111-1111-1111-1111-111111111111");
    expect(console.warn).not.toHaveBeenCalled();

    const withdrawn = await refreshAfter(() => adServe().setViewerId(null));
    expect(withdrawn[0].url).not.toContain("viewerId");
  });

  it("never throws into the host page", () => {
    loadSdk();
    expect(() => adServe().setViewerId(UUID, UUID, UUID)).not.toThrow();
  });
});

describe("the identifier the SDK keeps on opt-in (017, US2)", () => {
  it("creates one UUID, keeps it under one key and sends it", async () => {
    const { requests } = loadSdk({ viewerIdStorage: "local" });
    await flush();

    expect(window.localStorage.getItem("adServeViewerId")).toBe(GENERATED);
    expect(requests[0].url).toContain(`viewerId=${GENERATED}`);
  });

  it("reads the same value on a later load and in another tab (same storage), without writing again", async () => {
    window.localStorage.setItem("adServeViewerId", UUID);
    const setItem = jest.spyOn(Storage.prototype, "setItem");

    const { requests } = loadSdk({ viewerIdStorage: "local" });
    await flush();

    expect(requests[0].url).toContain(`viewerId=${UUID}`);
    expect(setItem.mock.calls.filter(([key]) => key === "adServeViewerId")).toEqual([]);
  });

  it("lets a platform identifier win and leaves the stored one untouched", async () => {
    window.localStorage.setItem("adServeViewerId", UUID);

    const { requests } = loadSdk({ viewerIdStorage: "local", queue: [["setViewerId", "11111111-1111-1111-1111-111111111111"]] });
    await flush();

    expect(requests[0].url).toContain("viewerId=11111111-1111-1111-1111-111111111111");
    expect(window.localStorage.getItem("adServeViewerId")).toBe(UUID);
  });

  it("still serves ads, with no identifier, when local storage cannot be read", async () => {
    jest.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    const { requests } = loadSdk({ viewerIdStorage: "local" });
    await flush();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).not.toContain("viewerId");
  });

  it("still serves ads, with no identifier, when writing to local storage fails", async () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const { requests } = loadSdk({ viewerIdStorage: "local" });
    await flush();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).not.toContain("viewerId");
  });

  it("still serves ads, with no identifier, when there is no UUID source", async () => {
    Object.defineProperty(window, "crypto", { value: undefined, configurable: true });

    const { requests } = loadSdk({ viewerIdStorage: "local" });
    await flush();

    expect(requests[0].url).not.toContain("viewerId");
    expect(window.localStorage.getItem("adServeViewerId")).toBeNull();
  });
});

describe("withdrawing the identifier through the page (017, US3)", () => {
  it("removes the kept identifier and stops sending, and does not create another", async () => {
    const { requests } = loadSdk({ viewerIdStorage: "local" });
    await flush();
    expect(window.localStorage.getItem("adServeViewerId")).toBe(GENERATED);

    adServe().setViewerId(null);
    const extra = document.createElement("div");
    extra.setAttribute("data-ad-serve-slot", "");
    extra.setAttribute("data-ad-type-id", "banner");
    document.body.append(extra);
    adServe().refresh();
    await flush();

    expect(window.localStorage.getItem("adServeViewerId")).toBeNull();
    expect(requests[requests.length - 1].url).not.toContain("viewerId");
  });

  it("a withdrawal queued before the SDK loaded means nothing is created or sent", async () => {
    const { requests } = loadSdk({ viewerIdStorage: "local", queue: [["setViewerId", null]] });
    await flush();

    expect(window.localStorage.getItem("adServeViewerId")).toBeNull();
    expect(requests[0].url).not.toContain("viewerId");
  });
});
