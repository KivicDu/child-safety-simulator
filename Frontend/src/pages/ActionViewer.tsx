import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createDriver, type ActionEntry } from '../components/Figuredriver';

// ─── Types ─────────────────────────────────────────────────────────────────
interface ActionDefinition {
  name: string;
  value: string;
  description: string;
  defaultVelocity: number;
}

interface AgeGroupDef {
  id: string;
  label: string;
  height: number;
  actions: ActionDefinition[];
}

// ─── Action Library ───────────────────────────────────────────────────────
const AGE_GROUPS: AgeGroupDef[] = [
  {
    id: 'infant',
    label: 'Infant (6-12m)',
    height: 0.65,
    actions: [
      { name: 'Crawl', value: 'crawl', description: 'Bò trên 4 chi', defaultVelocity: 0.15 },
      { name: 'Stand (từ crawl)', value: 'stand_up', description: 'Đứng dậy từ bò', defaultVelocity: 0 },
      { name: 'Pull to Stand', value: 'pull_to_stand', description: 'Kéo mình lên từ vật dụng', defaultVelocity: 0 },
      { name: 'Reach', value: 'reach', description: 'Mở rộng tay để lấy đồ', defaultVelocity: 0 },
      { name: 'Grab', value: 'grab', description: 'Nắm lấy', defaultVelocity: 0 },
      { name: 'Idle', value: 'idle', description: 'Đứng yên', defaultVelocity: 0 },
    ],
  },
  {
    id: 'early_toddler',
    label: 'Early Toddler (12-18m)',
    height: 0.85,
    actions: [
      { name: 'Walk', value: 'walk', description: 'Đi bộ chậm', defaultVelocity: 0.82 },
      { name: 'Crawl', value: 'crawl', description: 'Bò (khi không đủ không gian)', defaultVelocity: 0.70 },
      { name: 'Run', value: 'run', description: 'Chạy', defaultVelocity: 1.40 },
      { name: 'Fall Forward', value: 'fall_forward', description: 'Té phía trước', defaultVelocity: 0 },
      { name: 'Sitting', value: 'sitting', description: 'Ngồi', defaultVelocity: 0 },
      { name: 'Idle', value: 'idle', description: 'Đứng yên', defaultVelocity: 0 },
    ],
  },
  {
    id: 'late_toddler',
    label: 'Late Toddler (18-36m)',
    height: 1.0,
    actions: [
      { name: 'Walk', value: 'walk', description: 'Đi bộ bình thường', defaultVelocity: 0.95 },
      { name: 'Run', value: 'run', description: 'Chạy nhanh', defaultVelocity: 1.70 },
      { name: 'Crawl', value: 'crawl', description: 'Bò', defaultVelocity: 0.85 },
      { name: 'Climb', value: 'climb', description: 'Trèo', defaultVelocity: 0.5 },
      { name: 'Fall', value: 'falling', description: 'Ngã', defaultVelocity: 0 },
      { name: 'Idle', value: 'idle', description: 'Đứng yên', defaultVelocity: 0 },
    ],
  },
  {
    id: 'preschool',
    label: 'Preschool (3-5y)',
    height: 1.2,
    actions: [
      { name: 'Walk', value: 'walk', description: 'Đi bộ', defaultVelocity: 1.1 },
      { name: 'Run', value: 'run', description: 'Chạy', defaultVelocity: 2.0 },
      { name: 'Climb', value: 'climb', description: 'Trèo', defaultVelocity: 0.6 },
      { name: 'Jump', value: 'jump', description: 'Nhảy', defaultVelocity: 0 },
      { name: 'Idle', value: 'idle', description: 'Đứng yên', defaultVelocity: 0 },
    ],
  },
  {
    id: 'school_age',
    label: 'School Age (6-12y)',
    height: 1.5,
    actions: [
      { name: 'Walk', value: 'walk', description: 'Đi bộ', defaultVelocity: 1.3 },
      { name: 'Run', value: 'run', description: 'Chạy', defaultVelocity: 2.5 },
      { name: 'Sprint', value: 'sprint', description: 'Chạy nước rút', defaultVelocity: 3.2 },
      { name: 'Climb', value: 'climb', description: 'Trèo', defaultVelocity: 0.8 },
      { name: 'Idle', value: 'idle', description: 'Đứng yên', defaultVelocity: 0 },
    ],
  },
];

// ─── Main Component ────────────────────────────────────────────────────────
export default function ActionViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const figureRef = useRef<any>(null);
  const frameRef = useRef(0);
  const animationFrameRef = useRef<number>();

  const [ageGroup, setAgeGroup] = useState('infant');
  const [action, setAction] = useState('crawl');
  const [velocity, setVelocity] = useState(0.15);
  const [isReady, setIsReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('Loading...');
  const lastTimeRef = useRef<number>(Date.now());
  const actionRef = useRef('crawl');
  const velocityRef = useRef(0.15);

  // Get current age group and action definitions
  const currentAgeGroup = AGE_GROUPS.find((ag) => ag.id === ageGroup) || AGE_GROUPS[0];
  const currentAction = currentAgeGroup.actions.find((a) => a.value === action);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.01,
      1000
    );
    camera.position.set(0, 0.6, 1.5);
    camera.lookAt(0, 0.5, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2, 3, 2);
    scene.add(directionalLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(5, 5);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2b4a,
      metalness: 0.1,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(5, 10, 0x444466, 0x222233);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const controls = new OrbitControls(camera, renderer.domElement);
    // Tâm xoay của camera sẽ tập trung vào phần thân trên của nhân vật (~0.5m so với mặt đất)
    controls.target.set(0, 0.5, 0); 
    controls.enableDamping = true;   // Tạo hiệu ứng quán tính mượt mà khi xoay chuột
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Ngăn camera không bị lọt xuống dưới mặt đất
    controls.minDistance = 0.5;      // Giới hạn khoảng cách zoom gần nhất
    controls.maxDistance = 5.0;

    // Initialize procedural figure
    try {
      console.log('[ActionViewer] Creating driver for infant...');
      const driver = createDriver('infant', 1, 0x42a5f5); // agentId=1, color=blue
      console.log('[ActionViewer] Driver created:', driver);
      figureRef.current = driver;
      driver.root.position.y = 0;
      driver.root.position.z = 0;
      driver.root.position.x = 0;
      scene.add(driver.root);
      console.log('[ActionViewer] Figure added to scene');
      setIsReady(true);
      setDebugInfo('✓ Ready - Select action to begin');
    } catch (err) {
      console.error('[ActionViewer] Failed to create figure:', err);
      setDebugInfo(`✗ Error: ${String(err)}`);
    }

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Render loop with figure updates
    const render = () => {
      frameRef.current++;
      
      controls.update();

      // Update figure if ready
      if (figureRef.current && isReady) {
        const now = Date.now();
        const dt = Math.min((now - lastTimeRef.current) / 1000, 0.033); // Cap at 33ms
        lastTimeRef.current = now;
        
        const entry: ActionEntry = {
          a: actionRef.current,
          v: velocityRef.current,
        };
        figureRef.current.update(dt, entry);
      }
      
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(render);
    };
    lastTimeRef.current = Date.now();
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      controls.dispose();
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Update figure when action/velocity changes
  useEffect(() => {
    actionRef.current = action;
    velocityRef.current = velocity;
  }, [action, velocity]);

  // Update debug info periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isReady && currentAction) {
        setDebugInfo(
          `✓ Age: ${currentAgeGroup.label} | ` +
            `Action: ${currentAction.name} | ` +
            `Velocity: ${velocityRef.current.toFixed(2)} m/s | ` +
            `Frame: ${frameRef.current}`
        );
      }
    }, 100); // Update debug info 10 times per second
    return () => clearInterval(interval);
  }, [isReady, currentAgeGroup, currentAction]);

  // Handle age group change
  const handleAgeGroupChange = (newAgeGroup: string) => {
    setAgeGroup(newAgeGroup);
    const firstAction = AGE_GROUPS.find((ag) => ag.id === newAgeGroup)?.actions[0];
    if (firstAction) {
      setAction(firstAction.value);
      setVelocity(firstAction.defaultVelocity);
    }
  };

  // Handle action change
  const handleActionChange = (newAction: string) => {
    setAction(newAction);
    const actionDef = currentAgeGroup.actions.find((a) => a.value === newAction);
    if (actionDef) {
      setVelocity(actionDef.defaultVelocity);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: '#060d1e',
        fontFamily: 'sans-serif',
        color: '#e0e0e0',
      }}
    >
      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          background: 'linear-gradient(135deg, #0a0f1d 0%, #0f1628 100%)',
        }}
      />

      {/* Control Panel */}
      <div
        style={{
          width: 350,
          padding: 24,
          background: '#0b132b',
          overflowY: 'auto',
          borderLeft: '1px solid #1a2b4a',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 16px 0', fontSize: 20, color: '#d4af37' }}>
            🎭 Action Viewer
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#7a8fa8' }}>
            Xem trực tiếp các hành động của nhân vật
          </p>
        </div>

        {/* Status */}
        <div
          style={{
            padding: 12,
            background: '#0f1628',
            border: `1px solid ${isReady ? '#78dcd2' : '#e53e3e'}`,
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'monospace',
            color: isReady ? '#78dcd2' : '#e53e3e',
            wordBreak: 'break-all',
          }}
        >
          {debugInfo}
        </div>

        {/* Age Group Selector */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#ffe4a0' }}>
            👶 Độ tuổi
          </label>
          <select
            value={ageGroup}
            onChange={(e) => handleAgeGroupChange(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              background: '#1a2b4a',
              border: '1px solid #2a4b6a',
              borderRadius: 4,
              color: '#e0e0e0',
              cursor: 'pointer',
            }}
          >
            {AGE_GROUPS.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Selector */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#ffe4a0' }}>
            🎬 Hành động
          </label>
          <select
            value={action}
            onChange={(e) => handleActionChange(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              background: '#1a2b4a',
              border: '1px solid #2a4b6a',
              borderRadius: 4,
              color: '#e0e0e0',
              cursor: 'pointer',
            }}
          >
            {currentAgeGroup.actions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.name}
              </option>
            ))}
          </select>
          {currentAction && (
            <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#7a8fa8' }}>
              {currentAction.description}
            </p>
          )}
        </div>

        {/* Velocity Slider */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#ffe4a0' }}>
            💨 Vận tốc: {velocity.toFixed(2)} m/s
          </label>
          <input
            type="range"
            min="0"
            max="3.5"
            step="0.05"
            value={velocity}
            onChange={(e) => setVelocity(parseFloat(e.target.value))}
            style={{
              width: '100%',
              cursor: 'pointer',
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginTop: 12,
              fontSize: 11,
            }}
          >
            <button
              onClick={() => setVelocity(0)}
              style={{
                padding: 6,
                background: '#1a2b4a',
                border: '1px solid #2a4b6a',
                borderRadius: 4,
                color: '#e0e0e0',
                cursor: 'pointer',
              }}
            >
              ■ Dừng
            </button>
            <button
              onClick={() => setVelocity(currentAction?.defaultVelocity || 0.5)}
              style={{
                padding: 6,
                background: '#1a2b4a',
                border: '1px solid #2a4b6a',
                borderRadius: 4,
                color: '#e0e0e0',
                cursor: 'pointer',
              }}
            >
              ⟳ Reset
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ borderTop: '1px solid #1a2b4a', paddingTop: 16 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 12, color: '#ffe4a0' }}>
            📖 Hành động chính
          </h3>
          <div style={{ fontSize: 11, color: '#7a8fa8', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><strong>crawl</strong> - Bò (infant)</div>
            <div><strong>walk</strong> - Đi bộ</div>
            <div><strong>run</strong> - Chạy</div>
            <div><strong>fall_forward</strong> - Té phía trước</div>
            <div><strong>grab</strong> - Nắm lấy</div>
            <div><strong>reach</strong> - Mở rộng tay</div>
            <div><strong>idle</strong> - Đứng yên</div>
          </div>
        </div>

        {/* Help */}
        <div style={{ fontSize: 10, color: '#5a6fa8', lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            💡 Tip: Chọn một hành động rồi điều chỉnh vận tốc để thấy animation thay đổi. Vận tốc cao
            hơn = chuyển động nhanh hơn.
          </p>
        </div>
      </div>
    </div>
  );
}
