import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import cacheManager from './cacheManager.js';

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
  heatmapMesh: null,
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

/**
 * Initialize Three.js scene
 */
function initThreeJS() {
  const canvas = document.getElementById('canvas3d');
  const viewer = document.getElementById('viewer');

  // Scene
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x0a0a0a);
  state.scene.fog = new THREE.Fog(0x0a0a0a, 20, 50);

  // Camera
  const aspect = viewer.clientWidth / viewer.clientHeight;
  state.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  state.camera.position.set(8, 8, 8);
  state.camera.lookAt(0, 0, 0);

  // Renderer
  state.renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true,
    alpha: true 
  });
  state.renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lights
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

  // Grid helper
  const gridHelper = new THREE.GridHelper(20, 20, 0x00d4ff, 0x444444);
  state.scene.add(gridHelper);

  // Controls
  state.controls = new OrbitControls(state.camera, canvas);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.05;
  state.controls.maxPolarAngle = Math.PI / 2.1; // Don't go below floor
  state.controls.minDistance = 2;
  state.controls.maxDistance = 30;

  // Handle resize
  window.addEventListener('resize', onWindowResize);

  // Start animation loop
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

  // Update playback if playing
  if (state.playbackState.isPlaying) {
    updatePlayback();
  }
  
  state.renderer.render(state.scene, state.camera);
}

// ============================================================================
// SCENE LOADING
// ============================================================================

/**
 * Load GLB model into scene
 */
async function loadGLBModel(sceneId, filePath) {
  showStatus('Loading 3D model...', 'info');

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    
    loader.load(
      filePath,
      (gltf) => {
        // Remove old model
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
        
        // Enable shadows
        state.loadedModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        state.scene.add(state.loadedModel);
        state.currentSceneId = sceneId;

        // Center camera on model
        const box = new THREE.Box3().setFromObject(state.loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = state.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add margin

        state.camera.position.set(
          center.x + cameraZ * 0.5,
          center.y + cameraZ * 0.8,
          center.z + cameraZ * 0.5
        );
        state.camera.lookAt(center);
        state.controls.target.copy(center);

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

// ============================================================================
// AGE GROUP SLIDER & DYNAMIC UPDATE
// ============================================================================

/**
 * Setup age group change handler - DAY 20 CRITICAL FEATURE
 */
function setupAgeGroupControls() {
  const ageSelect = document.getElementById('ageGroup');
  
  ageSelect.addEventListener('change', async (e) => {
    const newAgeGroup = e.target.value;
    console.log(`🔄 Age group changed to: ${newAgeGroup}`);
    
    if (!state.currentSceneId) {
      showStatus('Please upload a scene first', 'warning');
      return;
    }

    // Update state
    state.currentAgeGroup = newAgeGroup;

    // Check if we have cached simulation for this age group
    const cached = cacheManager.getCachedSimulation(
      state.currentSceneId, 
      newAgeGroup
    );

    if (cached) {
      console.log(`📦 Using cached simulation for ${newAgeGroup}`);
      showStatus(`Switching to ${newAgeGroup} (cached)`, 'info');
      loadSimulationResults(cached);
      updateHeatmap(cached);
    } else {
      console.log(`🔄 No cache found, running new simulation for ${newAgeGroup}`);
      showStatus(`Running simulation for ${newAgeGroup}...`, 'info');
      
      // Get current simulation parameters
      const agentCount = parseInt(document.getElementById('agentCount').value) || 10;
      const duration = parseInt(document.getElementById('duration').value) || 10;
      
      await runSimulation(state.currentSceneId, newAgeGroup, agentCount, duration);
    }
  });

  console.log('✅ Age group controls initialized');
}

// ============================================================================
// SIMULATION EXECUTION
// ============================================================================

/**
 * Run simulation for specific age group
 */
async function runSimulation(sceneId, ageGroupId, agentCount, duration) {
  showLoading(`Running simulation for ${ageGroupId}...`);
  updateLoadingProgress(10);

  try {
    // Start simulation
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

    // Poll for completion
    const result = await pollSimulationStatus(simulationId);
    
    updateLoadingProgress(80);

    // Load results
    loadSimulationResults(result);
    
    // Generate and display heatmap
    await loadAndDisplayHeatmap(simulationId);

    updateLoadingProgress(100);
    hideLoading();

    showStatus('Simulation completed successfully!', 'success');

  } catch (error) {
    console.error('Simulation error:', error);
    hideLoading();
    showStatus(`Simulation failed: ${error.message}`, 'error');
  }
}

/**
 * Poll simulation status until complete
 */
async function pollSimulationStatus(simulationId, maxWait = 120000) {
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second

  while (Date.now() - startTime < maxWait) {
    const response = await fetch(`/api/simulate/${simulationId}/status`);
    
    if (!response.ok) {
      throw new Error('Failed to check simulation status');
    }

    const data = await response.json();

    if (data.status === 'completed') {
      return data;
    } else if (data.status === 'failed') {
      throw new Error(data.error || 'Simulation failed');
    }

    // Update progress
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    updateLoadingText(`Simulating... ${elapsed}s`);

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Simulation timeout');
}

// ============================================================================
// RESULTS VISUALIZATION
// ============================================================================

/**
 * Load and display simulation results
 */
function loadSimulationResults(simData) {
  console.log('📊 Loading simulation results...');
  
  state.currentSimulation = simData;

  // Update summary cards
  updateSummaryCards(simData);

  // Setup trajectory visualization
  setupTrajectoryVisualization(simData);

  // Show results section
  document.getElementById('simulationResults').style.display = 'block';

  console.log('✅ Results loaded');
}

/**
 * Update summary statistics cards
 */
function updateSummaryCards(simData) {
  const collisionEvents = simData.collisionEvents || [];
  
  // Total collisions
  document.getElementById('totalCollisions').textContent = collisionEvents.length;

  // Unique agents involved
  const uniqueAgents = new Set(collisionEvents.map(e => e.agentId));
  document.getElementById('agentsInvolved').textContent = uniqueAgents.size;

  // Unique objects hit
  const uniqueObjects = new Set(collisionEvents.map(e => e.objectId));
  document.getElementById('objectsHit').textContent = uniqueObjects.size;
}

/**
 * Setup trajectory visualization with agent paths
 */
function setupTrajectoryVisualization(simData) {
  // Clear old agents
  state.agents.forEach(agentMesh => {
    state.scene.remove(agentMesh);
    if (agentMesh.geometry) agentMesh.geometry.dispose();
    if (agentMesh.material) agentMesh.material.dispose();
  });
  state.agents = [];

  if (!simData.trajectories || simData.trajectories.length === 0) {
    console.warn('No trajectory data available');
    return;
  }

  // Get age group config for agent size
  const ageGroupId = simData.ageGroupId || 'toddler';
  const ageGroupConfig = getAgeGroupConfig(ageGroupId);

  // Create agent meshes
  simData.trajectories.forEach((trajectory, index) => {
    // Create capsule geometry for agent
    const radius = ageGroupConfig.capsuleRadius || 0.25;
    const height = ageGroupConfig.height || 1.0;
    
    const geometry = new THREE.CapsuleGeometry(radius, height - radius * 2, 8, 16);
    const material = new THREE.MeshPhongMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.7
    });

    const agentMesh = new THREE.Mesh(geometry, material);
    agentMesh.castShadow = true;
    
    // Set initial position (will be animated later)
    if (trajectory.positions && trajectory.positions.length > 0) {
      const startPos = trajectory.positions[0];
      agentMesh.position.set(startPos[0], startPos[1], startPos[2]);
    }

    state.scene.add(agentMesh);
    state.agents.push(agentMesh);

    // Store trajectory data on mesh
    agentMesh.userData = {
      trajectory: trajectory.positions || [],
      agentId: trajectory.agentId
    };
  });

  // Setup playback
  state.playbackState.totalFrames = simData.trajectories[0]?.positions?.length || 0;
  state.playbackState.currentFrame = 0;

  console.log(`✅ Created ${state.agents.length} agent visualizations`);
}

/**
 * Update playback frame
 */
function updatePlayback() {
  if (!state.currentSimulation || state.agents.length === 0) return;

  const { currentFrame, totalFrames, speed } = state.playbackState;

  // Update agent positions
  state.agents.forEach(agentMesh => {
    const trajectory = agentMesh.userData.trajectory;
    if (!trajectory || currentFrame >= trajectory.length) return;

    const pos = trajectory[currentFrame];
    agentMesh.position.set(pos[0], pos[1], pos[2]);
  });

  // Update playback info
  const time = (currentFrame / 60).toFixed(1); // Assuming 60 FPS
  document.getElementById('playbackTime').textContent = time;
  document.getElementById('activeAgents').textContent = state.agents.length;

  // Advance frame
  state.playbackState.currentFrame += speed;

  // Loop or stop at end
  if (state.playbackState.currentFrame >= totalFrames) {
    state.playbackState.currentFrame = 0;
    // state.playbackState.isPlaying = false; // Uncomment to stop at end
  }
}

// ============================================================================
// HEATMAP VISUALIZATION - DAY 18-19 CRITICAL
// ============================================================================

/**
 * Load and display heatmap overlay
 */
async function loadAndDisplayHeatmap(simulationId) {
  try {
    const response = await fetch(`/api/simulate/${simulationId}/heatmap`);
    
    if (!response.ok) {
      throw new Error('Failed to load heatmap');
    }

    const heatmapData = await response.json();
    
    displayHeatmap(heatmapData);
    displayHotspots(heatmapData.hotspots);

  } catch (error) {
    console.error('Heatmap error:', error);
    showStatus('Failed to load heatmap', 'warning');
  }
}

/**
 * Update heatmap when age group changes
 */
function updateHeatmap(simData) {
  if (!simData || !simData.simulationId) return;
  
  loadAndDisplayHeatmap(simData.simulationId);
}

/**
 * Display heatmap as 3D plane overlay
 */
function displayHeatmap(heatmapData) {
  // Remove old heatmap
  if (state.heatmapMesh) {
    state.scene.remove(state.heatmapMesh);
    if (state.heatmapMesh.geometry) state.heatmapMesh.geometry.dispose();
    if (state.heatmapMesh.material) {
      state.heatmapMesh.material.map?.dispose();
      state.heatmapMesh.material.dispose();
    }
  }

  const { width, height, cellSize, bounds, data } = heatmapData;

  // Create canvas for heatmap texture
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw heatmap
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const riskScore = data[row][col];
      const color = getRiskColor(riskScore);
      
      ctx.fillStyle = color;
      ctx.fillRect(col, height - row - 1, 1, 1); // Flip Y
    }
  }

  // Create texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  // Create plane geometry
  const planeWidth = bounds.maxX - bounds.minX;
  const planeHeight = bounds.maxZ - bounds.minZ;
  
  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
  });

  state.heatmapMesh = new THREE.Mesh(geometry, material);
  
  // Position at floor level + small offset
  state.heatmapMesh.rotation.x = -Math.PI / 2; // Face up
  state.heatmapMesh.position.set(
    (bounds.minX + bounds.maxX) / 2,
    0.01, // Slightly above floor
    (bounds.minZ + bounds.maxZ) / 2
  );

  state.scene.add(state.heatmapMesh);
  
  // Initially hidden, toggle with button
  state.heatmapMesh.visible = false;

  console.log('✅ Heatmap rendered');
}

/**
 * Get color for risk score (0-100)
 */
function getRiskColor(score) {
  if (score < 20) return 'rgba(34, 197, 94, 0.5)';   // Green - Safe
  if (score < 45) return 'rgba(234, 179, 8, 0.6)';   // Yellow - Watch
  if (score < 70) return 'rgba(249, 115, 22, 0.7)';  // Orange - Warning
  if (score < 90) return 'rgba(239, 68, 68, 0.8)';   // Red - Critical
  return 'rgba(127, 29, 29, 0.9)';                    // Dark Red - Dangerous
}

/**
 * Display hotspot markers in 3D scene
 */
function displayHotspots(hotspots) {
  if (!hotspots || hotspots.length === 0) return;

  // Create markers for top 5 hotspots
  const topHotspots = hotspots.slice(0, 5);

  topHotspots.forEach(hotspot => {
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8
    });

    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(hotspot.position.x, 0.5, hotspot.position.z);

    state.scene.add(marker);

    // Add pulsing animation
    const scale = { value: 1 };
    const pulse = () => {
      scale.value = 1 + 0.3 * Math.sin(Date.now() * 0.003);
      marker.scale.setScalar(scale.value);
    };
    marker.userData.update = pulse;
  });

  console.log(`✅ Displayed ${topHotspots.length} hotspot markers`);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Setup all UI event handlers
 */
function setupEventHandlers() {
  // File upload
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

  // Run simulation
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

  // Playback control
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

  // Show collision events
  const showEventsBtn = document.getElementById('showEventsBtn');
  showEventsBtn.addEventListener('click', () => {
    displayCollisionEventsTable();
  });

  // Toggle heatmap
  const toggleHeatmapBtn = document.getElementById('toggleHeatmapBtn');
  toggleHeatmapBtn.addEventListener('click', () => {
    if (state.heatmapMesh) {
      state.heatmapMesh.visible = !state.heatmapMesh.visible;
      
      const heatmapInfo = document.getElementById('heatmapInfo');
      heatmapInfo.style.display = state.heatmapMesh.visible ? 'block' : 'none';
      
      toggleHeatmapBtn.textContent = state.heatmapMesh.visible 
        ? '🗺️ Hide Heatmap' 
        : '🗺️ Show Heatmap';
    }
  });

  // Age group controls - DAY 20 CRITICAL
  setupAgeGroupControls();

  console.log('✅ Event handlers initialized');
}

/**
 * Upload and process GLB file
 */
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

    // Load model into Three.js
    await loadGLBModel(data.sceneId, data.filePath);

    updateLoadingProgress(80);

    // Display scene info
    displaySceneInfo(data.scene);

    // Show simulation controls
    document.getElementById('simulationControls').style.display = 'block';

    updateLoadingProgress(100);
    hideLoading();

  } catch (error) {
    console.error('Upload error:', error);
    hideLoading();
    showStatus(`Upload failed: ${error.message}`, 'error');
  }
}

/**
 * Display scene information
 */
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

/**
 * Display collision events table
 */
function displayCollisionEventsTable() {
  if (!state.currentSimulation || !state.currentSimulation.collisionEvents) {
    showStatus('No collision data available', 'warning');
    return;
  }

  const events = state.currentSimulation.collisionEvents;
  const eventsSection = document.getElementById('eventsSection');
  const eventsTable = document.getElementById('eventsTable');

  // Create table HTML
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

  // Auto-hide after 5 seconds
  setTimeout(() => {
    status.style.display = 'none';
  }, 5000);
}

// ============================================================================
// UTILITY FUNCTIONS
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
// INITIALIZATION ON LOAD
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Viewer initializing...');
  
  initThreeJS();
  setupEventHandlers();
  
  console.log('✅ Viewer ready!');
});