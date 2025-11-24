'use client';

import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

const SceneContext = createContext(null);

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);
  return isMobile;
}

export function SceneProvider({ children }) {
  const [tool, setTool] = useState('translate'); // translate, rotate, scale, extrude, bevel
  const [selectionMode, setSelectionMode] = useState('object'); // object, vertex, edge, face
  const [selectedObjects, setSelectedObjects] = useState([]); // Changed from selectedObject to selectedObjects
  const [primitivesToAdd, setPrimitivesToAdd] = useState([]);
  const [selectedSubComponent, setSelectedSubComponent] = useState(null);
  
  // New state for import/export and animation
  const [fileToImport, setFileToImport] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationTime, setAnimationTime] = useState(0);
  const [animationDuration, setAnimationDuration] = useState(0);
  const [animationActions, setAnimationActions] = useState([]);
  const [mixer, setMixer] = useState(null);

  // Undo/Redo state
  const [history, setHistory] = useState([[]]); // Initial state is an empty scene
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isRestoring, setIsRestoring] = useState(false);

  // Delete state
  const [objectsToDelete, setObjectsToDelete] = useState([]); // Changed to array for multi-delete

  // Scene Graph state
  const [sceneGraph, setSceneGraph] = useState([]);
  
  // UI State
  const isMobile = useIsMobile();
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(!isMobile);
  
  // Preview state
  const [previewRequested, setPreviewRequested] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Wireframe state
  const [isWireframe, setIsWireframe] = useState(false);

  // Extrude tool state
  const [extrude, setExtrude] = useState({ distance: 1, action: null });
  
  useEffect(() => {
    setIsLeftPanelOpen(!isMobile);
  }, [isMobile]);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  const addHistoryState = useCallback((state) => {
    if (isRestoring) return;
    // If we are not at the end of history, truncate it
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(state);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex, isRestoring]);

  const undo = useCallback(() => {
    if (canUndo) {
      setIsRestoring(true);
      setHistoryIndex(prev => prev - 1);
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) {
      setIsRestoring(true);
      setHistoryIndex(prev => prev + 1);
    }
  }, [canRedo]);


  const addPrimitive = useCallback((primitiveType) => {
    setPrimitivesToAdd(prev => [...prev, primitiveType]);
  }, []);

  const clearPrimitivesToAdd = useCallback(() => {
    setPrimitivesToAdd([]);
  }, []);

  const deleteSelectedObjects = useCallback(() => {
    if (selectedObjects.length > 0) {
      setObjectsToDelete(selectedObjects);
    }
  }, [selectedObjects]);

  const selectedObject = selectedObjects.length > 0 ? selectedObjects[selectedObjects.length - 1] : null;
  const setSelectedObject = useCallback((obj) => {
    if (obj) {
      setSelectedObjects([obj]);
    } else {
      setSelectedObjects([]);
    }
  }, []);
  
  const getObjectAndAllChildren = useCallback((uuid) => {
    const results = [];
    const findInGraph = (nodes) => {
        for (const node of nodes) {
            if (node.uuid === uuid) {
                const collect = (n) => {
                    results.push({ uuid: n.uuid, name: n.name, type: n.type });
                    if (n.children) {
                        n.children.forEach(collect);
                    }
                };
                collect(node);
                return true; 
            }
            if (node.children && findInGraph(node.children)) {
                return true;
            }
        }
        return false;
    };
    findInGraph(sceneGraph);
    return results;
  }, [sceneGraph]);


  const value = {
    tool,
    setTool,
    selectionMode,
    setSelectionMode,
    selectedObjects, // New
    setSelectedObjects, // New
    selectedObject, // Kept for single-selection contexts
    setSelectedObject, // Kept for single-selection contexts
    primitivesToAdd,
    addPrimitive,
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
    animationActions,
    setAnimationActions,
    mixer,
    setMixer,
    history,
    historyIndex,
    addHistoryState,
    undo,
    redo,
    canUndo,
    canRedo,
    isRestoring,
    setIsRestoring,
    objectsToDelete, // New name
    setObjectsToDelete, // New name
    deleteSelectedObjects, // New name
    sceneGraph,
    setSceneGraph,
    getObjectAndAllChildren,
    isLeftPanelOpen,
    setIsLeftPanelOpen,
    isMobile,
    previewRequested,
    setPreviewRequested,
    previewImage,
    setPreviewImage,
    isWireframe,
    setIsWireframe,
    extrude,
    setExtrude,
  };

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export function useScene() {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error('useScene must be used within a SceneProvider');
  }
  return context;
}
