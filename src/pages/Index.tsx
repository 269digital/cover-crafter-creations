import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Palette, Sparkles, BookOpen, CreditCard } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  
  // Don't use useAuth on the landing page since users aren't logged in yet
  const handleGetStarted = () => {
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Palette className="h-8 w-8 text-white" />
            <h1 className="text-2xl font-bold text-white">Covers by AI</h1>
          </div>
          <Button 
            variant="secondary" 
            onClick={() => navigate("/auth")}
            className="shadow-glow"
          >
            Get Started
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Create Stunning
            <span className="block bg-gradient-secondary bg-clip-text text-transparent">
              Book Covers with AI
            </span>
          </h2>
          <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
            Transform your book ideas into professional, eye-catching covers in seconds. 
            Our AI-powered platform generates four unique cover variations for every request.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate("/auth")}
            className="shadow-creative text-lg px-8 py-3"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Start Creating
          </Button>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white shadow-card">
            <CardHeader>
              <BookOpen className="h-12 w-12 text-accent mb-4" />
              <CardTitle>Multiple Genres</CardTitle>
              <CardDescription className="text-white/80">
                From thriller to romance, sci-fi to literary fiction - our AI understands every genre
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white shadow-card">
            <CardHeader>
              <Sparkles className="h-12 w-12 text-accent mb-4" />
              <CardTitle>AI-Powered Design</CardTitle>
              <CardDescription className="text-white/80">
                Advanced AI creates professional covers with perfect typography and composition
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white shadow-card">
            <CardHeader>
              <CreditCard className="h-12 w-12 text-accent mb-4" />
              <CardTitle>Pay Per Use</CardTitle>
              <CardDescription className="text-white/80">
                No subscriptions. Buy credits and use them whenever you need new covers
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Pricing Preview */}
        <div className="text-center">
          <h3 className="text-3xl font-bold text-white mb-8">Simple, Transparent Pricing</h3>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { name: "Starter Pack", credits: "8 Credits", subtitle: "(Up to 2 complete cover projects)", price: "$10" },
            { name: "Author Pack", credits: "24 Credits", subtitle: "(Up to 6 complete cover projects)", price: "$25", popular: true },
            { name: "Pro Pack", credits: "60 Credits", subtitle: "(Up to 15 complete cover projects)", price: "$50" }
          ].map((pkg) => (
              <Card key={pkg.name} className={`bg-white/10 backdrop-blur-sm border-white/20 text-white ${pkg.popular ? 'ring-2 ring-accent' : ''}`}>
                {pkg.popular && (
                  <div className="relative">
                    <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-accent text-white">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="pt-6 text-center">
                  <h4 className="font-semibold text-lg mb-2">{pkg.name}</h4>
                  <div className="text-2xl font-bold mb-1">{pkg.price}</div>
                  <div className="text-white/80 text-sm">{pkg.credits}</div>
                  <div className="text-white/60 text-xs mt-1">{pkg.subtitle}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-8">
            <p className="text-white/60 text-sm">
              *A "complete project" includes generating multiple concepts and one final high-resolution upscale.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-white/80">
        <p>&copy; 2025 Covers by AI. Create amazing book covers with AI.</p>
      </footer>
    </div>
  );
};

export default Index;
