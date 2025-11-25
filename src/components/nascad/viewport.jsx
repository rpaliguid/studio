'use client';

import { useEffect, useRef, useCallback }from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { useScene } from './scene-provider';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';


// --- Constants ---
const HIGHLIGHT_COLOR = 0x1d4ed8; // Blue
const VERTEX_HELPER_SIZE = 0.03;
const EDGE_HELPER_WIDTH = 3;

// --- Helper Functions ---

/**
 * Extracts and caches the topology of a mesh's geometry.
 * This includes unique vertices, edges derived from the index, and faces.
 */
function extractTopology(geometry) {
    if (geometry.userData.topology) {
        return geometry.userData.topology;
    }

    const vertices = [];
    const positionAttribute = geometry.getAttribute('position');
    for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
        vertices.push(vertex);
    }

    const edges = new Map();
    const faces = [];
    const index = geometry.index;

    if (index) {
        for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i);
            const b = index.getX(i + 1);
            const c = index.getX(i + 2);
            faces.push({ a, b, c, index: i / 3 });

            const edge1Key = `${Math.min(a, b)}-${Math.max(a, b)}`;
            const edge2Key = `${Math.min(b, c)}-${Math.max(b, c)}`;
            const edge3Key = `${Math.min(c, a)}-${Math.max(c, a)}`;
            
            edges.set(edge1Key, { a, b });
            edges.set(edge2Key, { b, c });
            edges.set(edge3Key, { c, a });
        }
    }
    
    const topology = { vertices, edges: Array.from(edges.entries()).map(([key, value]) => ({ key, ...value })), faces };
    geometry.userData.topology = topology;
    return topology;
}

// Custom raycasting for lines (edges) - more reliable than THREE.Raycaster for thin lines
function raycastEdge(ray, edge, matrixWorld, threshold) {
    const vStart = edge.geometry.attributes.position.array.slice(0, 3);
    const vEnd = edge.geometry.attributes.position.array.slice(3, 6);
    
    const start = new THREE.Vector3().fromArray(vStart).applyMatrix4(matrixWorld);
    const end = new THREE.Vector3().fromArray(vEnd).applyMatrix4(matrixWorld);

    const distance = ray.distanceToPoint(start) < ray.distanceToPoint(end) 
        ? ray.ray.distanceSqToSegment(start, end, null, null)
        : ray.ray.distanceSqToSegment(end, start, null, null);

    if (distance < threshold * threshold) {
        return { distance: Math.sqrt(distance), object: edge };
    }
    return null;
}


export default function Viewport() {
  const {
    tool,
    setTool,
    editMode,
    setEditMode,
    selectionMode,
    setSelectionMode,
    selectedObjects,
    setSelectedObjects,
    selectedObject,
    primitivesToAdd,
    clearPrimitivesToAdd,
    selectedSubComponents,
    setSelectedSubComponents,
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
    isWireframe,
    setExtrude,
  } = useScene();
  
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const objectsRef = useRef(new Map());
  const animationFrameId = useRef(null);
  const gizmoHelperRef = useRef(null);

  // --- Edit Mode Refs ---
  const editSessionRef = useRef({
      object: null,
      topology: null,
      helpersGroup: null, // A group to hold all helpers for easy management
      initialVertexPositions: null, // Store vertex positions at start of a drag
      gizmoMatrixInverse: null, // Store gizmo matrix for transform calculations
  });


  const handleDeselect = useCallback(() => {
    setSelectedObjects([]);
    setSelectedSubComponents({ vertices: [], edges: [], faces: [] });
  }, [setSelectedObjects, setSelectedSubComponents]);

  const buildSceneGraph = useCallback(() => {
    if (!sceneRef.current) return [];

    const graph = [];
    const processedUuids = new Set();
    const internalObjectNames = new Set(['gridHelper', 'Main Camera', 'floor', 'Directional Light', 'GizmoHelper']);
    
    const buildNode = (object) => {
        if (!object || processedUuids.has(object.uuid) || internalObjectNames.has(object.name) || object.isTransformControls || object.userData.isHelper) return null;
        
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
        // Invalidate cached topology
        if(object.geometry.userData.topology) delete object.geometry.userData.topology;

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

  // --- Main Initialization Effect ---
  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x909090);
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

    gizmoHelperRef.current = new THREE.Object3D();
    gizmoHelperRef.current.name = "GizmoHelper";
    scene.add(gizmoHelperRef.current);
    
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    floor.name = 'floor';
    scene.add(floor);


    const gridHelper = new THREE.GridHelper(50, 50, 0x00ffff, 0x00ffff);
    gridHelper.name = 'gridHelper';
    scene.add(gridHelper);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
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

    // --- TRANSFORM CONTROL LISTENERS ---
    const onDraggingChanged = (event) => {
      orbitControls.enabled = !event.value;
      if (!event.value) { // Drag finished
          addHistoryState(captureSceneState());
          if (editMode) {
              // After dragging vertices, clear the initial positions
              editSessionRef.current.initialVertexPositions = null;
          }
      } else { // Drag started
          if (editMode && selectedObject) {
              // Store initial vertex positions before transforming
              const editObject = objectsRef.current.get(selectedObject.uuid);
              if (editObject && editObject.isMesh) {
                  const positions = editObject.geometry.attributes.position.array;
                  editSessionRef.current.initialVertexPositions = new Float32Array(positions);
                  editSessionRef.current.gizmoMatrixInverse = gizmoHelperRef.current.matrixWorld.clone().invert();
              }
          }
      }
    };
    transformControls.addEventListener('dragging-changed', onDraggingChanged);

    const onObjectChange = () => {
        if (!editMode || !selectedObject || !gizmoHelperRef.current || !editSessionRef.current.initialVertexPositions) return;
    
        const editObject = objectsRef.current.get(selectedObject.uuid);
        if (!editObject || !editObject.isMesh) return;
    
        const positionAttribute = editObject.geometry.getAttribute('position');
        const gizmo = gizmoHelperRef.current;
        
        // This is a simplified move for all sub-component types.
        const deltaTransform = gizmo.matrixWorld.clone().multiply(editSessionRef.current.gizmoMatrixInverse);
    
        const verticesToMove = new Set();
        selectedSubComponents.vertices.forEach(vIdx => verticesToMove.add(vIdx));
        selectedSubComponents.faces.forEach(fIdx => {
            const face = editSessionRef.current.topology.faces[fIdx];
            verticesToMove.add(face.a);
            verticesToMove.add(face.b);
            verticesToMove.add(face.c);
        });
        selectedSubComponents.edges.forEach(edgeKey => {
            const [v1, v2] = edgeKey.split('-').map(Number);
            verticesToMove.add(v1);
            verticesToMove.add(v2);
        });
    
        verticesToMove.forEach(vertexIndex => {
            const initialVertex = new THREE.Vector3().fromArray(editSessionRef.current.initialVertexPositions, vertexIndex * 3);
            const newWorldPos = initialVertex.clone().applyMatrix4(editObject.matrixWorld).applyMatrix4(deltaTransform);
            const newLocalPos = editObject.worldToLocal(newWorldPos);
            positionAttribute.setXYZ(vertexIndex, newLocalPos.x, newLocalPos.y, newLocalPos.z);
        });
    
        positionAttribute.needsUpdate = true;
        editObject.geometry.computeVertexNormals();
        editObject.geometry.computeBoundingSphere();
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
      
      if (!editMode) {
          // --- OBJECT SELECTION ---
          const meshes = Array.from(objectsRef.current.values()).filter(o => o.isMesh);
          const intersects = raycaster.intersectObjects(meshes, true);
          let clickedObjectData = null;
          if (intersects.length > 0) {
            let current = intersects[0].object;
            while(current) {
                if(objectsRef.current.has(current.uuid) && (current.parent === sceneRef.current || current.parent?.type === 'Scene')) {
                    clickedObjectData = { uuid: current.uuid, name: current.name, type: current.type };
                    break;
                }
                if(current.parent === sceneRef.current) {
                    let groupParent = current;
                    while (groupParent.parent && groupParent.parent !== sceneRef.current && groupParent.parent.type !== 'Scene') {
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
      } else {
           // --- EDIT MODE SELECTION ---
          if (!selectedObject || !editSessionRef.current.helpersGroup) return;

          let newSelectedVertices = [...selectedSubComponents.vertices];
          let newSelectedEdges = [...selectedSubComponents.edges];
          let newSelectedFaces = [...selectedSubComponents.faces];
          
          let hit = false;
          
          if (selectionMode === 'vertex') {
              const vertexHelpers = editSessionRef.current.helpersGroup.children.filter(h => h.userData.type === 'vertex');
              const intersects = raycaster.intersectObjects(vertexHelpers);
              if (intersects.length > 0) {
                  const vertexIndex = intersects[0].object.userData.index;
                  if (event.shiftKey) {
                      newSelectedVertices = newSelectedVertices.includes(vertexIndex)
                          ? newSelectedVertices.filter(v => v !== vertexIndex)
                          : [...newSelectedVertices, vertexIndex];
                  } else {
                      newSelectedVertices = [vertexIndex];
                  }
                  hit = true;
              }
          } else if (selectionMode === 'edge') {
              const edgeHelpers = editSessionRef.current.helpersGroup.children.filter(h => h.userData.type === 'edge');
              const edgeIntersects = [];
              for (const edgeHelper of edgeHelpers) {
                   const intersect = raycastEdge(raycaster, edgeHelper, edgeHelper.matrixWorld, 0.05);
                   if (intersect) edgeIntersects.push(intersect);
              }

              if (edgeIntersects.length > 0) {
                  edgeIntersects.sort((a, b) => a.distance - b.distance);
                  const edgeKey = edgeIntersects[0].object.userData.key;
                   if (event.shiftKey) {
                      newSelectedEdges = newSelectedEdges.includes(edgeKey)
                          ? newSelectedEdges.filter(e => e !== edgeKey)
                          : [...newSelectedEdges, edgeKey];
                  } else {
                      newSelectedEdges = [edgeKey];
                  }
                  hit = true;
              }
          } else if (selectionMode === 'face') {
              const editObject = objectsRef.current.get(selectedObject.uuid);
              if(editObject && editObject.isMesh) {
                  const intersects = raycaster.intersectObject(editObject);
                  if (intersects.length > 0 && intersects[0].face) {
                      const faceIndex = intersects[0].faceIndex;
                      if (event.shiftKey) {
                           newSelectedFaces = newSelectedFaces.includes(faceIndex)
                              ? newSelectedFaces.filter(f => f !== faceIndex)
                              : [...newSelectedFaces, faceIndex];
                      } else {
                          newSelectedFaces = [faceIndex];
                      }
                      hit = true;
                  }
              }
          }

          if (hit) {
              setSelectedSubComponents({ vertices: newSelectedVertices, edges: newSelectedEdges, faces: newSelectedFaces });
          } else if (!event.shiftKey) {
              setSelectedSubComponents({ vertices: [], edges: [], faces: [] });
          }
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
        case 'tab': 
          event.preventDefault(); 
          if(selectedObjects.length > 0) setEditMode(!editMode);
          break;
        case '1': if(editMode) setSelectionMode('vertex'); break;
        case '2': if(editMode) setSelectionMode('edge'); break;
        case '3': if(editMode) setSelectionMode('face'); break;
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

       // Update helpers in edit mode
      if (editMode && editSessionRef.current.helpersGroup && editSessionRef.current.object) {
        editSessionRef.current.helpersGroup.matrix.copy(editSessionRef.current.object.matrixWorld);
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
  }, [isPlaying, mixer, animationDuration, editMode]);


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

  // --- Cleanup helper function ---
  const cleanupEditSession = () => {
    if (editSessionRef.current.helpersGroup) {
        sceneRef.current.remove(editSessionRef.current.helpersGroup);
        editSessionRef.current.helpersGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
    editSessionRef.current = { object: null, topology: null, helpersGroup: null };
    transformControlsRef.current.detach();
  };
  
  // --- Effect for Edit Mode & Selection Visuals ---
  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformControlsRef.current;
    const gizmoHelper = gizmoHelperRef.current;

    cleanupEditSession();
    
    // Manage main object outlines
    const outlineGroup = scene.getObjectByName('selectionOutlines');
    if (outlineGroup) scene.remove(outlineGroup);
    
    if (selectedObjects.length > 0) {
      const newOutlineGroup = new THREE.Group();
      newOutlineGroup.name = 'selectionOutlines';
      scene.add(newOutlineGroup);

      const outlineMaterial = new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, linewidth: 2, depthTest: false, renderOrder: 2 });
      
      selectedObjects.forEach(selObject => {
          const actualObject = objectsRef.current.get(selObject.uuid);
          if (!actualObject) return;
          actualObject.traverse(child => {
            if (child.isMesh) {
                const edges = new THREE.EdgesGeometry(child.geometry, 1);
                const objectOutline = new THREE.LineSegments(edges, outlineMaterial);
                objectOutline.position.copy(child.getWorldPosition(new THREE.Vector3()));
                objectOutline.quaternion.copy(child.getWorldQuaternion(new THREE.Quaternion()));
                objectOutline.scale.copy(child.getWorldScale(new THREE.Vector3()));
                newOutlineGroup.add(objectOutline);
            }
          });
      });
    }

    // --- OBJECT MODE ---
    if (!editMode || !selectedObject) {
      if (selectedObject) {
        const objectToAttach = objectsRef.current.get(selectedObject.uuid);
        if (objectToAttach) transformControls.attach(objectToAttach);
      }
      return; 
    }

    // --- EDIT MODE ---
    const editObject = objectsRef.current.get(selectedObject.uuid);
    if (!editObject || !editObject.isMesh) {
      setEditMode(false); // Can't enter edit mode on non-mesh or group
      return;
    }

    const topology = extractTopology(editObject.geometry);
    const helpersGroup = new THREE.Group();
    helpersGroup.userData.isHelper = true;
    scene.add(helpersGroup);

    editSessionRef.current = {
      object: editObject,
      topology,
      helpersGroup,
    };
    
    // --- Create and cache helpers ---
    const vertexMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, renderOrder: 3 });
    topology.vertices.forEach((vertex, index) => {
        const isSelected = selectedSubComponents.vertices.includes(index);
        const helper = new THREE.Mesh(new THREE.SphereGeometry(VERTEX_HELPER_SIZE), vertexMaterial.clone());
        helper.material.color.set(isSelected ? HIGHLIGHT_COLOR : 0xffffff);
        helper.position.copy(vertex);
        helper.userData = { type: 'vertex', index };
        helper.visible = selectionMode === 'vertex';
        helpersGroup.add(helper);
    });

    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: EDGE_HELPER_WIDTH, depthTest: false, renderOrder: 2 });
    topology.edges.forEach(({ key, a, b }) => {
        const isSelected = selectedSubComponents.edges.includes(key);
        const v1 = topology.vertices[a];
        const v2 = topology.vertices[b];
        if (!v1 || !v2) return; // Add this check
        const geometry = new THREE.BufferGeometry().setFromPoints([v1, v2]);
        const helper = new THREE.Line(geometry, edgeMaterial.clone());
        helper.material.color.set(isSelected ? HIGHLIGHT_COLOR : 0xffffff);
        helper.userData = { type: 'edge', key };
        helper.visible = selectionMode === 'edge';
        helpersGroup.add(helper);
    });
    
    const faceMaterial = new THREE.MeshBasicMaterial({ color: HIGHLIGHT_COLOR, side: THREE.DoubleSide, transparent: true, opacity: 0.3, depthTest: false, renderOrder: 1 });
    const selectedFaceGeometries = [];
    selectedSubComponents.faces.forEach(faceIndex => {
        const face = topology.faces[faceIndex];
        const positionAttribute = editObject.geometry.getAttribute('position');
        const vA = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.a);
        const vB = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.b);
        const vC = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.c);

        const faceGeometry = new THREE.BufferGeometry().setFromPoints([vA, vB, vC]);
        faceGeometry.setIndex([0, 1, 2]);
        selectedFaceGeometries.push(faceGeometry);
    });
    if (selectedFaceGeometries.length > 0) {
      const combinedGeom = BufferGeometryUtils.mergeGeometries(selectedFaceGeometries);
      const faceVisual = new THREE.Mesh(combinedGeom, faceMaterial);
      helpersGroup.add(faceVisual);
    }
    
    helpersGroup.matrix.copy(editObject.matrixWorld);
    helpersGroup.matrixAutoUpdate = false;

    // --- Update Gizmo ---
    const allSelectedVerticesIndices = new Set();
    selectedSubComponents.vertices.forEach(vIdx => allSelectedVerticesIndices.add(vIdx));
    selectedSubComponents.faces.forEach(fIdx => {
        const face = topology.faces[fIdx];
        allSelectedVerticesIndices.add(face.a);
        allSelectedVerticesIndices.add(face.b);
        allSelectedVerticesIndices.add(face.c);
    });
    selectedSubComponents.edges.forEach(edgeKey => {
        const [v1, v2] = edgeKey.split('-').map(Number);
        allSelectedVerticesIndices.add(v1);
        allSelectedVerticesIndices.add(v2);
    });

    if (allSelectedVerticesIndices.size > 0) {
        const centroid = new THREE.Vector3();
        allSelectedVerticesIndices.forEach(vertexIndex => {
            const vertex = topology.vertices[vertexIndex];
            centroid.add(vertex);
        });
        centroid.divideScalar(allSelectedVerticesIndices.size);
        editObject.localToWorld(centroid);
        
        gizmoHelper.position.copy(centroid);
        gizmoHelper.rotation.set(0, 0, 0);
        gizmoHelper.scale.set(1, 1, 1);
        gizmoHelper.updateMatrixWorld(true);
        transformControls.attach(gizmoHelper);
    } else {
        transformControls.detach();
    }


  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selectedObject, selectedSubComponents, selectionMode, tool, selectedObjects]);


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

        let geometry;
        const randomColor = new THREE.Color().setHSL(Math.random(), 0.7, 0.6);
        const material = new THREE.MeshStandardMaterial({
          color: randomColor,
          metalness: 0.1,
          roughness: 0.5,
          wireframe: isWireframe,
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
          geometry = geometry.toIndexed();
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
  }, [primitivesToAdd, clearPrimitivesToAdd, addHistoryState, captureSceneState, updateSceneGraph, isWireframe]);

  const handleLoadedModel = useCallback((object, animations, name = 'Imported') => {
    object.name = name.charAt(0).toUpperCase() + name.slice(1);
    object.traverse((child) => {
      if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          const randomColor = new THREE.Color().setHSL(Math.random(), 0.7, 0.6);
          const newMaterial = new THREE.MeshStandardMaterial({
            color: randomColor,
            metalness: 0.1,
            roughness: 0.5,
            wireframe: isWireframe,
          });

          // Dispose old material if it exists
          if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
          }

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
  }, [addHistoryState, captureSceneState, updateSceneGraph, setMixer, setAnimationActions, setAnimationDuration, setAnimationTime, setIsPlaying, isWireframe]);

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

  // --- Effect for Wireframe mode ---
  useEffect(() => {
    if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
            if (object.isMesh && object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.wireframe = isWireframe);
                } else {
                    object.material.wireframe = isWireframe;
                }
            }
        });
    }
  }, [isWireframe]);


  return <div ref={mountRef} className="w-full h-full" />;
}
