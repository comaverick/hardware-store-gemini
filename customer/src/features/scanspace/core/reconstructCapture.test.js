jest.mock("./fusionWorkerClient", () => ({
  createFusionWorker: () => null,
}));

import {
  observationPoints,
  reconstructFromRawCapture,
} from "./reconstructCapture";
import { createRgbdKeyframe } from "./fusion";

test("observationPoints converts observation arrays into point objects", () => {
  expect(observationPoints(null)).toBeNull();
  expect(observationPoints({})).toBeNull();
  expect(
    observationPoints({ count: 0, positions: new Float32Array() }),
  ).toBeNull();

  const observations = {
    count: 2,
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    colors: new Uint8Array([10, 20, 30, 40, 50, 60]),
    colorMask: new Uint8Array([1, 0]),
  };
  const points = observationPoints(observations);
  expect(points).toHaveLength(2);
  expect(points[0]).toEqual({ x: 1, y: 2, z: 3, color: [10, 20, 30] });
  expect(points[1]).toEqual({ x: 4, y: 5, z: 6 });
});

const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const makeFrame = (cameraX) => {
  const points = [];
  const size = 20;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const depth = 1.5;
      points.push({
        x: cameraX + (x / size - 0.5) * depth,
        y: (y / size - 0.5) * depth,
        z: -depth,
        depth,
        gridX: x,
        gridY: y,
        gridColumns: size,
        gridRows: size,
        color: [200, 150, 100],
      });
    }
  }
  const transform = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    cameraX, 0, 0, 1,
  ];
  return createRgbdKeyframe(points, {
    columns: size,
    rows: size,
    projectionMatrix: matrix,
    transformMatrix: transform,
  });
};

test("reconstructFromRawCapture reconstructs keyframes into a validated surface scan", async () => {
  const frame1 = makeFrame(0);
  const frame2 = makeFrame(0.08);

  const rawCapture = {
    version: 4,
    floorY: -0.5,
    observer: { x: 0.04, y: 1.6, z: 0 },
    keyframes: [
      {
        columns: frame1.columns,
        rows: frame1.rows,
        validCount: frame1.validCount,
        depths: Array.from(frame1.depths),
        positions: Array.from(frame1.positions),
        colors: Array.from(frame1.colors),
        colorMask: Array.from(frame1.colorMask),
        projectionMatrix: Array.from(frame1.projectionMatrix),
        transformMatrix: Array.from(frame1.transformMatrix),
      },
      {
        columns: frame2.columns,
        rows: frame2.rows,
        validCount: frame2.validCount,
        depths: Array.from(frame2.depths),
        positions: Array.from(frame2.positions),
        colors: Array.from(frame2.colors),
        colorMask: Array.from(frame2.colorMask),
        projectionMatrix: Array.from(frame2.projectionMatrix),
        transformMatrix: Array.from(frame2.transformMatrix),
      },
    ],
  };

  const stages = [];
  const result = await reconstructFromRawCapture(
    rawCapture,
    { reconstructionProfile: "fast" },
    (stage, progress) => {
      stages.push({ stage, progress });
    },
  );

  expect(stages.length).toBeGreaterThan(0);
  expect(result.kind).toBe("validated-measured-surface");
  expect(result.fusionMode).toBe("multi-view-recomputed");
  expect(result.rawCapture).toBeDefined();
  expect(result.cloud).toBeDefined();
});

test("reconstructFromRawCapture safely preserves fallbackMesh when fusion produces untextured mesh", async () => {
  const frame1 = makeFrame(0);
  const frame2 = makeFrame(0.08);

  const rawCapture = {
    version: 4,
    floorY: -0.5,
    observer: { x: 0.04, y: 1.6, z: 0 },
    keyframes: [
      {
        columns: frame1.columns,
        rows: frame1.rows,
        validCount: frame1.validCount,
        depths: Array.from(frame1.depths),
        positions: Array.from(frame1.positions),
        colors: Array.from(frame1.colors),
        colorMask: Array.from(frame1.colorMask),
        projectionMatrix: Array.from(frame1.projectionMatrix),
        transformMatrix: Array.from(frame1.transformMatrix),
      },
      {
        columns: frame2.columns,
        rows: frame2.rows,
        validCount: frame2.validCount,
        depths: Array.from(frame2.depths),
        positions: Array.from(frame2.positions),
        colors: Array.from(frame2.colors),
        colorMask: Array.from(frame2.colorMask),
        projectionMatrix: Array.from(frame2.projectionMatrix),
        transformMatrix: Array.from(frame2.transformMatrix),
      },
    ],
  };

  const existingMesh = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    texture: { width: 4, height: 4, data: new Uint8Array(64).fill(255) },
  };

  // Replay without photos produces untextured mesh, which should preserve existingMesh
  const result = await reconstructFromRawCapture(rawCapture, {
    fallbackMesh: existingMesh,
    reconstructionProfile: "fast",
  });

  expect(result.mesh).toBe(existingMesh);
  expect(result.mesh.texture).toBeDefined();
});

