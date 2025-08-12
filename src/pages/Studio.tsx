import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Palette, Sparkles, CreditCard, Download, Heart, Zap, Moon, Sun, Wand2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";

// Book cover generator component
const Studio = () => {
  const { user, credits, signOut, refreshCredits, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [genre, setGenre] = useState("");
  const [style, setStyle] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [narratedBy, setNarratedBy] = useState("");
  const [coverType, setCoverType] = useState<string>("eBook Cover");
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageData, setImageData] = useState<Array<{
    url: string;
    generationId?: string;
    isUpscaled: boolean;
    isUpscaling: boolean;
  }>>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentCreationId, setCurrentCreationId] = useState<string | null>(null);

  const aspectRatio = coverType === "eBook Cover" ? "ASPECT_2_3" : "ASPECT_1_1";
  const aspectClass = coverType === "eBook Cover" ? "aspect-[2/3]" : "aspect-square";

  const bookGenres = [
    "Thriller",
    "Romance",
    "Sci-Fi",
    "Fantasy",
    "Mystery",
    "Horror",
    "Literary Fiction",
    "Young Adult",
    "Historical Fiction",
    "Non-Fiction"
  ];

  const albumGenres = [
    "Popular & Contemporary",
    "Rock & Alternative",
    "Folk & Traditional",
    "Jazz & Related Styles",
    "Dance & Electronic",
    "Classical & New Age",
    "Religious & Spiritual",
    "Reggae & Caribbean",
    "Country & Americana",
    "Latin & World"
  ];

  const genres = coverType === "Album Cover" ? albumGenres : bookGenres;

  const styles = [
    "Realistic",
    "Illustrated",
    "Minimalist",
    "Vintage",
    "Modern",
    "Dark & Moody",
    "Bright & Colorful",
    "Abstract"
  ];

  const handleGenerate = async () => {
    // Require at least 2 credits to generate
    if (credits < 2) {
      toast({
        title: "Not enough credits",
        description: "You need 2 credits to generate covers.",
        variant: "destructive",
      });
      navigate("/buy-credits");
      return;
    }

    // Validate required fields
    if (!genre || !style || !title || !author || !description) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields before generating covers.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setGeneratedImages([]);
    setImageData([]);

    try {
      const { data, error } = await supabase.functions.invoke('generate-covers', {
        body: { 
          title,
          author,
          genre,
          style,
          description,
          tagline: "",
          aspectRatio,
          coverType,
          narratedBy
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        // Extract URLs from Ideogram response objects
        const imageUrls = (data.images || []).map((img: any) => img.url);
        setGeneratedImages(imageUrls);
        
        // Initialize image data with generation IDs if available
        const newImageData = imageUrls.map((url: string, index: number) => ({
          url,
          generationId: data.generationIds?.[index],
          isUpscaled: false,
          isUpscaling: false,
        }));
        setImageData(newImageData);
        
        // Save creation record to database
        try {
          // Delete any previous draft creations (those without an upscaled image) for this user
          try {
            await supabase
              .from('creations')
              .delete()
              .eq('user_id', user.id)
              .is('upscaled_image_url', null);
          } catch (delErr) {
            console.warn('Could not delete previous drafts:', delErr);
          }

          // Save the newly generated images as the current draft
          const { data: created, error: saveError } = await supabase
            .from('creations')
            .insert({
              user_id: user.id,
              prompt: `${genre} book cover for "${title}" by ${author}. ${style} style. ${description}`,
              image_url1: imageUrls[0] || null,
              image_url2: imageUrls[1] || null,
              image_url3: imageUrls[2] || null,
              image_url4: imageUrls[3] || null,
              cover_type: coverType
            })
            .select('id')
            .single();
          
          if (saveError) {
            console.error('Error saving creation:', saveError);
          }
          if (created?.id) {
            setCurrentCreationId(created.id);
            try { sessionStorage.setItem('currentCreationId', created.id); } catch {}
          }
        } catch (saveError) {
          console.error('Error saving creation:', saveError);
        }
        
        await refreshCredits(); // Refresh credits to show updated count
        toast({
          title: "Success!",
          description: data.message,
        });
      }
    } catch (error: any) {
      console.error('Cover generation error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate covers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (imageUrl: string, index: number) => {
    try {
      // Create a temporary link to download the image directly
      // This bypasses CORS by letting the browser handle the download
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_cover_${index + 1}.jpg`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      // Temporarily add to DOM and click
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: `Cover ${index + 1} download initiated. Check your downloads folder.`,
      });
    } catch (error) {
      console.error('Download error:', error);
      // Fallback: open in new tab
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
      
      toast({
        title: "Download Alternative",
        description: "Right-click the image in the new tab and select 'Save image as...'",
      });
    }
  };

  const handleUpscale = async (index: number) => {
    // Require at least 2 credits to upscale
    if (credits < 2) {
      toast({
        title: "Not enough credits",
        description: "You need 2 credits to upscale a cover.",
        variant: "destructive",
      });
      navigate("/buy-credits");
      return;
    }

    const imageInfo = imageData[index];
    console.log('Attempting to upscale image at index:', index, 'with imageInfo:', imageInfo);
    
    if (!imageInfo?.url) {
      toast({
        title: "Upscale Failed",
        description: "Unable to upscale this image. Image URL not found.",
        variant: "destructive",
      });
      return;
    }

    console.log('Sending upscale request with imageUrl:', imageInfo.url);

    // Set upscaling state
    setImageData(prev => prev.map((img, idx) => 
      idx === index ? { ...img, isUpscaling: true } : img
    ));

    try {
      const { data, error } = await supabase.functions.invoke('upscale-cover', {
        body: { 
          imageUrl: imageInfo.url,
          coverType
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        // Update the image data with upscaled image
        setImageData(prev => prev.map((img, idx) => 
          idx === index ? { 
            ...img, 
            url: data.upscaledImage,
            generationId: data.generationId,
            isUpscaled: true,
            isUpscaling: false 
          } : img
        ));
        
        // Also update the generatedImages array for backward compatibility
        setGeneratedImages(prev => prev.map((url, idx) => 
          idx === index ? data.upscaledImage : url
        ));

        await refreshCredits();
        toast({
          title: "Upscale Successful!",
          description: `Cover ${index + 1} has been upscaled to higher resolution.`,
        });
      }
    } catch (error: any) {
      console.error('Upscale error:', error);
      setImageData(prev => prev.map((img, idx) => 
        idx === index ? { ...img, isUpscaling: false } : img
      ));
      toast({
        title: "Upscale Failed",
        description: error.message || "Failed to upscale image. Please try again.",
        variant: "destructive",
      });
    }
  };


  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const captureEditViewportHintFromEvent = (e: React.MouseEvent) => {
    try {
      const card = (e.currentTarget as HTMLElement).closest('.relative.group') as HTMLElement | null;
      const img = card?.querySelector('img') as HTMLImageElement | null;
      if (img) {
        const rect = img.getBoundingClientRect();
        sessionStorage.setItem('editViewportHint', JSON.stringify({ width: Math.round(rect.width), height: Math.round(rect.height) }));
      }
    } catch {}
  };

  const handleEdit = async (imageUrl: string, index?: number) => {
    setEditingIndex(index ?? null);
    try {
      const preferred = typeof index === 'number' ? index + 1 : undefined;

      // Use stored creation id when available
      let storedId = currentCreationId as string | null;
      try { if (!storedId) storedId = sessionStorage.getItem('currentCreationId'); } catch {}

      if (storedId) {
        const { data: rec } = await supabase
          .from('creations')
          .select('id,image_url1,image_url2,image_url3,image_url4')
          .eq('id', storedId)
          .maybeSingle();

        if (rec?.id) {
          const urls = [rec.image_url1, rec.image_url2, rec.image_url3, rec.image_url4];
          let idx = 1;
          if (preferred && urls[preferred - 1] === imageUrl) {
            idx = preferred;
            navigate(`/edit/${rec.id}?img=${idx}`);
            return;
          }
          const found = urls.findIndex((u) => u === imageUrl);
          if (found >= 0) {
            idx = found + 1;
            navigate(`/edit/${rec.id}?img=${idx}`);
            return;
          }
        }
      }

      // Fallback: search recent creations for a match
      const { data: list } = await supabase
        .from('creations')
        .select('id,image_url1,image_url2,image_url3,image_url4,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (list && list.length) {
        for (const rec of list) {
          const urls = [rec.image_url1, rec.image_url2, rec.image_url3, rec.image_url4];
          const found = urls.findIndex((u) => u === imageUrl);
          if (found >= 0) {
            navigate(`/edit/${rec.id}?img=${found + 1}`);
            return;
          }
        }
      }

      // Last resort: create a new creation record for this single image
      const { data: inserted, error: insertError } = await supabase
        .from('creations')
        .insert({
          user_id: user.id,
          prompt: `${genre} ${coverType === "Album Cover" ? "album" : coverType === "Audiobook Cover" ? "audiobook" : "book"} cover for \"${title}\" by ${author}. ${style} style. ${description}`,
          image_url1: imageUrl,
          cover_type: coverType,
        })
        .select('id')
        .single();

      if (insertError || !inserted?.id) {
        throw new Error(insertError?.message || 'Unable to prepare edit');
      }

      setCurrentCreationId(inserted.id);
      try { sessionStorage.setItem('currentCreationId', inserted.id); } catch {}

      navigate(`/edit/${inserted.id}?img=1`);
    } catch (e: any) {
      console.error('Edit prep error:', e);
      toast({
        title: 'Unable to open editor',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setEditingIndex(null);
    }
  };

  // Utility to check if an image URL is still reachable (avoids broken previews)
  const validateImageUrl = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        // Cache-buster param to avoid cached 404s
        img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
      } catch {
        resolve(false);
      }
    });
  };

  // Redirect to auth if not authenticated
  React.useEffect(() => {
    if (!loading && !user) {
      console.log('User not authenticated, redirecting to auth page');
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  // Rehydrate last draft (non‑upscaled) creation on load; prefer stored creation id
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;

    // Reset UI while fetching
    setGeneratedImages([]);
    setImageData([]);

    (async () => {
      try {
        // Try to use the exact creation we just worked with
        let creationId: string | null = currentCreationId;
        try { if (!creationId) creationId = sessionStorage.getItem('currentCreationId'); } catch {}

        let data: any = null;
        if (creationId) {
          const { data: byId, error: byIdErr } = await supabase
            .from('creations')
            .select('id,image_url1,image_url2,image_url3,image_url4,cover_type')
            .eq('id', creationId)
            .maybeSingle();
          if (byIdErr) console.warn('Draft fetch by id error:', byIdErr);
          data = byId;
        }

        // Fallback to latest draft
        if (!data) {
          const { data: latest, error } = await supabase
            .from('creations')
            .select('id,image_url1,image_url2,image_url3,image_url4,cover_type')
            .eq('user_id', user.id)
            .is('upscaled_image_url', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) console.warn('Draft fetch error:', error);
          data = latest;
        }

        if (cancelled || !data) return;

        const urls = [data.image_url1, data.image_url2, data.image_url3, data.image_url4].filter(Boolean) as string[];
        if (!urls.length) return;

        if (data.cover_type) setCoverType(data.cover_type);
        setGeneratedImages(urls);
        setImageData(urls.map((u) => ({ url: u, isUpscaled: false, isUpscaling: false })));
        if (data.id) {
          setCurrentCreationId(data.id as string);
          try { sessionStorage.setItem('currentCreationId', data.id as string); } catch {}
        }
      } catch (e) {
        console.warn('Draft rehydrate exception:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if no user (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-hero border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Palette className="h-6 w-6 text-white" />
              <h1 className="text-xl font-bold text-white">Cover Studio</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log("Dark mode toggle clicked, current theme:", theme);
                  const newTheme = theme === "dark" ? "light" : "dark";
                  console.log("Switching to theme:", newTheme);
                  setTheme(newTheme);
                }}
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
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-white hover:bg-white/10">
                Sign Out
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/my-covers")}
              className="hidden sm:inline-flex bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              My Covers
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/my-covers")}
              className="sm:hidden bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              Covers
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-card">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl flex items-center justify-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                Create Your Cover
              </CardTitle>
              <CardDescription>
                Design a stunning cover with AI assistance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Cover Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="coverType">Cover Type</Label>
                <Select value={coverType} onValueChange={(v) => { setCoverType(v); setGenre(""); setNarratedBy(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cover type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eBook Cover">eBook Cover (2:3)</SelectItem>
                    <SelectItem value="Album Cover">Album Cover (1:1)</SelectItem>
                    <SelectItem value="Audiobook Cover">Audiobook Cover (1:1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Genre Selection */}
              <div className="space-y-2">
                <Label htmlFor="genre">Select Genre</Label>
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a genre" />
                  </SelectTrigger>
                  <SelectContent>
                    {genres.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Style Selection */}
              <div className="space-y-2">
                <Label htmlFor="style">Select Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a style" />
                  </SelectTrigger>
                  <SelectContent>
                    {styles.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title Field */}
              <div className="space-y-2">
                <Label htmlFor="title">{coverType === "Album Cover" ? "Album Title" : coverType === "Audiobook Cover" ? "Audiobook Title" : "Book Title"}</Label>
                <Input
                  id="title"
                  placeholder={coverType === "Album Cover" ? "Enter album title" : coverType === "Audiobook Cover" ? "Enter your audiobook title" : "Enter your book title"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Author Field */}
              <div className="space-y-2">
                <Label htmlFor="author">{coverType === "Album Cover" ? "Band/Artist Name" : "Author Name"}</Label>
                <Input
                  id="author"
                  placeholder={coverType === "Album Cover" ? "Enter band or artist name" : "Enter author name"}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
                {coverType === "Audiobook Cover" && (
                  <div className="space-y-2">
                    <Label htmlFor="narratedBy">Narrated by</Label>
                    <Input
                      id="narratedBy"
                      placeholder="Enter narrator name (optional)"
                      value={narratedBy}
                      onChange={(e) => setNarratedBy(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Describe the Cover Art</Label>
                <Textarea
                  id="description"
                  placeholder={coverType === "Album Cover" ? "Describe the visual elements you want on your album cover (e.g., band performance, abstract art, iconic symbol...)" : coverType === "Audiobook Cover" ? "Describe the visual elements you want on your audiobook cover (e.g., narrator theme, story mood, symbolic imagery...)" : "Describe the visual elements you want on your cover (e.g., dark forest, mystical creatures, ancient castle...)"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Important Notice */}
              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                <CreditCard className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> Only upscaled covers will be saved and be downloadable in My Covers.
                </AlertDescription>
              </Alert>

              {/* Generate Button */}
              <Button 
                onClick={handleGenerate}
                className="w-full"
                size="lg"
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating... (May take up to 30 seconds...)
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Cover (-2 credits)
                  </>
                )}
              </Button>

              {/* Results Section */}
              {imageData.length > 0 && (
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-4">Generated Covers</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {imageData.map((image, index) => (
                        <div key={index} className="relative group">
                          <img 
                            src={image.url} 
                            alt={`Generated cover ${index + 1}`}
                            className={`${aspectClass} w-full ${coverType === "eBook Cover" ? "object-cover" : "object-contain"} rounded-lg shadow-sm bg-muted`}
                          />
                          {image.isUpscaled && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                            Upscaled
                          </div>
                        )}
                          {/* Mobile buttons - always visible */}
                        <div className="absolute bottom-2 left-2 right-2 sm:hidden">
                          <div className="flex gap-1">
                            {!image.isUpscaled ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleUpscale(index)}
                                disabled={image.isUpscaling}
                                className="w-full bg-white/95 text-gray-900 hover:bg-white border-0 shadow-lg font-semibold text-xs"
                              >
                                {image.isUpscaling ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-900 border-t-transparent mr-1"></div>
                                    Upscaling...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-3 w-3 mr-1" />
                                    Upscale (-2 credits)
                                  </>
                                )}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="hero"
                                onClick={() => handleDownload(image.url, index)}
                                className="w-full font-semibold text-xs"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download HD
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => { captureEditViewportHintFromEvent(e); handleEdit(image.url, index); }}
                              disabled={editingIndex === index}
                              className="w-full bg-white/95 text-gray-900 hover:bg-white border-0 shadow-lg font-semibold text-xs"
                            >
                              {editingIndex === index ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Editing... (May take up to 30 seconds...)
                                </>
                              ) : (
                                <>
                                  <Wand2 className="h-3 w-3 mr-1" />
                                  Edit
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        {/* Desktop buttons - hover overlay */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg hidden sm:block">
                          <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
                            {!image.isUpscaled ? (
                              <Button
                                size="lg"
                                variant="secondary"
                                onClick={() => handleUpscale(index)}
                                disabled={image.isUpscaling}
                                className="w-full min-w-[120px] bg-white/90 text-gray-900 hover:bg-white border-0 shadow-lg font-semibold"
                              >
                                {image.isUpscaling ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-900 border-t-transparent mr-2"></div>
                                    Upscaling...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-4 w-4 mr-2" />
                                    Upscale (-2 credits)
                                  </>
                                )}
                              </Button>
                            ) : (
                              <Button
                                size="lg"
                                variant="hero"
                                onClick={() => handleDownload(image.url, index)}
                                className="w-full min-w-[120px] font-semibold"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download HD
                              </Button>
                            )}
                            <Button
                              size="lg"
                              variant="secondary"
                              onClick={(e) => { captureEditViewportHintFromEvent(e); handleEdit(image.url, index); }}
                              disabled={editingIndex === index}
                              className="w-full min-w-[120px] bg-white/90 text-gray-900 hover:bg-white border-0 shadow-lg font-semibold"
                            >
                              {editingIndex === index ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Editing... (May take up to 30 seconds...)
                                </>
                              ) : (
                                <>
                                  <Wand2 className="h-4 w-4 mr-2" />
                                  Edit
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Placeholder when no images */}
              {!generating && imageData.length === 0 && (
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-4">Generated Covers</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div 
                        key={i} 
                        className={`${aspectClass} bg-muted rounded-lg flex items-center justify-center text-muted-foreground`}
                      >
                        Cover {i}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Studio;