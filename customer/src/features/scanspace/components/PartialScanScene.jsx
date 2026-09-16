import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import ScanPointCloud from "./ScanPointCloud";
import ScanMesh from "./ScanMesh";

function ScanControls({ cloud, mode, input, view, reset }) {
  const { camera, gl } = useThree();
  const angle = useRef({ yaw: 0, pitch: 0 });
  useEffect(() => {
    if (mode === "first") {
      const start = cloud.observer || view.center;
      camera.position.set(start.x, start.y || 1.6, start.z);
      const dx = view.center.x - start.x;
      const dz = view.center.z - start.z;
      angle.current = {
        yaw: Math.atan2(-dx, -dz),
        pitch: 0,
      };
      camera.rotation.order = "YXZ";
      camera.rotation.set(0, angle.current.yaw, 0);
    } else {
      camera.position.set(...view.position);
      camera.lookAt(view.center.x, view.center.y, view.center.z);
    }
  }, [camera, cloud, mode, reset, view]);
  useEffect(() => {
    if (mode !== "first") return undefined;
    const element = gl.domElement;
    let pointer = null;
    const down = (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      element.setPointerCapture?.(event.pointerId);
    };
    const move = (event) => {
      if (!pointer) return;
      angle.current.yaw -= (event.clientX - pointer.x) * 0.004;
      angle.current.pitch = Math.max(
        -1.35,
        Math.min(
          1.35,
          angle.current.pitch - (event.clientY - pointer.y) * 0.004,
        ),
      );
      pointer = { x: event.clientX, y: event.clientY };
    };
    const up = () => {
      pointer = null;
    };
    const key = (event) => {
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.code === "Space" && mode === "first") event.preventDefault();
      input.current.keys[event.code] = event.type === "keydown";
    };
    const blur = () => {
      input.current.keys = {};
      input.current.x = input.current.y = input.current.elevation = 0;
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", blur);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", blur);
      blur();
    };
  }, [gl, input, mode]);
  useFrame((_, delta) => {
    if (mode !== "first") return;
    camera.rotation.order = "YXZ";
    camera.rotation.set(angle.current.pitch, angle.current.yaw, 0);
    const controls = input.current;
    const keys = controls.keys;
    const forward =
      -controls.y + (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const right = controls.x + (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const elevation =
      (controls.elevation || 0) +
      (keys.KeyE || keys.Space ? 1 : 0) -
      (keys.KeyQ || keys.KeyC || keys.ShiftLeft || keys.ShiftRight ? 1 : 0);
    const speed =
      (Math.min(delta, 0.05) * 1.35) /
      Math.max(1, Math.hypot(forward, right));
    const dx =
      (Math.cos(angle.current.yaw) * right -
        Math.sin(angle.current.yaw) * forward) *
      speed;
    const dz =
      (-Math.sin(angle.current.yaw) * right -
        Math.cos(angle.current.yaw) * forward) *
      speed;
    const dy = elevation * (Math.min(delta, 0.05) * 1.25);
    const padding = 0.7;
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x + dx,
      cloud.bounds.min.x - padding,
      cloud.bounds.max.x + padding,
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z + dz,
      cloud.bounds.min.z - padding,
      cloud.bounds.max.z + padding,
    );
    const minY = cloud.bounds ? Math.max(0.2, cloud.bounds.min.y + 0.2) : 0.2;
    const maxY = cloud.bounds ? Math.max(minY + 1.2, cloud.bounds.max.y + 0.6) : 4.5;
    camera.position.y = THREE.MathUtils.clamp(
      camera.position.y + dy,
      minY,
      maxY,
    );
  });
  return mode === "first" ? null : (
    <OrbitControls
      makeDefault
      target={[view.center.x, view.center.y, view.center.z]}
      enableDamping
      minDistance={0.45}
      maxDistance={view.extent * 5}
    />
  );
}

export default function PartialScanScene({ scan }) {
  const [mode, setMode] = useState("orbit");
  const [low, setLow] = useState(false);
  const [reset, setReset] = useState(0);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const input = useRef({ x: 0, y: 0, elevation: 0, keys: {} });
  const mesh = scan.mesh;
  const cloud = scan.cloud;
  const visual = mesh || cloud;
  const view = useMemo(() => {
    if (!visual)
      return {
        center: { x: 0, y: 1, z: 0 },
        extent: 3,
        position: [4, 3, 4],
      };
    const center = {
      x: (visual.bounds.min.x + visual.bounds.max.x) / 2,
      y: (visual.bounds.min.y + visual.bounds.max.y) / 2,
      z: (visual.bounds.min.z + visual.bounds.max.z) / 2,
    };
    const extent = Math.max(
      2.2,
      visual.bounds.max.x - visual.bounds.min.x,
      visual.bounds.max.y - visual.bounds.min.y,
      visual.bounds.max.z - visual.bounds.min.z,
    );
    return {
      center,
      extent,
      position: [
        center.x + extent * 1.1,
        center.y + extent * 0.6,
        center.z + extent * 1.1,
      ],
    };
  }, [visual]);
  const joystick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const magnitude = Math.max(1, Math.hypot(x, y) / 32);
    const position = { x: x / magnitude, y: y / magnitude };
    input.current.x = position.x / 32;
    input.current.y = position.y / 32;
    setKnob(position);
  };
  const clearJoystick = () => {
    input.current.x = input.current.y = 0;
    setKnob({ x: 0, y: 0 });
  };
  const setElevation = (value) => {
    input.current.elevation = value;
  };
  if (!visual)
    return <div className="ss-notice">Captured depth is unavailable.</div>;
  return (
    <div className="ss-partial-scene">
      <Canvas
        camera={{ position: view.position, fov: 48, near: 0.025, far: 100 }}
        dpr={low ? 1 : [1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
      >
        <color attach="background" args={["#18211e"]} />
        <hemisphereLight args={["#fff8ed", "#66756f", 2.1]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 7, 4]} intensity={1.6} />
        {mesh ? (
          <ScanMesh mesh={mesh} low={low} />
        ) : (
          <ScanPointCloud cloud={cloud} low={low} />
        )}
        <ScanControls
          cloud={visual}
          mode={mode}
          input={input}
          view={view}
          reset={reset}
        />
      </Canvas>
      <div className="ss-partial-viewbar">
        <div role="group" aria-label="Captured room view">
          <button
            className={mode === "orbit" ? "is-active" : ""}
            aria-pressed={mode === "orbit"}
            onClick={() => setMode("orbit")}
          >
            Overview
          </button>
          <button
            className={mode === "first" ? "is-active" : ""}
            aria-pressed={mode === "first"}
            onClick={() => setMode("first")}
          >
            Walk inside
          </button>
        </div>
        <button aria-label="Reset camera" onClick={() => setReset((v) => v + 1)}>
          Reset
        </button>
      </div>
      {mode === "first" && (
        <>
          <div
            className="ss-joystick"
            role="group"
            aria-label="Movement joystick"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              joystick(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons) joystick(event);
            }}
            onPointerUp={clearJoystick}
            onPointerCancel={clearJoystick}
          >
            <span style={{ transform: `translate(${knob.x}px,${knob.y}px)` }} />
            <small>Move</small>
          </div>
          <div
            className="ss-elevation-control"
            role="group"
            aria-label="Elevation control"
          >
            <button
              type="button"
              className="ss-elevation-btn ss-elevation-up"
              aria-label="Move camera up"
              title="Move up (E or Space)"
              onPointerDown={(e) => {
                e.stopPropagation();
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch (_) {}
                setElevation(1);
              }}
              onPointerUp={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch (_) {}
                setElevation(0);
              }}
              onPointerCancel={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch (_) {}
                setElevation(0);
              }}
              onPointerLeave={() => setElevation(0)}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              className="ss-elevation-btn ss-elevation-down"
              aria-label="Move camera down"
              title="Move down (Q, C or Shift)"
              onPointerDown={(e) => {
                e.stopPropagation();
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch (_) {}
                setElevation(-1);
              }}
              onPointerUp={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch (_) {}
                setElevation(0);
              }}
              onPointerCancel={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch (_) {}
                setElevation(0);
              }}
              onPointerLeave={() => setElevation(0)}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <small>Height</small>
          </div>
        </>
      )}
      <span className="ss-view-hint">
        {mode === "first"
          ? "Drag to look · Move & height controls or WASD/QE"
          : "Drag to orbit · Pinch to zoom"}
      </span>
      <span className="ss-partial-legend" role="status">
        <i />{" "}
        {mesh ? "Captured measured surface" : "Captured depth points"}
      </span>
      <button
        className="ss-quality"
        aria-pressed={low}
        onClick={() => setLow((value) => !value)}
      >
        {low ? "Battery saver" : "High quality"}
      </button>
    </div>
  );
}
