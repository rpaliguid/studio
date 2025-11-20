'use client';

import React, { createContext, useState, useContext, useCallback } from 'react';

const SceneContext = createContext(null);

export function SceneProvider({ children }) {
  const [tool, setTool] = useState('translate'); // translate, rotate, scale, extrude, bevel
  const [selectionMode, setSelectionMode] = useState('object'); // object, vertex, edge, face
  const [selectedObject, setSelectedObject] = useState(null);
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
  const [objectToDelete, setObjectToDelete] = useState(null);

  // Scene Graph state
  const [sceneGraph, setSceneGraph] = useState([]);

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
      setHistoryIndex(prev => prev - 1);
    }
  }, [canRedo]);


  const addPrimitive = useCallback((primitiveType) => {
    setPrimitivesToAdd(prev => [...prev, primitiveType]);
  }, []);

  const clearPrimitivesToAdd = useCallback(() => {
    setPrimitivesToAdd([]);
  }, []);

  const deleteSelectedObject = useCallback(() => {
    if (selectedObject) {
      setObjectToDelete(selectedObject);
    }
  }, [selectedObject]);


  const value = {
    tool,
    setTool,
    selectionMode,
    setSelectionMode,
    selectedObject,
    setSelectedObject,
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
    objectToDelete,
    setObjectToDelete,
    deleteSelectedObject,
    sceneGraph,
    setSceneGraph,
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
