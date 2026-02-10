import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
  
  // File input
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      updateStatus(`📁 Selected: ${e.target.files[0].name}`, 'info');
    }
  });
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

    const data = await response.json();

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
    updateStatus('❌ Upload error: ' + error.message, 'error');
  }
}


async function runSimulation() {
  if (!currentSceneId) {
    updateStatus('⚠️ Please upload a GLB file first', 'warning');
    return;
  }

  const agentCount = parseInt(document.getElementById('agentCount').value);
  const duration = parseInt(document.getElementById('duration').value);
  const ageGroupId = document.getElementById('ageGroup').value;

  updateStatus('⏳ Running simulation...', 'info');

  try {
    const response = await fetch('/api/simulate/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sceneId: currentSceneId,
        agentCount,
        duration,
        ageGroupId  
      })
    });

    const data = await response.json();

    if (data.success) {
      currentSimulationId = data.simulationId;
      updateStatus('✅ Simulation complete!', 'success');
      
      // Display results
      displaySimulationResults(data.summary);
      
      // Load full simulation data for playback
      loadSimulationData(data.simulationId);
    } else {
      updateStatus('❌ Simulation failed: ' + data.error, 'error');
    }
  } catch (error) {
    updateStatus('❌ Simulation error: ' + error.message, 'error');
  }
}


function displaySimulationResults(summary) {
  document.getElementById('simulationResults').style.display = 'block';
  document.getElementById('totalCollisions').textContent = summary.totalCollisions;
  document.getElementById('agentsInvolved').textContent = summary.agentsInvolved;
  document.getElementById('objectsHit').textContent = summary.objectsHit;
}


async function loadSimulationData(simulationId) {
  try {
    const response = await fetch(`/api/simulate/${simulationId}/status`);
    const data = await response.json();
    
    simulationData = data;
    console.log('📊 Simulation data loaded:', simulationData);
    
    // Create agent meshes
    createAgentMeshes();
    
  } catch (error) {
    console.error('❌ Error loading simulation data:', error);
  }
}

function createAgentMeshes() {
  // Clear existing agent meshes
  agentMeshes.forEach(mesh => scene.remove(mesh));
  agentMeshes = [];

  if (!simulationData || !simulationData.trajectories) return;

  const agentGeometry = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
  const agentMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x00ff88,
    transparent: true,
    opacity: 0.8
  });

  simulationData.trajectories.forEach(trajectory => {
    const mesh = new THREE.Mesh(agentGeometry, agentMaterial.clone());
    mesh.userData.trajectory = trajectory.positions;
    mesh.userData.agentId = trajectory.agentId;
    
    // Set initial position (hidden)
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

  // Loop or stop at end
  if (currentFrame >= totalFrames) {
    currentFrame = 0;
    simulationStartTime = Date.now();
  }

  // Update each agent mesh position
  agentMeshes.forEach(mesh => {
    const trajectory = mesh.userData.trajectory;
    if (trajectory && trajectory[currentFrame]) {
      const pos = trajectory[currentFrame];
      mesh.position.set(pos[0], pos[1], pos[2]);
    }
  });

  // Update playback info
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
    const data = await response.json();
    
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
      const riskColor = injury.riskColor || '#666';
      
      html += '<tr>';
      html += `<td>${event.time.toFixed(2)}</td>`;
      html += `<td>${event.agentId}</td>`;
      html += `<td>${event.objectName}</td>`;
      html += `<td>${event.velocity.toFixed(2)}</td>`;
      html += `<td>${injury.injuryScore || 0}</td>`;
      html += `<td style="color: ${riskColor}; font-weight: bold;">${injury.riskTier || 'N/A'}</td>`;
      html += `<td>${injury.bodyPart || 'N/A'}</td>`;
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    eventsTable.innerHTML = html;
    
  } catch (error) {
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

      // Adjust camera
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
    
    // Color based on classification
    let color = 0x00ff00; // Default green
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

  // Highlight floor
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