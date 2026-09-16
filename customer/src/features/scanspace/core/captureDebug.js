// Review diagnostics stay in memory until the user downloads them.
// Snapshot before worker transfer detaches the live typed arrays. Camera photos
// are omitted to bound memory; per-point RGB is sufficient for geometry replay.
export function captureDebugEnabled() {
  return new URLSearchParams(window.location.search).get("scanspaceDebug") === "1";
}

export function compressColorImageToJpeg(data, width, height, quality = 0.82) {
  if (typeof document === "undefined" || !data?.length || !width || !height)
    return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imgData = ctx.createImageData(width, height);
    if (data.length === width * height * 4) {
      imgData.data.set(data);
    } else if (data.length === width * height * 3) {
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        imgData.data[j] = data[i];
        imgData.data[j + 1] = data[i + 1];
        imgData.data[j + 2] = data[i + 2];
        imgData.data[j + 3] = 255;
      }
    } else {
      return null;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

export function decodeJpegToRgba(dataUrl) {
  if (typeof document === "undefined" || typeof Image === "undefined" || !dataUrl)
    return Promise.resolve(null);
  try {
    const testCanvas = document.createElement("canvas");
    if (!testCanvas.getContext?.("2d")) return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 1500);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({
          data: new Uint8Array(imgData.data.buffer),
          width: canvas.width,
          height: canvas.height,
          channels: 4,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = dataUrl;
  });
}

export async function restoreKeyframeImages(keyframes) {
  if (!Array.isArray(keyframes)) return keyframes;
  await Promise.all(
    keyframes.map(async (frame) => {
      if (
        frame.colorImageDataUrl &&
        (!frame.colorImage || !frame.colorImage.length)
      ) {
        const decoded = await decodeJpegToRgba(frame.colorImageDataUrl);
        if (decoded) {
          frame.colorImage = decoded.data;
          frame.colorWidth = decoded.width;
          frame.colorHeight = decoded.height;
          frame.colorChannels = decoded.channels;
        }
      }
    }),
  );
  return keyframes;
}

export function snapshotDepthCaptureData(raw) {
  let imagesCount = 0;
  const keyframes = (raw.keyframes || []).map((frame) => {
    let colorImageDataUrl = frame.colorImageDataUrl || null;
    const hasRawImage =
      frame.colorImage?.length && frame.colorWidth && frame.colorHeight;
    if (!colorImageDataUrl && hasRawImage) {
      colorImageDataUrl = compressColorImageToJpeg(
        frame.colorImage,
        frame.colorWidth,
        frame.colorHeight,
      );
    }
    if (colorImageDataUrl) imagesCount++;

    return {
      columns: frame.columns,
      rows: frame.rows,
      validCount: frame.validCount,
      coloredCount: frame.coloredCount,
      tracking: frame.tracking,
      timestamp: frame.timestamp,
      linearSpeed: frame.linearSpeed || 0,
      angularSpeed: frame.angularSpeed || 0,
      depthQuality: frame.depthQuality || 0,
      measuredDepthCount: frame.measuredDepthCount || 0,
      colorSharpness: frame.colorSharpness || 0,
      colorClippedRatio: frame.colorClippedRatio || 0,
      colorFocus: frame.colorFocus || 0,
      textureLinearSpeed: frame.textureLinearSpeed || 0,
      textureAngularSpeed: frame.textureAngularSpeed || 0,
      geometryMode: frame.geometryMode,
      nativeDepthWidth: frame.nativeDepthWidth,
      nativeDepthHeight: frame.nativeDepthHeight,
      nativeDepthUvTransform: Array.from(frame.nativeDepthUvTransform || []),
      depths: Array.from(frame.depths),
      positions: Array.from(frame.positions),
      colors: Array.from(frame.colors),
      colorMask: Array.from(frame.colorMask),
      projectionMatrix: Array.from(frame.projectionMatrix),
      transformMatrix: Array.from(frame.transformMatrix),
      viewProjectionMatrix: Array.from(
        frame.viewProjectionMatrix || frame.projectionMatrix,
      ),
      viewTransformMatrix: Array.from(
        frame.viewTransformMatrix || frame.transformMatrix,
      ),
      camera: Array.from(frame.camera || []),
      colorImageDataUrl: colorImageDataUrl || null,
      colorWidth: frame.colorWidth || 0,
      colorHeight: frame.colorHeight || 0,
      colorChannels: frame.colorChannels || 4,
    };
  });

  const header = {
    version: 4,
    geometrySchemaVersion: 1,
    coordinateMode: "view-aligned-v1",
    buildId:
      process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA ||
      process.env.REACT_APP_GIT_SHA ||
      "local-or-unknown",
    browser:
      typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    orientation:
      typeof window === "undefined"
        ? "unknown"
        : window.screen.orientation?.type ||
          `${window.screen.width || 0}x${window.screen.height || 0}`,
    createdAt: new Date().toISOString(),
    floorY: raw.floorY,
    observer: raw.observer,
    stats: raw.stats,
    cameraImagesIncluded: imagesCount > 0,
  };
  return { ...header, keyframes };
}

export function snapshotDepthCapture(raw) {
  const data = snapshotDepthCaptureData(raw);
  return new Blob([JSON.stringify(data)], { type: "application/json" });
}

export function downloadDepthCapture(blob, diagnostics = null) {
  const file = new Blob([
    '{"capture":', blob, ',"diagnostics":', JSON.stringify(diagnostics), "}",
  ], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `scanspace-debug-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function restoreDepthCapture(payload) {
  const capture = payload.capture || payload;
  if (!Array.isArray(capture.keyframes) || capture.keyframes.length > 256)
    throw new Error("Expected a ScanSpace capture with at most 256 keyframes.");
  const keyframes = capture.keyframes.map((frame) => {
    const count = frame.columns * frame.rows;
    if (!Number.isInteger(count) || count < 1 || count > 100000 ||
        frame.depths?.length !== count || frame.positions?.length !== count * 3 ||
        frame.projectionMatrix?.length !== 16 || frame.transformMatrix?.length !== 16)
      throw new Error("Invalid keyframe dimensions or camera matrices.");
    return {
      ...frame,
      geometryMode:
        frame.geometryMode ||
        (frame.depthUvs?.length === count * 2
          ? "legacy-depth-uv-ambiguous"
          : "view-aligned-legacy"),
      legacyGeometryAmbiguous:
        !frame.geometryMode && frame.depthUvs?.length === count * 2,
      nativeDepthWidth: Number(frame.nativeDepthWidth) || 0,
      nativeDepthHeight: Number(frame.nativeDepthHeight) || 0,
      nativeDepthUvTransform:
        frame.nativeDepthUvTransform?.length === 16
          ? Float32Array.from(frame.nativeDepthUvTransform)
          : new Float32Array(),
      depths: Float32Array.from(frame.depths, (v) => v ?? 0),
      positions: Float32Array.from(frame.positions, (v) => v ?? NaN),
      colors: Uint8Array.from(frame.colors || new Uint8Array(count * 3)),
      colorMask: Uint8Array.from(frame.colorMask || new Uint8Array(count)),
      projectionMatrix: Float32Array.from(frame.projectionMatrix),
      transformMatrix: Float32Array.from(frame.transformMatrix),
      viewProjectionMatrix: Float32Array.from(
        frame.viewProjectionMatrix || frame.projectionMatrix,
      ),
      viewTransformMatrix: Float32Array.from(
        frame.viewTransformMatrix || frame.transformMatrix,
      ),
      camera: Float32Array.from(frame.camera || frame.transformMatrix.slice(12, 15)),
      linearSpeed: Number(frame.linearSpeed) || 0,
      angularSpeed: Number(frame.angularSpeed) || 0,
      depthQuality: Number(frame.depthQuality) || 0,
      measuredDepthCount: Number(frame.measuredDepthCount) || 0,
      colorSharpness: Number(frame.colorSharpness) || 0,
      colorClippedRatio: Number(frame.colorClippedRatio) || 0,
      colorFocus: Number(frame.colorFocus) || 0,
      textureLinearSpeed: Number(frame.textureLinearSpeed) || 0,
      textureAngularSpeed: Number(frame.textureAngularSpeed) || 0,
      validCount: frame.validCount ?? frame.depths.filter((v) => v > 0).length,
      coloredCount: frame.coloredCount ?? (frame.colorMask || []).filter(Boolean).length,
      colorImageDataUrl: frame.colorImageDataUrl || null,
      colorWidth: Number(frame.colorWidth) || 0,
      colorHeight: Number(frame.colorHeight) || 0,
      colorChannels: Number(frame.colorChannels) || 4,
      colorImage: frame.colorImage || null,
      tracking: frame.tracking !== false,
    };
  });
  return {
    keyframes,
    options: { floorY: capture.floorY, observer: capture.observer },
    metadata: {
      captureVersion: capture.version || 1,
      geometrySchemaVersion: capture.geometrySchemaVersion || null,
      coordinateMode: capture.coordinateMode || "legacy-unspecified",
      buildId: capture.buildId || "unknown",
      browser: capture.browser || "unknown",
      ambiguousLegacyGeometry: keyframes.some(
        (frame) => frame.legacyGeometryAmbiguous,
      ),
    },
  };
}
