'use client';

import { useEffect, useRef, useCallback }from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { useScene } from './scene-provider';

export default function Viewport() {
  const {
    tool,
    setTool,
    selectionMode,
    setSelectionMode,
    selectedObjects,
    setSelectedObjects,
    selectedObject,
    setSelectedObject,
    primitivesToAdd,
    clearPrimitivesToAdd,
    selectedSubComponent,
    setSelectedSubComponent,
    fileToImport,
    setFileToImport,
    isPlaying,
    setIsPlaying,
    animationTime,
    setAnimationTime,
    animationDuration,
    setAnimationDuration,
    setAnimationActions,
    mixer,
    setMixer,
    history,
    historyIndex,
    addHistoryState,
    isRestoring,
    setIsRestoring,
    objectsToDelete,
    setObjectsToDelete,
    deleteSelectedObjects,
    setSceneGraph,
    undo,
    redo,
    previewRequested,
    setPreviewRequested,
    setPreviewImage,
  } = useScene();
  
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const selectionVisualsRef = useRef([]); 
  const clockRef = useRef(new THREE.Clock());
  const objectsRef = useRef(new Map());
  const animationFrameId = useRef(null);

  const handleDeselect = useCallback(() => {
    setSelectedObjects([]);
    setSelectedSubComponent(null);
  }, [setSelectedObjects, setSelectedSubComponent]);

  const buildSceneGraph = useCallback(() => {
    if (!sceneRef.current) return [];

    const graph = [];
    const processedUuids = new Set();
    const internalObjectNames = new Set(['gridHelper', 'Main Camera', 'floor', 'Directional Light']);

    const buildNode = (object) => {
      if (!object || processedUuids.has(object.uuid) || internalObjectNames.has(object.name) || object.isTransformControls || object.isLine) return null;
      
      processedUuids.add(object.uuid);

      const node = {
        uuid: object.uuid,
        name: object.name || 'Object',
        type: object.type,
        children: [],
      };

      if (object.children && object.children.length > 0) {
        object.children.forEach(child => {
          const childNode = buildNode(child);
          if (childNode) {
            node.children.push(childNode);
          }
        });
      }
      
      return node;
    };
    
    sceneRef.current.children.forEach(object => {
       const node = buildNode(object);
       if (node) {
         graph.push(node);
       }
    });

    return graph;
  }, []);

  const updateSceneGraph = useCallback(() => {
    const newGraph = buildSceneGraph();
    setSceneGraph(newGraph);
  }, [buildSceneGraph, setSceneGraph]);


  const captureSceneState = useCallback(() => {
    if (!sceneRef.current) return null;
    const state = [];
    objectsRef.current.forEach(child => {
        if ((child.isMesh || child.isGroup || child.isScene) && child.uuid) {
            const objData = {
                uuid: child.uuid,
                name: child.name,
                type: child.type,
                position: child.position.clone(),
                rotation: child.rotation.clone(),
                scale: child.scale.clone(),
                userData: JSON.parse(JSON.stringify(child.userData)),
                parent: child.parent?.uuid
            };

            if (child.isMesh && child.geometry) {
                const geometry = child.geometry;
                if(geometry.isBufferGeometry) {
                    objData.geometry = {
                        position: Array.from(geometry.attributes.position.array),
                        index: geometry.index ? Array.from(geometry.index.array) : null,
                    };
                }
            }
            state.push(objData);
        }
    });
    return state;
  }, []);

  const restoreSceneState = useCallback((state) => {
    if (!sceneRef.current || !state) return;
    
    handleDeselect();
    
    const currentUuids = new Set(Array.from(objectsRef.current.keys()));
    const stateUuids = new Set(state.map(s => s.uuid));

    // Remove objects no longer in state
    currentUuids.forEach(uuid => {
        const obj = objectsRef.current.get(uuid);
        // Don't remove essential scene items
        if(obj && (obj.isCamera || obj.isLight)) return;

        if (!stateUuids.has(uuid)) {
            if (obj) {
                obj.parent?.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if(Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
                objectsRef.current.delete(uuid);
            }
        }
    });
    
    // Add/update objects from state
    state.forEach(objState => {
      let object = objectsRef.current.get(objState.uuid);

      if (!object) {
        if (objState.geometry) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(objState.geometry.position, 3));
          if (objState.geometry.index) {
            geometry.setIndex(objState.geometry.index);
          }
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.1, roughness: 0.5 });
          object = new THREE.Mesh(geometry, material);
        } else if (objState.type === 'Group' || objState.type === 'Scene') {
          object = new THREE.Group();
        } else {
          return;
        }
        object.uuid = objState.uuid;
        objectsRef.current.set(objState.uuid, object);
      }
      
      object.castShadow = true;
      object.receiveShadow = true;

      object.name = objState.name;
      object.position.copy(objState.position);
      object.rotation.copy(objState.rotation);
      object.scale.copy(objState.scale);
      object.userData = JSON.parse(JSON.stringify(objState.userData));

      if (object.isMesh && objState.geometry) {
        object.geometry.attributes.position.array.set(objState.geometry.position);
        object.geometry.attributes.position.needsUpdate = true;
        if (objState.geometry.index && object.geometry.index) {
          object.geometry.index.array.set(objState.geometry.index);
          object.geometry.index.needsUpdate = true;
        }
        object.geometry.computeVertexNormals();
        object.geometry.computeBoundingSphere();
      }
    });

    // Second pass for parenting
    state.forEach(objState => {
        const object = objectsRef.current.get(objState.uuid);
        let parent = objState.parent ? objectsRef.current.get(objState.parent) : null;
        if (!parent) {
          // If parent not found in map, it might be the scene itself if it's a top-level object
          const parentInScene = sceneRef.current.getObjectByProperty('uuid', objState.parent);
          if (!parentInScene) {
            parent = sceneRef.current;
          }
        }

        if (object && parent && object.parent !== parent) {
            parent.add(object);
        } else if (object && !object.parent) {
            sceneRef.current.add(object);
        }
    });

    updateSceneGraph();

  }, [handleDeselect, updateSceneGraph]);
  
  const findClosestVertex = useCallback((intersect, object) => {
      const positionAttribute = object.geometry.getAttribute('position');
      let closestVertexIndex = -1;
      let minDistanceSq = Infinity;
      const intersectPoint = intersect.point;
      const worldToLocal = new THREE.Matrix4().copy(object.matrixWorld).invert();
      const localIntersectPoint = intersectPoint.clone().applyMatrix4(worldToLocal);

      for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
        const distanceSq = vertex.distanceToSquared(localIntersectPoint);
        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          closestVertexIndex = i;
        }
      }
      
      const worldVertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, closestVertexIndex);
      object.localToWorld(worldVertex);
      // A small tolerance to ensure we're clicking near the vertex
      const worldDistance = worldVertex.distanceTo(intersectPoint);

      if (worldDistance > 0.5) return null;

      return { index: closestVertexIndex, distance: worldDistance };
  }, []);

  // --- Main Initialization Effect ---
  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xadb9d4);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    camera.name = "Main Camera";
    scene.add(camera);
    cameraRef.current = camera;
    objectsRef.current.set(camera.uuid, camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    rendererRef.current = renderer;
    currentMount.appendChild(renderer.domElement);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    orbitControlsRef.current = orbitControls;

    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControlsRef.current = transformControls;
    
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    floor.name = 'floor';
    scene.add(floor);


    const gridHelper = new THREE.GridHelper(50, 50, 0xe0e0e0, 0xe0e0e0);
    gridHelper.name = 'gridHelper';
    scene.add(gridHelper);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 5);
    directionalLight.castShadow = true;
    directionalLight.name = "Directional Light";
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    objectsRef.current.set(directionalLight.uuid, directionalLight);


    // HDR Lighting
    new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/empty_warehouse_01_1k.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
    });

    const onDraggingChanged = (event) => {
      orbitControls.enabled = !event.value;
      if (!event.value) { // Drag finished
          addHistoryState(captureSceneState());
      }
    };
    transformControls.addEventListener('dragging-changed', onDraggingChanged);

    const onObjectChange = () => {
        if (!selectedSubComponent || !selectedObject || !transformControls.object) return;
    
        const objectWithGeometry = objectsRef.current.get(selectedObject.uuid);
        if (!objectWithGeometry || !objectWithGeometry.isMesh) return;

        const positionAttribute = objectWithGeometry.geometry.getAttribute('position');
        const gizmo = transformControls.object;
    
        if (selectedSubComponent.type === 'vertex') {
            const localPosition = objectWithGeometry.worldToLocal(gizmo.position.clone());
            positionAttribute.setXYZ(selectedSubComponent.index, localPosition.x, localPosition.y, localPosition.z);
            positionAttribute.needsUpdate = true;
            objectWithGeometry.geometry.computeVertexNormals();
        } else if (selectedSubComponent.type === 'face') {
            const gizmoMatrix = gizmo.matrixWorld.clone();
            const invOriginalMatrix = selectedSubComponent.gizmoMatrixInverse;
            const deltaTransform = gizmoMatrix.multiply(invOriginalMatrix);
    
            selectedSubComponent.indices.forEach((vertexIndex, i) => {
                const originalVertex = selectedSubComponent.originalVertices[i].clone();
                const newWorldPos = originalVertex.applyMatrix4(deltaTransform);
                const newLocalPos = objectWithGeometry.worldToLocal(newWorldPos);
                
                positionAttribute.setXYZ(vertexIndex, newLocalPos.x, newLocalPos.y, newLocalPos.z);
            });
    
            positionAttribute.needsUpdate = true;
            objectWithGeometry.geometry.computeVertexNormals();
            objectWithGeometry.geometry.computeBoundingSphere();
        }
    };
    transformControls.addEventListener('objectChange', onObjectChange);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event) => {
      if (transformControls.dragging) return;
      event.preventDefault();

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(objectsRef.current.values()).filter(o => o.isMesh);
      const intersects = raycaster.intersectObjects(meshes, true);
      
      let clickedObjectData = null;
      if (intersects.length > 0) {
        let current = intersects[0].object;
        while(current) {
            // Find the top-level parent that is tracked in objectsRef
            if(objectsRef.current.has(current.uuid) && current.parent === sceneRef.current) {
                clickedObjectData = { uuid: current.uuid, name: current.name, type: current.type };
                break;
            }
             // If we hit the scene without finding a tracked parent, this object is likely part of a group
            if(current.parent === sceneRef.current) {
                let groupParent = current;
                while (groupParent.parent && groupParent.parent !== sceneRef.current) {
                    groupParent = groupParent.parent;
                }
                if (objectsRef.current.has(groupParent.uuid)) {
                    clickedObjectData = { uuid: groupParent.uuid, name: groupParent.name, type: groupParent.type };
                }
                break;
            }
            current = current.parent;
        }
      }
      
      if (selectionMode === 'object') {
        if (clickedObjectData) {
          if (event.shiftKey) {
            setSelectedObjects(prev => {
              const isAlreadySelected = prev.some(obj => obj.uuid === clickedObjectData.uuid);
              if (isAlreadySelected) {
                return prev.filter(obj => obj.uuid !== clickedObjectData.uuid);
              } else {
                return [...prev, clickedObjectData];
              }
            });
          } else {
            setSelectedObjects([clickedObjectData]);
          }
        } else {
            if(!event.shiftKey) handleDeselect();
        }
        setSelectedSubComponent(null);
      } else if (clickedObjectData) {
        const clickedObject = objectsRef.current.get(clickedObjectData.uuid);
        if (!clickedObject || !clickedObject.isMesh) {
            setSelectedObject(clickedObjectData);
            setSelectedSubComponent(null);
            return;
        }

         if (selectedObject?.uuid !== clickedObject.uuid) {
          setSelectedObject(clickedObjectData);
          setSelectedSubComponent(null);
          return; 
        }
        
        const geometry = clickedObject.geometry;
        const positionAttribute = geometry.getAttribute('position');

        if (selectionMode === 'vertex') {
          const closestVertex = findClosestVertex(intersects[0], clickedObject);
          if (closestVertex) {
            const vertexPosition = new THREE.Vector3().fromBufferAttribute(positionAttribute, closestVertex.index);
            clickedObject.localToWorld(vertexPosition);
            setSelectedSubComponent({ type: 'vertex', index: closestVertex.index, position: vertexPosition });
          } else {
            setSelectedSubComponent(null);
          }
        } else if (selectionMode === 'face' && intersects[0].face) {
            
            if (!geometry.index) {
                console.error("Geometry is non-indexed, cannot select faces.");
                return;
            }

            const faceIndex = intersects[0].faceIndex;
            const faceIndices = [geometry.index.getX(faceIndex), geometry.index.getY(faceIndex), geometry.index.getZ(faceIndex)];
            
            const originalVertices = faceIndices.map(index => 
              new THREE.Vector3().fromBufferAttribute(positionAttribute, index).applyMatrix4(clickedObject.matrixWorld)
            );
            
            const faceCentroid = new THREE.Vector3();
            originalVertices.forEach(v => faceCentroid.add(v));
            faceCentroid.divideScalar(originalVertices.length);

            const gizmo = new THREE.Object3D();
            gizmo.position.copy(faceCentroid);
            const worldNormal = intersects[0].face.normal.clone().transformDirection(clickedObject.matrixWorld);
            gizmo.lookAt(gizmo.position.clone().add(worldNormal));
            gizmo.updateMatrixWorld(true);

            setSelectedSubComponent({
              type: 'face',
              index: faceIndex,
              indices: faceIndices,
              originalVertices: originalVertices,
              gizmoMatrixInverse: gizmo.matrixWorld.clone().invert(),
            });
        } else {
          setSelectedSubComponent(null);
        }
      } else {
        handleDeselect();
      }
    };
    currentMount.addEventListener('click', onClick);

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
      
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undo();
      } else if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
            event.preventDefault();
            redo();
      }
      
      switch (event.key.toLowerCase()) {
        case 'w': setTool('translate'); break;
        case 'e': setTool('rotate'); break;
        case 'r': setTool('scale'); break;
        case '1': setSelectionMode('object'); setSelectedSubComponent(null); break;
        case '2': setSelectionMode('vertex'); setSelectedSubComponent(null); break;
        case '3': setSelectionMode('edge'); setSelectedSubComponent(null); break;
        case '4': setSelectionMode('face'); setSelectedSubComponent(null); break;
        case 'escape': handleDeselect(); break;
        case 'delete':
        case 'backspace':
            deleteSelectedObjects();
            break;
        case ' ': event.preventDefault(); if(mixer) setIsPlaying(p => !p); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    updateSceneGraph();
    // Save initial state
    setTimeout(() => {
        addHistoryState(captureSceneState());
        updateSceneGraph();
    }, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      currentMount.removeEventListener('click', onClick);
      transformControls.removeEventListener('dragging-changed', onDraggingChanged);
      transformControls.removeEventListener('objectChange', onObjectChange);
      if (renderer.domElement && renderer.domElement.parentElement === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
       if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      orbitControls.dispose();
      transformControls.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // --- Effect for Animation Loop ---
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const orbitControls = orbitControlsRef.current;

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      orbitControls.update();
      
      const delta = clockRef.current.getDelta();
      if (mixer && isPlaying) {
        mixer.update(delta);
        const newTime = Math.min(mixer.time, animationDuration);
        setAnimationTime(newTime);
      }

      renderer.render(scene, camera);
    };

    // Start the animation loop
    animate();

    return () => {
      // Clean up the animation frame when the component unmounts or deps change
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, mixer, animationDuration]);


  // --- Effect for Undo/Redo ---
  useEffect(() => {
    if (isRestoring && history[historyIndex]) {
      restoreSceneState(history[historyIndex]);
      setIsRestoring(false);
    }
  }, [isRestoring, historyIndex, history, restoreSceneState, setIsRestoring]);


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

    // Clear previous selection visuals
    selectionVisualsRef.current.forEach(visual => {
      scene.remove(visual);
      if (visual.geometry) visual.geometry.dispose();
      if (visual.material) visual.material.dispose();
      if(visual.dispose) visual.dispose();
    });
    selectionVisualsRef.current = [];
    transformControls.detach();
    transformControls.visible = false;
    
    // Create visuals for all selected objects
    selectedObjects.forEach(selObject => {
        const actualObject = objectsRef.current.get(selObject.uuid);
        if (!actualObject) return;
        
        let objectToOutline = actualObject;
        if (actualObject.isGroup) {
            // Find a mesh to get geometry from if it's a group
            actualObject.traverse(child => {
                if (child.isMesh) objectToOutline = child;
            });
        }
        
        if (!objectToOutline.isMesh) return;

        const edges = new THREE.EdgesGeometry(objectToOutline.geometry, 1);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x1d4ed8, linewidth: 2, depthTest: false });
        const objectOutline = new THREE.LineSegments(edges, lineMaterial);
        objectOutline.matrix.copy(objectToOutline.matrixWorld);
        objectOutline.matrixAutoUpdate = false;
        objectOutline.renderOrder = 1;
        scene.add(objectOutline);
        selectionVisualsRef.current.push(objectOutline);

        const updateOutline = () => {
            if (objectToOutline && objectOutline) {
                objectOutline.matrix.copy(objectToOutline.matrixWorld);
            }
        };
        transformControls.addEventListener('objectChange', updateOutline);
        
        const currentTC = transformControls;
        const cleanup = () => currentTC.removeEventListener('objectChange', updateOutline);
        selectionVisualsRef.current.push({ dispose: cleanup });
    });


    if (!selectedObject) return;

    const actualObject = objectsRef.current.get(selectedObject.uuid);
    if (!actualObject) return;

    if (selectedSubComponent) {
      let gizmoHelper;

      if (selectedSubComponent.type === 'vertex') {
        const vertexVisual = new THREE.Mesh(
            new THREE.SphereGeometry(0.05),
            new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: false, depthTest: false })
        );
        vertexVisual.position.copy(selectedSubComponent.position);
        vertexVisual.renderOrder = 1; // Render on top
        scene.add(vertexVisual);
        selectionVisualsRef.current.push(vertexVisual);

        gizmoHelper = new THREE.Object3D();
        gizmoHelper.position.copy(selectedSubComponent.position);
      } else if (selectedSubComponent.type === 'face' && actualObject.isMesh) {
        const positionAttribute = actualObject.geometry.getAttribute('position');
        const faceIndices = selectedSubComponent.indices;
        
        // Use a BufferGeometry to create the highlight face
        const highlightGeometry = new THREE.BufferGeometry();
        const faceVertices = [];
        faceIndices.forEach(index => {
          const v = new THREE.Vector3().fromBufferAttribute(positionAttribute, index);
          faceVertices.push(v.x, v.y, v.z);
        });
        
        highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(faceVertices, 3));
        highlightGeometry.setIndex([0,1,2]); // Assuming triangular faces
        
        const faceVisual = new THREE.Mesh(highlightGeometry, new THREE.MeshBasicMaterial({ color: 0x1d4ed8, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthTest: false }));
        
        faceVisual.matrix.copy(actualObject.matrixWorld);
        faceVisual.matrixAutoUpdate = false;
        faceVisual.renderOrder = 1;
        scene.add(faceVisual);
        selectionVisualsRef.current.push(faceVisual);
        
        const centroid = new THREE.Vector3()
          .fromBufferAttribute(positionAttribute, faceIndices[0])
          .add(new THREE.Vector3().fromBufferAttribute(positionAttribute, faceIndices[1]))
          .add(new THREE.Vector3().fromBufferAttribute(positionAttribute, faceIndices[2]))
          .divideScalar(3);

        const worldCentroid = centroid.clone().applyMatrix4(actualObject.matrixWorld);
        
        gizmoHelper = selectedSubComponent.gizmo || new THREE.Object3D();
        gizmoHelper.position.copy(worldCentroid);
        
        const worldNormal = new THREE.Triangle(
            new THREE.Vector3().fromBufferAttribute(positionAttribute, faceIndices[0]),
            new THREE.Vector3().fromBufferAttribute(positionAttribute, faceIndices[1]),
            new THREE.Vector3().fromBufferAttribute(positionAttribute, faceIndices[2])
        ).getNormal(new THREE.Vector3()).clone().transformDirection(actualObject.matrixWorld).normalize();

        gizmoHelper.lookAt(gizmoHelper.position.clone().add(worldNormal));
      }

      if(gizmoHelper){
          scene.add(gizmoHelper);
          selectionVisualsRef.current.push(gizmoHelper);
          transformControls.attach(gizmoHelper);
          transformControls.visible = true;
      }
    } else if (selectionMode === 'object') {
      transformControls.attach(actualObject);
      transformControls.visible = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObjects, selectedSubComponent, selectionMode, tool]);


  // --- Effect for Adding Primitives ---
  useEffect(() => {
    if (primitivesToAdd.length > 0 && sceneRef.current) {
      primitivesToAdd.forEach(primitiveType => {
        const loader = new GLTFLoader();
        
        if (primitiveType === 'torus') {
          loader.load('https://cdn.glitch.me/68b2a272-e034-45d6-8832-c1161245a4a5/torus.glb', (gltf) => {
            handleLoadedModel(gltf.scene, [], primitiveType);
          });
          return;
        }

        if (primitiveType === 'robotic-arm') {
          loader.load('https://raw.githubusercontent.com/rpaliguid/nascad/main/Robotic%20Arm.glb', (gltf) => {
            handleLoadedModel(gltf.scene, gltf.animations, 'Robotic Arm');
          });
          return;
        }

        if (primitiveType === 'gun') {
          loader.load('https://raw.githubusercontent.com/rpaliguid/nascad/main/Gun.glb', (gltf) => {
            handleLoadedModel(gltf.scene, gltf.animations, 'Gun');
          });
          return;
        }

        let geometry;
        const randomColor = new THREE.Color().setHSL(Math.random(), 0.7, 0.8);
        const material = new THREE.MeshStandardMaterial({
          color: randomColor,
          metalness: 0.1,
          roughness: 0.5
        });
        
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

        // Ensure the geometry is indexed for sub-component selection
        if (!geometry.index) {
          const indexedGeometry = new THREE.BufferGeometry();
          indexedGeometry.setAttribute('position', geometry.getAttribute('position'));
          if (geometry.getAttribute('normal')) {
            indexedGeometry.setAttribute('normal', geometry.getAttribute('normal'));
          }
          if (geometry.getAttribute('uv')) {
            indexedGeometry.setAttribute('uv', geometry.getAttribute('uv'));
          }
          geometry.dispose();
          geometry = indexedGeometry.toIndexed();
        }
        
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = primitiveType.charAt(0).toUpperCase() + primitiveType.slice(1);
        mesh.position.y = 0.5;
        sceneRef.current.add(mesh);
        objectsRef.current.set(mesh.uuid, mesh);
      });
      
      addHistoryState(captureSceneState());
      updateSceneGraph();
      clearPrimitivesToAdd();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primitivesToAdd, clearPrimitivesToAdd, addHistoryState, captureSceneState, updateSceneGraph]);

  const handleLoadedModel = useCallback((object, animations, name = 'Imported') => {
    const randomColor = new THREE.Color().setHSL(Math.random(), 0.7, 0.8);
    object.name = name.charAt(0).toUpperCase() + name.slice(1);
    object.traverse((child) => {
      if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          const newMaterial = new THREE.MeshStandardMaterial({
            color: randomColor,
            metalness: 0.1,
            roughness: 0.5,
          });
          if(child.material.map) newMaterial.map = child.material.map;
          child.material = newMaterial;
          
          if (!child.geometry.index) {
              child.geometry = child.geometry.toIndexed();
          }
          child.geometry.computeVertexNormals();
      }
      objectsRef.current.set(child.uuid, child);
    });
    
    if (animations && animations.length > 0) {
        const newMixer = new THREE.AnimationMixer(object);
        const newActions = animations.map(clip => newMixer.clipAction(clip));
        let maxDuration = 0;
        animations.forEach(clip => {
            maxDuration = Math.max(maxDuration, clip.duration);
        });

        newActions.forEach(action => action.play());
        
        setMixer(newMixer);
        setAnimationActions(newActions);
        setAnimationDuration(maxDuration);
        setAnimationTime(0);
        setIsPlaying(false); // Start paused
    }
    sceneRef.current.add(object);
    
    addHistoryState(captureSceneState());
    updateSceneGraph();
  }, [addHistoryState, captureSceneState, updateSceneGraph, setMixer, setAnimationActions, setAnimationDuration, setAnimationTime, setIsPlaying]);

  // --- Effect for Importing Files ---
  useEffect(() => {
    if (fileToImport && sceneRef.current) {
      const reader = new FileReader();
      const filename = fileToImport.name.toLowerCase();

      reader.onload = (e) => {
        const contents = e.target.result;
        
        if (filename.endsWith('.gltf') || filename.endsWith('.glb')) {
          const loader = new GLTFLoader();
          loader.parse(contents, '', (gltf) => {
            handleLoadedModel(gltf.scene, gltf.animations, fileToImport.name.replace(/\.[^/.]+$/, ""));
          }, (error) => {
            console.error('An error happened with GLTFLoader:', error);
          });
        } else {
          console.error('Unsupported file type');
          return;
        }
      };

      if (filename.endsWith('.glb') || filename.endsWith('.gltf')) {
        reader.readAsArrayBuffer(fileToImport);
      }
      
      setFileToImport(null);
    }
  }, [fileToImport, setFileToImport, handleLoadedModel]);


  // --- Effect for Deleting Objects ---
    useEffect(() => {
        if (objectsToDelete.length > 0) {
            objectsToDelete.forEach(objToDelete => {
                const object = objectsRef.current.get(objToDelete.uuid);
                if (object) {
                    
                    // Recursively remove from map
                    object.traverse(child => {
                        if (transformControlsRef.current?.object === child) {
                            transformControlsRef.current.detach();
                        }
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if(Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                            else child.material.dispose();
                        }
                        objectsRef.current.delete(child.uuid);
                    });

                    object.parent?.remove(object);
                }
            });

            handleDeselect();
            addHistoryState(captureSceneState());
            updateSceneGraph();
            setObjectsToDelete([]);
        }
    }, [objectsToDelete, setObjectsToDelete, addHistoryState, captureSceneState, handleDeselect, updateSceneGraph]);
  
  // --- Effect for Preview ---
  useEffect(() => {
    if (previewRequested) {
      const renderer = rendererRef.current;
      if (renderer) {
        // Force a render of the scene to ensure it's up-to-date
        renderer.render(sceneRef.current, cameraRef.current);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        setPreviewImage(dataUrl);
      }
      setPreviewRequested(false);
    }
  }, [previewRequested, setPreviewRequested, setPreviewImage]);


  return <div ref={mountRef} className="w-full h-full" />;
}
