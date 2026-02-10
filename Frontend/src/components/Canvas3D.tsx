import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface Canvas3DProps {
  modelPath?: string;
  fileName?: string;
}

const Canvas3D: React.FC<Canvas3DProps> = ({ modelPath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f9ff); // Light sky blue
    sceneRef.current = scene;

    // Camera setup
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 400;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0xe0e0e0, 0xf5f5f5);
    scene.add(gridHelper);

    // Load model if provided
    if (modelPath && modelPath.trim()) {
      try {
        // Ensure full URL so loader hits backend static uploads
        const url = modelPath.startsWith('/') ? `${window.location.origin}${modelPath}` : modelPath;
        // dynamic import avoids TS issues with example types in some setups
        (async () => {
          const mod: any = await import('three/examples/jsm/loaders/GLTFLoader');
          const GLTFLoader = mod.GLTFLoader;
          const loader = new GLTFLoader();
          loader.load(
            url,
            (gltf: any) => {
              const model = gltf.scene;

            // Compute bounding box and scale to fit
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = Math.min(6 / maxDim, 6);
            model.scale.multiplyScalar(scale);

            // Center model
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center.multiplyScalar(scale));

            scene.add(model);

            // Bring camera back to fit scene
            camera.position.set(0, Math.max(1, size.y / 2), Math.max(6, maxDim * 1.5));
            },
            undefined,
            (err: any) => {
              console.error('GLTF load error:', err);
              // fallback placeholder
              const geometry = new THREE.BoxGeometry(2, 2, 2);
              const material = new THREE.MeshStandardMaterial({ color: 0xffc0cb });
              const box = new THREE.Mesh(geometry, material);
              scene.add(box);
            }
          );
        })();
      } catch (err) {
        console.warn('Could not load 3D model, showing placeholder', err);
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ color: 0xffc0cb });
        const box = new THREE.Mesh(geometry, material);
        scene.add(box);
      }
    } else {
      // Placeholder scene with a colored box
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshStandardMaterial({ color: 0xffc0cb, metalness: 0.3, roughness: 0.4 });
      const box = new THREE.Mesh(geometry, material);
      scene.add(box);
    }

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Rotate objects
      scene.children.forEach((child: any) => {
        if (child instanceof THREE.Mesh && child.uuid !== gridHelper.uuid) {
          child.rotation.x += 0.003;
          child.rotation.y += 0.005;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      
      (camera as THREE.PerspectiveCamera).aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (containerRef.current && renderer.domElement.parentElement === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [modelPath]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gradient-to-b from-sky-100 to-sky-50 rounded-3xl shadow-inner"
      style={{ minHeight: '400px' }}
    />
  );
};

export default Canvas3D;
