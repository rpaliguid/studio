'use client';
import { Bot } from 'lucide-react';

export default function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
      <div className="relative">
        <Bot className="w-24 h-24 text-primary animate-pulse" />
      </div>
      <h1 className="text-4xl font-bold tracking-tighter mt-4">Nascad</h1>
      <p className="text-muted-foreground mt-2">Loading advanced 3D modeling...</p>
    </div>
  );
}
