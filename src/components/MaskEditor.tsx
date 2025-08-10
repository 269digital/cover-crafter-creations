import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { Loader2, CreditCard } from "lucide-react";

interface MaskEditorProps {
  imageUrl: string; // display URL (may be proxied)
  originalUrl: string; // original source URL for server-side fetch
  coverId: string;
  coverType?: string; // 'eBook Cover' | 'Album Cover' | 'Audiobook Cover'
}

// Helper to load an image and ensure it's decoded before use
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = async () => {
    try { await (img as any).decode?.(); } catch {}
    resolve(img);
  };
  img.onerror = reject;
  img.src = src;
});



const PREVIEW_SIZE = { w: 892, h: 1248 };

type Mode = "remove" | "restore";

export const MaskEditor: React.FC<MaskEditorProps> = ({ imageUrl, originalUrl, coverId, coverType = 'eBook Cover' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgPerCssRef = useRef<{ sx: number; sy: number }>({ sx: 1, sy: 1 });
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1); // CSS px per image px
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [mode, setMode] = useState<Mode>("remove");
  const [displayedUrl, setDisplayedUrl] = useState<string>(imageUrl);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const { refreshCredits } = useAuth();
  const navigate = useNavigate();

  // Responsive container height based on image aspect ratio (fallback to cover type)
  const [containerHeight, setContainerHeight] = useState<number>(PREVIEW_SIZE.h);
  const [imgAspect, setImgAspect] = useState<number | null>(null); // width/height

  // Load the image when displayedUrl changes
  useEffect(() => {
    let mounted = true;
    loadImage(displayedUrl).then((img) => {
      if (!mounted) return;
      setImgEl(img);
      setImgAspect(img.naturalWidth / img.naturalHeight);

      // Initialize mask canvas to full image resolution and fill white (keep)
      const maskCanvas = maskCanvasRef.current!;
      const mctx = maskCanvas.getContext('2d')!;
      maskCanvas.width = img.naturalWidth;
      maskCanvas.height = img.naturalHeight;
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      hasPaintedRef.current = false;

      // Set preview size based on container and draw (rAF to ensure layout ready)
      requestAnimationFrame(() => {
        resizePreview();
        drawPreview();
      });
    }).catch(() => {
      toast.error("Failed to load image for editing.");
    });

    const onResize = () => {
      resizePreview();
      drawPreview();
    };
    window.addEventListener('resize', onResize);
    return () => { mounted = false; window.removeEventListener('resize', onResize); };
  }, [displayedUrl]);


  // Ensure initial draw when image and layout are ready
  useEffect(() => {
    if (!imgEl) return;
    requestAnimationFrame(() => {
      resizePreview();
      drawPreview();
    });
  }, [imgEl, containerHeight, coverType]);

  // Observe container size changes to keep canvas in sync
  useEffect(() => {
    if (!imgEl || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      resizePreview();
      drawPreview();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [imgEl, containerHeight, coverType]);


  const resizePreview = () => {
    if (!imgEl || !previewCanvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const availableW = Math.max(320, Math.floor(container.clientWidth || PREVIEW_SIZE.w));
    const ratio = imgAspect ?? (coverType === 'eBook Cover' ? (2 / 3) : 1); // width:height (use actual image when available)
    const cssW = availableW;
    const cssH = Math.round(cssW / ratio);

    // Keep container in sync for layout
    container.style.width = '100%';
    container.style.height = cssH + 'px';
    setContainerHeight(cssH);

    // Handle DPR for crisp drawing
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const canvas = previewCanvasRef.current;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    // Compute image draw scale and offsets (contain, allow upscaling)
    const fitW = cssW / imgEl.naturalWidth;
    const fitH = cssH / imgEl.naturalHeight;
    const scaleToFit = Math.min(fitW, fitH);
    const drawW = imgEl.naturalWidth * scaleToFit;
    const drawH = imgEl.naturalHeight * scaleToFit;
    const offX = (cssW - drawW) / 2;
    const offY = (cssH - drawH) / 2;

    // Store CSS px per image px and its inverse
    setScale(scaleToFit);
    imgPerCssRef.current = { sx: scaleToFit ? 1 / scaleToFit : 1, sy: scaleToFit ? 1 / scaleToFit : 1 };
    setOffset({ x: offX, y: offY });
  };

  const drawPreview = () => {
    if (!imgEl || !previewCanvasRef.current || !maskCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const pctx = canvas.getContext('2d')!;

    // Reset transform for DPR-aware drawing
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear full CSS-sized area using client dimensions (CSS px)
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    pctx.clearRect(0, 0, cssW, cssH);

    // Compute drawn image rect (CSS px)
    const drawW = imgEl.naturalWidth * scale;
    const drawH = imgEl.naturalHeight * scale;

    // Draw base image
    pctx.drawImage(imgEl, offset.x, offset.y, drawW, drawH);

    // Prepare mask overlay at same rect
    const off = document.createElement('canvas');
    off.width = Math.ceil(cssW);
    off.height = Math.ceil(cssH);
    const octx = off.getContext('2d')!;
    // Draw the full-res mask scaled into the same rect
    octx.drawImage(
      maskCanvasRef.current,
      0,
      0,
      maskCanvasRef.current.width,
      maskCanvasRef.current.height,
      offset.x,
      offset.y,
      drawW,
      drawH
    );

    const imgData = octx.getImageData(0, 0, off.width, off.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isBlack = r < 128 && g < 128 && b < 128;
      if (isBlack) {
        data[i] = 255; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 76;
      } else {
        data[i + 3] = 0;
      }
    }
    octx.putImageData(imgData, 0, 0);
    pctx.drawImage(off, 0, 0);
  };

  // Draw a line segment on the mask canvas in the chosen color
  const drawOnMask = (fromX: number, fromY: number, toX: number, toY: number) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    const scaleFactor = Math.max(imgPerCssRef.current.sx, imgPerCssRef.current.sy);
    ctx.strokeStyle = mode === 'remove' ? '#000000' : '#ffffff';
    ctx.lineWidth = brushSize * scaleFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    if (mode === 'remove') {
      hasPaintedRef.current = true;
    }
  };

  // Track last point to draw continuous lines
  const lastPoint = useRef<{x: number, y: number} | null>(null);
  // Track whether user actually painted any removal (black)
  const hasPaintedRef = useRef(false);

  const toImageCoords = (clientX: number, clientY: number) => {
    const rect = previewCanvasRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const x = (px - offset.x) / scale;
    const y = (py - offset.y) / scale;
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
    hasPaintedRef.current = false;
    drawPreview();
  };

  // Binarize mask to strict black/white with full opacity.
  // Returns true if the mask is untouched (all white, meaning no removals painted).
  const binarizeAndCheckUntouched = (): boolean => {
    if (!maskCanvasRef.current) return true;
    const mask = maskCanvasRef.current;
    const ctx = mask.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, mask.width, mask.height);
    const data = imgData.data;
    let hasBlack = false;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = (r + g + b) / 3;

      if (gray < 128) {
        // Force pure black, fully opaque
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
        hasBlack = true;
      } else {
        // Force pure white, fully opaque
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return !hasBlack;
  };

  const handleGenerateFix = async () => {
    try {
      setIsGenerating(true);
      if (!imgEl) throw new Error('Image not ready');

      // Normalize mask and check if the user painted anything
      const isUntouched = binarizeAndCheckUntouched();
      if (isUntouched) {
        toast("No changes made to cover");
        return;
      }

      // Export mask as PNG (full resolution) after binarization
      const maskBlob = await new Promise<Blob | null>((resolve) =>
        maskCanvasRef.current!.toBlob((b) => resolve(b), 'image/png')
      );
      if (!maskBlob) throw new Error('Failed to export mask');

      // Export the exact source image at the SAME pixel dimensions as the mask
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = maskCanvasRef.current!.width;
      srcCanvas.height = maskCanvasRef.current!.height;
      const sctx = srcCanvas.getContext('2d')!;
      sctx.drawImage(imgEl, 0, 0, srcCanvas.width, srcCanvas.height);
      const imageBlob = await new Promise<Blob | null>((resolve) =>
        srcCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
      );
      if (!imageBlob) throw new Error('Failed to export source image');

      // Build multipart form for edge function (prompt handled server-side)
      const form = new FormData();
      form.append('image', imageBlob, 'image.jpg');
      form.append('mask', maskBlob, 'mask.png');
      form.append('cover_id', coverId);

      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      const editResp = await fetch(
        `https://qasrsadhebdlwgxffkya.supabase.co/functions/v1/ideogram-edit`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        }
      );

      const editJson = await editResp.json().catch(async () => ({ error: await editResp.text().catch(() => 'Edit failed') }));
      if (!editResp.ok || !editJson?.success) {
        const baseMsg = editJson?.error || 'Edit failed';
        const det = editJson?.details ? `: ${typeof editJson.details === 'string' ? editJson.details : JSON.stringify(editJson.details)}` : '';
        console.error('Edit error details:', editJson);
        throw new Error(`${baseMsg}${det}`);
      }

      const editedUrl: string = editJson.storedImageUrl || editJson.editedImage;
      if (!editedUrl) throw new Error('Missing edited image URL');

      // Update the editor to show the new fixed image and reset mask
      setDisplayedUrl(editedUrl);
      clearMask();
      toast.success('Fix applied. Review and Upscale when ready.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate fix');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpscale = async () => {
    try {
      setIsUpscaling(true);
      const srcUrl = (displayedUrl && displayedUrl.startsWith('blob:'))
        ? (originalUrl || imageUrl)
        : (displayedUrl || originalUrl || imageUrl);
      const { data: upData, error: upError } = await supabase.functions.invoke('upscale-cover', {
        body: { imageUrl: srcUrl, coverId }
      });

      if (upError || !upData?.success) {
        console.error('Upscale error:', upError || upData);
        throw new Error((upError as any)?.message || upData?.error || 'Upscale failed');
      }

      await refreshCredits();
      navigate(`/my-covers?waitFor=${coverId}`);
    } catch (e: any) {
      toast.error(e?.message || 'Upscale failed');
    } finally {
      setIsUpscaling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mobile-only controls at top */}
      <div className="md:hidden space-y-4">
        <div className="space-y-2">
          <Label>Brush size</Label>
          <Slider value={[brushSize]} min={5} max={150} step={1} onValueChange={(v) => setBrushSize(v[0])} />
        </div>
        <Button variant="secondary" onClick={clearMask} className="w-full">
          Clear Mask
        </Button>
        <Button onClick={handleGenerateFix} className="w-full" disabled={isGenerating || isUpscaling}>
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating fix...
            </>
          ) : (
            'Generate Fix'
          )}
        </Button>
        <Button onClick={handleUpscale} className="w-full" disabled={isUpscaling || isGenerating}>
          {isUpscaling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Upscaling...
            </>
          ) : (
            'Upscale'
          )}
        </Button>
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <CreditCard className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> You will lose your cover if you navigate away from this page without upscaling.
          </AlertDescription>
        </Alert>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div>
            <div
              ref={containerRef}
              className="relative w-full"
              style={{ width: '100%', height: containerHeight }}
            >
              <canvas
                ref={previewCanvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                className="touch-none block"
              />
              {/* Upscaled badge overlay placeholder (shown by Studio-like behavior if needed) */}
            </div>
          </div>
        </div>
        <div className="hidden md:block lg:col-span-1 space-y-4 w-full max-w-md mx-auto lg:max-w-none">
          <div className="space-y-2">
            <Label>Brush size</Label>
            <Slider value={[brushSize]} min={5} max={150} step={1} onValueChange={(v) => setBrushSize(v[0])} />
          </div>


          <Button variant="secondary" onClick={clearMask} className="w-full">
            Clear Mask
          </Button>

          

          <Button onClick={handleGenerateFix} className="w-full" disabled={isGenerating || isUpscaling}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating fix...
              </>
            ) : (
              'Generate Fix'
            )}
          </Button>
          <Button onClick={handleUpscale} className="w-full" disabled={isUpscaling || isGenerating}>
            {isUpscaling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Upscaling...
              </>
            ) : (
              'Upscale'
            )}
          </Button>
          <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
            <CreditCard className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> You will lose your cover if you navigate away from this page without upscaling.
            </AlertDescription>
          </Alert>
          {/* Upscale and Download buttons will be available from the Studio-like flow after upscaling */}

        </div>
      </div>

      {/* Hidden full-resolution mask canvas */}
      <canvas ref={maskCanvasRef} className="hidden" />
    </div>
  );
};
