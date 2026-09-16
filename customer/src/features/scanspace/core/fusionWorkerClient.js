export function createFusionWorker() {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./fusion.worker.js", import.meta.url));
  } catch {
    return null;
  }
}
