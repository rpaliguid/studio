'use client';
import { FileUp, FileDown, Bot, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScene } from './scene-provider';
import { useRef } from 'react';

export default function Header() {
  const { setFileToImport, undo, redo, canUndo, canRedo } = useScene();
  const fileInputRef = useRef(null);

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileToImport(file);
    }
    // Reset file input to allow re-importing the same file
    event.target.value = null; 
  };

  return (
    <header className="flex items-center h-14 px-4 shrink-0 border-b border-border z-10 bg-card">
      <div className="flex items-center gap-2">
        <Bot className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-semibold tracking-tighter text-foreground">Nascad</h1>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo}>
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo}>
          <Redo className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".gltf,.glb"
        />
        <Button variant="outline" size="sm" onClick={handleImportClick}>
          <FileUp className="mr-2 h-4 w-4" />
          Import
        </Button>
        <Button variant="outline" size="sm">
          <FileDown className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>
    </header>
  );
}
