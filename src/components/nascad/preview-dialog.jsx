'use client';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useScene } from './scene-provider';
import { Button } from '@/components/ui/button';

export default function PreviewDialog() {
  const { previewImage, setPreviewImage } = useScene();

  const handleDownload = () => {
    if (!previewImage) return;
    const link = document.createElement('a');
    link.href = previewImage;
    link.download = 'nascad-preview.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Render Preview</DialogTitle>
          <DialogDescription>
            A snapshot of your current scene. You can download this image.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 rounded-lg overflow-hidden border border-border">
          {previewImage && (
            <Image
              src={previewImage}
              alt="Render Preview"
              width={1920}
              height={1080}
              style={{ width: '100%', height: 'auto' }}
            />
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={handleDownload} disabled={!previewImage}>Download Image</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
