import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { CreditCard, Download, Image, Eye, X, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Creation {
  id: string;
  prompt: string;
  image_url1: string | null;
  image_url2: string | null;
  image_url3: string | null;
  image_url4: string | null;
  created_at: string;
}

const MyCovers = () => {
  const { user, credits, signOut, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [upscalingImages, setUpscalingImages] = useState<Set<string>>(new Set());
  const [upscaledImages, setUpscaledImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      fetchCreations();
    }
  }, [user]);

  const fetchCreations = async () => {
    try {
      const { data, error } = await supabase
        .from("creations")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching creations:", error);
        return;
      }

      setCreations(data || []);
    } catch (error) {
      console.error("Error fetching creations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleDownload = (imageUrl: string) => {
    // Create a temporary link element and trigger download
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'book-cover.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpscale = async (imageUrl: string, creationId: string, imageIndex: number) => {
    // Skip credit check for free testing mode
    const imageKey = `${creationId}-${imageIndex}`;
    
    if (upscalingImages.has(imageKey)) return; // Already upscaling
    
    setUpscalingImages(prev => new Set(prev).add(imageKey));

    try {
      const { data, error } = await supabase.functions.invoke('upscale-cover', {
        body: { 
          imageUrl: imageUrl,
          prompt: `High quality upscaled book cover, sharp details, professional appearance`
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        // Update the creation in the database with the upscaled image
        const updateData: any = {};
        updateData[`image_url${imageIndex + 1}`] = data.upscaledImage;
        
        const { error: updateError } = await supabase
          .from('creations')
          .update(updateData)
          .eq('id', creationId);

        if (updateError) {
          console.error('Error updating creation:', updateError);
        } else {
          // Mark this image as upscaled
          setUpscaledImages(prev => new Set(prev).add(imageKey));
          // Refresh the creations to show the updated image
          await fetchCreations();
        }

        await refreshCredits();
        toast({
          title: "Upscale Successful!",
          description: `Cover has been upscaled to higher resolution.`,
        });
      }
    } catch (error: any) {
      console.error('Upscale error:', error);
      toast({
        title: "Upscale Failed",
        description: error.message || "Failed to upscale image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpscalingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageKey);
        return newSet;
      });
    }
  };

  const getAllImages = (creation: Creation): string[] => {
    return [
      creation.image_url1,
      creation.image_url2,
      creation.image_url3,
      creation.image_url4
    ].filter(Boolean) as string[];
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Image className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">My Covers</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="secondary" className="px-3 py-1">
              <CreditCard className="h-4 w-4 mr-1" />
              Credits: {credits}
            </Badge>
            <Button 
              variant="outline" 
              onClick={() => navigate("/studio")}
            >
              Create New
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate("/buy-credits")}
            >
              Buy Credits
            </Button>
            <Button variant="ghost" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Your Book Covers</h2>
          <p className="text-muted-foreground">
            Browse and download your AI-generated book covers
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-[2/3] bg-muted rounded-t-lg"></div>
                <CardContent className="p-4">
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-3 bg-muted rounded w-3/4"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : creations.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Image className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No covers created yet</h3>
              <p className="text-muted-foreground mb-4">
                Start creating amazing book covers with AI
              </p>
              <Button onClick={() => {
                console.log("Create Your First Cover button clicked, navigating to /studio");
                navigate("/studio");
              }}>
                Create Your First Cover
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {creations.map((creation) => {
              const images = getAllImages(creation);
              return images.map((imageUrl, index) => (
                <Card key={`${creation.id}-${index}`} className="group hover:shadow-lg transition-shadow">
                  <div className="aspect-[2/3] relative overflow-hidden rounded-t-lg">
                    <img
                      src={imageUrl}
                      alt={`Cover ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                       <Button
                         size="sm"
                         variant="secondary"
                         onClick={() => setSelectedImage(imageUrl)}
                       >
                         <Eye className="h-4 w-4" />
                       </Button>
                        {(() => {
                          const imageKey = `${creation.id}-${index}`;
                          const isUpscaling = upscalingImages.has(imageKey);
                          const isUpscaled = upscaledImages.has(imageKey);
                          
                          if (isUpscaled) {
                            // Show download button for upscaled images
                            return (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDownload(imageUrl)}
                                className="min-w-[80px]"
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Download HD
                              </Button>
                            );
                          } else {
                            // Show upscale button for non-upscaled images
                            return (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleUpscale(imageUrl, creation.id, index)}
                                disabled={isUpscaling}
                                className="min-w-[80px]"
                              >
                                {isUpscaling ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-current border-t-transparent mr-1"></div>
                                    Upscaling...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-4 w-4 mr-1" />
                                    Upscale (2 Credits)
                                  </>
                                )}
                              </Button>
                            );
                          }
                        })()}
                     </div>
                  </div>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {creation.prompt}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(creation.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ));
            })}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Book Cover Preview</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedImage(null)}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          {selectedImage && (
            <div className="space-y-4 overflow-auto max-h-[calc(90vh-120px)]">
              <div className="flex justify-center">
                <img
                  src={selectedImage}
                  alt="Cover Preview"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyCovers;