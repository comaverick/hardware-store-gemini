import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { createScanMeshResources } from "../core/renderMesh";

export default function ScanMesh({ mesh, low = false }) {
  const resources = useMemo(() => createScanMeshResources(mesh), [mesh]);
  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.texture?.dispose();
    },
    [resources],
  );
  return (
    <mesh geometry={resources.geometry} frustumCulled={false}>
      {resources.texture ? (
        <meshBasicMaterial vertexColors map={resources.texture}
          side={THREE.DoubleSide} toneMapped={false} />
      ) : (
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} toneMapped={false} />
      )}
    </mesh>
  );
}
