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
const HIGHLIGHT_COLOR = new THREE.Color(0x16b4f7); // Cyan
const DEFAULT_COLOR = new THREE.Color(0xffffff); // White
const FACE_HIGHLIGHT_COLOR = new THREE.Color(0x16b4f7); 


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
        vertices.push(new THREE.Vector3().fromBufferAttribute(positionAttribute, i));
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
    } else { // Handle non-indexed geometry
        for (let i = 0; i < positionAttribute.count; i += 3) {
            const a = i;
            const b = i + 1;
            const c = i + 2;
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

  // --- Edit Mode Refs ---
  const editSessionRef = useRef({
      object: null,
      topology: null,
      helpersGroup: null, // A group to hold all helpers for easy management
      gizmoHelper: null, // Empty Object3D for gizmo attachment
      initialVertexPositions: null, // Store vertex positions at start of a drag
      dragged: false, // Track if a drag operation is happening
  });

  const vertexGeoRef = useRef(new THREE.SphereGeometry(0.05, 8, 8));


  const handleDeselect = useCallback(() => {
    setSelectedObjects([]);
    setSelectedSubComponents({ vertices: [], edges: [], faces: [] });
  }, [setSelectedObjects, setSelectedSubComponents]);

  const buildSceneGraph = useCallback(() => {
    if (!sceneRef.current) return [];

    const graph = [];
    const processedUuids = new Set();
    const internalObjectNames = new Set(['gridHelper', 'Main Camera', 'floor', 'Directional Light', 'GizmoHelper', 'EditHelpers', 'selectionOutlines']);
    
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
                    // Make sure geometry has index before attempting to clone
                    if (!geometry.index && geometry.attributes.position) {
                        const posCount = geometry.attributes.position.count;
                        const indices = new Uint32Array(posCount);
                        for(let i = 0; i < posCount; i++) indices[i] = i;
                        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
                    }

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
    
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    floor.name = 'floor';
    scene.add(floor);


    const gridHelper = new THREE.GridHelper(500, 500, 0xFFFFFF, 0xFFFFFF);
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
      if (event.value) { // Drag started
        editSessionRef.current.dragged = true;
        // Store initial positions of selected vertices
        const { object, topology } = editSessionRef.current;
        if (object && topology && selectedSubComponents.vertices.length > 0) {
            const initialPositions = new Map();
            const positionAttribute = object.geometry.attributes.position;
            selectedSubComponents.vertices.forEach(vIdx => {
                initialPositions.set(vIdx, new THREE.Vector3().fromBufferAttribute(positionAttribute, vIdx));
            });
            editSessionRef.current.initialVertexPositions = initialPositions;
        }
      } else { // Drag finished
          if (editSessionRef.current.dragged) {
              addHistoryState(captureSceneState());
              editSessionRef.current.initialVertexPositions = null;
              editSessionRef.current.dragged = false;
          }
      }
    };
    transformControls.addEventListener('dragging-changed', onDraggingChanged);

    const onObjectChange = () => {
        const { object, gizmoHelper, initialVertexPositions } = editSessionRef.current;
        if (!editMode || !object || !gizmoHelper || !initialVertexPositions) return;

        const positionAttribute = object.geometry.attributes.position;
        
        // Calculate the world-space delta of the gizmo
        const gizmoWorldPosition = gizmoHelper.position.clone();
        const controlWorldPosition = transformControls.object.position.clone();
        const worldDelta = controlWorldPosition.sub(gizmoWorldPosition);

        // Apply this world delta to each selected vertex from their initial world positions
        selectedSubComponents.vertices.forEach(vIdx => {
            const initialLocalPos = initialVertexPositions.get(vIdx);
            if (initialLocalPos) {
                // Convert initial local position to world space
                const initialWorldPos = initialLocalPos.clone().applyMatrix4(object.matrixWorld);
                // Add the world-space delta
                const newWorldPos = initialWorldPos.add(worldDelta);
                // Convert the new world position back to local space
                const newLocalPos = newWorldPos.clone().applyMatrix4(object.matrixWorld.clone().invert());
                
                positionAttribute.setXYZ(vIdx, newLocalPos.x, newLocalPos.y, newLocalPos.z);
            }
        });

        positionAttribute.needsUpdate = true;
        object.geometry.computeVertexNormals();
        object.geometry.computeBoundingSphere();
    };
    transformControls.addEventListener('objectChange', onObjectChange);


    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.2;
    raycaster.params.Points.threshold = 0.2;
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
            const { helpersGroup, object } = editSessionRef.current;
            if (!object || !helpersGroup) return;

            let clickedSomething = false;

            if (selectionMode === 'vertex') {
                const vertexHelpers = helpersGroup.children.filter(h => h.userData.type === 'vertex' && h.visible);
                const intersects = raycaster.intersectObjects(vertexHelpers, false);
                if (intersects.length > 0) {
                    const clickedVertex = intersects[0].object;
                    const index = clickedVertex.userData.index;

                    setSelectedSubComponents(prev => {
                        const newVertices = new Set(prev.vertices);
                        if (event.shiftKey) {
                            if (newVertices.has(index)) newVertices.delete(index);
                            else newVertices.add(index);
                        } else {
                           newVertices.clear();
                           newVertices.add(index);
                        }
                        return { vertices: Array.from(newVertices), edges: [], faces: [] };
                    });
                    clickedSomething = true;
                }
            } else if (selectionMode === 'edge') {
                const edgeHelpers = helpersGroup.children.filter(h => h.userData.type === 'edge' && h.visible);
                const intersects = raycaster.intersectObjects(edgeHelpers, false);
                if (intersects.length > 0) {
                    const clickedEdge = intersects[0].object;
                    const { key } = clickedEdge.userData;

                    setSelectedSubComponents(prev => {
                        const newEdges = new Set(prev.edges);
                        if(event.shiftKey) {
                            if(newEdges.has(key)) newEdges.delete(key);
                            else newEdges.add(key);
                        } else {
                            newEdges.clear();
                            newEdges.add(key);
                        }
                        return { vertices: [], edges: Array.from(newEdges), faces: [] };
                    });
                    clickedSomething = true;
                }
            } else if (selectionMode === 'face') {
                const intersects = raycaster.intersectObject(object, false);
                 if (intersects.length > 0) {
                    const { faceIndex } = intersects[0];
                    setSelectedSubComponents(prev => {
                        const newFaces = new Set(prev.faces);
                         if(event.shiftKey) {
                            if(newFaces.has(faceIndex)) newFaces.delete(faceIndex);
                            else newFaces.add(faceIndex);
                        } else {
                            newFaces.clear();
                            newFaces.add(faceIndex);
                        }
                        return { vertices: [], edges: [], faces: Array.from(newFaces) };
                    });
                    clickedSomething = true;
                }
            }

            if (!clickedSomething && !event.shiftKey) {
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

  // --- Animation Loop ---
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
      
      const { helpersGroup, object } = editSessionRef.current;
      if (editMode && helpersGroup && object) {
          helpersGroup.matrix.copy(object.matrixWorld);

          // Continuously update helper positions in case geometry is modified externally
           const positionAttribute = object.geometry.attributes.position;
            helpersGroup.children.forEach(helper => {
                if (helper.userData.type === 'vertex') {
                    const vIdx = helper.userData.index;
                    helper.position.fromBufferAttribute(positionAttribute, vIdx);
                    helper.visible = selectionMode === 'vertex';
                } else if (helper.userData.type === 'edge') {
                    const { a, b } = helper.userData;
                    const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, a);
                    const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, b);
                    const positions = helper.geometry.attributes.position.array;
                    positions[0] = v1.x; positions[1] = v1.y; positions[2] = v1.z;
                    positions[3] = v2.x; positions[4] = v2.y; positions[5] = v2.z;
                    helper.geometry.attributes.position.needsUpdate = true;
                    helper.visible = selectionMode === 'edge';
                } else if (helper.userData.type === 'face') {
                    helper.visible = selectionMode === 'face';
                }
            });
      }


      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, mixer, animationDuration, editMode, selectionMode]);


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
    const session = editSessionRef.current;
    if (session.helpersGroup) {
        sceneRef.current.remove(session.helpersGroup);
        session.helpersGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }
    if (session.gizmoHelper) {
        sceneRef.current.remove(session.gizmoHelper);
    }
    transformControlsRef.current.detach();
    editSessionRef.current = { object: null, topology: null, helpersGroup: null, gizmoHelper: null, initialVertexPositions: null, dragged: false };
  };
  
  // --- Effect for Edit Mode & Selection Visuals ---
  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformControlsRef.current;
    
    // Always clean up previous session state when this effect runs
    cleanupEditSession();
    
    // Manage main object outlines
    const outlineGroup = scene.getObjectByName('selectionOutlines');
    if (outlineGroup) {
        scene.remove(outlineGroup);
        outlineGroup.traverse(child => {
            if(child.isMesh || child.isLineSegments) {
                child.geometry?.dispose();
                child.material?.dispose();
            }
        })
    }
    
    if (selectedObjects.length > 0 && !editMode) {
      const newOutlineGroup = new THREE.Group();
      newOutlineGroup.name = 'selectionOutlines';
      scene.add(newOutlineGroup);

      const outlineMaterial = new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, linewidth: 2, depthTest: false, renderOrder: 999 });
      
      selectedObjects.forEach(selObject => {
          const actualObject = objectsRef.current.get(selObject.uuid);
          if (!actualObject) return;
          actualObject.traverse(child => {
            if (child.isMesh) {
                const edges = new THREE.EdgesGeometry(child.geometry, 1);
                const objectOutline = new THREE.LineSegments(edges, outlineMaterial.clone());
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
    
    // --- Create Helper Group ---
    const helpersGroup = new THREE.Group();
    helpersGroup.name = "EditHelpers";
    helpersGroup.matrixAutoUpdate = false;
    scene.add(helpersGroup);

    // --- Create Gizmo Helper ---
    const gizmoHelper = new THREE.Object3D();
    gizmoHelper.name = "GizmoHelper";
    scene.add(gizmoHelper);

    // --- Create Vertex Helpers ---
    const vertexMaterial = new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR, depthTest: false, transparent: true });
    topology.vertices.forEach((vertex, index) => {
        const isSelected = selectedSubComponents.vertices.includes(index);
        const sphere = new THREE.Mesh(vertexGeoRef.current, vertexMaterial.clone());
        if(isSelected) sphere.material.color.copy(HIGHLIGHT_COLOR);
        sphere.position.copy(vertex);
        sphere.userData = { type: 'vertex', index: index };
        sphere.renderOrder = 999;
        helpersGroup.add(sphere);
    });

    // --- Create Edge Helpers ---
    const edgeMaterial = new THREE.LineBasicMaterial({ color: DEFAULT_COLOR, linewidth: 4, depthTest: false });
    topology.edges.forEach(({ key, a, b }) => {
        if (!topology.vertices[a] || !topology.vertices[b]) return;
        const v1 = topology.vertices[a];
        const v2 = topology.vertices[b];
        const geometry = new THREE.BufferGeometry().setFromPoints([v1, v2]);
        const isSelected = selectedSubComponents.edges.includes(key);
        const line = new THREE.Line(geometry, edgeMaterial.clone());
        if(isSelected) line.material.color.copy(HIGHLIGHT_COLOR);
        line.userData = { type: 'edge', key, a, b };
        line.renderOrder = 998;
        helpersGroup.add(line);
    });
    
    // --- Create Face Helpers ---
    const faceMaterial = new THREE.MeshBasicMaterial({
        color: FACE_HIGHLIGHT_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
        depthTest: false,
    });
    selectedSubComponents.faces.forEach(faceIndex => {
        const faceData = topology.faces[faceIndex];
        if (!faceData) return;
        const { a, b, c } = faceData;
        const vA = topology.vertices[a];
        const vB = topology.vertices[b];
        const vC = topology.vertices[c];

        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute([vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z], 3));
        faceGeometry.setIndex([0, 1, 2]);

        const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
        faceMesh.renderOrder = 997;
        faceMesh.userData = { type: 'face', index: faceIndex };
        helpersGroup.add(faceMesh);
    });

    
    editSessionRef.current = {
      object: editObject,
      topology,
      helpersGroup,
      gizmoHelper,
      initialVertexPositions: null,
      dragged: false,
    };
    
    // --- Update Gizmo ---
    const centroid = new THREE.Vector3();
    let count = 0;
    
    if (selectionMode === 'vertex' && selectedSubComponents.vertices.length > 0) {
        selectedSubComponents.vertices.forEach(vIdx => {
            const vertexPosition = topology.vertices[vIdx];
            if(vertexPosition) centroid.add(vertexPosition);
            count++;
        });
    } else if (selectionMode === 'edge' && selectedSubComponents.edges.length > 0) {
        const processedVerts = new Set();
        selectedSubComponents.edges.forEach(edgeKey => {
            const edgeData = topology.edges.find(e => e.key === edgeKey);
            if (edgeData) {
                if (!processedVerts.has(edgeData.a)) { centroid.add(topology.vertices[edgeData.a]); count++; processedVerts.add(edgeData.a); }
                if (!processedVerts.has(edgeData.b)) { centroid.add(topology.vertices[edgeData.b]); count++; processedVerts.add(edgeData.b); }
            }
        });
    } else if (selectionMode === 'face' && selectedSubComponents.faces.length > 0) {
        const processedVerts = new Set();
         selectedSubComponents.faces.forEach(faceIndex => {
            const face = topology.faces[faceIndex];
            if(face) {
                 if (!processedVerts.has(face.a)) { centroid.add(topology.vertices[face.a]); count++; processedVerts.add(face.a); }
                 if (!processedVerts.has(face.b)) { centroid.add(topology.vertices[face.b]); count++; processedVerts.add(face.b); }
                 if (!processedVerts.has(face.c)) { centroid.add(topology.vertices[face.c]); count++; processedVerts.add(face.c); }
            }
         });
    }
    
    if (count > 0) {
        centroid.divideScalar(count);
        gizmoHelper.position.copy(centroid);
        // The gizmo helper's position is in local space, but transformControls works in world space.
        // We need to apply the object's world matrix to the helper.
        gizmoHelper.applyMatrix4(editObject.matrixWorld);
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
          case 'torus':
            geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100);
            break;
          default:
            return;
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
