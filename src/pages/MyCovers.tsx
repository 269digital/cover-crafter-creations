import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { CreditCard, Download, Image, Eye, X, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";

interface Creation {
  id: string;
  prompt: string;
  image_url1: string | null;
  image_url2: string | null;
  image_url3: string | null;
  image_url4: string | null;
  created_at: string;
  upscaled_image_url: string | null; // Permanently stored upscaled image
}

const MyCovers = () => {
  const { user, credits, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [creations, setCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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
        .not("upscaled_image_url", "is", null) // Only fetch creations with upscaled images
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

  // Since we only store upscaled images, just return the single upscaled image URL
  const getUpscaledImage = (creation: Creation): string | null => {
    return creation.upscaled_image_url;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-hero border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Image className="h-6 w-6 text-white" />
              <h1 className="text-xl font-bold text-white">My Covers</h1>
            </div>
            <div className="flex flex-col gap-2 items-end">
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newTheme = theme === "dark" ? "light" : "dark";
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
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-white hover:bg-white/10">
                Sign Out
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/studio")}
              className="hidden sm:inline-flex bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              Create New
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/studio")}
              className="sm:hidden bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              Create
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Your HD Book Covers</h2>
          <p className="text-muted-foreground">
            Your permanently saved upscaled book covers - download anytime in high quality
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
              <h3 className="font-semibold mb-2">No HD covers saved yet</h3>
              <p className="text-muted-foreground mb-4">
                Create covers in the Studio and upscale them to save them permanently to your collection
              </p>
              <Button onClick={() => {
                console.log("Create Your First Cover button clicked, navigating to /studio");
                navigate("/studio");
              }}>
                Go to Studio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {creations.map((creation) => {
              const upscaledImageUrl = getUpscaledImage(creation);
              if (!upscaledImageUrl) return null;
              
              return (
                <Card key={creation.id} className="group hover:shadow-lg transition-shadow">
                  <div className="aspect-[2/3] relative overflow-hidden rounded-t-lg">
                    <img
                      src={upscaledImageUrl}
                      alt="Upscaled book cover"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                       <Button
                         size="sm"
                         variant="secondary"
                         onClick={() => setSelectedImage(upscaledImageUrl)}
                       >
                         <Eye className="h-4 w-4" />
                       </Button>
                       <Button
                         size="sm"
                         variant="secondary"
                         onClick={() => handleDownload(upscaledImageUrl)}
                         className="min-w-[100px]"
                       >
                         <Download className="h-4 w-4 mr-1" />
                         Download HD
                       </Button>
                     </div>
                     <div className="absolute top-2 right-2">
                       <Badge variant="secondary" className="text-xs bg-green-600 text-white">
                         HD SAVED
                       </Badge>
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
              );
            })}
          </div>
        )}
      </div>

      {/* Image Preview Modal - Simple Implementation */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => {
            console.log('Backdrop clicked - closing modal');
            setSelectedImage(null);
          }}
        >
          {/* Close Button - Top Right */}
          <button
            onClick={(e) => {
              console.log('X button clicked');
              e.stopPropagation();
              setSelectedImage(null);
            }}
            className="absolute top-8 right-8 z-60 w-10 h-10 bg-white rounded-full flex items-center justify-center hover:bg-gray-100 shadow-lg"
          >
            <X className="h-6 w-6 text-black" />
          </button>
          
          {/* Image Container */}
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage}
              alt="Cover Preview"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={() => {
                console.log('Image clicked - closing modal');
                setSelectedImage(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCovers;