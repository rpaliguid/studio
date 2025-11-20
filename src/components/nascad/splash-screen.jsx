'use client';
import Image from 'next/image';

export default function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
      <div className="relative animate-pulse-subtle">
        <Image
          src="/logo.png"
          alt="Nascad Logo"
          width={96}
          height={96}
          priority
        />
      </div>
      <h1 className="text-5xl font-headline font-bold tracking-tight mt-6">Nascad</h1>
      <p className="text-muted-foreground mt-2">Advanced 3D modeling has arrived.</p>
    </div>
  );
}
