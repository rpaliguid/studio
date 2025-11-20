import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import ParameterOptimizer from './parameter-optimizer';

const VectorInput = ({ label }) => (
  <div className="grid grid-cols-4 items-center gap-2">
    <Label htmlFor={`${label}-x`} className="text-right text-xs">
      {label}
    </Label>
    <Input id={`${label}-x`} defaultValue="0.00" className="col-span-1 h-8" />
    <Input id={`${label}-y`} defaultValue="0.00" className="col-span-1 h-8" />
    <Input id={`${label}-z`} defaultValue="0.00" className="col-span-1 h-8" />
  </div>
);

export default function RightPanel() {
  return (
    <aside className="w-80 border-l border-border bg-card overflow-y-auto">
      <Accordion type="multiple" defaultValue={['transform', 'ai-optimizer']} className="w-full">
        <AccordionItem value="transform">
          <AccordionTrigger className="px-4 text-sm font-medium">Transform</AccordionTrigger>
          <AccordionContent className="px-4 space-y-4">
             <div className="space-y-1">
                <div className="grid grid-cols-4 items-center gap-2">
                    <div className="col-start-2 text-center text-xs text-muted-foreground">X</div>
                    <div className="text-center text-xs text-muted-foreground">Y</div>
                    <div className="text-center text-xs text-muted-foreground">Z</div>
                </div>
                <VectorInput label="Position" />
                <VectorInput label="Rotation" />
                <VectorInput label="Scale" />
             </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="rig-controls">
          <AccordionTrigger className="px-4 text-sm font-medium">Rig Controls</AccordionTrigger>
          <AccordionContent className="px-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="ik-switch">Inverse Kinematics</Label>
              <Switch id="ik-switch" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="elbow-slider">Elbow Constraint</Label>
              <Slider id="elbow-slider" defaultValue={[50]} max={100} step={1} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="pole-target-slider">Pole Target Angle</Label>
              <Slider id="pole-target-slider" defaultValue={[25]} max={100} step={1} />
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="ai-optimizer">
          <AccordionTrigger className="px-4 text-sm font-medium">Parameter Optimization</AccordionTrigger>
          <AccordionContent>
            <ParameterOptimizer />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </aside>
  );
}
