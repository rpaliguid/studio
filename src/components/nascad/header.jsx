'use client';
import { FileUp, FileDown, Bot, Undo, Redo, Play, Pause, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScene } from './scene-provider';
import { useRef } from 'react';

export default function Header() {
  const { setFileToImport, undo, redo, canUndo, canRedo, isPlaying, setIsPlaying, mixer, isLeftPanelOpen, setIsLeftPanelOpen } = useScene();
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
  
  const handlePlayPause = () => {
    if (mixer) {
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <header className="flex items-center h-14 px-2 md:px-4 shrink-0 border-b border-border z-20 bg-card">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}>
          <PanelLeft className="h-5 w-5" />
        </Button>
        <Bot className="w-6 h-6 text-primary hidden sm:block" />
        <h1 className="text-lg md:text-xl font-semibold tracking-tighter text-foreground">Nascad</h1>
      </div>
      <div className="flex items-center gap-1 md:gap-2 ml-2 md:ml-4">
        <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo} className="h-8 w-8">
          <Undo className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo} className="h-8 w-8">
          <Redo className="h-5 w-5" />
        </Button>
      </div>
       <div className="flex items-center gap-1 md:gap-2 ml-2 md:ml-4">
        <Button variant="ghost" size="icon" onClick={handlePlayPause} disabled={!mixer} className="h-8 w-8">
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
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
          <span className="hidden sm:inline">Import</span>
        </Button>
        <Button variant="outline" size="sm">
          <FileDown className="mr-2 h-4 w-4" />
           <span className="hidden sm:inline">Export</span>
        </Button>
      </div>
    </header>
  );
}
