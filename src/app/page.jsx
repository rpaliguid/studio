import Header from '@/components/nascad/header';
import LeftPanel from '@/components/nascad/left-panel';
import RightPanel from '@/components/nascad/right-panel';
import Viewport from '@/components/nascad/viewport';

export default function NascadEditor() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body antialiased">
      <Header />
      <div className="flex flex-1 border-t border-border overflow-hidden">
        <LeftPanel />
        <main className="flex-1 relative bg-muted/20">
          <Viewport />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}
