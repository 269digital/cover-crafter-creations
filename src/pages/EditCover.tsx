import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MaskEditor } from "@/components/MaskEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useTheme } from "next-themes";
import { Palette, CreditCard, Sun, Moon } from "lucide-react";

interface Creation {
  id: string;
  upscaled_image_url: string | null;
  image_url1: string | null;
  image_url2: string | null;
  image_url3: string | null;
  image_url4: string | null;
  prompt: string;
}


const EditCover: React.FC = () => {
  const { coverId } = useParams<{ coverId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null); // display URL (may be proxied blob)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [coverType, setCoverType] = useState<string>('eBook Cover');

  useEffect(() => {
    document.title = `Edit Cover | Covers by AI`;
  }, []);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        if (!coverId) {
          setError('Missing cover id');
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from('creations')
          .select('*')
          .eq('id', coverId)
          .maybeSingle();
        if (error || !data) {
          setError('Cover not found');
          setLoading(false);
          return;
        }
        const url = data.upscaled_image_url || data.image_url1 || data.image_url2 || data.image_url3 || data.image_url4;
        if (!url) {
          setError('No image available to edit');
          setLoading(false);
          return;
        }
        setOriginalUrl(url);
        setCoverType(data.cover_type || 'eBook Cover');

        const host = new URL(url).hostname;
        const isIdeogram = host === 'ideogram.ai' || host.endsWith('.ideogram.ai');
        if (isIdeogram) {
          const { data: session } = await supabase.auth.getSession();
          const accessToken = session.session?.access_token;
          if (!accessToken) throw new Error('Not authenticated');
          const proxied = `https://qasrsadhebdlwgxffkya.supabase.co/functions/v1/proxy-image?url=${encodeURIComponent(url)}`;
          const resp = await fetch(proxied, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!resp.ok) throw new Error('Failed to load image');
          const blob = await resp.blob();
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setImageUrl(objectUrl);
        } else {
          setImageUrl(url);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load cover');
      } finally {
        setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => navigate('/my-covers')}>Go to My Covers</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-bold">Edit Cover</h1>
        <p className="text-muted-foreground">Anything you paint over will be removed and replaced by AI.</p>
        {imageUrl && originalUrl && coverId && (
          <MaskEditor imageUrl={imageUrl} originalUrl={originalUrl} coverId={coverId} coverType={coverType} />
        )}
      </main>
    </div>
  );
};

export default EditCover;
