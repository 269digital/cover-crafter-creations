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
import { Palette, Sparkles, CreditCard, Download, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Studio = () => {
  const { user, credits, signOut, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [genre, setGenre] = useState("");
  const [style, setStyle] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

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
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_cover_${index + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Downloaded!",
        description: `Cover ${index + 1} has been downloaded.`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download the cover. Please try again.",
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
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Palette className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Covers by AI Studio</h1>
          </div>
          <div className="flex items-center space-x-4">
            {/* Credit system temporarily disabled */}
            {/* <Badge variant="secondary" className="px-3 py-1">
              <CreditCard className="h-4 w-4 mr-1" />
              Credits: {credits}
            </Badge>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                console.log('Manual refresh clicked, current credits:', credits);
                refreshCredits();
              }}
            >
              🔄
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate("/buy-credits")}
            >
              Buy Credits
            </Button> */}
            <Button 
              variant="outline" 
              onClick={() => navigate("/my-covers")}
            >
              My Covers
            </Button>
            <Button variant="ghost" onClick={handleSignOut}>
              Sign Out
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

              {/* Generate Button */}
              <Button 
                onClick={handleGenerate}
                className="w-full"
                size="lg"
                disabled={generating}
              >
                {generating ? (
                  "Generating..."
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Cover (Free - Testing Mode)
                  </>
                )}
              </Button>

              {/* Results Section */}
              {generatedImages.length > 0 && (
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-4">Generated Covers</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {generatedImages.map((imageUrl, index) => (
                      <div key={index} className="relative group">
                        <img 
                          src={imageUrl} 
                          alt={`Generated cover ${index + 1}`}
                          className="aspect-[2/3] w-full object-cover rounded-lg shadow-sm"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDownload(imageUrl, index)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Placeholder when no images */}
              {!generating && generatedImages.length === 0 && (
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-4">Generated Covers</h3>
                  <div className="grid grid-cols-2 gap-4">
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