'use client';
import { Play, Pause, Rewind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useScene } from './scene-provider';
import { useEffect } from 'react';

export default function Timeline() {
  const { isPlaying, setIsPlaying, animationTime, setAnimationTime, animationDuration, mixer } = useScene();

  const handlePlayPause = () => {
    if (mixer) {
      setIsPlaying(!isPlaying);
    }
  };

  const handleRewind = () => {
    if (mixer) {
      mixer.setTime(0);
      setAnimationTime(0);
    }
  };

  const handleSliderChange = (value) => {
    if (mixer) {
      const newTime = value[0];
      mixer.setTime(newTime);
      setAnimationTime(newTime);
    }
  };
  
  useEffect(() => {
    if (mixer && isPlaying && animationTime >= animationDuration) {
        // Loop animation
        mixer.setTime(0);
        setAnimationTime(0);
    }
  }, [animationTime, animationDuration, isPlaying, mixer, setAnimationTime]);

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time * 1000) % 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };

  if (!mixer) {
    return null;
  }

  return (
    <div className="h-24 shrink-0 border-t border-border bg-card flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={handleRewind} className="h-8 w-8 md:h-10 md:w-10">
          <Rewind className="w-4 h-4 md:w-5 md:h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handlePlayPause} className="h-8 w-8 md:h-10 md:w-10">
          {isPlaying ? <Pause className="w-4 h-4 md:w-5 md:h-5" /> : <Play className="w-4 h-4 md:w-5 md:h-5" />}
        </Button>
      </div>
      <div className="flex-1 flex items-center gap-4">
        <Slider
          value={[animationTime]}
          max={animationDuration}
          step={0.01}
          onValueChange={handleSliderChange}
        />
        <div className="text-xs font-mono text-muted-foreground w-28">
          {formatTime(animationTime)} / {formatTime(animationDuration)}
        </div>
      </div>
    </div>
  );
}
