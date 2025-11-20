'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
    setSelectedSubComponent,
    fileToImport,
    setFileToImport,
    isPlaying,
    setIsPlaying,
    setAnimationTime,
    setAnimationDuration,
    animationActions,
    setAnimationActions,
    mixer,
    setMixer,
    history,
    historyIndex,
    addHistoryState,
    isRestoring,
    setIsRestoring
  } = useScene();
  
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const selectionVisualsRef = useRef([]); 
  const clockRef = useRef(new THREE.Clock());
  const objectsRef = useRef(new Map());

  const captureSceneState = useCallback(() => {
    if (!sceneRef.current) return null;
    const state = [];
    sceneRef.current.children.forEach(child => {
        if ((child.isMesh || child.isGroup) && child.uuid) {
            if (!objectsRef.current.has(child.uuid)) {
                objectsRef.current.set(child.uuid, child);
            }
            state.push({
                uuid: child.uuid,
                position: child.position.clone(),
                rotation: child.rotation.clone(),
                scale: child.scale.clone(),
            });
        }
    });
    return state;
  }, []);

  const restoreSceneState = useCallback((state) => {
    if (!sceneRef.current || !state) return;
    
    state.forEach(objState => {
        const object = objectsRef.current.get(objState.uuid);
        if (object) {
            object.position.copy(objState.position);
            object.rotation.copy(objState.rotation);
            object.scale.copy(objState.scale);
        }
    });
  }, []);
  
  // Effect for Undo/Redo
  useEffect(() => {
    if (isRestoring && history[historyIndex]) {
      restoreSceneState(history[historyIndex]);
      setIsRestoring(false);
    }
  }, [isRestoring, historyIndex, history, restoreSceneState, setIsRestoring]);


  const handleDeselect = useCallback(() => {
    setSelectedObject(null);
    setSelectedSubComponent(null);
  }, [setSelectedObject, setSelectedSubComponent]);

  const findClosestVertex = (intersect, object) => {
      const positionAttribute = object.geometry.getAttribute('position');
      let closestVertexIndex = -1;
      let minDistanceSq = Infinity;
      const intersectPoint = intersect.point;

      for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
        object.localToWorld(vertex); // Transform vertex to world space
        const distanceSq = vertex.distanceToSquared(intersectPoint);
        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          closestVertexIndex = i;
        }
      }
      // Threshold to prevent selecting a vertex that is too far
      if (Math.sqrt(minDistanceSq) > 0.1) return null;

      return { index: closestVertexIndex, distance: Math.sqrt(minDistanceSq) };
  };

  // --- Main Initialization Effect ---
  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#2a3a4a'); 
    gradient.addColorStop(1, '#1c2530');
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
    
    // Initial state capture
    setTimeout(() => addHistoryState(captureSceneState()), 100);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControlsRef.current = orbitControls;

    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControlsRef.current = transformControls;

    const gridHelper = new THREE.GridHelper(50, 50, 0x556677, 0x445566);
    scene.add(gridHelper);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    const onDraggingChanged = (event) => {
      orbitControls.enabled = !event.value;
      if (!event.value) { // Drag finished
          addHistoryState(captureSceneState());
      }
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
            const gizmoMatrix = gizmo.matrixWorld.clone();
            const invOriginalMatrix = selectedSubComponent.gizmoMatrixInverse;
            const deltaTransform = gizmoMatrix.multiply(invOriginalMatrix);
    
            selectedSubComponent.indices.forEach((vertexIndex, i) => {
                const originalVertex = selectedSubComponent.originalVertices[i].clone();
                const newWorldPos = originalVertex.applyMatrix4(deltaTransform);
                const newLocalPos = selectedObject.worldToLocal(newWorldPos);
                
                positionAttribute.setXYZ(vertexIndex, newLocalPos.x, newLocalPos.y, newLocalPos.z);
            });
    
            positionAttribute.needsUpdate = true;
            selectedObject.geometry.computeVertexNormals();
            selectedObject.geometry.computeBoundingSphere();
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
      const meshes = scene.children.filter(c => c.isMesh || c.isGroup);
      const intersects = raycaster.intersectObjects(meshes, true);
      
      let clickedObject = null;
      if (intersects.length > 0) {
        let current = intersects[0].object;
        while(current.parent && current.parent.isGroup && current.parent !== scene) {
            current = current.parent;
        }
        clickedObject = current;
      }
      const intersectedObject = clickedObject;
      
      if (selectionMode === 'object') {
        setSelectedObject(intersectedObject);
        setSelectedSubComponent(null);
      } else if (intersectedObject && intersectedObject.isMesh) {
         if (selectedObject !== intersectedObject) {
          setSelectedObject(intersectedObject);
          setSelectedSubComponent(null);
          return; 
        }
        
        const geometry = selectedObject.geometry;
        const positionAttribute = geometry.getAttribute('position');

        if (selectionMode === 'vertex') {
          const closestVertex = findClosestVertex(intersects[0], selectedObject);
          if (closestVertex) {
            const vertexPosition = new THREE.Vector3().fromBufferAttribute(positionAttribute, closestVertex.index);
            selectedObject.localToWorld(vertexPosition);
            setSelectedSubComponent({ type: 'vertex', index: closestVertex.index, position: vertexPosition });
          } else {
            setSelectedSubComponent(null);
          }
        } else if (selectionMode === 'face' && intersects[0].face) {
            const faceIndex = intersects[0].faceIndex;
            const face = intersects[0].face;
            
            if (!geometry.index) {
                console.error("Geometry is non-indexed, cannot select faces.");
                return;
            }

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
              originalVertices: originalVertices,
              gizmoMatrixInverse: gizmo.matrixWorld.clone().invert(),
            });
        } else {
          setSelectedSubComponent(null);
        }
      } else if (intersectedObject) {
         setSelectedObject(intersectedObject);
         setSelectedSubComponent(null);
      } else {
        handleDeselect();
      }
    };
    currentMount.addEventListener('click', onClick);

    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      
      const delta = clockRef.current.getDelta();
      if (mixer && isPlaying) {
        mixer.update(delta);
        const newTime = Math.min(mixer.time, animationDuration);
        setAnimationTime(newTime);
        if (newTime >= animationDuration) {
            setIsPlaying(false);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

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
      
      // Undo/Redo shortcuts
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 'z') {
            event.preventDefault();
            useScene.getState().undo();
        } else if (event.key.toLowerCase() === 'y') {
            event.preventDefault();
            useScene.getState().redo();
        }
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
        case ' ': event.preventDefault(); setIsPlaying(p => !p); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

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

    selectionVisualsRef.current.forEach(visual => {
      if(visual.dispose) visual.dispose();
      scene.remove(visual);
      if (visual.geometry) visual.geometry.dispose();
      if (visual.material) visual.material.dispose();
    });
    selectionVisualsRef.current = [];
    transformControls.detach();
    transformControls.visible = false;

    if (!selectedObject) return;

    if (selectedSubComponent) {
      let gizmoHelper;

      if (selectedSubComponent.type === 'vertex') {
        const vertexVisual = new THREE.Mesh(
            new THREE.SphereGeometry(0.05),
            new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: false })
        );
        vertexVisual.position.copy(selectedSubComponent.position);
        scene.add(vertexVisual);
        selectionVisualsRef.current.push(vertexVisual);

        gizmoHelper = new THREE.Object3D();
        gizmoHelper.position.copy(selectedSubComponent.position);
      } else if (selectedSubComponent.type === 'face' && selectedObject.isMesh) {
        const positionAttribute = selectedObject.geometry.getAttribute('position');
        const faceIndices = selectedSubComponent.indices;
        const faceVertices = faceIndices.map(index => new THREE.Vector3().fromBufferAttribute(positionAttribute, index));
        
        const highlightGeometry = new THREE.BufferGeometry();
        highlightGeometry.setFromPoints(faceVertices);
        highlightGeometry.setIndex([0, 1, 2]);
        const faceVisual = new THREE.Mesh(highlightGeometry, new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
        
        faceVisual.position.copy(selectedObject.position);
        faceVisual.quaternion.copy(selectedObject.quaternion);
        faceVisual.scale.copy(selectedObject.scale);
        scene.add(faceVisual);
        selectionVisualsRef.current.push(faceVisual);
        
        const faceCentroid = new THREE.Vector3();
        faceVertices.forEach(v => faceCentroid.add(v));
        faceCentroid.divideScalar(faceVertices.length);
        selectedObject.localToWorld(faceCentroid); 

        gizmoHelper = new THREE.Object3D();
        gizmoHelper.position.copy(faceCentroid);
        const worldNormal = selectedSubComponent.originalVertices[1].clone().sub(selectedSubComponent.originalVertices[0])
            .cross(selectedSubComponent.originalVertices[2].clone().sub(selectedSubComponent.originalVertices[0]))
            .normalize();
        gizmoHelper.lookAt(gizmoHelper.position.clone().add(worldNormal));
      }

      if(gizmoHelper){
          scene.add(gizmoHelper);
          selectionVisualsRef.current.push(gizmoHelper);
          transformControls.attach(gizmoHelper);
          transformControls.visible = true;
      }
    } else if (selectionMode === 'object') {
       if (selectedObject.isMesh) {
          const edges = new THREE.EdgesGeometry(selectedObject.geometry, 1);
          const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
          const objectOutline = new THREE.LineSegments(edges, lineMaterial);
          objectOutline.position.copy(selectedObject.position);
          objectOutline.quaternion.copy(selectedObject.quaternion);
          objectOutline.scale.copy(selectedObject.scale);
          scene.add(objectOutline);
          selectionVisualsRef.current.push(objectOutline);

          const updateOutline = () => {
              if (selectedObject && objectOutline) {
                  objectOutline.position.copy(selectedObject.position);
                  objectOutline.quaternion.copy(selectedObject.quaternion);
                  objectOutline.scale.copy(selectedObject.scale);
              }
          };
          transformControls.addEventListener('objectChange', updateOutline);
          
          const currentTC = transformControls;
          const cleanup = () => currentTC.removeEventListener('objectChange', updateOutline);
          selectionVisualsRef.current.push({ dispose: cleanup });
       }

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

        if (!geometry.index) {
          geometry = geometry.toIndexed();
        }
        
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.5;
        sceneRef.current.add(mesh);
        objectsRef.current.set(mesh.uuid, mesh);
      });
      addHistoryState(captureSceneState());
      clearPrimitivesToAdd();
    }
  }, [primitivesToAdd, clearPrimitivesToAdd, addHistoryState, captureSceneState]);


  // --- Effect for Importing Files ---
  useEffect(() => {
    if (fileToImport && sceneRef.current) {
      const scene = sceneRef.current;
      const reader = new FileReader();
      const filename = fileToImport.name.toLowerCase();

      const handleLoadedModel = (object, animations) => {
        
        object.traverse((child) => {
          if (child.isMesh) {
              if (!child.geometry.index) {
                  child.geometry = child.geometry.toIndexed();
              }
              child.geometry.computeVertexNormals();
              objectsRef.current.set(child.uuid, child);
          }
        });
        
        if (animations && animations.length > 0) {
            const newMixer = new THREE.AnimationMixer(object);
            const newActions = animations.map(clip => newMixer.clipAction(clip));
            let maxDuration = 0;
            animations.forEach(clip => {
                maxDuration = Math.max(maxDuration, clip.duration);
            });
            
            setMixer(newMixer);
            setAnimationActions(newActions);
            setAnimationDuration(maxDuration);
            setAnimationTime(0);
            setIsPlaying(false);
        }
        scene.add(object);
        objectsRef.current.set(object.uuid, object);
        addHistoryState(captureSceneState());
      };

      reader.onload = (e) => {
        const contents = e.target.result;
        
        if (filename.endsWith('.fbx')) {
          const loader = new FBXLoader();
          const object = loader.parse(contents);
          handleLoadedModel(object, object.animations);
        } else if (filename.endsWith('.obj')) {
          const loader = new OBJLoader();
          const object = loader.parse(contents);
          handleLoadedModel(object, []);
        } else if (filename.endsWith('.gltf') || filename.endsWith('.glb')) {
          const loader = new GLTFLoader();
          loader.parse(contents, '', (gltf) => {
            handleLoadedModel(gltf.scene, gltf.animations);
          }, (error) => {
            console.error('An error happened with GLTFLoader:', error);
          });
        } else {
          console.error('Unsupported file type');
          return;
        }
      };

      if (filename.endsWith('.fbx') || filename.endsWith('.glb') || filename.endsWith('.gltf')) {
        reader.readAsArrayBuffer(fileToImport);
      } else {
        reader.readAsText(fileToImport);
      }
      
      setFileToImport(null); // Clear after processing
    }
  }, [fileToImport, setFileToImport, setMixer, setAnimationActions, setAnimationDuration, setAnimationTime, setIsPlaying, addHistoryState, captureSceneState]);


  // --- Effect for Animation Control ---
  useEffect(() => {
    if (!mixer) return;

    if (isPlaying) {
      animationActions.forEach(action => {
        if (mixer.time < action.getClip().duration) {
            action.paused = false;
            action.play();
        }
      });
    } else {
      animationActions.forEach(action => action.paused = true);
    }
  }, [isPlaying, mixer, animationActions]);


  return <div ref={mountRef} className="w-full h-full" />;
}
