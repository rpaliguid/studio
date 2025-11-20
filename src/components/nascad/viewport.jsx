'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useScene } from './scene-provider';

export default function Viewport() {
  const mountRef = useRef(null);
  const {
    tool,
    setTool,
    selectionMode,
    selectedObject,
    setSelectedObject,
    primitivesToAdd,
    clearPrimitivesToAdd,
  } = useScene();
  
  const [selectedVertex, setSelectedVertex] = useState(null);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const outlineRef = useRef(null);
  const vertexHelperRef = useRef(null);


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
    orbitControlsRef.current = orbitControls;

    // Transform Controls (gizmo)
    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControlsRef.current = transformControls;

    transformControls.addEventListener('dragging-changed', function (event) {
      orbitControls.enabled = !event.value;
    });

    transformControls.addEventListener('objectChange', () => {
        if (selectedVertex && selectedObject) {
            const positionAttribute = selectedObject.geometry.getAttribute('position');
            positionAttribute.setXYZ(selectedVertex.index, selectedVertex.object.position.x, selectedVertex.object.position.y, selectedVertex.object.position.z);
            positionAttribute.needsUpdate = true;
            selectedObject.geometry.computeVertexNormals();
        }
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
      if (transformControls.dragging) return;
      event.preventDefault();

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const meshes = scene.children.filter(c => c.isMesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (selectionMode === 'object') {
        if (intersects.length > 0) {
          const firstIntersected = intersects[0].object;
          if (firstIntersected !== selectedObject) {
            setSelectedObject(firstIntersected);
            setSelectedVertex(null); 
          }
        } else {
          setSelectedObject(null);
          setSelectedVertex(null);
        }
      } else if (selectionMode === 'vertex' && selectedObject) {
        const positionAttribute = selectedObject.geometry.getAttribute('position');
        let closestVertex = null;
        let minDistance = Infinity;

        for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
            selectedObject.localToWorld(vertex);
            const distance = raycaster.ray.distanceToPoint(vertex);
            if (distance < 0.1 && distance < minDistance) { 
                minDistance = distance;
                closestVertex = { index: i, position: vertex };
            }
        }

        if (closestVertex) {
            const vertexSphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.05),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );
            vertexSphere.position.copy(closestVertex.position);
            setSelectedVertex({ object: vertexSphere, index: closestVertex.index });
        } else {
            setSelectedVertex(null);
        }
      }
    };
    currentMount.addEventListener('click', onClick);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      
      if (selectedObject && outlineRef.current) {
        outlineRef.current.position.copy(selectedObject.position);
        outlineRef.current.quaternion.copy(selectedObject.quaternion);
        outlineRef.current.scale.copy(selectedObject.scale);
      }

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

    const handleKeyDown = (event) => {
      switch (event.key.toLowerCase()) {
        case 'w': setTool('translate'); break;
        case 'e': setTool('rotate'); break;
        case 'r': setTool('scale'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      currentMount.removeEventListener('click', onClick);
      if (renderer.domElement && renderer.domElement.parentElement === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      orbitControls.dispose();
      transformControls.dispose();
    };
  }, []);


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
    
    if (outlineRef.current) {
        scene.remove(outlineRef.current);
        outlineRef.current.geometry.dispose();
        outlineRef.current.material.dispose();
        outlineRef.current = null;
    }
    
    if(vertexHelperRef.current){
        scene.remove(vertexHelperRef.current);
        vertexHelperRef.current = null;
    }

    if (selectedObject && selectionMode === 'object') {
      transformControls.attach(selectedObject);
      transformControls.visible = true;

      const edges = new THREE.EdgesGeometry(selectedObject.geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
      const lineSegments = new THREE.LineSegments(edges, lineMaterial);
      
      lineSegments.position.copy(selectedObject.position);
      lineSegments.quaternion.copy(selectedObject.quaternion);
      lineSegments.scale.copy(selectedObject.scale);
      
      scene.add(lineSegments);
      outlineRef.current = lineSegments;

    } else if (selectedVertex) {
        transformControls.attach(selectedVertex.object);
        transformControls.visible = true;
        scene.add(selectedVertex.object);
        vertexHelperRef.current = selectedVertex.object;
    }
    else {
      transformControls.detach();
      transformControls.visible = false;
    }
  }, [selectedObject, selectedVertex, selectionMode]);


  // Handle adding primitives
  useEffect(() => {
    if (primitivesToAdd.length > 0 && sceneRef.current) {
      primitivesToAdd.forEach(primitiveType => {
        let geometry;
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.1, roughness: 0.5 });
        
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
