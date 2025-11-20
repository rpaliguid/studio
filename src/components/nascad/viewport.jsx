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
  const outlineRef = useRef(null); // For object outline
  const subComponentHelperRef = useRef(null); // For sub-component gizmo/highlight

  // Simplified extrude function
  const extrudeFace = (object, faceIndex) => {
      if (!object || !(object.geometry instanceof THREE.BufferGeometry) || !object.geometry.index) return;
      console.log('Extruding face', faceIndex);
      
      const geometry = object.geometry;
      const positionAttribute = geometry.getAttribute('position');
      const normalAttribute = geometry.getAttribute('normal');
      const index = geometry.index;
      
      const faceVerticesIndices = [
          index.getX(faceIndex * 3),
          index.getY(faceIndex * 3),
          index.getZ(faceIndex * 3),
      ];

      const faceNormal = new THREE.Vector3();
      const n1 = new THREE.Vector3().fromBufferAttribute(normalAttribute, faceVerticesIndices[0]);
      const n2 = new THREE.Vector3().fromBufferAttribute(normalAttribute, faceVerticesIndices[1]);
      const n3 = new THREE.Vector3().fromBufferAttribute(normalAttribute, faceVerticesIndices[2]);
      faceNormal.add(n1).add(n2).add(n3).divideScalar(3).normalize();
      
      const extrusionAmount = 0.2;

      faceVerticesIndices.forEach(vertexIndex => {
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
        if (selectedSubComponent && selectedObject && subComponentHelperRef.current) {
           const positionAttribute = selectedObject.geometry.getAttribute('position');
           const helper = subComponentHelperRef.current;

           if(selectedSubComponent.type === 'vertex'){
              // Convert the helper's world position back to the object's local space
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
      const intersects = raycaster.intersectObjects(meshes, false);
      
      const intersectedObject = intersects.length > 0 ? intersects[0].object : null;

      if (selectionMode === 'object') {
        setSelectedObject(intersectedObject);
        setSelectedSubComponent(null); 
      } else if (selectedObject && intersects.length > 0 && intersects[0].object === selectedObject) {
          const intersectPoint = intersects[0].point;
          const geometry = selectedObject.geometry;
          const positionAttribute = geometry.getAttribute('position');

          if (selectionMode === 'vertex') {
              let closestVertexIndex = -1;
              let minDistance = Infinity;

              // Iterate through vertices to find the closest one to the intersection point
              for (let i = 0; i < positionAttribute.count; i++) {
                  const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
                  // Transform vertex to world space to compare with intersection point
                  selectedObject.localToWorld(vertex); 
                  const distance = vertex.distanceTo(intersectPoint);
                  
                  if (distance < minDistance) {
                      minDistance = distance;
                      closestVertexIndex = i;
                  }
              }
              
              // If a vertex is found within a small threshold, select it
              if (minDistance < 0.1) {
                  const vertexPosition = new THREE.Vector3().fromBufferAttribute(positionAttribute, closestVertexIndex);
                  selectedObject.localToWorld(vertexPosition); // Get world space position for the gizmo
                  setSelectedSubComponent({ type: 'vertex', index: closestVertexIndex, position: vertexPosition });
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
          } else {
              // Placeholder for edge selection
              setSelectedSubComponent(null);
          }
      } else {
        // Clicked on nothing, deselect everything
        setSelectedObject(null);
        setSelectedSubComponent(null);
      }
    };
    currentMount.addEventListener('click', onClick);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      
      // Keep outline attached to the moving object
      if (outlineRef.current && selectedObject) {
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
      if(event.target.tagName.toLowerCase() === 'input' || event.target.tagName.toLowerCase() === 'textarea') return;
      switch (event.key.toLowerCase()) {
        case 'w': setTool('translate'); break;
        case 'e': setTool('rotate'); break;
        case 'r': setTool('scale'); break;
        case '1': setSelectionMode('object'); setSelectedSubComponent(null); break;
        case '2': setSelectionMode('vertex'); setSelectedSubComponent(null); break;
        case '3': setSelectionMode('edge'); setSelectedSubComponent(null); break;
        case '4': setSelectionMode('face'); setSelectedSubComponent(null); break;
        case 'escape': setSelectedObject(null); setSelectedSubComponent(null); break;
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
  }, []); // Empty dependency array ensures this runs only once on mount

  // Handle tool change for transform controls
  useEffect(() => {
    if (transformControlsRef.current) {
      const transformTools = ['translate', 'rotate', 'scale'];
      if (transformTools.includes(tool)) {
        transformControlsRef.current.setMode(tool);
      }
    }
  }, [tool]);

  // Handle object/sub-component selection changes
  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformControlsRef.current;

    if (!scene || !transformControls) return;
    
    // --- Cleanup previous visuals ---
    if (outlineRef.current) {
        scene.remove(outlineRef.current);
        outlineRef.current.geometry.dispose();
        outlineRef.current.material.dispose();
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
    transformControls.visible = false;


    // --- Create new visuals based on selection ---
    if (selectedObject) {
      // Show edge outline for the selected object, but only if no sub-component is selected
      if (!selectedSubComponent) {
        const edges = new THREE.EdgesGeometry(selectedObject.geometry, 1);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
        const lineSegments = new THREE.LineSegments(edges, lineMaterial);
        lineSegments.position.copy(selectedObject.position);
        lineSegments.quaternion.copy(selectedObject.quaternion);
        lineSegments.scale.copy(selectedObject.scale);
        scene.add(lineSegments);
        outlineRef.current = lineSegments;
      }

      if (selectedSubComponent) {
          let helper;
          if (selectedSubComponent.type === 'vertex') {
              helper = new THREE.Mesh(
                  new THREE.SphereGeometry(0.05), // A small sphere to mark the vertex
                  new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: false })
              );
              // Position the helper in world space
              helper.position.copy(selectedSubComponent.position);
          } else if (selectedSubComponent.type === 'face') {
              // Create a mesh to highlight the selected face
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
              
              // This helper is in the object's local space, so attach it to the object
              helper.position.copy(selectedObject.position);
              helper.quaternion.copy(selectedObject.quaternion);
              helper.scale.copy(selectedObject.scale);
          }
          // Note: Edge selection helper would be implemented here

          if(helper){
              helper.name = 'subComponentHelper';
              scene.add(helper);
              subComponentHelperRef.current = helper;
              
              // Attach transform controls to vertex helpers for manipulation
              if (selectedSubComponent.type === 'vertex') {
                 transformControls.attach(helper);
                 transformControls.visible = true;
              }
          }
      } else if (selectionMode === 'object') {
        // If in object mode and no sub-component is selected, attach gizmo to the object itself
        transformControls.attach(selectedObject);
        transformControls.visible = true;
      }
    }
  }, [selectedObject, selectedSubComponent, selectionMode, tool]);


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
        
        const nonIndexed = geometry.toNonIndexed();
        const indexedGeometry = new THREE.BufferGeometry();
        indexedGeometry.setAttribute('position', nonIndexed.getAttribute('position'));
        indexedGeometry.setIndex(Array.from({ length: nonIndexed.getAttribute('position').count / 3 }, (_, i) => [i * 3, i * 3 + 1, i * 3 + 2]).flat());
        indexedGeometry.computeVertexNormals();

        const mesh = new THREE.Mesh(indexedGeometry, material);
        mesh.position.y = 0.5;
        sceneRef.current.add(mesh);
      });
      clearPrimitivesToAdd();
    }
  }, [primitivesToAdd, clearPrimitivesToAdd]);

  return <div ref={mountRef} className="w-full h-full" />;
}
