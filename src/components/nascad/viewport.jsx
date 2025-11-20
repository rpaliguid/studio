'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useScene } from './scene-provider';

export default function Viewport() {
  const mountRef = useRef(null);
  const {
    tool,
    setTool,
    selectedObject,
    setSelectedObject,
    primitivesToAdd,
    clearPrimitivesToAdd,
  } = useScene();
  
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const outlineRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    rendererRef.current = renderer;
    currentMount.appendChild(renderer.domElement);

    // Orbit Controls (camera)
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.screenSpacePanning = true; 
    orbitControls.minDistance = 2;
    orbitControls.maxDistance = 50;
    orbitControls.maxPolarAngle = Math.PI; 
    orbitControlsRef.current = orbitControls;

    // Transform Controls (gizmo)
    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControlsRef.current = transformControls;

    transformControls.addEventListener('dragging-changed', function (event) {
      orbitControls.enabled = !event.value;
    });

    // Floor Grid
    const gridHelper = new THREE.GridHelper(50, 50, 0xcccccc, 0xdddddd);
    scene.add(gridHelper);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Raycaster for object selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event) => {
      event.preventDefault();

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(scene.children.filter(c => c.isMesh));

      if (intersects.length > 0) {
        const firstIntersected = intersects[0].object;
        if (firstIntersected !== outlineRef.current) {
          setSelectedObject(firstIntersected);
        }
      } else {
        setSelectedObject(null);
      }
    };
    currentMount.addEventListener('click', onClick);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (currentMount) {
        camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    // Handle keyboard shortcuts for transform modes
    const handleKeyDown = (event) => {
      switch (event.key.toLowerCase()) {
        case 'w':
          setTool('translate');
          break;
        case 'e':
          setTool('rotate');
          break;
        case 'r':
          setTool('scale');
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      currentMount.removeEventListener('click', onClick);
      if (renderer.domElement.parentElement === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      orbitControls.dispose();
      transformControls.dispose();
    };
  }, [setTool, setSelectedObject]);


  // Handle tool change
  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(tool);
    }
  }, [tool]);

  // Handle object selection
  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformControlsRef.current;

    if (!scene || !transformControls) return;
    
    // Cleanup previous outline
    if (outlineRef.current) {
        scene.remove(outlineRef.current);
        outlineRef.current.geometry.dispose();
        outlineRef.current.material.dispose();
        outlineRef.current = null;
    }

    if (selectedObject) {
      transformControls.attach(selectedObject);
      transformControls.visible = true;

      // Create outline
      const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.BackSide });
      const outlineMesh = new THREE.Mesh(selectedObject.geometry, outlineMaterial);
      outlineMesh.position.copy(selectedObject.position);
      outlineMesh.rotation.copy(selectedObject.rotation);
      outlineMesh.scale.copy(selectedObject.scale);
      outlineMesh.scale.multiplyScalar(1.05); // Make it slightly larger
      scene.add(outlineMesh);
      outlineRef.current = outlineMesh;

    } else {
      transformControls.detach();
      transformControls.visible = false;
    }
  }, [selectedObject]);


  // Handle adding primitives
  useEffect(() => {
    if (primitivesToAdd.length > 0 && sceneRef.current) {
      primitivesToAdd.forEach(primitiveType => {
        let geometry;
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        
        switch (primitiveType) {
          case 'cube':
            geometry = new THREE.BoxGeometry(1, 1, 1);
            break;
          case 'sphere':
            geometry = new THREE.SphereGeometry(0.5, 32, 16);
            break;
          case 'cylinder':
            geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
            break;
          default:
            return;
        }
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.5;
        sceneRef.current.add(mesh);
      });
      clearPrimitivesToAdd();
    }
  }, [primitivesToAdd, clearPrimitivesToAdd]);

  return <div ref={mountRef} className="w-full h-full" />;
}
