'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Box,
  Circle,
  Database,
  Move,
  Scale,
  RotateCw,
  GitCommitHorizontal,
  Scissors,
  Eye,
  EyeOff,
  LayoutGrid,
  Plus,
  Trash2,
  Camera,
  Sun,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { VertexIcon, EdgeIcon, FaceIcon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useScene } from '@/components/nascad/scene-provider';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';


const SceneItem = ({ node, level = 0 }) => {
  const { selectedObjects, setSelectedObjects, getObjectAndAllChildren } = useScene();
  const [visible, setVisible] = useState(true);
  const [isOpen, setIsOpen] = useState(true);

  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedObjects.some(obj => obj.uuid === node.uuid);

  const getIcon = (type) => {
    switch (type) {
      case 'PerspectiveCamera':
        return <Camera className="w-4 h-4 mr-2 text-muted-foreground" />;
      case 'DirectionalLight':
        return <Sun className="w-4 h-4 mr-2 text-muted-foreground" />;
      default:
        return <LayoutGrid className="w-4 h-4 mr-2 text-muted-foreground" />;
    }
  };

  const handleSelect = (event) => {
    const objectsToSelect = getObjectAndAllChildren(node.uuid);
    
    if (event.shiftKey) {
        setSelectedObjects(prev => {
            const currentSelectionUuids = new Set(prev.map(o => o.uuid));
            const newSelection = [...prev];
            let allAreSelected = true;

            for(const obj of objectsToSelect) {
                if (!currentSelectionUuids.has(obj.uuid)) {
                    allAreSelected = false;
                    break;
                }
            }

            if (allAreSelected) {
                // Deselect this group
                const objectsToSelectUuids = new Set(objectsToSelect.map(o => o.uuid));
                return prev.filter(obj => !objectsToSelectUuids.has(obj.uuid));
            } else {
                // Add this group to selection (avoiding duplicates)
                const newUuids = new Set(newSelection.map(o => o.uuid));
                objectsToSelect.forEach(obj => {
                    if (!newUuids.has(obj.uuid)) {
                        newSelection.push(obj);
                    }
                });
                return newSelection;
            }
        });
    } else {
        setSelectedObjects(objectsToSelect);
    }
  };

  const handleToggleOpen = (e) => {
    e.stopPropagation();
    if (hasChildren) {
      setIsOpen(!isOpen);
    }
  };


  return (
    <div>
      <div 
        className={`flex items-center justify-between hover:bg-muted/50 rounded-md pr-2 cursor-pointer ${isSelected ? 'bg-primary/20' : ''}`}
        onClick={handleSelect}
        style={{ paddingLeft: `${level * 1}rem` }}
      >
        <div className="flex items-center flex-1 min-w-0">
          <button onClick={handleToggleOpen} className="w-5 p-0.5 text-muted-foreground disabled:opacity-0" disabled={!hasChildren}>
             <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
          {getIcon(node.type)}
          <span className="text-sm select-none truncate">{node.name || node.type}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setVisible(!visible); }}>
          {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.children.map(child => (
            <SceneItem key={child.uuid} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const selectionModes = [
    { id: 'object', icon: Box, name: 'Object Select (1)' },
    { id: 'vertex', icon: VertexIcon, name: 'Vertex Select (2)' },
    { id: 'edge', icon: EdgeIcon, name: 'Edge Select (3)' },
    { id: 'face', icon: FaceIcon, name: 'Face Select (4)' },
];

const transformTools = [
    { id: 'translate', icon: Move, name: 'Move (W)' },
    { id: 'rotate', icon: RotateCw, name: 'Rotate (E)' },
    { id: 'scale', icon: Scale, name: 'Scale (R)' },
];

const modelingTools = [
    { id: 'extrude', icon: GitCommitHorizontal, name: 'Extrude' },
    { id: 'bevel', icon: Scissors, name: 'Bevel' },
];

const primitives = [
    { id: 'cube', icon: Box, name: 'Cube' },
    { id: 'sphere', icon: Circle, name: 'Sphere' },
    { id: 'cylinder', icon: Database, name: 'Cylinder' },
];

const ToolButton = ({ tool, onClick, currentTool }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button 
                variant={currentTool === tool.id ? "secondary" : "outline"} 
                size="icon" 
                onClick={onClick}
                className="h-9 w-9 md:h-10 md:w-10"
            >
                <tool.icon className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
        </TooltipTrigger>
        <TooltipContent><p>{tool.name}</p></TooltipContent>
    </Tooltip>
);

function LeftPanelContent() {
  const { tool, setTool, selectionMode, setSelectionMode, addPrimitive, setSelectedSubComponent, deleteSelectedObjects, sceneGraph } = useScene();

  const handleSelectionModeChange = (newMode) => {
    setSelectionMode(newMode);
    setSelectedSubComponent(null); // Clear sub-component selection when changing mode
  };
  return (
    <aside className="w-72 border-r border-border bg-card overflow-y-auto h-full">
      <Accordion type="multiple" defaultValue={['scene-graph', 'toolbox']} className="w-full">
        <AccordionItem value="scene-graph">
          <AccordionTrigger className="px-4 text-sm font-medium">Scene Graph</AccordionTrigger>
          <AccordionContent className="px-4 text-sm">
            <div className="space-y-1">
              {sceneGraph.map(node => (
                <SceneItem key={node.uuid} node={node} />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="toolbox">
          <AccordionTrigger className="px-4 text-sm font-medium">Toolbox</AccordionTrigger>
          <AccordionContent className="px-4 space-y-4">
            <TooltipProvider>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Primitives</p>
                <div className="grid grid-cols-4 gap-2">
                  {primitives.map(primitive => (
                      <Tooltip key={primitive.name}>
                          <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-10 w-10 md:h-12 md:w-12" onClick={() => addPrimitive(primitive.id)}>
                                  <primitive.icon className="h-5 w-5 md:h-6 md:w-6" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>{primitive.name}</p></TooltipContent>
                      </Tooltip>
                  ))}
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-10 w-10 md:h-12 md:w-12">
                              <Plus className="h-5 w-5 md:h-6 md:w-6" />
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Add</p></TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Selection Mode</p>
                <div className="grid grid-cols-4 gap-2">
                  {selectionModes.map(mode => (
                      <ToolButton key={mode.id} tool={mode} onClick={() => handleSelectionModeChange(mode.id)} currentTool={selectionMode} />
                  ))}
                </div>
              </div>

              <Separator />
              
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Transform Tools</p>
                <div className="grid grid-cols-4 gap-2">
                  {transformTools.map(t => (
                      <ToolButton key={t.id} tool={t} onClick={() => setTool(t.id)} currentTool={tool} />
                  ))}
                   <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-9 w-9 md:h-10 md:w-10" onClick={deleteSelectedObjects}>
                                <Trash2 className="h-4 w-4 md:h-5 md:w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Delete (Del)</p></TooltipContent>
                    </Tooltip>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Modeling Tools</p>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {modelingTools.map(t => (
                       <ToolButton key={t.id} tool={t} onClick={() => setTool(t.id)} currentTool={tool} />
                  ))}
                </div>
              </div>
            </TooltipProvider>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </aside>
  );
}

export default function LeftPanel() {
  const { isLeftPanelOpen, setIsLeftPanelOpen, isMobile } = useScene();

  if (isMobile) {
    return (
      <Sheet open={isLeftPanelOpen} onOpenChange={setIsLeftPanelOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <LeftPanelContent />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn(
        'fixed top-14 left-0 h-[calc(100vh-3.5rem)] z-10 bg-card transition-transform duration-300 ease-in-out md:block',
        isLeftPanelOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <LeftPanelContent />
    </div>
  );
}
