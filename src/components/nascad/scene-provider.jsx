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

  const addPrimitive = useCallback((primitiveType) => {
    setPrimitivesToAdd(prev => [...prev, primitiveType]);
  }, []);

  const clearPrimitivesToAdd = useCallback(() => {
    setPrimitivesToAdd([]);
  }, []);

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
    setMixer
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
