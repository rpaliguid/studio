'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
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

const tools = [
    { icon: Move, name: 'Move' },
    { icon: RotateCw, name: 'Rotate' },
    { icon: Scale, name: 'Scale' },
    { icon: GitCommitHorizontal, name: 'Extrude' },
    { icon: Scissors, name: 'Bevel' },
];

const selectionModes = [
    { icon: VertexIcon, name: 'Vertex Select' },
    { icon: EdgeIcon, name: 'Edge Select' },
    { icon: FaceIcon, name: 'Face Select' },
]

const primitives = [
    { icon: Box, name: 'Cube' },
    { icon: Circle, name: 'Sphere' },
    { icon: Database, name: 'Cylinder' },
];

export default function LeftPanel() {
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
          <AccordionContent className="px-4">
            <TooltipProvider>
              <div className="grid grid-cols-4 gap-2">
                {primitives.map(tool => (
                    <Tooltip key={tool.name}>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="h-12 w-12">
                                <tool.icon className="h-6 w-6" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{tool.name}</p></TooltipContent>
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
              <div className="grid grid-cols-4 gap-2 mt-4">
                 {selectionModes.map(tool => (
                     <Tooltip key={tool.name}>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon">
                                <tool.icon className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{tool.name}</p></TooltipContent>
                    </Tooltip>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {tools.map(tool => (
                     <Tooltip key={tool.name}>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon">
                                <tool.icon className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{tool.name}</p></TooltipContent>
                    </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </aside>
  );
}
