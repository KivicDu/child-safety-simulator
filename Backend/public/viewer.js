import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import cacheManager from './cacheManager.js';
import SurfaceHeatmap3D from './surfaceHeatmap3d.js'; // 🔥 NEW IMPORT

// ============================================================================
// GLOBAL STATE
// ============================================================================
const state = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  currentSceneId: null,
  currentAgeGroup: 'toddler',
  currentSimulation: null,
  loadedModel: null,
  agents: [],
  heatmapMesh: null, // ⚠️ DEPRECATED - will be removed
  hotspotMarkers: [],
  sceneMetadata: null,
  heatmap3D: null, // 🔥 NEW: 3D Vertex Color Heatmap
  heatmapEnabled: false, // 🔥 NEW: Track heatmap state
  playbackState: {
    isPlaying: false,
    currentFrame: 0,
    totalFrames: 0,
    speed: 1.0
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function initThreeJS() {
  const canvas = document.getElementById('canvas3d');
  const viewer = document.getElementById('viewer');

  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x0a0a0a);
  state.scene.fog = new THREE.Fog(0x0a0a0a, 20, 50);

  const aspect = viewer.clientWidth / viewer.clientHeight;
  state.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  state.camera.position.set(8, 8, 8);
  state.camera.lookAt(0, 0, 0);

  state.renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true,
    alpha: true 
  });
  state.renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  state.scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  state.scene.add(dirLight);

  const gridHelper = new THREE.GridHelper(20, 20, 0x00d4ff, 0x444444);
  state.scene.add(gridHelper);

  state.controls = new OrbitControls(state.camera, canvas);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.05;
  state.controls.maxPolarAngle = Math.PI / 2.1;
  state.controls.minDistance = 2;
  state.controls.maxDistance = 30;

  window.addEventListener('resize', onWindowResize);
  animate();

  console.log('✅ Three.js initialized');
}

function onWindowResize() {
  const viewer = document.getElementById('viewer');
  const aspect = viewer.clientWidth / viewer.clientHeight;
  
  state.camera.aspect = aspect;
  state.camera.updateProjectionMatrix();
  
  state.renderer.setSize(viewer.clientWidth, viewer.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  
  if (state.controls) {
    state.controls.update();
  }

  if (state.playbackState.isPlaying) {
    updatePlayback();
  }
  
  state.hotspotMarkers.forEach(marker => {
    if (marker.userData.update) {
      marker.userData.update();
    }
  });
  
  state.renderer.render(state.scene, state.camera);
}

// ============================================================================
// SCENE LOADING
// ============================================================================

async function loadGLBModel(sceneId, filePath) {
  showStatus('Loading 3D model...', 'info');

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    
    loader.load(
      filePath,
      (gltf) => {
        if (state.loadedModel) {
          state.scene.remove(state.loadedModel);
          state.loadedModel.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        }

        state.loadedModel = gltf.scene;
        
        state.loadedModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        state.scene.add(state.loadedModel);
        state.currentSceneId = sceneId;

        const box = new THREE.Box3().setFromObject(state.loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = state.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;

        state.camera.position.set(
          center.x + cameraZ * 0.5,
          center.y + cameraZ * 0.8,
          center.z + cameraZ * 0.5
        );
        state.camera.lookAt(center);
        state.controls.target.copy(center);

        // 🔥 NEW: Initialize 3D Surface Heatmap after model loads
        initializeHeatmap3D();

        showStatus('3D model loaded successfully', 'success');
        resolve(gltf.scene);
      },
      (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        updateLoadingProgress(percent);
      },
      (error) => {
        console.error('GLB load error:', error);
        showStatus('Failed to load 3D model', 'error');
        reject(error);
      }
    );
  });
}

// 🔥 NEW: Initialize 3D Surface Heatmap
function initializeHeatmap3D() {
  console.log('🔥 Initializing 3D Surface Heatmap...');
  
  if (!state.scene || !state.sceneMetadata) {
    console.warn('⚠️  Cannot initialize heatmap: missing scene or metadata');
    return;
  }

  try {
    state.heatmap3D = new SurfaceHeatmap3D(state.scene, state.sceneMetadata);
    
    // Optional: Configure heatmap settings
    state.heatmap3D.setConfig({
      maxInfluenceDistance: 2.0,
      falloffSigma: 0.5,
      colorScheme: 'RISK', // Use 3-tier risk colors
      minHeatThreshold: 0.05
    });

    console.log('✅ 3D Surface Heatmap ready');
  } catch (error) {
    console.error('❌ Failed to initialize heatmap:', error);
  }
}

// 🔥 NEW: Apply heatmap to meshes
function applyHeatmap3D(collisionEvents) {
  if (!state.heatmap3D) {
    console.warn('⚠️  Heatmap not initialized');
    return;
  }

  if (!collisionEvents || collisionEvents.length === 0) {
    console.warn('⚠️  No collision events to visualize');
    return;
  }

  console.log(`🔥 Applying 3D heatmap to ${collisionEvents.length} collision events...`);
  
  try {
    state.heatmap3D.applyHeatmapToMeshes(collisionEvents);
    state.heatmapEnabled = true;
    
    // Log stats
    const stats = state.heatmap3D.getStats();
    console.log('📊 Heatmap Stats:', stats);
    
  } catch (error) {
    console.error('❌ Failed to apply heatmap:', error);
  }
}

// 🔥 NEW: Clear heatmap
function clearHeatmap3D() {
  if (!state.heatmap3D) return;
  
  console.log('🧹 Clearing 3D heatmap...');
  state.heatmap3D.clearHeatmap();
  state.heatmapEnabled = false;
}

// 🔥 NEW: Toggle heatmap on/off
function toggleHeatmap3D() {
  if (!state.heatmap3D) {
    console.warn('⚠️  Heatmap not initialized');
    return;
  }

  if (!state.currentSimulation || !state.currentSimulation.collisionEvents) {
    showStatus('No simulation data available', 'warning');
    return;
  }

  if (state.heatmapEnabled) {
    clearHeatmap3D();
    showStatus('Heatmap hidden', 'info');
  } else {
    applyHeatmap3D(state.currentSimulation.collisionEvents);
    showStatus('Heatmap shown', 'success');
  }
}

// ============================================================================
// AGE GROUP CONTROLS
// ============================================================================

function setupAgeGroupControls() {
  const ageSelect = document.getElementById('ageGroup');
  
  ageSelect.addEventListener('change', async (e) => {
    const newAgeGroup = e.target.value;
    console.log(`🔄 Age group changed to: ${newAgeGroup}`);
    
    if (!state.currentSceneId) {
      showStatus('Please upload a scene first', 'warning');
      return;
    }

    state.currentAgeGroup = newAgeGroup;

    const cached = cacheManager.getCachedSimulation(
      state.currentSceneId, 
      newAgeGroup
    );

    if (cached) {
      console.log(`📦 Using cached simulation for ${newAgeGroup}`);
      showStatus(`Switching to ${newAgeGroup} (cached)`, 'info');
      loadSimulationResults(cached);
      updateHeatmap(cached); // Old heatmap
      
      // 🔥 NEW: Apply 3D heatmap if enabled
      if (state.heatmapEnabled) {
        applyHeatmap3D(cached.collisionEvents);
      }
    } else {
      console.log(`🔄 No cache found, running new simulation for ${newAgeGroup}`);
      showStatus(`Running simulation for ${newAgeGroup}...`, 'info');
      
      const agentCount = parseInt(document.getElementById('agentCount').value) || 10;
      const duration = parseInt(document.getElementById('duration').value) || 10;
      
      await runSimulation(state.currentSceneId, newAgeGroup, agentCount, duration);
    }
  });

  console.log('✅ Age group controls initialized');
}

// ============================================================================
// SIMULATION
// ============================================================================

async function runSimulation(sceneId, ageGroupId, agentCount, duration) {
  showLoading(`Running simulation for ${ageGroupId}...`);
  updateLoadingProgress(10);

  try {
    const response = await fetch('/api/simulate/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sceneId,
        ageGroupId,
        agentCount,
        duration
      })
    });

    if (!response.ok) {
      throw new Error(`Simulation failed: ${response.status}`);
    }

    const data = await response.json();
    const simulationId = data.simulationId;

    updateLoadingProgress(30);

    const result = await pollSimulationStatus(simulationId);
    
    updateLoadingProgress(80);

    loadSimulationResults(result);
    
    updateLoadingProgress(90);

    updateHeatmap(result); // Old heatmap (2D plane)
    
    // 🔥 NEW: Auto-apply 3D heatmap after simulation
    if (result.collisionEvents && result.collisionEvents.length > 0) {
      console.log('🔥 Auto-applying 3D surface heatmap...');
      applyHeatmap3D(result.collisionEvents);
    }

    updateLoadingProgress(100);
    hideLoading();
    
    showStatus('Simulation complete!', 'success');

  } catch (error) {
    console.error('Simulation error:', error);
    hideLoading();
    showStatus(`Simulation failed: ${error.message}`, 'error');
  }
}

async function pollSimulationStatus(simulationId, maxAttempts = 60) {
  const pollInterval = 1000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`/api/simulate/${simulationId}/status`);
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'complete') {
        console.log('✅ Simulation complete');
        return data;
      } else if (data.status === 'error') {
        throw new Error(data.error || 'Simulation error');
      }

      const progress = Math.min(30 + (attempts / maxAttempts) * 50, 80);
      updateLoadingProgress(progress);

      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;

    } catch (error) {
      console.error('Poll error:', error);
      throw error;
    }
  }

  throw new Error('Simulation timeout');
}

function loadSimulationResults(simulationData) {
  state.currentSimulation = simulationData;

  const totalCollisions = simulationData.collisionEvents?.length || 0;
  const summary = simulationData.summary || {};

  document.getElementById('totalCollisions').textContent = totalCollisions;
  
  const uniqueAgents = new Set(
    simulationData.collisionEvents?.map(e => e.agentId) || []
  );
  document.getElementById('agentsInvolved').textContent = uniqueAgents.size;

  const uniqueObjects = new Set(
    simulationData.collisionEvents?.map(e => e.objectId) || []
  );
  document.getElementById('objectsHit').textContent = uniqueObjects.size;

  document.getElementById('simulationResults').style.display = 'block';

  // Load agent trajectories for playback
  loadAgentTrajectories(simulationData.trajectories || []);

  console.log('✅ Simulation results loaded');
}

function loadAgentTrajectories(trajectories) {
  // Clear old agents
  state.agents.forEach(agent => {
    state.scene.remove(agent.mesh);
    agent.mesh.geometry.dispose();
    agent.mesh.material.dispose();
  });
  state.agents = [];

  if (!trajectories || trajectories.length === 0) {
    console.warn('No trajectories to load');
    return;
  }

  const ageConfig = getAgeGroupConfig(state.currentAgeGroup);
  
  trajectories.forEach((traj, index) => {
    if (!traj.positions || traj.positions.length === 0) return;

    const geometry = new THREE.CapsuleGeometry(
      ageConfig.capsuleRadius, 
      ageConfig.height, 
      8, 
      16
    );
    const material = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      metalness: 0.3,
      roughness: 0.7
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const startPos = traj.positions[0];
    mesh.position.set(startPos[0], startPos[1], startPos[2]);

    state.scene.add(mesh);

    state.agents.push({
      id: traj.agentId,
      mesh: mesh,
      trajectory: traj.positions,
      currentIndex: 0
    });
  });

  state.playbackState.totalFrames = Math.max(
    ...trajectories.map(t => t.positions?.length || 0)
  );
  state.playbackState.currentFrame = 0;

  console.log(`✅ Loaded ${state.agents.length} agents for playback`);
}

function updatePlayback() {
  const { currentFrame, totalFrames, speed } = state.playbackState;

  if (currentFrame >= totalFrames - 1) {
    state.playbackState.isPlaying = false;
    state.playbackState.currentFrame = 0;
    document.getElementById('playbackBtn').textContent = '▶️ Play Simulation';
    return;
  }

  state.agents.forEach(agent => {
    if (agent.currentIndex < agent.trajectory.length - 1) {
      agent.currentIndex += speed;
      const index = Math.floor(agent.currentIndex);
      
      if (index < agent.trajectory.length) {
        const pos = agent.trajectory[index];
        agent.mesh.position.set(pos[0], pos[1], pos[2]);
      }
    }
  });

  state.playbackState.currentFrame += speed;

  const time = (currentFrame / 60).toFixed(1);
  const activeAgents = state.agents.filter(a => 
    a.currentIndex < a.trajectory.length - 1
  ).length;

  document.getElementById('playbackTime').textContent = time;
  document.getElementById('activeAgents').textContent = activeAgents;
}

// ⚠️ DEPRECATED: Old 2D heatmap (keep for backwards compatibility)
function updateHeatmap(simulationData) {
  if (state.heatmapMesh) {
    state.scene.remove(state.heatmapMesh);
    state.heatmapMesh.geometry.dispose();
    state.heatmapMesh.material.dispose();
    state.heatmapMesh = null;
  }

  state.hotspotMarkers.forEach(marker => {
    state.scene.remove(marker);
    marker.geometry.dispose();
    marker.material.dispose();
  });
  state.hotspotMarkers = [];

  if (!simulationData || !simulationData.collisionEvents) {
    console.warn('No collision data for heatmap');
    return;
  }

  const heatmap = generateHeatmapData(simulationData.collisionEvents);
  
  if (heatmap) {
    state.heatmapMesh = heatmap.mesh;
    state.scene.add(state.heatmapMesh);
    displayHotspotMarkers(heatmap.hotspots);
    
    console.log('✅ 2D Heatmap created (legacy)');
  }
}

function generateHeatmapData(collisionEvents) {
  if (!collisionEvents || collisionEvents.length === 0) {
    return null;
  }

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let floorY = 0;

  collisionEvents.forEach(event => {
    const pos = event.position;
    minX = Math.min(minX, pos[0]);
    maxX = Math.max(maxX, pos[0]);
    minZ = Math.min(minZ, pos[2]);
    maxZ = Math.max(maxZ, pos[2]);
    floorY = Math.min(floorY, pos[1]);
  });

  const padding = 1.0;
  minX -= padding; maxX += padding;
  minZ -= padding; maxZ += padding;

  const width = maxX - minX;
  const height = maxZ - minZ;

  const resolution = 128;
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');

  const grid = Array(resolution).fill(0).map(() => Array(resolution).fill(0));

  collisionEvents.forEach(event => {
    const pos = event.position;
    const injury = event.injury || {};
    const score = injury.injuryScore || 0;

    const gridX = Math.floor((pos[0] - minX) / width * (resolution - 1));
    const gridZ = Math.floor((pos[2] - minZ) / height * (resolution - 1));

    if (gridX >= 0 && gridX < resolution && gridZ >= 0 && gridZ < resolution) {
      grid[gridZ][gridX] += score;
    }
  });

  let maxValue = 0;
  grid.forEach(row => {
    row.forEach(val => {
      maxValue = Math.max(maxValue, val);
    });
  });

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const value = grid[y][x];
      const normalized = maxValue > 0 ? value / maxValue : 0;
      
      const color = getHeatColor(normalized);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(minX + width / 2, floorY + 0.01, minZ + height / 2);

  const hotspots = findHotspots(collisionEvents, 5);

  return { mesh, hotspots };
}

function getHeatColor(value) {
  if (value === 0) return 'rgba(0, 0, 0, 0)';
  
  if (value < 0.2) return `rgba(34, 197, 94, ${0.3 + value * 0.5})`;
  if (value < 0.4) return `rgba(234, 179, 8, ${0.4 + value * 0.4})`;
  if (value < 0.7) return `rgba(249, 115, 22, ${0.5 + value * 0.3})`;
  if (value < 0.9) return `rgba(239, 68, 68, ${0.6 + value * 0.3})`;
  return `rgba(127, 29, 29, ${0.7 + value * 0.3})`;
}

function findHotspots(collisionEvents, topN = 5) {
  const hotspots = {};

  collisionEvents.forEach(event => {
    const key = `${event.objectId}`;
    
    if (!hotspots[key]) {
      hotspots[key] = {
        objectId: event.objectId,
        objectName: event.objectName,
        position: [...event.position],
        count: 0,
        totalRisk: 0
      };
    }

    hotspots[key].count++;
    hotspots[key].totalRisk += (event.injury?.injuryScore || 0);
  });

  const sorted = Object.values(hotspots)
    .map(h => ({
      ...h,
      riskScore: h.totalRisk / h.count
    }))
    .sort((a, b) => b.totalRisk - a.totalRisk)
    .slice(0, topN);

  return sorted;
}

function displayHotspotMarkers(hotspots) {
  console.log(`📍 Creating ${hotspots.length} hotspot markers...`);

  hotspots.forEach((hotspot, index) => {
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const color = hotspot.riskScore > 70 ? 0x7f1d1d :
                  hotspot.riskScore > 45 ? 0xef4444 :
                  hotspot.riskScore > 20 ? 0xf97316 :
                  0xeab308;
    
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8
    });

    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(
      hotspot.position[0],
      hotspot.position[1] + 0.5,
      hotspot.position[2]
    );

    console.log(`  Marker ${index + 1}: (${marker.position.x.toFixed(2)}, ${marker.position.y.toFixed(2)}, ${marker.position.z.toFixed(2)}) risk=${hotspot.riskScore}`);

    state.scene.add(marker);
    state.hotspotMarkers.push(marker);

    const baseScale = 1;
    const pulse = () => {
      const scale = baseScale + 0.4 * Math.sin(Date.now() * 0.004);
      marker.scale.setScalar(scale);
    };
    marker.userData.update = pulse;
  });

  console.log(`✅ Displayed ${hotspots.length} hotspot markers`);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventHandlers() {
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');

  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      showStatus('Please select a file', 'warning');
      return;
    }

    await uploadAndProcessGLB(file);
  });

  const runSimBtn = document.getElementById('runSimBtn');
  runSimBtn.addEventListener('click', async () => {
    if (!state.currentSceneId) {
      showStatus('Please upload a scene first', 'warning');
      return;
    }

    const agentCount = parseInt(document.getElementById('agentCount').value);
    const duration = parseInt(document.getElementById('duration').value);
    const ageGroupId = document.getElementById('ageGroup').value;

    await runSimulation(state.currentSceneId, ageGroupId, agentCount, duration);
  });

  const playbackBtn = document.getElementById('playbackBtn');
  playbackBtn.addEventListener('click', () => {
    state.playbackState.isPlaying = !state.playbackState.isPlaying;
    
    if (state.playbackState.isPlaying) {
      playbackBtn.textContent = '⏸️ Pause Simulation';
      document.getElementById('playbackInfo').style.display = 'block';
    } else {
      playbackBtn.textContent = '▶️ Play Simulation';
    }
  });

  const showEventsBtn = document.getElementById('showEventsBtn');
  showEventsBtn.addEventListener('click', () => {
    displayCollisionEventsTable();
  });

  const toggleHeatmapBtn = document.getElementById('toggleHeatmapBtn');
  toggleHeatmapBtn.addEventListener('click', () => {
    // 🔥 UPDATED: Toggle 3D heatmap instead of old 2D heatmap
    toggleHeatmap3D();
    
    // Update button text
    toggleHeatmapBtn.textContent = state.heatmapEnabled 
      ? '🗺️ Hide Heatmap' 
      : '🗺️ Show Heatmap';
    
    // Show/hide heatmap info
    const heatmapInfo = document.getElementById('heatmapInfo');
    heatmapInfo.style.display = state.heatmapEnabled ? 'block' : 'none';
  });

  setupAgeGroupControls();

  console.log('✅ Event handlers initialized');
}

async function uploadAndProcessGLB(file) {
  showLoading('Uploading and processing GLB...');
  updateLoadingProgress(10);

  const formData = new FormData();
  formData.append('model', file);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    updateLoadingProgress(40);

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const data = await response.json();
    
    updateLoadingProgress(60);

    state.sceneMetadata = data.scene;

    await loadGLBModel(data.sceneId, data.filePath);

    updateLoadingProgress(80);

    displaySceneInfo(data.scene);

    document.getElementById('simulationControls').style.display = 'block';

    updateLoadingProgress(100);
    hideLoading();

  } catch (error) {
    console.error('Upload error:', error);
    hideLoading();
    showStatus(`Upload failed: ${error.message}`, 'error');
  }
}

function displaySceneInfo(sceneData) {
  const sceneInfo = document.getElementById('sceneInfo');
  const sceneDataPre = document.getElementById('sceneData');

  const info = {
    objects: sceneData.objects.length,
    boundingBox: sceneData.boundingBox,
    floor: sceneData.floor
  };

  sceneDataPre.textContent = JSON.stringify(info, null, 2);
  sceneInfo.style.display = 'block';
}

function displayCollisionEventsTable() {
  if (!state.currentSimulation || !state.currentSimulation.collisionEvents) {
    showStatus('No collision data available', 'warning');
    return;
  }

  const events = state.currentSimulation.collisionEvents;
  const eventsSection = document.getElementById('eventsSection');
  const eventsTable = document.getElementById('eventsTable');

  let tableHTML = `
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Agent</th>
          <th>Object</th>
          <th>Velocity</th>
          <th>Body Part</th>
          <th>Injury Score</th>
          <th>Risk Tier</th>
        </tr>
      </thead>
      <tbody>
  `;

  events.forEach(event => {
    const injury = event.injury || {};
    const riskClass = `risk-${(injury.riskTier || 'safe').toLowerCase()}`;
    
    tableHTML += `
      <tr>
        <td>${event.time?.toFixed(2)}s</td>
        <td>${event.agentId}</td>
        <td>${event.objectName || event.objectId}</td>
        <td>${event.velocity?.toFixed(2)} m/s</td>
        <td>${injury.bodyPart || 'N/A'}</td>
        <td>${injury.injuryScore || 0}</td>
        <td class="${riskClass}">${injury.riskTier || 'safe'}</td>
      </tr>
    `;
  });

  tableHTML += `
      </tbody>
    </table>
  `;

  eventsTable.innerHTML = tableHTML;
  eventsSection.style.display = 'block';
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showLoading(text = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  
  loadingText.textContent = text;
  overlay.style.display = 'flex';
  updateLoadingProgress(0);
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = 'none';
}

function updateLoadingProgress(percent) {
  const progressBar = document.getElementById('loadingProgressBar');
  progressBar.style.width = `${percent}%`;
}

function updateLoadingText(text) {
  const loadingText = document.getElementById('loadingText');
  loadingText.textContent = text;
}

function showStatus(message, type = 'info') {
  const status = document.getElementById('status');
  
  status.textContent = message;
  status.className = type;
  status.style.display = 'block';

  setTimeout(() => {
    status.style.display = 'none';
  }, 5000);
}

// ============================================================================
// UTILITY
// ============================================================================

function getAgeGroupConfig(ageGroupId) {
  const configs = {
    infant: { height: 0.7, capsuleRadius: 0.25 },
    toddler: { height: 0.9, capsuleRadius: 0.25 },
    preschool: { height: 1.1, capsuleRadius: 0.28 },
    school: { height: 1.3, capsuleRadius: 0.30 },
    preteen: { height: 1.5, capsuleRadius: 0.32 }
  };

  return configs[ageGroupId] || configs.toddler;
}

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Viewer initializing...');
  
  initThreeJS();
  setupEventHandlers();
  
  console.log('✅ Viewer ready!');
});