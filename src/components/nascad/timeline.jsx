
'use client';
import { Play, Pause, Rewind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useScene } from './scene-provider';
import { useEffect } from 'react';

export default function Timeline() {
  const { 
    isPlaying, 
    setIsPlaying, 
    animationTime, 
    setAnimationTime,
    animationDuration, 
    mixer 
  } = useScene();

  const handlePlayPause = () => {
    if (animationDuration > 0) {
        setIsPlaying(!isPlaying);
    }
  };

  const handleRewind = () => {
    if (mixer) {
      mixer.setTime(0);
      setAnimationTime(0);
      if (!isPlaying) {
        // If paused, we need to manually update the actions to reflect the new time
         mixer.update(0);
      }
    }
  };
  
  const handleScrub = (value) => {
    const newTime = value[0];
    if (mixer) {
        // Set the time on the mixer
        mixer.setTime(newTime);
        // Also update the state for the slider
        setAnimationTime(newTime);
        // If we are paused, we need to manually update the scene to reflect the new time
         if (!isPlaying) {
            mixer.update(0);
         }
    }
  };

  useEffect(() => {
    // This effect handles looping. When the animation finishes, if it was playing, we reset it.
    if(isPlaying && animationTime >= animationDuration && animationDuration > 0) {
        // Reset the animation time which will cause the viewport loop to continue from the start
        if(mixer) {
            mixer.setTime(0);
            setAnimationTime(0);
        }
    }
  }, [animationTime, animationDuration, isPlaying, mixer, setAnimationTime]);


  // Format time as MM:SS:FF (minutes:seconds:frames)
  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60).toString().padStart(2, '0');
    const seconds = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
    const frames = Math.floor((timeInSeconds * 30) % 30).toString().padStart(2, '0'); // Assuming 30fps
    return `${minutes}:${seconds}:${frames}`;
  };

  return (
    <div className="h-24 w-full bg-card border-t border-border p-2 flex items-center gap-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={handleRewind} disabled={!mixer}>
          <Rewind className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handlePlayPause} disabled={!mixer}>
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </Button>
      </div>
      <div className="flex-grow flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground">{formatTime(animationTime)}</span>
        <Slider
          value={[animationTime]}
          max={animationDuration}
          step={1 / 30} // Step per frame
          onValueChange={handleScrub}
          disabled={!mixer}
          className="w-full"
        />
        <span className="text-xs font-mono text-muted-foreground">{formatTime(animationDuration)}</span>
      </div>
    </div>
  );
}
