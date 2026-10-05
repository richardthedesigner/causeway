/**
 * Notice when a new build has taken over (DEP-04, D-045). The service worker
 * (public/sw.js) activates a new version straight away, but a page that's
 * already open keeps running the old code until it's reloaded. So: look for
 * a new version when the app comes back to the front and every hour, and
 * say so when one takes over, so nobody is stuck on an old build for days.
 * Never reloads by itself: someone may be mid-journey.
 */
const HOUR = 60 * 60 * 1000;

export function watchForUpdate(onUpdate: () => void): () => void {
  const sw = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;
  if (!sw) return () => {};
  // With no controller this is the first visit: the worker taking over then isn't an update.
  let hadController = !!sw.controller;
  const onChange = () => {
    if (hadController) onUpdate();
    hadController = true;
  };
  const check = () => {
    sw.getRegistration().then((r) => r?.update()).catch(() => {});
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  sw.addEventListener("controllerchange", onChange);
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(check, HOUR);
  return () => {
    sw.removeEventListener("controllerchange", onChange);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
  };
}
