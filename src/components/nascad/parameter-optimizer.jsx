'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { optimizeParameters } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/hooks/use-toast";
import { Sparkles } from 'lucide-react';

const formSchema = z.object({
  sceneComplexity: z.string().min(1, 'Scene complexity is required.'),
  renderingMethod: z.string().min(1, 'Rendering method is required.'),
  desiredFramerate: z.coerce.number().min(1, 'Desired framerate must be positive.'),
  existingParameters: z.string().min(1, 'Existing parameters are required.'),
});

export default function ParameterOptimizer() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sceneComplexity: 'Medium, ~500k polygons, 100 objects, 2k textures',
      renderingMethod: 'Rasterization with PBR',
      desiredFramerate: 60,
      existingParameters: 'Shadow Quality: High, Anti-aliasing: TAA, Ambient Occlusion: SSAO',
    },
  });

  async function onSubmit(values) {
    setLoading(true);
    setResult('');
    const res = await optimizeParameters(values);
    setLoading(false);

    if (res.success) {
      setResult(res.data.suggestedSettings);
    } else {
      toast({
        variant: "destructive",
        title: "Optimization Failed",
        description: res.error,
      });
    }
  }

  return (
    <div className="p-4 text-sm">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="sceneComplexity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Scene Complexity</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., High, ~1M polygons" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="renderingMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rendering Method</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Ray Tracing" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="desiredFramerate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Desired Framerate (FPS)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 60" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="existingParameters"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Existing Parameters</FormLabel>
                <FormControl>
                  <Textarea placeholder="e.g., Shadow Quality: High, AA: MSAA 4x" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={loading} className="w-full">
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? 'Optimizing...' : 'Optimize Parameters'}
          </Button>
        </form>
      </Form>
      {result && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Suggested Settings:</h3>
          <Textarea readOnly value={result} className="h-48 bg-muted/50" />
        </div>
      )}
    </div>
  );
}
