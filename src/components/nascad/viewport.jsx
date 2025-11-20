'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export default function Viewport() {
  const mountRef = useRef(null);
  const [selectedObject, setSelectedObject] = useState(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0e7db); // Light theme background

    // Camera
    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0,0,0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);

    // Orbit Controls (camera)
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.screenSpacePanning = false;
    orbitControls.minDistance = 2;
    orbitControls.maxDistance = 50;
    orbitControls.maxPolarAngle = Math.PI / 2;

    // Geometry
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xDAA520 }); // Gold color
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = 0.5;
    scene.add(cube);

    // Transform Controls (gizmo)
    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControls.visible = false; 

    transformControls.addEventListener('dragging-changed', function (event) {
      orbitControls.enabled = !event.value;
    });

    // Raycaster for object selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event) => {
        // Calculate mouse position in normalized device coordinates
        mouse.x = (event.clientX / currentMount.clientWidth) * 2 - 1;
        mouse.y = -(event.clientY / currentMount.clientHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(scene.children.filter(c => c.isMesh));

        if (intersects.length > 0) {
            const firstIntersected = intersects[0].object;
            if (selectedObject !== firstIntersected) {
                setSelectedObject(firstIntersected);
                transformControls.attach(firstIntersected);
                transformControls.visible = true;
            }
        } else {
            if (selectedObject) {
                transformControls.detach();
                transformControls.visible = false;
                setSelectedObject(null);
            }
        }
    }
    currentMount.addEventListener('click', onClick);


    // Floor Grid
    const gridHelper = new THREE.GridHelper(50, 50, 0xcccccc, 0xdddddd);
    scene.add(gridHelper);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update(); // only required if controls.enableDamping or controls.autoRotate are set to true
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
        switch (event.key) {
            case 'w':
                transformControls.setMode('translate');
                break;
            case 'e':
                transformControls.setMode('rotate');
                break;
            case 'r':
                transformControls.setMode('scale');
                break;
        }
    }
    window.addEventListener('keydown', handleKeyDown);


    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      currentMount.removeEventListener('click', onClick);
      if (currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      orbitControls.dispose();
      transformControls.dispose();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
