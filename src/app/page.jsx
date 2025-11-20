import Header from '@/components/nascad/header';
import LeftPanel from '@/components/nascad/left-panel';
import Viewport from '@/components/nascad/viewport';
import { SceneProvider } from '@/components/nascad/scene-provider';

export default function NascadEditor() {
  return (
    <SceneProvider>
      <div className="flex flex-col h-screen bg-background text-foreground font-body antialiased dark">
        <Header />
        <div className="flex flex-1 border-t border-border overflow-hidden">
          <LeftPanel />
          <main className="flex-1 relative bg-muted/20">
            <Viewport />
          </main>
        </div>
      </div>
    </SceneProvider>
  );
}
