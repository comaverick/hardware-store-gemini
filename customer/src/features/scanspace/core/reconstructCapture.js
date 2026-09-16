import { restoreDepthCapture, restoreKeyframeImages } from "./captureDebug.js";
import { buildScanCloud } from "./scanCloud.js";
import { FLOOR_OUTLIER_TOLERANCE_METERS } from "./readiness.js";
import { fuseRgbdKeyframes } from "./fusion.js";
import { createFusionWorker } from "./fusionWorkerClient.js";

export function observationPoints(observations) {
  if (!observations?.count || !observations.positions?.length) return null;
  return Array.from({ length: observations.count }, (_, index) => {
    const offset = index * 3;
    const point = {
      x: observations.positions[offset],
      y: observations.positions[offset + 1],
      z: observations.positions[offset + 2],
    };
    if (observations.colorMask?.[index])
      point.color = Array.from(observations.colors.slice(offset, offset + 3));
    return point;
  });
}

export async function reconstructFromRawCapture(
  payload,
  options = {},
  onProgress = () => {},
) {
  const restored = restoreDepthCapture(payload);
  const keyframes = restored.keyframes;
  if (!keyframes?.length)
    throw new Error("No valid depth keyframes found in raw scan capture.");

  const headingCoverage =
    restored.options?.stats?.coverage ??
    payload?.stats?.coverage ??
    payload?.scan?.stats?.coverage ??
    0;

  const baseOptions = {
    floorY: restored.options.floorY,
    observer: restored.options.observer,
    headingCoverage,
    completionMode: "surface",
    reconstructionProfile: "quality",
    floorOutlierTolerance: FLOOR_OUTLIER_TOLERANCE_METERS,
    pruneUnsupportedBridges: true,
    poseRefinement: "native-tracking",
    requireCoherentSurfaceCore: false,
    preferCoherentSurfaceCore: true,
    rejectStructurallyInvalidSurface: false,
    smoothingPasses: 3,
    ...options,
  };

  onProgress("preparing", 2);
  await restoreKeyframeImages(keyframes);

  let fused;
  const worker = createFusionWorker();
  if (worker) {
    fused = await new Promise((resolve, reject) => {
      let settled = false;
      worker.onmessage = (event) => {
        if (event.data.type === "progress") {
          onProgress(
            event.data.stage,
            event.data.progress,
            event.data.diagnostics,
          );
          return;
        }
        if (settled) return;
        if (event.data.type === "error") {
          settled = true;
          worker.terminate();
          reject(new Error(event.data.error));
          return;
        }
        if (event.data.type === "complete") {
          settled = true;
          worker.terminate();
          resolve(event.data.result);
        }
      };
      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        reject(
          new Error(
            event?.message ||
              "Reconstruction worker stopped unexpectedly during re-rendering.",
          ),
        );
      };

      worker.postMessage({ keyframes, options: baseOptions });
    });
  } else {
    // Synchronous execution for Node / tests
    fused = fuseRgbdKeyframes(
      keyframes,
      baseOptions,
      (stage, progress, diagnostics) => {
        onProgress(stage, progress, diagnostics);
      },
    );
  }

  if (!fused?.mesh) {
    throw new Error(
      fused?.diagnostics?.reason ||
        "The measured surface did not pass multi-view quality checks during re-rendering.",
    );
  }

  const fallbackMesh =
    options.fallbackMesh || payload?.mesh || payload?.scan?.mesh || null;
  if (!fused.mesh.texture && fallbackMesh?.texture) {
    onProgress("texturing", 98);
    fused.mesh = fallbackMesh;
  }

  const acceptedPoints = observationPoints(fused.observations) || [];
  const scanCloud = buildScanCloud(acceptedPoints, {
    floorY: restored.options.floorY,
    observer: restored.options.observer,
    voxelSize: 0.035,
    floorOutlierTolerance: FLOOR_OUTLIER_TOLERANCE_METERS,
  });

  return {
    version: 2,
    kind: "validated-measured-surface",
    name:
      options.name ||
      payload?.name ||
      payload?.scan?.name ||
      "Re-rendered surface scan",
    walls: [],
    floorObserved: Number.isFinite(restored.options.floorY),
    ceilingObserved: false,
    pointCount: acceptedPoints.length,
    reason:
      "Validated multi-view surface re-rendered from raw keyframe capture.",
    cloud: scanCloud,
    mesh: fused.mesh,
    fusionMode: "multi-view-recomputed",
    captureQuality:
      options.captureQuality ||
      payload?.captureQuality ||
      payload?.scan?.captureQuality ||
      null,
    rawCapture: payload?.scan?.rawCapture || payload?.capture || payload,
    fusionDiagnostics: fused.diagnostics,
    measuredGapWarning: fused.diagnostics?.measuredGapWarning || null,
    measuredReviewWarning: fused.diagnostics?.measuredReviewWarning || null,
    fusionReason:
      options.fusionReason ||
      payload?.fusionReason ||
      payload?.scan?.fusionReason ||
      null,
  };
}
