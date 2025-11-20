'use client';

import { useEffect, useRef, useCallback } from 'react';
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
  const selectionVisualsRef = useRef([]); // Manages all selection visuals (outlines, helpers)

  // Use a ref to store a stable reference to the latest extrude function
  const extrudeFaceRef = useRef();

  // Use a stable callback with useCallback
  const handleDeselect = useCallback(() => {
    setSelectedObject(null);
    setSelectedSubComponent(null);
  }, [setSelectedObject, setSelectedSubComponent]);

  useEffect(() => {
    // This function will be updated whenever its dependencies change
    extrudeFaceRef.current = (object, faceIndex) => {
        if (!object || !(object.geometry instanceof THREE.BufferGeometry) || !object.geometry.index) return;
        
        const geometry = object.geometry;
        const positionAttribute = geometry.getAttribute('position');
        const normalAttribute = geometry.getAttribute('normal');
        const index = geometry.index;
        
        const faceVertexIndices = [
            index.getX(faceIndex * 3),
            index.getY(faceIndex * 3),
            index.getZ(faceIndex * 3),
        ];

        const faceNormal = new THREE.Vector3();
        const vA = new THREE.Vector3().fromBufferAttribute(positionAttribute, faceVertexIndices[0]);
        const vB = new THREE.Vector3().fromBufferAttribute(positionAttribute, faceVertexIndices[1]);
        const vC = new THREE.Vector3().fromBufferAttribute(positionAttribute, faceVertexIndices[2]);
        faceNormal.copy(vB).sub(vA).cross(new THREE.Vector3().copy(vC).sub(vA)).normalize();
        
        const extrusionAmount = 0.2;

        const newVertices = [];
        const originalPositions = {}; // Store original positions to create side faces
        
        faceVertexIndices.forEach(vertexIndex => {
            const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex);
            originalPositions[vertexIndex] = vertex.clone();
            const newVertex = vertex.clone().addScaledVector(faceNormal, extrusionAmount);
            newVertices.push(newVertex);
        });

        const newPositionArray = Array.from(positionAttribute.array);
        
        faceVertexIndices.forEach((vertexIndex, i) => {
            const newVertex = newVertices[i];
            newPositionArray[vertexIndex * 3] = newVertex.x;
            newPositionArray[vertexIndex * 3 + 1] = newVertex.y;
            newPositionArray[vertexIndex * 3 + 2] = newVertex.z;
        });

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositionArray, 3));
        
        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        
        // After extruding, deselect the face and reset the tool to prevent re-extrusion on click
        setSelectedSubComponent(null);
        setTool('translate');
    };
  }, [setTool, setSelectedSubComponent]);
  

  // --- Main Initialization Effect ---
  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // --- Basic Scene Setup ---
    const scene = new THREE.Scene();
    
    // Create a gradient background
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#3a4a5a'); // Darker navy/grey
    gradient.addColorStop(1, '#1c2530'); // Even darker
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const backgroundTexture = new THREE.CanvasTexture(canvas);
    scene.background = backgroundTexture;

    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    rendererRef.current = renderer;
    currentMount.appendChild(renderer.domElement);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControlsRef.current = orbitControls;

    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControlsRef.current = transformControls;

    // --- Scene Content ---
    const gridHelper = new THREE.GridHelper(50, 50, 0x556677, 0x445566);
    scene.add(gridHelper);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // --- Controls Listeners ---
    const onDraggingChanged = (event) => {
      orbitControls.enabled = !event.value;
    };
    transformControls.addEventListener('dragging-changed', onDraggingChanged);

    const onObjectChange = () => {
        if (!selectedSubComponent || !selectedObject || !transformControls.object) return;
    
        const positionAttribute = selectedObject.geometry.getAttribute('position');
        const gizmo = transformControls.object;
    
        if (selectedSubComponent.type === 'vertex') {
            const localPosition = selectedObject.worldToLocal(gizmo.position.clone());
            positionAttribute.setXYZ(selectedSubComponent.index, localPosition.x, localPosition.y, localPosition.z);
            positionAttribute.needsUpdate = true;
            selectedObject.geometry.computeVertexNormals();
        } else if (selectedSubComponent.type === 'face') {
            // Calculate the transformation from the gizmo's matrix
            const gizmoMatrix = gizmo.matrixWorld.clone();
            const invOriginalMatrix = selectedSubComponent.gizmoMatrixInverse;
            const deltaTransform = gizmoMatrix.multiply(invOriginalMatrix);
    
            selectedSubComponent.indices.forEach((vertexIndex, i) => {
                const originalVertex = selectedSubComponent.originalVertices[i].clone();
                // Apply the delta transformation to the original vertex position
                const newWorldPos = originalVertex.applyMatrix4(deltaTransform);
                // Convert the new world position back to the object's local space
                const newLocalPos = selectedObject.worldToLocal(newWorldPos);
                
                positionAttribute.setXYZ(vertexIndex, newLocalPos.x, newLocalPos.y, newLocalPos.z);
            });
    
            positionAttribute.needsUpdate = true;
            selectedObject.geometry.computeVertexNormals();
            selectedObject.geometry.computeBoundingSphere();
        }
    };
    transformControls.addEventListener('objectChange', onObjectChange);


    // --- Raycasting and Selection ---
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
      const intersects = raycaster.intersectObjects(meshes, false);
      const intersectedObject = intersects.length > 0 ? intersects[0].object : null;

      if (selectionMode === 'object') {
        setSelectedObject(intersectedObject);
        setSelectedSubComponent(null);
      } else if (intersectedObject) {
        if (selectedObject !== intersectedObject) {
          setSelectedObject(intersectedObject);
          setSelectedSubComponent(null);
          return; // Select object first, then sub-component on next click
        }
        
        const geometry = selectedObject.geometry;
        const positionAttribute = geometry.getAttribute('position');
        const intersectPoint = intersects[0].point;

        if (selectionMode === 'vertex') {
          let closestVertexIndex = -1;
          let minDistanceSq = Infinity;
          for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
            selectedObject.localToWorld(vertex);
            const distanceSq = vertex.distanceToSquared(intersectPoint);
            if (distanceSq < minDistanceSq) {
              minDistanceSq = distanceSq;
              closestVertexIndex = i;
            }
          }
          if (closestVertexIndex !== -1 && minDistanceSq < 0.1) {
            const vertexPosition = new THREE.Vector3().fromBufferAttribute(positionAttribute, closestVertexIndex);
            selectedObject.localToWorld(vertexPosition);
            setSelectedSubComponent({ type: 'vertex', index: closestVertexIndex, position: vertexPosition });
          } else {
            setSelectedSubComponent(null);
          }
        } else if (selectionMode === 'face' && intersects[0].face) {
          const faceIndex = intersects[0].faceIndex;
          if (tool === 'extrude') {
            extrudeFaceRef.current(selectedObject, faceIndex);
          } else {
            const face = intersects[0].face;
            const faceIndices = [geometry.index.getX(faceIndex*3), geometry.index.getY(faceIndex*3), geometry.index.getZ(faceIndex*3)];
            
            const originalVertices = faceIndices.map(index => 
              new THREE.Vector3().fromBufferAttribute(positionAttribute, index).applyMatrix4(selectedObject.matrixWorld)
            );
            
            const faceCentroid = new THREE.Vector3();
            originalVertices.forEach(v => faceCentroid.add(v));
            faceCentroid.divideScalar(originalVertices.length);

            const gizmo = new THREE.Object3D();
            gizmo.position.copy(faceCentroid);
            const worldNormal = face.normal.clone().transformDirection(selectedObject.matrixWorld);
            gizmo.lookAt(gizmo.position.clone().add(worldNormal));
            gizmo.updateMatrixWorld(true);

            setSelectedSubComponent({
              type: 'face',
              index: faceIndex,
              indices: faceIndices,
              originalVertices: originalVertices, // Store original positions in world space
              gizmoMatrixInverse: gizmo.matrixWorld.clone().invert(),
            });
          }
        } else {
          setSelectedSubComponent(null);
        }
      } else {
        handleDeselect();
      }
    };
    currentMount.addEventListener('click', onClick);

    // --- Animation Loop ---
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      renderer.render(scene, camera);
    };
    animate();

    // --- Event Handlers ---
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
        case 'escape': handleDeselect(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      currentMount.removeEventListener('click', onClick);
      transformControls.removeEventListener('dragging-changed', onDraggingChanged);
      transformControls.removeEventListener('objectChange', onObjectChange);
      if (renderer.domElement && renderer.domElement.parentElement === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      orbitControls.dispose();
      transformControls.dispose();
    };
  }, [handleDeselect]); 

  // --- Effect for Tool Changes ---
  useEffect(() => {
    if (transformControlsRef.current) {
      const transformTools = ['translate', 'rotate', 'scale'];
      transformControlsRef.current.setMode(transformTools.includes(tool) ? tool : 'translate');
    }
  }, [tool]);

  // --- Effect for Selection Visuals & Gizmo Attachment ---
  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformControlsRef.current;
    if (!scene || !transformControls) return;

    // Cleanup previous visuals
    selectionVisualsRef.current.forEach(visual => {
      scene.remove(visual);
      if (visual.geometry) visual.geometry.dispose();
      if (visual.material) visual.material.dispose();
    });
    selectionVisualsRef.current = [];
    transformControls.detach();
    transformControls.visible = false;

    if (!selectedObject) return;

    // --- Create new visuals based on selection ---
    if (selectedSubComponent) {
      let gizmoHelper;

      if (selectedSubComponent.type === 'vertex') {
        // Visual: Small sphere for the vertex
        const vertexVisual = new THREE.Mesh(
            new THREE.SphereGeometry(0.05),
            new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: false })
        );
        vertexVisual.position.copy(selectedSubComponent.position);
        scene.add(vertexVisual);
        selectionVisualsRef.current.push(vertexVisual);

        // Gizmo attached to an invisible object at the vertex position
        gizmoHelper = new THREE.Object3D();
        gizmoHelper.position.copy(selectedSubComponent.position);
      } else if (selectedSubComponent.type === 'face') {
        // Visual: Highlighted face
        const positionAttribute = selectedObject.geometry.getAttribute('position');
        const faceIndices = selectedSubComponent.indices;
        const faceVertices = faceIndices.map(index => new THREE.Vector3().fromBufferAttribute(positionAttribute, index));
        
        const highlightGeometry = new THREE.BufferGeometry();
        highlightGeometry.setFromPoints(faceVertices);
        highlightGeometry.setIndex([0, 1, 2]); // Assuming triangular faces
        const faceVisual = new THREE.Mesh(highlightGeometry, new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
        
        // The visual mesh must be in the same coordinate system as the object it's highlighting
        faceVisual.position.copy(selectedObject.position);
        faceVisual.quaternion.copy(selectedObject.quaternion);
        faceVisual.scale.copy(selectedObject.scale);
        scene.add(faceVisual);
        selectionVisualsRef.current.push(faceVisual);
        
        // Gizmo attached to an invisible object at the face's center
        const faceCentroid = new THREE.Vector3();
        faceVertices.forEach(v => faceCentroid.add(v));
        faceCentroid.divideScalar(faceVertices.length);
        selectedObject.localToWorld(faceCentroid); // Convert to world space

        gizmoHelper = new THREE.Object3D();
        gizmoHelper.position.copy(faceCentroid);
        const worldNormal = selectedSubComponent.originalVertices[1].clone().sub(selectedSubComponent.originalVertices[0])
            .cross(selectedSubComponent.originalVertices[2].clone().sub(selectedSubComponent.originalVertices[0]))
            .normalize();
        gizmoHelper.lookAt(gizmoHelper.position.clone().add(worldNormal));
      }
      // Note: Edge selection helper would be implemented here

      if(gizmoHelper){
          scene.add(gizmoHelper);
          selectionVisualsRef.current.push(gizmoHelper);
          transformControls.attach(gizmoHelper);
          transformControls.visible = true;
      }
    } else if (selectionMode === 'object') {
      // Visual: Edges for the whole object
      const edges = new THREE.EdgesGeometry(selectedObject.geometry, 1);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
      const objectOutline = new THREE.LineSegments(edges, lineMaterial);
      objectOutline.position.copy(selectedObject.position);
      objectOutline.quaternion.copy(selectedObject.quaternion);
      objectOutline.scale.copy(selectedObject.scale);
      scene.add(objectOutline);
      selectionVisualsRef.current.push(objectOutline);

      // Keep the outline attached during transformations
      const updateOutline = () => {
          if (selectedObject && objectOutline) {
              objectOutline.position.copy(selectedObject.position);
              objectOutline.quaternion.copy(selectedObject.quaternion);
              objectOutline.scale.copy(selectedObject.scale);
          }
      };
      transformControls.addEventListener('objectChange', updateOutline);
      
      // Cleanup listener when selection changes
      const currentTC = transformControls; // Capture current ref
      const cleanup = () => currentTC.removeEventListener('objectChange', updateOutline);
      selectionVisualsRef.current.push({ dispose: cleanup });

      // Gizmo attached to the object itself
      transformControls.attach(selectedObject);
      transformControls.visible = true;
    }
  }, [selectedObject, selectedSubComponent, selectionMode, tool]);


  // --- Effect for Adding Primitives ---
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
        
        // This is crucial for sub-component editing: ensure geometry is indexed.
        if (!geometry.index) {
          const position = geometry.getAttribute('position');
          const vertexCount = position.count;
          const indices = new Uint32Array(vertexCount);
          for (let i = 0; i < vertexCount; i++) {
              indices[i] = i;
          }
          geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        }
        
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.5;
        sceneRef.current.add(mesh);
      });
      clearPrimitivesToAdd();
    }
  }, [primitivesToAdd, clearPrimitivesToAdd]);

  return <div ref={mountRef} className="w-full h-full" />;
}

    