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
import { Palette, Sparkles, CreditCard, Download, Heart, Zap, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";

const Studio = () => {
  const { user, credits, signOut, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [genre, setGenre] = useState("");
  const [style, setStyle] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageData, setImageData] = useState<Array<{
    url: string;
    generationId?: string;
    isUpscaled: boolean;
    isUpscaling: boolean;
  }>>([]);

  const genres = [
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
    // Credit check temporarily disabled
    // if (credits === 0) {
    //   navigate("/buy-credits");
    //   return;
    // }

    if (!genre || !style || !bookTitle || !authorName || !description) {
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
          title: bookTitle,
          author: authorName,
          genre,
          style,
          description
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        setGeneratedImages(data.images || []);
        // Initialize image data with generation IDs if available
        const newImageData = (data.images || []).map((url: string, index: number) => ({
          url,
          generationId: data.generationIds?.[index],
          isUpscaled: false,
          isUpscaling: false,
        }));
        setImageData(newImageData);
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
      link.download = `${bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_cover_${index + 1}.jpg`;
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
    // Skip credit check for free testing mode

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
          prompt: `High quality ${genre} book cover for "${bookTitle}", ${style} style, sharp details, professional appearance`
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-hero border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Palette className="h-6 w-6 text-white" />
              <h1 className="text-xl font-bold text-white">Covers by AI</h1>
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
                Create Your Book Cover
              </CardTitle>
              <CardDescription>
                Design a stunning cover for your book with AI assistance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

              {/* Book Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Book Title</Label>
                <Input
                  id="title"
                  placeholder="Enter your book title"
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                />
              </div>

              {/* Author Name */}
              <div className="space-y-2">
                <Label htmlFor="author">Author Name</Label>
                <Input
                  id="author"
                  placeholder="Enter author name"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Describe the Cover Art</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the visual elements you want on your cover (e.g., dark forest, mystical creatures, ancient castle...)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Credit Warning - temporarily disabled */}
              {/* {credits === 0 && (
                <Alert>
                  <CreditCard className="h-4 w-4" />
                  <AlertDescription>
                    You are out of credits! 
                    <Button 
                      variant="link" 
                      className="p-0 ml-1 h-auto"
                      onClick={() => navigate("/buy-credits")}
                    >
                      Buy credits to generate covers.
                    </Button>
                  </AlertDescription>
                </Alert>
              )} */}

              {/* Important Notice */}
              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                <CreditCard className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> Only upscaled book covers will be saved and downloadable in My Covers.
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
                  "Generating... (May take up to 30 seconds)"
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Cover (Free - Testing Mode)
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
                          className="aspect-[2/3] w-full object-cover rounded-lg shadow-sm"
                        />
                        {image.isUpscaled && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                            Upscaled
                          </div>
                        )}
                        {/* Mobile buttons - always visible */}
                        <div className="absolute bottom-2 left-2 right-2 sm:hidden">
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
                                   Upscale (2 Credits)
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
                                    Upscale (2 Credits)
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
                        className="aspect-[2/3] bg-muted rounded-lg flex items-center justify-center text-muted-foreground"
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