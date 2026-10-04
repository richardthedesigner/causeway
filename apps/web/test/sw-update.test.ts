import { afterEach, describe, expect, it, vi } from "vitest";
import { watchForUpdate } from "../src/lib/sw-update";

/** Just enough of navigator.serviceWorker and document for watchForUpdate. */
function fakeBrowser(controller: object | null) {
  const sw = Object.assign(new EventTarget(), { controller, getRegistration: vi.fn(async () => ({ update: vi.fn(async () => {}) })) });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("navigator", { serviceWorker: sw });
  vi.stubGlobal("document", doc);
  return { sw, doc };
}

afterEach(() => vi.unstubAllGlobals());

describe("update prompt (DEP-04)", () => {
  it("says so when a new version takes over an open page", () => {
    const { sw } = fakeBrowser({});
    const onUpdate = vi.fn();
    const stop = watchForUpdate(onUpdate);
    sw.dispatchEvent(new Event("controllerchange"));
    expect(onUpdate).toHaveBeenCalledOnce();
    stop();
  });

  it("stays quiet on a first visit, when the worker first takes control", () => {
    const { sw } = fakeBrowser(null);
    const onUpdate = vi.fn();
    const stop = watchForUpdate(onUpdate);
    sw.dispatchEvent(new Event("controllerchange"));
    expect(onUpdate).not.toHaveBeenCalled();
    // A later takeover is a real update.
    sw.dispatchEvent(new Event("controllerchange"));
    expect(onUpdate).toHaveBeenCalledOnce();
    stop();
  });

  it("looks for a new version when the app comes back to the front", async () => {
    const { sw, doc } = fakeBrowser({});
    const stop = watchForUpdate(() => {});
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(sw.getRegistration).toHaveBeenCalledOnce();
    stop();
  });

  it("does nothing without service workers", () => {
    vi.stubGlobal("navigator", {});
    expect(() => watchForUpdate(() => {})()).not.toThrow();
  });
});
