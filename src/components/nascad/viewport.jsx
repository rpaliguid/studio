'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useScene } from './scene-provider';

// Constants for enabling/disabling layers for raycasting
const ENABLE_ALL_LAYERS = 0; // Default layer
const DISABLE_ALL_LAYERS = 1;


export default function Viewport() {
  const mountRef = useRef(null);
  const {
    tool,
    setTool,
    selectionMode,
    setSelectionMode,
    selectedObject,
    setSelectedObject,
    primitivesToAdd,
    clearPrimitivesToAdd,
    selectedSubComponent,
    setSelectedSubComponent
  } = useScene();
  
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const outlineRef = useRef(null);
  const subComponentHelperRef = useRef(null);

  // Extrude function
  const extrudeFace = (object, faceIndex) => {
      if (!object || !(object.geometry instanceof THREE.BufferGeometry)) return;
      
      console.log('Extruding face', faceIndex);
      // This is a simplified example. A real implementation is much more complex.
      // It requires creating new vertices and faces, and updating the geometry.
      // For now, we'll just move the face vertices outwards.
      
      const geometry = object.geometry;
      const positionAttribute = geometry.getAttribute('position');
      const normalAttribute = geometry.getAttribute('normal');
      const index = geometry.index;

      if (!index) {
          console.warn("Extrude only works on indexed geometries for now.");
          return;
      }
      
      const faceVertices = [
          index.getX(faceIndex * 3),
          index.getY(faceIndex * 3),
          index.getZ(faceIndex * 3),
      ];

      const faceNormal = new THREE.Vector3();
      const n1 = new THREE.Vector3().fromBufferAttribute(normalAttribute, faceVertices[0]);
      const n2 = new THREE.Vector3().fromBufferAttribute(normalAttribute, faceVertices[1]);
      const n3 = new THREE.Vector3().fromBufferAttribute(normalAttribute, faceVertices[2]);
      faceNormal.add(n1).add(n2).add(n3).divideScalar(3).normalize();
      
      const extrusionAmount = 0.2;

      faceVertices.forEach(vertexIndex => {
          const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex);
          vertex.addScaledVector(faceNormal, extrusionAmount);
          positionAttribute.setXYZ(vertexIndex, vertex.x, vertex.y, vertex.z);
      });
      
      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
  };

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
        if (selectedSubComponent && selectedObject) {
           const positionAttribute = selectedObject.geometry.getAttribute('position');
           const helper = subComponentHelperRef.current;
           if(helper && selectedSubComponent.type === 'vertex'){
              const localPosition = selectedObject.worldToLocal(helper.position.clone());
              positionAttribute.setXYZ(selectedSubComponent.index, localPosition.x, localPosition.y, localPosition.z);
              positionAttribute.needsUpdate = true;
              selectedObject.geometry.computeVertexNormals();
           }
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

      const meshes = scene.children.filter(c => c.isMesh && c.name !== 'subComponentHelper');
      const intersects = raycaster.intersectObjects(meshes);
      
      let intersectedObject = intersects.length > 0 ? intersects[0].object : null;

      if (selectionMode === 'object') {
        if (intersectedObject) {
          setSelectedObject(intersectedObject);
          setSelectedSubComponent(null); 
        } else {
          setSelectedObject(null);
          setSelectedSubComponent(null);
        }
      } else if (selectedObject && (selectionMode === 'vertex' || selectionMode === 'face' || selectionMode === 'edge')) {
        
        // Deselect sub-component if clicking outside the selected object
        if (intersects.length === 0 || intersects[0].object !== selectedObject) {
             setSelectedSubComponent(null);
             if (!intersectedObject) setSelectedObject(null);
             else {
                 setSelectionMode('object');
                 setSelectedObject(intersectedObject);
             }
             return;
        }

        if (selectionMode === 'vertex') {
            const positionAttribute = selectedObject.geometry.getAttribute('position');
            let closestVertex = null;
            let minDistance = Infinity;

            for (let i = 0; i < positionAttribute.count; i++) {
                const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
                selectedObject.localToWorld(vertex);
                const distance = raycaster.ray.distanceToPoint(vertex);
                
                if (distance < 0.1 && distance < minDistance) { 
                    minDistance = distance;
                    closestVertex = { index: i, position: vertex.clone() };
                }
            }
            
            if (closestVertex) {
                setSelectedSubComponent({ type: 'vertex', index: closestVertex.index, position: closestVertex.position });
            } else {
                setSelectedSubComponent(null);
            }
        } else if (selectionMode === 'face' && intersects.length > 0) {
            const intersect = intersects[0];
            if (intersect.face) {
                setSelectedSubComponent({ type: 'face', index: intersect.faceIndex, normal: intersect.face.normal });
                 // If extrude tool is active, perform action
                if(tool === 'extrude'){
                    extrudeFace(selectedObject, intersect.faceIndex);
                    setTool('translate'); // Reset tool
                }
            }
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
        if (selectedObject.geometry) {
             outlineRef.current.geometry = selectedObject.geometry;
        }
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
      if(event.target.tagName.toLowerCase() === 'input' || event.target.tagName.toLowerCase() === 'textarea') return;
      switch (event.key.toLowerCase()) {
        case 'w': setTool('translate'); break;
        case 'e': setTool('rotate'); break;
        case 'r': setTool('scale'); break;
        case '1': setSelectionMode('object'); break;
        case '2': setSelectionMode('vertex'); break;
        case '3': setSelectionMode('edge'); break;
        case '4': setSelectionMode('face'); break;
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

  // Handle tool change for transform controls
  useEffect(() => {
    if (transformControlsRef.current) {
      const transformTools = ['translate', 'rotate', 'scale'];
      if (transformTools.includes(tool)) {
        transformControlsRef.current.setMode(tool);
      }
    }
  }, [tool]);

  // Handle object/sub-component selection
  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformControlsRef.current;

    if (!scene || !transformControls) return;
    
    // Clear previous outlines and helpers
    if (outlineRef.current) {
        scene.remove(outlineRef.current);
        outlineRef.current.geometry.dispose();
        if(outlineRef.current.material) {
             outlineRef.current.material.dispose();
        }
        outlineRef.current = null;
    }
    
    if(subComponentHelperRef.current){
        scene.remove(subComponentHelperRef.current);
        subComponentHelperRef.current.geometry.dispose();
        if (subComponentHelperRef.current.material) {
           subComponentHelperRef.current.material.dispose();
        }
        subComponentHelperRef.current = null;
    }
    transformControls.detach();

    if (selectedSubComponent) {
        let helper;
        if(selectedSubComponent.type === 'vertex') {
            helper = new THREE.Mesh(
                new THREE.SphereGeometry(0.05),
                new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 })
            );
            helper.position.copy(selectedSubComponent.position);
        } else if (selectedSubComponent.type === 'face' && selectedObject) {
            // Visualize selected face - this is for visual feedback only
            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const originalVertices = selectedObject.geometry.getAttribute('position');
            const faceIndices = [
                selectedObject.geometry.index.getX(selectedSubComponent.index * 3),
                selectedObject.geometry.index.getY(selectedSubComponent.index * 3),
                selectedObject.geometry.index.getZ(selectedSubComponent.index * 3),
            ];
            
            vertices.push(
                originalVertices.getX(faceIndices[0]), originalVertices.getY(faceIndices[0]), originalVertices.getZ(faceIndices[0]),
                originalVertices.getX(faceIndices[1]), originalVertices.getY(faceIndices[1]), originalVertices.getZ(faceIndices[1]),
                originalVertices.getX(faceIndices[2]), originalVertices.getY(faceIndices[2]), originalVertices.getZ(faceIndices[2]),
            );

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            helper = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.3 }));
            
            // This helper is in local space of the object, so we must add it to the object.
            // But for simplicity, we won't attach the gizmo to it.
        }

        if(helper){
            helper.name = 'subComponentHelper';
            scene.add(helper);
            subComponentHelperRef.current = helper;
            transformControls.attach(helper);
            transformControls.visible = true;
        }

        if(selectedObject){
            const edges = new THREE.EdgesGeometry(selectedObject.geometry);
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
            const lineSegments = new THREE.LineSegments(edges, lineMaterial);
            lineSegments.position.copy(selectedObject.position);
            lineSegments.quaternion.copy(selectedObject.quaternion);
            lineSegments.scale.copy(selectedObject.scale);
            scene.add(lineSegments);
            outlineRef.current = lineSegments;
        }


    } else if (selectedObject) {
      if(selectionMode === 'object') {
        transformControls.attach(selectedObject);
        transformControls.visible = true;
      }

      const edges = new THREE.EdgesGeometry(selectedObject.geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
      const lineSegments = new THREE.LineSegments(edges, lineMaterial);
      
      lineSegments.position.copy(selectedObject.position);
      lineSegments.quaternion.copy(selectedObject.quaternion);
      lineSegments.scale.copy(selectedObject.scale);
      
      scene.add(lineSegments);
      outlineRef.current = lineSegments;
      
    } else {
      if (transformControls.object) {
        transformControls.detach();
      }
      transformControls.visible = false;
    }
  }, [selectedObject, selectedSubComponent, selectionMode]);


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
        if(mesh) {
            sceneRef.current.add(mesh);
        }
      });
      clearPrimitivesToAdd();
    }
  }, [primitivesToAdd, clearPrimitivesToAdd]);

  return <div ref={mountRef} className="w-full h-full" />;
}
