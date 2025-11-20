'use client';
import { useState, useEffect } from 'react';
import Header from '@/components/nascad/header';
import LeftPanel from '@/components/nascad/left-panel';
import Viewport from '@/components/nascad/viewport';
import { SceneProvider, useScene } from '@/components/nascad/scene-provider';
import { cn } from '@/lib/utils';
import Timeline from '@/components/nascad/timeline';
import SplashScreen from '@/components/nascad/splash-screen';

function NascadLayout() {
  const { isLeftPanelOpen } = useScene();
  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body antialiased">
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000); // Show splash screen for 2 seconds
    return () => clearTimeout(timer);
  }, []);

  return (
    <SceneProvider>
      {isLoading ? <SplashScreen /> : <NascadLayout />}
    </SceneProvider>
  );
}
