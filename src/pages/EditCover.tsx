import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
  const { credits, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
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
        let url = null as string | null;
        const imgParam = Number(searchParams.get('img'));
        if (!Number.isNaN(imgParam)) {
          if (imgParam === 1) url = data.image_url1;
          else if (imgParam === 2) url = data.image_url2;
          else if (imgParam === 3) url = data.image_url3;
          else if (imgParam === 4) url = data.image_url4;
        }
        if (!url) {
          url = data.upscaled_image_url || data.image_url1 || data.image_url2 || data.image_url3 || data.image_url4;
        }
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
  }, [coverId, searchParams]);

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
      {/* Header */}
      <header className="bg-gradient-hero border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Palette className="h-6 w-6 text-white" />
              <h1 className="text-xl font-bold text-white">Edit Cover</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="text-white hover:bg-white/10"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-3 py-1 text-sm font-medium bg-white/10 text-white border-white/20">
                <CreditCard className="h-4 w-4 mr-1" />
                {credits} Credits
              </Badge>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/buy-credits")}
                className="bg-white/10 text-white border-white/20 hover:bg-white/20"
              >
                <CreditCard className="h-4 w-4 mr-1" />
                Buy Credits
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/my-covers")}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              My Covers
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/studio")}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              Create New
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <p className="text-muted-foreground">Anything you paint over will be removed and replaced by AI.</p>
        {imageUrl && originalUrl && coverId && (
          <MaskEditor imageUrl={imageUrl} originalUrl={originalUrl} coverId={coverId} coverType={coverType} />
        )}
      </main>
    </div>
  );
};

export default EditCover;
