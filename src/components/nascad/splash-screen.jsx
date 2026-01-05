'use client';

export default function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-5xl font-headline font-bold tracking-tight animate-slideUp-1">Nascad</h1>
        <p className="text-muted-foreground mt-2 animate-slideUp-2">A Simulation Software.</p>
      </div>
      <div className="absolute bottom-8 text-xs text-muted-foreground animate-fadeIn-delay">
        BETA V1
      </div>
    </div>
  );
}
