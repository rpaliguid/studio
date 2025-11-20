'use client';
import Header from '@/components/nascad/header';
import LeftPanel from '@/components/nascad/left-panel';
import Viewport from '@/components/nascad/viewport';
import { SceneProvider, useScene } from '@/components/nascad/scene-provider';
import { cn } from '@/lib/utils';
import Timeline from '@/components/nascad/timeline';

function NascadLayout() {
  const { isLeftPanelOpen } = useScene();
  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body antialiased dark">
      <Header />
      <div className="flex flex-1 border-t border-border overflow-hidden">
        <LeftPanel />
        <main
          className={cn(
            'flex-1 flex flex-col relative bg-muted/20 transition-all duration-300 ease-in-out',
            isLeftPanelOpen ? 'ml-0 md:ml-72' : 'ml-0'
          )}
        >
          <div className="flex-grow">
            <Viewport />
          </div>
          <Timeline />
        </main>
      </div>
    </div>
  );
}

export default function NascadEditor() {
  return (
    <SceneProvider>
      <NascadLayout />
    </SceneProvider>
  );
}
