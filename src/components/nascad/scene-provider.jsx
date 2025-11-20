'use client';

import React, { createContext, useState, useContext, useCallback } from 'react';

const SceneContext = createContext(null);

export function SceneProvider({ children }) {
  const [tool, setTool] = useState('translate'); // translate, rotate, scale, extrude, bevel
  const [selectionMode, setSelectionMode] = useState('object'); // object, vertex, edge, face
  const [selectedObject, setSelectedObject] = useState(null);
  const [primitivesToAdd, setPrimitivesToAdd] = useState([]);
  const [selectedSubComponent, setSelectedSubComponent] = useState(null); // { type: 'vertex' | 'edge' | 'face', index: number, position?: THREE.Vector3 }

  const addPrimitive = useCallback((primitiveType) => {
    setPrimitivesToAdd(prev => [...prev, primitiveType]);
  }, []);

  const clearPrimitivesToAdd = useCallback(() => {
    setPrimitivesToAdd([]);
  }, []);
  
  const handleToolChange = (newTool) => {
    const transformTools = ['translate', 'rotate', 'scale'];
    if (transformTools.includes(newTool)) {
      setTool(newTool);
    } else {
      // For instant-action tools like extrude/bevel
      // We can set it, and the viewport can listen for it, perform the action, and reset the tool.
      setTool(newTool); 
      // Optionally, reset to a default tool immediately after
      // setTimeout(() => setTool('translate'), 100);
    }
  };


  const value = {
    tool,
    setTool: handleToolChange,
    selectionMode,
    setSelectionMode,
    selectedObject,
    setSelectedObject,
    primitivesToAdd,
    addPrimitive,
    clearPrimitivesToAdd,
    selectedSubComponent,
    setSelectedSubComponent,
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
