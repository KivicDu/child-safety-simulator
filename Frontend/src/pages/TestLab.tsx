import { useState, useRef, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html, Line, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Vec3 { x: number; y: number; z: number }
interface BBox { min: Vec3; max: Vec3 }
interface Dims { width: number; height: number; depth: number }

interface AnalysisObject {
  id: string;
  name: string;
  bbox: BBox;
  center: Vec3;
  dimensions: Dims;
  classification?: {
    label: string;
    category: string;
    subcategory: string;
    confidence: number;
    source: 'keyword' | 'shape';
    surfaceType: string;
    dangerScore: number;
  };
}

interface ObjectGroup {
  id: string;
  name: string;
  members: string[];
  bbox: BBox;
  center: Vec3;
}

interface SpatialRelation {
  objectA: string;
  objectB: string;
  relation: 'near' | 'onTopOf' | 'touching' | 'inside';
  distance?: number;
  confidence: number;
}

interface Hazard {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  objects: string[];
  position: Vec3;
  explanation: string;
}

interface AnalysisData {
  objects: AnalysisObject[];
  groups: ObjectGroup[];
  ungrouped: string[];
  relations: SpatialRelation[];
  hazards: Hazard[];
  meta: {
    totalObjects: number;
    totalGroups: number;
    totalRelations: number;
    totalHazards: number;
    floorHeight: number;
  };
}

// ─── Color helpers ────────────────────────────────────────────────────────────
const SEVERITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const RELATION_COLORS = { near: '#60a5fa', onTopOf: '#a78bfa', touching: '#f472b6', inside: '#34d399' };

const GROUP_PALETTE = [
  '#06b6d4', '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b',
  '#6366f1', '#ec4899', '#14b8a6', '#ef4444', '#84cc16',
];

function getGroupColor(idx: number) {
  return GROUP_PALETTE[idx % GROUP_PALETTE.length];
}

// ─── 3D: Loaded Model ────────────────────────────────────────────────────────
function LoadedModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

// ─── 3D: Bounding Box wireframe ──────────────────────────────────────────────
function BBoxWireframe({ bbox, color = '#00ff88', opacity = 0.6 }: { bbox: BBox; color?: string; opacity?: number }) {
  const geo = useMemo(() => {
    const w = bbox.max.x - bbox.min.x;
    const h = bbox.max.y - bbox.min.y;
    const d = bbox.max.z - bbox.min.z;
    return new THREE.BoxGeometry(w, h, d);
  }, [bbox]);

  const pos: [number, number, number] = [
    (bbox.min.x + bbox.max.x) / 2,
    (bbox.min.y + bbox.max.y) / 2,
    (bbox.min.z + bbox.max.z) / 2,
  ];

  return (
    <mesh position={pos}>
      <primitive object={geo} attach="geometry" />
      <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
    </mesh>
  );
}

// ─── 3D: Object center point ─────────────────────────────────────────────────
function CenterPoint({ pos, color = '#ffffff' }: { pos: Vec3; color?: string }) {
  return (
    <mesh position={[pos.x, pos.y, pos.z]}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

// ─── 3D: Label ───────────────────────────────────────────────────────────────
function ObjectLabel({ pos, text, color = '#ffffff' }: { pos: Vec3; text: string; color?: string }) {
  return (
    <Html position={[pos.x, pos.y + 0.15, pos.z]} center distanceFactor={5}>
      <div style={{
        background: 'rgba(0,0,0,0.75)',
        color,
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        border: `1px solid ${color}44`,
      }}>
        {text}
      </div>
    </Html>
  );
}

// ─── 3D: Relation line between two objects ───────────────────────────────────
function RelationLine({ from, to, color }: { from: Vec3; to: Vec3; color: string }) {
  const points: [number, number, number][] = [
    [from.x, from.y, from.z],
    [to.x, to.y, to.z],
  ];
  return <Line points={points} color={color} lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />;
}

// ─── 3D: Scene overlays ──────────────────────────────────────────────────────
interface OverlayProps {
  analysis: AnalysisData;
  showBBoxes: boolean;
  showLabels: boolean;
  showCenters: boolean;
  showGroupBBoxes: boolean;
  showRelationLines: boolean;
  showHazardColors: boolean;
  selectedObjectId: string | null;
}

function SceneOverlays({
  analysis, showBBoxes, showLabels, showCenters,
  showGroupBBoxes, showRelationLines, showHazardColors, selectedObjectId,
}: OverlayProps) {
  // Map object IDs to group index for coloring
  const objGroupMap = useMemo(() => {
    const map: Record<string, number> = {};
    analysis.groups.forEach((g, idx) => {
      g.members.forEach(id => { map[id] = idx; });
    });
    return map;
  }, [analysis.groups]);

  // Map object IDs to hazard severity
  const objHazardMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const h of analysis.hazards) {
      for (const objId of h.objects) {
        const existing = map[objId];
        if (!existing || h.severity === 'high' || (h.severity === 'medium' && existing === 'low')) {
          map[objId] = h.severity;
        }
      }
    }
    return map;
  }, [analysis.hazards]);

  // Get object center by ID (for relation lines)
  const objCenterMap = useMemo(() => {
    const map: Record<string, Vec3> = {};
    analysis.objects.forEach(o => { map[o.id] = o.center; });
    return map;
  }, [analysis.objects]);

  return (
    <group>
      {/* Object BBoxes */}
      {showBBoxes && analysis.objects.map(obj => {
        let color = '#00ff88';
        if (showHazardColors && objHazardMap[obj.id]) {
          color = SEVERITY_COLORS[objHazardMap[obj.id] as keyof typeof SEVERITY_COLORS];
        } else if (objGroupMap[obj.id] !== undefined) {
          color = getGroupColor(objGroupMap[obj.id]);
        }
        const isSelected = selectedObjectId === obj.id;
        return (
          <BBoxWireframe
            key={obj.id}
            bbox={obj.bbox}
            color={isSelected ? '#ffffff' : color}
            opacity={isSelected ? 1.0 : 0.4}
          />
        );
      })}

      {/* Object labels */}
      {showLabels && analysis.objects.map(obj => {
        const label = obj.classification
          ? `${obj.name} [${obj.classification.label}]`
          : obj.name;
        let color = '#ffffff';
        if (showHazardColors && objHazardMap[obj.id]) {
          color = SEVERITY_COLORS[objHazardMap[obj.id] as keyof typeof SEVERITY_COLORS];
        }
        return <ObjectLabel key={`lbl-${obj.id}`} pos={obj.center} text={label} color={color} />;
      })}

      {/* Object centers */}
      {showCenters && analysis.objects.map(obj => (
        <CenterPoint key={`ctr-${obj.id}`} pos={obj.center} color={
          objGroupMap[obj.id] !== undefined ? getGroupColor(objGroupMap[obj.id]) : '#ffffff'
        } />
      ))}

      {/* Group BBoxes */}
      {showGroupBBoxes && analysis.groups.map((g, idx) => (
        <BBoxWireframe key={`grp-${g.id}`} bbox={g.bbox} color={getGroupColor(idx)} opacity={0.25} />
      ))}

      {/* Relation lines */}
      {showRelationLines && analysis.relations.map((r, idx) => {
        const from = objCenterMap[r.objectA];
        const to = objCenterMap[r.objectB];
        if (!from || !to) return null;
        const color = RELATION_COLORS[r.relation] || '#888';
        return <RelationLine key={`rel-${idx}`} from={from} to={to} color={color} />;
      })}
    </group>
  );
}

// ─── 3D: Scene container ─────────────────────────────────────────────────────
function Scene3D({ modelUrl, analysis, overlays, selectedObjectId }: {
  modelUrl: string | null;
  analysis: AnalysisData | null;
  overlays: OverlayProps;
  selectedObjectId: string | null;
}) {
  return (
    <Canvas
      camera={{ position: [3, 3, 3], fov: 60 }}
      style={{ background: '#0f0f23' }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.0} />
      <directionalLight position={[-3, 2, -3]} intensity={0.3} />

      {modelUrl && <LoadedModel url={modelUrl} />}

      {analysis && (
        <SceneOverlays
          {...overlays}
          analysis={analysis}
          selectedObjectId={selectedObjectId}
        />
      )}

      <OrbitControls makeDefault />
      <gridHelper args={[20, 40, '#1a1a3e', '#1a1a3e']} />

      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport />
      </GizmoHelper>
    </Canvas>
  );
}

// ─── Sidebar: Objects Tab ────────────────────────────────────────────────────
function ObjectsTab({ objects, selectedId, onSelect }: {
  objects: AnalysisObject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="tab-content">
      <div className="tab-header">Objects ({objects.length})</div>
      {objects.map(obj => (
        <div
          key={obj.id}
          className={`item-card ${selectedId === obj.id ? 'selected' : ''}`}
          onClick={() => onSelect(obj.id)}
        >
          <div className="item-name">{obj.name}</div>
          {obj.classification && (
            <div className="item-details">
              <span className={`badge source-${obj.classification.source}`}>
                {obj.classification.source}
              </span>
              <span className="label-text">{obj.classification.label}</span>
              <span className="confidence">{(obj.classification.confidence * 100).toFixed(0)}%</span>
            </div>
          )}
          <div className="item-dims">
            {obj.dimensions.width.toFixed(2)} × {obj.dimensions.height.toFixed(2)} × {obj.dimensions.depth.toFixed(2)}m
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar: Groups Tab ─────────────────────────────────────────────────────
function GroupsTab({ groups, objects }: { groups: ObjectGroup[]; objects: AnalysisObject[] }) {
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    objects.forEach(o => { m[o.id] = o.name; });
    return m;
  }, [objects]);

  return (
    <div className="tab-content">
      <div className="tab-header">Groups ({groups.length})</div>
      {groups.map((g, idx) => (
        <div key={g.id} className="item-card">
          <div className="item-name" style={{ borderLeft: `3px solid ${getGroupColor(idx)}`, paddingLeft: 8 }}>
            {g.name}
          </div>
          <div className="item-details">
            {g.members.length} members
          </div>
          <div className="item-members">
            {g.members.map(id => (
              <span key={id} className="member-chip">{nameMap[id] || id}</span>
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && <div className="empty-state">No groups found</div>}
    </div>
  );
}

// ─── Sidebar: Relations Tab ──────────────────────────────────────────────────
function RelationsTab({ relations, objects, selectedId }: {
  relations: SpatialRelation[];
  objects: AnalysisObject[];
  selectedId: string | null;
}) {
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    objects.forEach(o => { m[o.id] = o.name; });
    return m;
  }, [objects]);

  const filtered = selectedId
    ? relations.filter(r => r.objectA === selectedId || r.objectB === selectedId)
    : relations;

  return (
    <div className="tab-content">
      <div className="tab-header">
        Relations ({filtered.length})
        {selectedId && <span className="filter-badge">filtered</span>}
      </div>
      {filtered.map((r, idx) => (
        <div key={idx} className="item-card">
          <div className="relation-row">
            <span className="obj-name">{nameMap[r.objectA] || r.objectA}</span>
            <span className={`relation-badge relation-${r.relation}`}>
              {r.relation}
            </span>
            <span className="obj-name">{nameMap[r.objectB] || r.objectB}</span>
          </div>
          <div className="item-details">
            conf: {(r.confidence * 100).toFixed(0)}%
            {r.distance !== undefined && ` · dist: ${r.distance.toFixed(2)}m`}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div className="empty-state">No relations found</div>}
    </div>
  );
}

// ─── Sidebar: Hazards Tab ────────────────────────────────────────────────────
function HazardsTab({ hazards, objects, selectedId }: {
  hazards: Hazard[];
  objects: AnalysisObject[];
  selectedId: string | null;
}) {
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    objects.forEach(o => { m[o.id] = o.name; });
    return m;
  }, [objects]);

  const filtered = selectedId
    ? hazards.filter(h => h.objects.includes(selectedId))
    : hazards;

  return (
    <div className="tab-content">
      <div className="tab-header">
        Hazards ({filtered.length})
        {selectedId && <span className="filter-badge">filtered</span>}
      </div>
      {filtered.map((h) => (
        <div key={h.id} className="item-card hazard-card">
          <div className="hazard-header">
            <span className={`severity-badge severity-${h.severity}`}>
              {h.severity.toUpperCase()}
            </span>
            <span className="hazard-type">{h.type.replace(/_/g, ' ')}</span>
          </div>
          <div className="hazard-explanation">{h.explanation}</div>
          <div className="hazard-objects">
            {h.objects.map(id => (
              <span key={id} className="member-chip">{nameMap[id] || id}</span>
            ))}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div className="empty-state">No hazards found</div>}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function TestLab() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'objects' | 'groups' | 'relations' | 'hazards'>('objects');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Overlay toggles
  const [showBBoxes, setShowBBoxes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showCenters, setShowCenters] = useState(false);
  const [showGroupBBoxes, setShowGroupBBoxes] = useState(false);
  const [showRelationLines, setShowRelationLines] = useState(false);
  const [showHazardColors, setShowHazardColors] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload handler ──────────────────────────────────────────────────────
  const handleUpload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSelectedObjectId(null);

    try {
      const formData = new FormData();
      formData.append('model', file);

      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      const { sceneId: sid, filePath } = uploadRes.data;
      setModelUrl(filePath);

      // Fetch analysis data
      const analysisRes = await axios.get(`/api/scene/${sid}/analysis`);
      setAnalysis(analysisRes.data);

    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Drag and drop ───────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      handleUpload(file);
    } else {
      setError('Only .glb / .gltf files are supported');
    }
  }, [handleUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleObjectSelect = useCallback((id: string) => {
    setSelectedObjectId(prev => prev === id ? null : id);
  }, []);

  const overlayProps: OverlayProps = {
    analysis: analysis!,
    showBBoxes,
    showLabels,
    showCenters,
    showGroupBBoxes,
    showRelationLines,
    showHazardColors,
    selectedObjectId,
  };

  return (
    <div className="testlab-root">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="testlab-header">
        <div className="header-left">
          <a href="/" className="back-link">← Return</a>
          <h1>✧ Blueprint Archive ✧</h1>
          <span className="subtitle">Spatial Analysis Matrix</span>
        </div>
        <div className="header-right">
          {analysis && (
            <div className="meta-badges">
              <span className="meta-badge">{analysis.meta.totalObjects} objs</span>
              <span className="meta-badge">{analysis.meta.totalGroups} groups</span>
              <span className="meta-badge">{analysis.meta.totalRelations} rels</span>
              <span className="meta-badge hazard-count">{analysis.meta.totalHazards} hazards</span>
            </div>
          )}
        </div>
      </header>

      <div className="testlab-body">
        {/* ── 3D Viewer ────────────────────────────────────────────────── */}
        <div className="viewer-panel">
          {!modelUrl && !loading && (
            <div
              className="upload-zone"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon">✧</div>
              <p className="upload-text">Place the Architectural Scroll (.glb) here</p>
              <p className="upload-hint">The structure will be analyzed for latent hazards</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
              <p>Parsing & analyzing model...</p>
            </div>
          )}

          {error && (
            <div className="error-banner">
              <span>❌ {error}</span>
              <button onClick={() => { setError(null); setModelUrl(null); }}>Dismiss</button>
            </div>
          )}

          {modelUrl && (
            <Scene3D
              modelUrl={modelUrl}
              analysis={analysis}
              overlays={overlayProps}
              selectedObjectId={selectedObjectId}
            />
          )}

          {/* Overlay toggles */}
          {modelUrl && (
            <div className="overlay-controls">
              <label><input type="checkbox" checked={showBBoxes} onChange={e => setShowBBoxes(e.target.checked)} /> BBoxes</label>
              <label><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Labels</label>
              <label><input type="checkbox" checked={showCenters} onChange={e => setShowCenters(e.target.checked)} /> Centers</label>
              <label><input type="checkbox" checked={showGroupBBoxes} onChange={e => setShowGroupBBoxes(e.target.checked)} /> Group BBox</label>
              <label><input type="checkbox" checked={showRelationLines} onChange={e => setShowRelationLines(e.target.checked)} /> Relations</label>
              <label><input type="checkbox" checked={showHazardColors} onChange={e => setShowHazardColors(e.target.checked)} /> Hazards</label>
            </div>
          )}
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="sidebar-panel">
          <div className="tab-bar">
            {(['objects', 'groups', 'relations', 'hazards'] as const).map(tab => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
                {analysis && (
                  <span className="tab-count">
                    {tab === 'objects' && analysis.objects.length}
                    {tab === 'groups' && analysis.groups.length}
                    {tab === 'relations' && analysis.relations.length}
                    {tab === 'hazards' && analysis.hazards.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="tab-scroll">
            {!analysis && !loading && (
              <div className="empty-state">Upload a model to see analysis</div>
            )}
            {loading && <div className="empty-state">Analyzing...</div>}
            
            {analysis && activeTab === 'objects' && (
              <ObjectsTab objects={analysis.objects} selectedId={selectedObjectId} onSelect={handleObjectSelect} />
            )}
            {analysis && activeTab === 'groups' && (
              <GroupsTab groups={analysis.groups} objects={analysis.objects} />
            )}
            {analysis && activeTab === 'relations' && (
              <RelationsTab relations={analysis.relations} objects={analysis.objects} selectedId={selectedObjectId} />
            )}
            {analysis && activeTab === 'hazards' && (
              <HazardsTab hazards={analysis.hazards} objects={analysis.objects} selectedId={selectedObjectId} />
            )}
          </div>

          {/* Selected object info */}
          {selectedObjectId && analysis && (
            <div className="selected-info-bar">
              <button className="clear-select" onClick={() => setSelectedObjectId(null)}>✕</button>
              <span>Selected: {analysis.objects.find(o => o.id === selectedObjectId)?.name || selectedObjectId}</span>
            </div>
          )}
        </aside>
      </div>

      {/* ── Styles ─────────────────────────────────────────────────────── */}
      <style>{testLabStyles}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const testLabStyles = `
  .testlab-root {
    position: fixed; inset: 0;
    display: flex; flex-direction: column;
    background: #091024;
    color: #f5e6c8;
    font-family: 'Georgia', serif;
    overflow: hidden;
  }

  /* ── Header ────────────────────────────────────────────────────────── */
  .testlab-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 24px;
    background: #0B132B;
    border-bottom: 1px solid rgba(212, 175, 55, 0.4);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    flex-shrink: 0;
    z-index: 10;
  }
  .header-left { display: flex; align-items: baseline; gap: 16px; }
  .back-link {
    color: #D4AF37; text-decoration: none; font-size: 13px; font-weight: 700;
    padding: 4px 8px; border: 1px solid transparent; border-radius: 4px;
    transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.1em;
  }
  .back-link:hover { border-color: #D4AF37; background: rgba(212, 175, 55, 0.1); }
  .testlab-header h1 { font-family: 'Cinzel Decorative', serif; font-size: 22px; font-weight: 700; margin: 0; color: #f5e6c8; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
  .subtitle { color: #A0B0C0; font-size: 12px; font-style: italic; font-family: 'Cormorant Garamond', serif; }
  
  .meta-badges { display: flex; gap: 8px; }
  .meta-badge {
    padding: 4px 10px; border-radius: 4px;
    background: rgba(11, 19, 43, 0.8); font-size: 11px; color: #A0B0C0;
    border: 1px solid rgba(212, 175, 55, 0.3); font-family: 'Georgia', serif;
  }
  .hazard-count { color: #ff4d4d; border-color: #8b0000; background: rgba(139, 0, 0, 0.2); font-weight: 700; }

  /* ── Body ───────────────────────────────────────────────────────────── */
  .testlab-body {
    flex: 1; display: flex; overflow: hidden; position: relative;
  }
  .testlab-body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/assets/images/auth-bg-sky.png');
    background-size: cover;
    background-position: center;
    filter: blur(20px) opacity(0.15) saturate(0.5);
    z-index: 0;
    pointer-events: none;
  }

  /* ── Viewer ─────────────────────────────────────────────────────────── */
  .viewer-panel {
    flex: 1; position: relative; min-width: 0; z-index: 1;
    border-right: 1px solid rgba(212, 175, 55, 0.3);
  }

  .upload-zone {
    position: absolute; inset: 40px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    border: 2px dashed rgba(212, 175, 55, 0.5); border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
    background: rgba(11, 19, 43, 0.6);
    backdrop-filter: blur(4px);
  }
  .upload-zone:hover { border-color: #D4AF37; background: rgba(212, 175, 55, 0.05); }
  .upload-icon { font-size: 64px; color: #D4AF37; margin-bottom: 16px; text-shadow: 0 0 20px rgba(212,175,55,0.5); }
  .upload-text { font-family: 'Cinzel Decorative', serif; font-size: 20px; font-weight: 700; color: #f5e6c8; }
  .upload-hint { font-size: 14px; font-style: italic; color: #A0B0C0; margin-top: 8px; font-family: 'Cormorant Garamond', serif; }

  .loading-overlay {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: rgba(9, 16, 36, 0.85); z-index: 5; backdrop-filter: blur(5px);
  }
  .spinner {
    width: 50px; height: 50px;
    border: 3px solid rgba(212, 175, 55, 0.2); border-top-color: #D4AF37;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-overlay p { margin-top: 16px; color: #D4AF37; font-family: 'Cinzel Decorative', serif; letter-spacing: 0.1em; }

  .error-banner {
    position: absolute; top: 16px; left: 16px; right: 16px; z-index: 10;
    padding: 12px 20px; background: rgba(139, 0, 0, 0.8); border: 1px solid #ff4d4d;
    border-radius: 4px; display: flex; justify-content: space-between; align-items: center;
    backdrop-filter: blur(5px); font-weight: 700;
  }
  .error-banner button {
    background: transparent; border: 1px solid #ff4d4d; color: #fca5a5;
    padding: 6px 12px; border-radius: 4px; cursor: pointer; text-transform: uppercase; font-size: 11px;
  }
  .error-banner button:hover { background: rgba(255, 77, 77, 0.2); }

  .overlay-controls {
    position: absolute; bottom: 16px; left: 16px; z-index: 5;
    display: flex; gap: 8px; flex-wrap: wrap;
    padding: 12px; background: rgba(11, 19, 43, 0.85); border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.4);
    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
  }
  .overlay-controls label {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: #A0B0C0; cursor: pointer;
    padding: 4px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    transition: all 0.2s;
  }
  .overlay-controls label:hover { color: #D4AF37; background: rgba(212, 175, 55, 0.1); }
  .overlay-controls input[type="checkbox"] { accent-color: #D4AF37; width: 14px; height: 14px; }

  /* ── Sidebar ────────────────────────────────────────────────────────── */
  .sidebar-panel {
    width: 380px; display: flex; flex-direction: column;
    background: #0B132B; border-left: 1px solid rgba(212, 175, 55, 0.3);
    flex-shrink: 0; z-index: 2;
  }

  .tab-bar {
    display: flex; border-bottom: 1px solid rgba(212, 175, 55, 0.4);
    flex-shrink: 0; background: #091024;
  }
  .tab-btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 12px 4px; background: transparent; border: none; color: #A0B0C0;
    font-size: 11px; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  .tab-btn:hover { color: #f5e6c8; background: rgba(212, 175, 55, 0.05); }
  .tab-btn.active { color: #D4AF37; border-bottom-color: #D4AF37; background: rgba(212, 175, 55, 0.1); }
  .tab-count {
    padding: 2px 6px; border-radius: 4px; background: rgba(9, 16, 36, 0.8); font-size: 10px; border: 1px solid rgba(212,175,55,0.2);
  }

  .tab-scroll {
    flex: 1; overflow-y: auto; padding: 16px;
  }
  .tab-scroll::-webkit-scrollbar { width: 6px; }
  .tab-scroll::-webkit-scrollbar-track { background: transparent; }
  .tab-scroll::-webkit-scrollbar-thumb { background: rgba(212, 175, 55, 0.3); border-radius: 3px; }
  .tab-scroll::-webkit-scrollbar-thumb:hover { background: rgba(212, 175, 55, 0.6); }

  .tab-header {
    font-family: 'Cinzel Decorative', serif; font-size: 16px; font-weight: 700; color: #D4AF37;
    padding: 0 0 12px; margin-bottom: 12px;
    border-bottom: 1px solid rgba(212, 175, 55, 0.2);
    display: flex; align-items: center; gap: 8px;
  }
  .filter-badge {
    font-size: 9px; padding: 2px 6px; border-radius: 4px;
    background: #D4AF37; color: #091024; font-weight: 800; text-transform: uppercase;
  }

  .item-card {
    padding: 12px; margin-bottom: 8px;
    background: rgba(9, 16, 36, 0.6); border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.15);
    cursor: pointer;
    transition: all 0.2s;
  }
  .item-card:hover { border-color: rgba(212, 175, 55, 0.5); background: rgba(9, 16, 36, 0.9); }
  .item-card.selected { border-color: #D4AF37; background: rgba(212, 175, 55, 0.1); box-shadow: inset 0 0 10px rgba(212,175,55,0.1); }

  .item-name { font-size: 14px; font-weight: 700; color: #f5e6c8; }
  .item-details { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; color: #A0B0C0; }
  .item-dims { font-size: 10px; color: #64748b; margin-top: 6px; font-family: monospace; letter-spacing: 0.05em; }

  .badge {
    padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 800; text-transform: uppercase; border: 1px solid transparent;
  }
  .source-keyword { background: rgba(46, 139, 87, 0.2); color: #8fbc8f; border-color: rgba(46,139,87,0.4); }
  .source-shape { background: rgba(184, 134, 11, 0.2); color: #deb887; border-color: rgba(184,134,11,0.4); }
  .label-text { color: #D4AF37; font-style: italic; font-family: 'Cormorant Garamond', serif; font-size: 13px; }
  .confidence { color: #A0B0C0; font-family: monospace; }

  .item-members { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .member-chip {
    padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;
    background: rgba(9, 16, 36, 0.8); color: #A0B0C0; border: 1px solid rgba(212,175,55,0.2);
  }

  .empty-state {
    text-align: center; padding: 40px 20px; color: #A0B0C0;
    font-size: 13px; font-style: italic; font-family: 'Cormorant Garamond', serif;
  }

  /* ── Relations ──────────────────────────────────────────────────────── */
  .relation-row { display: flex; align-items: center; gap: 8px; }
  .obj-name { font-size: 12px; color: #f5e6c8; font-weight: 700; }
  .relation-badge {
    padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 800; text-transform: uppercase;
  }
  .relation-near { background: rgba(96, 165, 250, 0.2); color: #93c5fd; border: 1px solid #60a5fa; }
  .relation-onTopOf { background: rgba(167, 139, 250, 0.2); color: #c4b5fd; border: 1px solid #a78bfa; }
  .relation-touching { background: rgba(244, 114, 182, 0.2); color: #f9a8d4; border: 1px solid #f472b6; }
  .relation-inside { background: rgba(52, 211, 153, 0.2); color: #6ee7b7; border: 1px solid #34d399; }

  /* ── Hazards ────────────────────────────────────────────────────────── */
  .hazard-card { border-left: 3px solid #ff4d4d; }
  .hazard-header { display: flex; align-items: center; gap: 10px; }
  .severity-badge {
    padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 800; text-transform: uppercase;
  }
  .severity-high { background: rgba(255, 77, 77, 0.2); color: #ffb3b3; border: 1px solid #ff4d4d; }
  .severity-medium { background: rgba(255, 184, 77, 0.2); color: #ffd699; border: 1px solid #ffb84d; }
  .severity-low { background: rgba(77, 255, 77, 0.2); color: #b3ffb3; border: 1px solid #4dff4d; }
  .hazard-type { font-size: 13px; font-weight: 700; color: #f5e6c8; text-transform: capitalize; }
  .hazard-explanation { font-size: 12px; color: #A0B0C0; margin-top: 8px; line-height: 1.5; font-style: italic; }
  .hazard-objects { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }

  /* ── Selected info bar ─────────────────────────────────────────────── */
  .selected-info-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; background: rgba(212, 175, 55, 0.1); border-top: 1px solid #D4AF37;
    font-size: 12px; color: #D4AF37; flex-shrink: 0; font-weight: 700; font-family: 'Georgia', serif;
  }
  .clear-select {
    background: #D4AF37; border: none; color: #091024; cursor: pointer; font-size: 12px; font-weight: 800;
    width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s;
  }
  .clear-select:hover { transform: scale(1.1); }
`;
