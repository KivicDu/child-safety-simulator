/**
 * ModelDiagnostic — Inspect all GLB models: bounding boxes, mesh names, sizes.
 * This is a temporary dev-only component for calibration.
 */
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface ModelInfo {
  name: string;
  url: string;
  rawSize: { w: number; h: number; d: number };
  rawMin: { x: number; y: number; z: number };
  rawMax: { x: number; y: number; z: number };
  rawCenter: { x: number; y: number; z: number };
  meshNames: string[];
  meshCount: number;
  materialCount: number;
  vertexCount: number;
}

const MODEL_URLS = [
  '/models/house_complete.glb',
  '/models/room.glb',
  '/models/play_toys_animated.glb',
  '/models/sit_to_stand_animated.glb',
  '/models/walk_animated.glb',
  '/models/car_toy.glb',
  '/models/dog_toy.glb',
  '/models/seal_toys.glb',
  '/models/table_hazard.glb',
];

function ModelInspector({ url, onInfo }: { url: string; onInfo: (info: ModelInfo) => void }) {
  const { scene, animations } = useGLTF(url);

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const meshNames: string[] = [];
    let meshCount = 0;
    let vertexCount = 0;
    const materials = new Set<string>();

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        meshCount++;
        meshNames.push(child.name || `unnamed_mesh_${meshCount}`);
        if (mesh.geometry) {
          const posAttr = mesh.geometry.getAttribute('position');
          if (posAttr) vertexCount += posAttr.count;
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => materials.add(m.name || 'unnamed'));
      }
    });

    const info: ModelInfo = {
      name: url.split('/').pop() || url,
      url,
      rawSize: { w: +size.x.toFixed(3), h: +size.y.toFixed(3), d: +size.z.toFixed(3) },
      rawMin: { x: +box.min.x.toFixed(3), y: +box.min.y.toFixed(3), z: +box.min.z.toFixed(3) },
      rawMax: { x: +box.max.x.toFixed(3), y: +box.max.y.toFixed(3), z: +box.max.z.toFixed(3) },
      rawCenter: { x: +center.x.toFixed(3), y: +center.y.toFixed(3), z: +center.z.toFixed(3) },
      meshNames,
      meshCount,
      materialCount: materials.size,
      vertexCount,
    };

    console.log(`[ModelDiagnostic] ${info.name}:`, info);
    console.log(`  Animations: ${animations.length}`, animations.map(a => a.name));
    onInfo(info);
  }, [scene, animations, url, onInfo]);

  return null;
}

export default function ModelDiagnostic() {
  const [results, setResults] = useState<ModelInfo[]>([]);
  const [loaded, setLoaded] = useState(0);

  const handleInfo = (info: ModelInfo) => {
    setResults((prev) => {
      const existing = prev.findIndex((r) => r.url === info.url);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = info;
        return next;
      }
      return [...prev, info];
    });
    setLoaded((p) => p + 1);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a14', color: '#fff', fontFamily: 'monospace', fontSize: 12, zIndex: 9999 }}>
      {/* Hidden Canvas to load models */}
      <Canvas style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
        {MODEL_URLS.map((url) => (
          <ModelInspector key={url} url={url} onInfo={handleInfo} />
        ))}
      </Canvas>

      <div style={{ padding: 20, overflow: 'auto', height: '100vh' }}>
        <h1 style={{ color: '#ffe4a0', fontSize: 18, marginBottom: 12 }}>
          🔍 Model Diagnostic ({loaded}/{MODEL_URLS.length} loaded)
        </h1>

        {results.length === 0 && <p style={{ color: '#888' }}>Loading models...</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
          {results.map((r) => (
            <div key={r.url} style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: 14,
            }}>
              <div style={{ color: '#78dcd2', fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>
                📦 {r.name}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={tdStyle}>Raw Size</td><td style={tdVal}>W={r.rawSize.w} H={r.rawSize.h} D={r.rawSize.d}</td></tr>
                  <tr><td style={tdStyle}>Raw Min</td><td style={tdVal}>({r.rawMin.x}, {r.rawMin.y}, {r.rawMin.z})</td></tr>
                  <tr><td style={tdStyle}>Raw Max</td><td style={tdVal}>({r.rawMax.x}, {r.rawMax.y}, {r.rawMax.z})</td></tr>
                  <tr><td style={tdStyle}>Raw Center</td><td style={tdVal}>({r.rawCenter.x}, {r.rawCenter.y}, {r.rawCenter.z})</td></tr>
                  <tr><td style={tdStyle}>Meshes</td><td style={tdVal}>{r.meshCount} meshes, {r.materialCount} materials</td></tr>
                  <tr><td style={tdStyle}>Vertices</td><td style={tdVal}>{r.vertexCount.toLocaleString()}</td></tr>
                  <tr><td style={tdStyle}>Mesh Names</td><td style={{ ...tdVal, maxHeight: 80, overflow: 'auto' }}>
                    {r.meshNames.map((n, i) => (
                      <span key={i} style={{
                        display: 'inline-block',
                        background: 'rgba(120,220,210,0.15)',
                        border: '1px solid rgba(120,220,210,0.2)',
                        borderRadius: 4, padding: '1px 6px', margin: '1px 2px',
                        fontSize: 11,
                      }}>{n}</span>
                    ))}
                  </td></tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 20, padding: 14, background: 'rgba(255,228,160,0.08)', border: '1px solid rgba(255,228,160,0.2)', borderRadius: 8 }}>
            <h3 style={{ color: '#ffe4a0', marginBottom: 8 }}>📐 Scale Calculations</h3>
            {results.map((r) => {
              const targetH = r.name.includes('house') ? 3.5 : r.name.includes('room') ? 3.0 : r.name.includes('play') || r.name.includes('sit') || r.name.includes('walk') ? 0.5 : r.name.includes('table') ? 0.55 : 0.1;
              const scale = +(targetH / r.rawSize.h).toFixed(6);
              const worldW = +(r.rawSize.w * scale).toFixed(2);
              const worldH = +(r.rawSize.h * scale).toFixed(2);
              const worldD = +(r.rawSize.d * scale).toFixed(2);
              const floorOffset = +(-r.rawMin.y * scale).toFixed(4);
              return (
                <div key={r.url} style={{ marginBottom: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: '#78dcd2' }}>{r.name}</span>: target H={targetH} → scale={scale} → world [{worldW} × {worldH} × {worldD}] floorOffset=+{floorOffset}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = { color: '#aaa', padding: '2px 8px 2px 0', verticalAlign: 'top', whiteSpace: 'nowrap' };
const tdVal: React.CSSProperties = { color: '#e0e0e0', padding: '2px 0' };
