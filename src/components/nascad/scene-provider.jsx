'use client';

import React, { createContext, useState, useContext, useCallback } from 'react';

const SceneContext = createContext(null);

export function SceneProvider({ children }) {
  const [tool, setTool] = useState('translate'); // translate, rotate, scale
  const [selectionMode, setSelectionMode] = useState('object'); // object, vertex, edge, face
  const [selectedObject, setSelectedObject] = useState(null);
  const [primitivesToAdd, setPrimitivesToAdd] = useState([]);

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
