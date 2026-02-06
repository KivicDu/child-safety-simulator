import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import cacheManager from './cacheManager.js';

// Global variables
let scene, camera, renderer, controls;
let currentModel = null;
let currentSceneId = null;
let currentSimulationId = null;
let simulationData = null;

// Agent visualization
let agentMeshes = [];
let isPlayingSimulation = false;
let simulationStartTime = 0;
let animationFrameId = null;
let currentFrame = 0;

// Heatmap visualization
let heatmapMesh = null;
let heatmapTexture = null;
let heatmapVisible = true;
let hotspotMarkers = [];

// Initialize viewer on page load
document.addEventListener('DOMContentLoaded', () => {
  initViewer();
  setupEventListeners();
});

function initViewer() {
  const canvas = document.getElementById('canvas3d');
  const container = document.getElementById('viewer');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(5, 5, 5);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);

  // Grid
  const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
  scene.add(gridHelper);

  // Axes
  const axesHelper = new THREE.AxesHelper(5);
  scene.add(axesHelper);

  animate();

  window.addEventListener('resize', onWindowResize);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Update agent positions if playing simulation
  if (isPlayingSimulation && simulationData) {
    updateAgentPositions();
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  const container = document.getElementById('viewer');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function setupEventListeners() {
  // Upload button
  document.getElementById('uploadBtn').addEventListener('click', handleUpload);
  
  // Run simulation button
  document.getElementById('runSimBtn').addEventListener('click', runSimulation);
  
  // Playback button
  document.getElementById('playbackBtn').addEventListener('click', togglePlayback);
  
  // Show events button
  document.getElementById('showEventsBtn').addEventListener('click', showCollisionEvents);
  
  //  Toggle heatmap button
  const toggleHeatmapBtn = document.getElementById('toggleHeatmapBtn');
  if (toggleHeatmapBtn) {
    toggleHeatmapBtn.addEventListener('click', toggleHeatmapVisibility);
  }
  
  //  Age group change listener
  document.getElementById('ageGroup').addEventListener('change', handleAgeGroupChange);
  
  // File input
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      updateStatus(`📂 Selected: ${e.target.files[0].name}`, 'info');
    }
  });
}

/**
 * ✅ FIXED: Safe JSON parsing helper
 */
async function safeJsonParse(response) {
  try {
    // Check if response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Server error (${response.status}):`, errorText);
      throw new Error(`Server error: ${response.status} - ${errorText.substring(0, 100)}`);
    }
    
    // Get response text first
    const text = await response.text();
    
    // Check if empty
    if (!text || text.trim() === '') {
      console.error('❌ Empty response from server');
      throw new Error('Empty response from server');
    }
    
    // Try to parse
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('   Response text:', text.substring(0, 500));
      throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
    }
    
  } catch (error) {
    console.error('❌ safeJsonParse error:', error);
    throw error;
  }
}

async function handleUpload() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    updateStatus('⚠️ Please select a GLB file first', 'warning');
    return;
  }

  if (!file.name.endsWith('.glb')) {
    updateStatus('❌ Please select a valid .glb file', 'error');
    return;
  }

  updateStatus('⏳ Uploading...', 'info');

  const formData = new FormData();
  formData.append('model', file);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    // ✅ FIXED: Use safe JSON parsing
    const data = await safeJsonParse(response);

    if (data.success) {
      currentSceneId = data.sceneId;
      updateStatus('✅ Upload successful! Loading 3D model...', 'success');
      
      // Display scene info
      document.getElementById('sceneInfo').style.display = 'block';
      document.getElementById('sceneData').textContent = JSON.stringify(data.scene, null, 2);
      
      // Load GLB into viewer
      loadGLB(data.filePath, data.scene);
    } else {
      updateStatus('❌ Upload failed: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('❌ Upload error:', error);
    updateStatus('❌ Upload error: ' + error.message, 'error');
  }
}

function displaySimulationResults(summary) {
  document.getElementById('simulationResults').style.display = 'block';
  document.getElementById('totalCollisions').textContent = summary.totalCollisions;
  document.getElementById('agentsInvolved').textContent = summary.agentsInvolved;
  document.getElementById('objectsHit').textContent = summary.objectsHit;
  
  // Show heatmap legend
  document.getElementById('heatmapInfo').style.display = 'block';
}

async function loadSimulationData(simulationId) {
  try {
    const response = await fetch(`/api/simulate/${simulationId}/status`);
    
    // ✅ FIXED: Use safe JSON parsing
    const data = await safeJsonParse(response);
    
    simulationData = data;
    console.log('📊 Simulation data loaded:', simulationData);
    
    // Create agent meshes
    createAgentMeshes();
    
  } catch (error) {
    console.error('❌ Error loading simulation data:', error);
    updateStatus('❌ Error loading simulation: ' + error.message, 'error');
  }
}

//  Load and render heatmap from backend
async function loadAndRenderHeatmap(simulationId) {
  try {
    updateStatus('⏳ Generating heatmap...', 'info');
    
    const response = await fetch(`/api/simulate/${simulationId}/heatmap?cellSize=0.5&smoothing=true`);
    
    // ✅ FIXED: Use safe JSON parsing
    const data = await safeJsonParse(response);
    
    if (data.success) {
      console.log('🗺️ Heatmap data received:', data.heatmap);
      renderHeatmap(data.heatmap);
      updateStatus('✅ Heatmap generated!', 'success');
    } else {
      console.error('❌ Heatmap generation failed');
      updateStatus('⚠️ Heatmap generation failed', 'warning');
    }
    
  } catch (error) {
    console.error('❌ Error loading heatmap:', error);
    updateStatus('⚠️ Could not load heatmap: ' + error.message, 'warning');
  }
}

// Render heatmap as 2D texture overlay on 3D floor
function renderHeatmap(heatmapData) {
  // Remove existing heatmap if any
  if (heatmapMesh) {
    scene.remove(heatmapMesh);
    heatmapMesh = null;
  }
  
  // Remove existing hotspot markers
  hotspotMarkers.forEach(marker => scene.remove(marker));
  hotspotMarkers = [];
  
  console.log('🗺️ Rendering heatmap...');
  console.log('   Grid size:', heatmapData.width, 'x', heatmapData.height);
  console.log('   Hotspots:', heatmapData.hotspots.length);
  
  // Create canvas for heatmap texture
  const canvas = document.createElement('canvas');
  canvas.width = heatmapData.width;
  canvas.height = heatmapData.height;
  const ctx = canvas.getContext('2d');
  
  // Draw heatmap pixel by pixel
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  
  for (let row = 0; row < heatmapData.height; row++) {
    for (let col = 0; col < heatmapData.width; col++) {
      const riskScore = heatmapData.data[row][col];
      const color = getHeatmapColor(riskScore);
      
      const index = (row * canvas.width + col) * 4;
      imageData.data[index] = color.r;
      imageData.data[index + 1] = color.g;
      imageData.data[index + 2] = color.b;
      imageData.data[index + 3] = riskScore > 0 ? 180 : 0; // Alpha (transparency)
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  // Create texture from canvas
  heatmapTexture = new THREE.CanvasTexture(canvas);
  heatmapTexture.minFilter = THREE.LinearFilter;
  heatmapTexture.magFilter = THREE.LinearFilter;
  
  // Create plane mesh for heatmap
  const bounds = heatmapData.bounds;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  
  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshBasicMaterial({
    map: heatmapTexture,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  
  heatmapMesh = new THREE.Mesh(geometry, material);
  
  // Position heatmap slightly above floor
  heatmapMesh.position.set(
    (bounds.minX + bounds.maxX) / 2,
    0.05,
    (bounds.minZ + bounds.maxZ) / 2
  );
  heatmapMesh.rotation.x = -Math.PI / 2;
  
  scene.add(heatmapMesh);
  
  // Add hotspot markers (red spheres)
  heatmapData.hotspots.forEach(hotspot => {
    const markerGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      transparent: true,
      opacity: 0.8
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    
    marker.position.set(hotspot.position.x, 0.5, hotspot.position.z);
    scene.add(marker);
    hotspotMarkers.push(marker);
    
    console.log(`   📍 Hotspot at (${hotspot.position.x.toFixed(1)}, ${hotspot.position.z.toFixed(1)}): Risk ${hotspot.riskScore}`);
  });
  
  console.log('✅ Heatmap rendered successfully');
}

// Get color based on risk score (0-100)
function getHeatmapColor(score) {
  if (score === 0) return { r: 0, g: 0, b: 0 };
  if (score <= 20) return { r: 34, g: 197, b: 94 };   // Green
  if (score <= 45) return { r: 234, g: 179, b: 8 };   // Yellow
  if (score <= 70) return { r: 249, g: 115, b: 22 };  // Orange
  if (score <= 90) return { r: 239, g: 68, b: 68 };   // Red
  return { r: 127, g: 29, b: 29 };                    // Dark red
}

// Toggle heatmap visibility
function toggleHeatmapVisibility() {
  if (heatmapMesh) {
    heatmapVisible = !heatmapVisible;
    heatmapMesh.visible = heatmapVisible;
    hotspotMarkers.forEach(marker => {
      marker.visible = heatmapVisible;
    });
    
    const btn = document.getElementById('toggleHeatmapBtn');
    btn.textContent = heatmapVisible ? '🗺️ Hide Heatmap' : '🗺️ Show Heatmap';
    
    console.log(`🗺️ Heatmap ${heatmapVisible ? 'shown' : 'hidden'}`);
  } else {
    updateStatus('⚠️ No heatmap data available', 'warning');
  }
}

//  Handle age group change
async function handleAgeGroupChange() {
  if (!currentSceneId) {
    return;
  }
  
  const ageGroupId = document.getElementById('ageGroup').value;
  console.log(`🔄 Age group changed to: ${ageGroupId}`);
  
  // Check if cached
  if (!cacheManager.hasAgeGroupCached(currentSceneId, ageGroupId)) {
    console.log(`⚠️ ${ageGroupId} not cached yet`);
    updateStatus(`⚠️ ${ageGroupId} data not available. Click "Run Simulation" to generate.`, 'warning');
    return;
  }
  
  // Load from cache
  const cachedData = cacheManager.getCachedSimulation(currentSceneId, ageGroupId);
  
  if (cachedData) {
    console.log(`✅ Loaded ${ageGroupId} from cache`);
    currentSimulationId = cachedData.simulationId;
    simulationData = cachedData;
    
    // Update UI
    displaySimulationResults(cachedData.summary);
    
    // Recreate agent meshes
    createAgentMeshes();
    
    // Reload heatmap
    await loadAndRenderHeatmap(currentSimulationId);
    
    updateStatus(`✅ Switched to ${ageGroupId} simulation`, 'success');
  }
}

function createAgentMeshes() {
  // Clear existing agent meshes
  agentMeshes.forEach(mesh => scene.remove(mesh));
  agentMeshes = [];
  
  if (!simulationData || !simulationData.trajectories) {
    console.warn('⚠️ No trajectory data to visualize');
    return;
  }

  console.log(`📊 Creating agent visualization for ${simulationData.trajectories.length} agents`);

  const ageGroupId = simulationData.ageGroupId || 'toddler';
  
  // Agent mesh (cylinder representing child)
  const geometry = new THREE.CylinderGeometry(0.25, 0.25, 0.9, 8);
  const material = new THREE.MeshPhongMaterial({ 
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.8
  });

  simulationData.trajectories.forEach(traj => {
    const mesh = new THREE.Mesh(geometry, material.clone());
    
    // Store trajectory data in mesh
    mesh.userData.trajectory = traj.positions;
    mesh.userData.agentId = traj.agentId;
    
    // Set initial position (hidden until playback)
    mesh.visible = false;
    
    scene.add(mesh);
    agentMeshes.push(mesh);
  });

  console.log(`✅ Created ${agentMeshes.length} agent visualization meshes`);
}

function togglePlayback() {
  if (!simulationData) {
    updateStatus('⚠️ No simulation data to play', 'warning');
    return;
  }

  isPlayingSimulation = !isPlayingSimulation;
  
  const playbackBtn = document.getElementById('playbackBtn');
  const playbackInfo = document.getElementById('playbackInfo');
  
  if (isPlayingSimulation) {
    playbackBtn.textContent = '⏸️ Pause Simulation';
    playbackInfo.style.display = 'block';
    simulationStartTime = Date.now();
    currentFrame = 0;
    
    // Show all agent meshes
    agentMeshes.forEach(mesh => {
      mesh.visible = true;
    });
  } else {
    playbackBtn.textContent = '▶️ Play Simulation';
    simulationStartTime = 0;
  }
}

function updateAgentPositions() {
  if (!simulationData || !isPlayingSimulation) return;

  const fps = simulationData.config.fps || 60;
  const duration = simulationData.config.duration || 10;
  const totalFrames = fps * duration;

  // Calculate current frame based on elapsed time
  const elapsed = (Date.now() - simulationStartTime) / 1000; // seconds
  currentFrame = Math.floor(elapsed * fps);

  // Loop animation
  if (currentFrame >= totalFrames) {
    currentFrame = 0;
    simulationStartTime = Date.now();
  }

  // Update each agent mesh position from trajectory
  agentMeshes.forEach(mesh => {
    const trajectory = mesh.userData.trajectory;
    if (trajectory && trajectory[currentFrame]) {
      const pos = trajectory[currentFrame];
      mesh.position.set(pos[0], pos[1], pos[2]);
    }
  });

  // Update playback UI
  const currentTime = (currentFrame / fps).toFixed(1);
  document.getElementById('playbackTime').textContent = currentTime;
  document.getElementById('activeAgents').textContent = agentMeshes.length;
}

async function showCollisionEvents() {
  if (!currentSimulationId) {
    updateStatus('⚠️ No simulation data available', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/simulate/${currentSimulationId}/events`);
    
    // ✅ FIXED: Use safe JSON parsing
    const data = await safeJsonParse(response);
    
    const eventsSection = document.getElementById('eventsSection');
    const eventsTable = document.getElementById('eventsTable');
    
    eventsSection.style.display = 'block';
    
    // Build table HTML
    let html = '<table><thead><tr>';
    html += '<th>Time (s)</th><th>Agent</th><th>Object</th><th>Velocity</th>';
    html += '<th>Injury Score</th><th>Risk Tier</th><th>Body Part</th>';
    html += '</tr></thead><tbody>';
    
    data.events.forEach(event => {
      const injury = event.injury || {};
      const riskTier = injury.riskTier || 'N/A';
      const riskClass = `risk-${riskTier.toLowerCase()}`;
      
      html += '<tr>';
      html += `<td>${event.time.toFixed(2)}</td>`;
      html += `<td>${event.agentId}</td>`;
      html += `<td>${event.objectName}</td>`;
      html += `<td>${event.velocity.toFixed(2)}</td>`;
      html += `<td>${injury.injuryScore || 0}</td>`;
      html += `<td class="${riskClass}">${riskTier}</td>`;
      html += `<td>${injury.bodyPart || 'N/A'}</td>`;
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    eventsTable.innerHTML = html;
    
  } catch (error) {
    console.error('❌ Error loading events:', error);
    updateStatus('❌ Error loading events: ' + error.message, 'error');
  }
}

function loadGLB(url, sceneData) {
  const loader = new GLTFLoader();
  
  if (currentModel) {
    scene.remove(currentModel);
  }

  console.log('📄 Starting to load GLB from:', url);
  updateStatus('⏳ Downloading model... 0%', 'info');

  loader.load(
    url,
    (gltf) => {
      console.log('✅ GLB loaded successfully');
      currentModel = gltf.scene;
      scene.add(currentModel);

      // Center and frame model
      const box = new THREE.Box3().setFromObject(currentModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      currentModel.position.sub(center);

      // Adjust camera to fit model
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;

      camera.position.set(cameraZ, cameraZ, cameraZ);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();

      // Visualize bounding boxes
      visualizeBoundingBoxes(sceneData);

      updateStatus('✅ Model loaded successfully!', 'success');
      
      // Show simulation controls
      document.getElementById('simulationControls').style.display = 'block';
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
        updateStatus(`⏳ Downloading model... ${percent}%`, 'info');
      } else {
        const loadedMB = (xhr.loaded / 1024 / 1024).toFixed(1);
        updateStatus(`⏳ Downloading... ${loadedMB} MB loaded`, 'info');
      }
    },
    (error) => {
      console.error('❌ Error loading GLB:', error);
      updateStatus(`❌ Error loading model: ${error.message}`, 'error');
    }
  );
}

function visualizeBoundingBoxes(sceneData) {
  if (!sceneData.objects || sceneData.objects.length === 0) {
    console.warn('⚠️ No objects to visualize');
    return;
  }

  sceneData.objects.forEach(obj => {
    const bbox = obj.boundingBox;
    
    // Color based on classification danger score
    let color = 0x00ff00; // Default green (safe)
    if (obj.classification) {
      if (obj.classification.dangerScore > 7) {
        color = 0xff0000; // Red for high danger
      } else if (obj.classification.dangerScore > 4) {
        color = 0xff8800; // Orange for medium danger
      }
    }
    
    const boxHelper = new THREE.Box3Helper(
      new THREE.Box3(
        new THREE.Vector3(bbox.min[0], bbox.min[1], bbox.min[2]),
        new THREE.Vector3(bbox.max[0], bbox.max[1], bbox.max[2])
      ),
      color
    );
    scene.add(boxHelper);
  });

  // Highlight floor with blue box
  if (sceneData.floor && sceneData.floor.objectId) {
    const floorObj = sceneData.objects.find(o => o.id === sceneData.floor.objectId);
    if (floorObj) {
      const bbox = floorObj.boundingBox;
      const floorHelper = new THREE.Box3Helper(
        new THREE.Box3(
          new THREE.Vector3(bbox.min[0], bbox.min[1], bbox.min[2]),
          new THREE.Vector3(bbox.max[0], bbox.max[1], bbox.max[2])
        ),
        0x0088ff // Blue for floor
      );
      scene.add(floorHelper);
    }
  }
}

function updateStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = type; 
  console.log(message);
}

// Loading state management
function showLoading(text = 'Processing...', progress = 0) {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const progressBar = document.getElementById('loadingProgressBar');
  
  overlay.style.display = 'flex';
  loadingText.textContent = text;
  progressBar.style.width = `${progress}%`;
}

function updateLoadingProgress(progress, text) {
  const loadingText = document.getElementById('loadingText');
  const progressBar = document.getElementById('loadingProgressBar');
  
  if (text) loadingText.textContent = text;
  progressBar.style.width = `${Math.min(100, progress)}%`;
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = 'none';
}

// Modified runSimulation with caching
async function runSimulation() {
  if (!currentSceneId) {
    updateStatus('⚠️ Please upload a GLB file first', 'warning');
    return;
  }

  const agentCount = parseInt(document.getElementById('agentCount').value);
  const duration = parseInt(document.getElementById('duration').value);
  const ageGroupId = document.getElementById('ageGroup').value;

  // Check if we have cache for all ages
  if (!cacheManager.hasCachedBatch(currentSceneId)) {
    showLoading('Running simulation for ALL age groups...', 0);
    
    // Simulate progress updates
    const progressInterval = setInterval(() => {
      const currentProgress = parseInt(document.getElementById('loadingProgressBar').style.width);
      if (currentProgress < 90) {
        updateLoadingProgress(currentProgress + 10, `Simulating... ${currentProgress + 10}%`);
      }
    }, 1000);

    // Generate cache for all ages at once
    const success = await cacheManager.generateBatchCache(
      currentSceneId,
      agentCount,
      duration
    );

    clearInterval(progressInterval);
    updateLoadingProgress(100, 'Complete!');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    hideLoading();

    if (!success) {
      updateStatus('❌ Batch simulation failed', 'error');
      return;
    }

    updateStatus('✅ All age groups simulated! Cache ready.', 'success');
  }

  // Load from cache
  const cachedData = cacheManager.getCachedSimulation(currentSceneId, ageGroupId);
  
  if (cachedData) {
    currentSimulationId = cachedData.simulationId;
    simulationData = cachedData;
    
    console.log('📦 Loaded from cache:', ageGroupId);
    
    // Display results
    displaySimulationResults(cachedData.summary);
    
    // Create agent visualizations
    createAgentMeshes();
    
    // Load heatmap
    await loadAndRenderHeatmap(currentSimulationId);
    
    updateStatus(`✅ ${ageGroupId} simulation loaded from cache!`, 'success');
  } else {
    updateStatus('❌ Failed to load cached simulation', 'error');
  }
}