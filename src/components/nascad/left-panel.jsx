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
  Plus
} from 'lucide-react';
import { useState } from 'react';
import { VertexIcon, EdgeIcon, FaceIcon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useScene } from '@/components/nascad/scene-provider';


const SceneItem = ({ name, children, level = 0 }) => {
  const [visible, setVisible] = useState(true);
  return (
    <div>
      <div className="flex items-center justify-between hover:bg-muted/50 rounded-md pr-2">
        <div className="flex items-center" style={{ paddingLeft: `${level * 1}rem` }}>
          <LayoutGrid className="w-4 h-4 mr-2 text-muted-foreground" />
          <span className="text-sm">{name}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setVisible(!visible)}>
          {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
      {children && <div className="pl-4">{children}</div>}
    </div>
  );
};

const selectionModes = [
    { id: 'object', icon: Box, name: 'Object Select' },
    { id: 'vertex', icon: VertexIcon, name: 'Vertex Select' },
    { id: 'edge', icon: EdgeIcon, name: 'Edge Select' },
    { id: 'face', icon: FaceIcon, name: 'Face Select' },
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
            >
                <tool.icon className="h-5 w-5" />
            </Button>
        </TooltipTrigger>
        <TooltipContent><p>{tool.name}</p></TooltipContent>
    </Tooltip>
);

export default function LeftPanel() {
  const { tool, setTool, selectionMode, setSelectionMode, addPrimitive } = useScene();

  return (
    <aside className="w-72 border-r border-border bg-card overflow-y-auto">
      <Accordion type="multiple" defaultValue={['scene-graph', 'toolbox']} className="w-full">
        <AccordionItem value="scene-graph">
          <AccordionTrigger className="px-4 text-sm font-medium">Scene Graph</AccordionTrigger>
          <AccordionContent className="px-4 text-sm">
            <div className="space-y-1">
              <SceneItem name="Main Camera" />
              <SceneItem name="Directional Light" />
              <SceneItem name="CharacterArmature">
                <SceneItem name="Hips" level={1}>
                  <SceneItem name="Spine" level={2}>
                     <SceneItem name="Head" level={3} />
                  </SceneItem>
                </SceneItem>
              </SceneItem>
               <SceneItem name="Floor" />
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
                              <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => addPrimitive(primitive.id)}>
                                  <primitive.icon className="h-6 w-6" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>{primitive.name}</p></TooltipContent>
                      </Tooltip>
                  ))}
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-12 w-12">
                              <Plus className="h-6 w-6" />
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
                      <ToolButton key={mode.id} tool={mode} onClick={() => setSelectionMode(mode.id)} currentTool={selectionMode} />
                  ))}
                </div>
              </div>

              <Separator />
              
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Tools</p>
                <div className="grid grid-cols-4 gap-2">
                  {transformTools.map(t => (
                      <ToolButton key={t.id} tool={t} onClick={() => setTool(t.id)} currentTool={tool} />
                  ))}
                </div>
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