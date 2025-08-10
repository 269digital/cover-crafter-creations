import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface MaskEditorProps {
  imageUrl: string;
  coverId: string;
}

// Helper to load an image and get natural dimensions
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const DEFAULT_PROMPT = "Remove any stray/extra text and fill the background naturally.";

type Mode = "remove" | "restore";

export const MaskEditor: React.FC<MaskEditorProps> = ({ imageUrl, coverId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [mode, setMode] = useState<Mode>("remove");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  // Load the image once
  useEffect(() => {
    let mounted = true;
    loadImage(imageUrl).then((img) => {
      if (!mounted) return;
      setImgEl(img);

      // Initialize mask canvas to full image resolution and fill white (keep)
      const maskCanvas = maskCanvasRef.current!;
      const mctx = maskCanvas.getContext('2d')!;
      maskCanvas.width = img.naturalWidth;
      maskCanvas.height = img.naturalHeight;
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      // Set preview size based on container
      resizePreview();
      drawPreview();
    }).catch(() => {
      toast.error("Failed to load image for editing.");
    });

    const onResize = () => {
      resizePreview();
      drawPreview();
    };
    window.addEventListener('resize', onResize);
    return () => { mounted = false; window.removeEventListener('resize', onResize); };
  }, [imageUrl]);

  const resizePreview = () => {
    if (!imgEl || !containerRef.current || !previewCanvasRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const maxHeight = 520; // constrain a bit for viewport

    const imgW = imgEl.naturalWidth;
    const imgH = imgEl.naturalHeight;

    let targetW = containerWidth;
    let targetH = Math.round((imgH / imgW) * targetW);

    if (targetH > maxHeight) {
      targetH = maxHeight;
      targetW = Math.round((imgW / imgH) * targetH);
    }

    const scaleFactor = targetW / imgW;
    setScale(scaleFactor);

    previewCanvasRef.current.width = targetW;
    previewCanvasRef.current.height = targetH;
  };

  const drawPreview = () => {
    if (!imgEl || !previewCanvasRef.current || !maskCanvasRef.current) return;
    const pctx = previewCanvasRef.current.getContext('2d')!;
    const mask = maskCanvasRef.current;

    // Draw base image
    pctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
    pctx.drawImage(imgEl, 0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);

    // Build a tinted overlay only where mask is black
    const w = previewCanvasRef.current.width;
    const h = previewCanvasRef.current.height;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    octx.drawImage(mask, 0, 0, w, h);
    const imgData = octx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Treat dark (near-black) pixels as masked, white as keep
      const isBlack = r < 128 && g < 128 && b < 128;
      if (isBlack) {
        data[i] = 255;      // R
        data[i + 1] = 0;    // G
        data[i + 2] = 0;    // B
        data[i + 3] = 76;   // A ~0.3
      } else {
        data[i + 3] = 0;    // transparent
      }
    }
    octx.putImageData(imgData, 0, 0);
    pctx.drawImage(off, 0, 0);
  };

  // Draw a line segment on the mask canvas in the chosen color
  const drawOnMask = (fromX: number, fromY: number, toX: number, toY: number) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.strokeStyle = mode === 'remove' ? '#000000' : '#ffffff';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  };

  // Track last point to draw continuous lines
  const lastPoint = useRef<{x: number, y: number} | null>(null);

  const toImageCoords = (clientX: number, clientY: number) => {
    const rect = previewCanvasRef.current!.getBoundingClientRect();
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!previewCanvasRef.current) return;
    previewCanvasRef.current.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const { x, y } = toImageCoords(e.clientX, e.clientY);
    lastPoint.current = { x, y };
    drawOnMask(x, y, x, y);
    drawPreview();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !lastPoint.current) return;
    const { x, y } = toImageCoords(e.clientX, e.clientY);
    drawOnMask(lastPoint.current.x, lastPoint.current.y, x, y);
    lastPoint.current = { x, y };
    drawPreview();
  };

  const endDraw = (e: React.PointerEvent) => {
    if (!previewCanvasRef.current) return;
    previewCanvasRef.current.releasePointerCapture(e.pointerId);
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const clearMask = () => {
    const mask = maskCanvasRef.current!;
    const ctx = mask.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, mask.width, mask.height);
    drawPreview();
  };

  const handleGenerateFix = async () => {
    try {
      toast.info('Submitting edit...', { duration: 1200 });

      // Fetch original image as Blob
      const imgResp = await fetch(imageUrl, { cache: 'no-cache' });
      if (!imgResp.ok) throw new Error('Failed to fetch original image');
      const imgBlob = await imgResp.blob();

      // Export mask as PNG (full resolution)
      const maskBlob = await new Promise<Blob | null>((resolve) =>
        maskCanvasRef.current!.toBlob((b) => resolve(b), 'image/png')
      );
      if (!maskBlob) throw new Error('Failed to export mask');

      // Build multipart form for edge function
      const form = new FormData();
      form.append('image', imgBlob, 'image.png');
      form.append('mask', maskBlob, 'mask.png');
      form.append('prompt', prompt);
      form.append('cover_id', coverId);

      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      const resp = await fetch(
        `https://qasrsadhebdlwgxffkya.supabase.co/functions/v1/ideogram-edit`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        }
      );

      const json = await resp.json();
      if (!resp.ok || !json?.success) {
        console.error('Edit error:', json);
        throw new Error(json?.error || 'Edit failed');
      }

      toast.success('Edit applied! Redirecting...');
      // Redirect to My Covers to see updated image
      window.location.assign('/my-covers');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate fix');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="rounded-lg border bg-card p-3">
            <div ref={containerRef} className="w-full">
              <canvas
                ref={previewCanvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                className="w-full touch-none rounded-md border bg-muted"
              />
            </div>
          </div>
        </div>
        <div className="md:col-span-1 space-y-4">
          <div className="space-y-2">
            <Label>Brush size</Label>
            <Slider value={[brushSize]} min={5} max={150} step={1} onValueChange={(v) => setBrushSize(v[0])} />
          </div>

          <div className="flex gap-2">
            <Button variant={mode === 'remove' ? 'default' : 'outline'} onClick={() => setMode('remove')}>
              Remove (paint)
            </Button>
            <Button variant={mode === 'restore' ? 'default' : 'outline'} onClick={() => setMode('restore')}>
              Restore
            </Button>
          </div>

          <Button variant="secondary" onClick={clearMask} className="w-full">
            Clear Mask
          </Button>

          <div className="space-y-2">
            <Label>Prompt</Label>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <p className="text-xs text-muted-foreground">Anything you paint will be removed and replaced by AI.</p>
          </div>

          <Button onClick={handleGenerateFix} className="w-full">Generate Fix</Button>
        </div>
      </div>

      {/* Hidden full-resolution mask canvas */}
      <canvas ref={maskCanvasRef} className="hidden" />
    </div>
  );
};
