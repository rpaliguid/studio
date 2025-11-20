import { FileUp, FileDown, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Header() {
  return (
    <header className="flex items-center h-14 px-4 shrink-0 border-b border-border z-10 bg-card">
      <div className="flex items-center gap-2">
        <Bot className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-semibold tracking-tighter text-foreground">Nascad</h1>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="outline" size="sm">
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
