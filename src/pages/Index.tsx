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
      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Create Stunning
            <span className="block bg-gradient-secondary bg-clip-text text-transparent">
              Book Covers with AI
            </span>
          </h2>
          <p className="text-lg md:text-xl text-white/85 max-w-2xl mx-auto mb-10 leading-relaxed">
            Transform your book ideas into professional, eye-catching covers in seconds. 
            Our AI-powered platform generates four unique cover variations for every request.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate("/auth")}
            className="shadow-creative text-lg px-10 py-4 h-auto font-semibold"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Start Creating
          </Button>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-20 max-w-5xl mx-auto">
          <Card className="bg-white/5 backdrop-blur-md border-white/10 text-white shadow-card hover:bg-white/10 transition-all duration-300">
            <CardHeader className="text-center p-8">
              <BookOpen className="h-14 w-14 text-accent mb-6 mx-auto" />
              <CardTitle className="text-xl mb-3">Multiple Genres</CardTitle>
              <CardDescription className="text-white/75 leading-relaxed">
                From thriller to romance, sci-fi to literary fiction - our AI understands every genre
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/5 backdrop-blur-md border-white/10 text-white shadow-card hover:bg-white/10 transition-all duration-300">
            <CardHeader className="text-center p-8">
              <Sparkles className="h-14 w-14 text-accent mb-6 mx-auto" />
              <CardTitle className="text-xl mb-3">AI-Powered Design</CardTitle>
              <CardDescription className="text-white/75 leading-relaxed">
                Advanced AI creates professional covers with perfect typography and composition
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/5 backdrop-blur-md border-white/10 text-white shadow-card hover:bg-white/10 transition-all duration-300">
            <CardHeader className="text-center p-8">
              <CreditCard className="h-14 w-14 text-accent mb-6 mx-auto" />
              <CardTitle className="text-xl mb-3">Pay Per Use</CardTitle>
              <CardDescription className="text-white/75 leading-relaxed">
                No subscriptions. Buy credits and use them whenever you need new covers
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Pricing Preview */}
        <div className="text-center">
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-12">Simple, Transparent Pricing</h3>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { name: "Starter Pack", credits: "8 Credits", subtitle: "(Up to 2 complete cover projects)", price: "$10" },
              { name: "Author Pack", credits: "24 Credits", subtitle: "(Up to 6 complete cover projects)", price: "$25", popular: true },
              { name: "Pro Pack", credits: "60 Credits", subtitle: "(Up to 15 complete cover projects)", price: "$50" }
            ].map((pkg) => (
              <Card key={pkg.name} className={`bg-white/5 backdrop-blur-md border-white/10 text-white shadow-card hover:bg-white/10 transition-all duration-300 ${pkg.popular ? 'ring-2 ring-accent scale-105' : ''}`}>
                {pkg.popular && (
                  <div className="relative">
                    <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-accent text-white px-4 py-1 text-sm">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-8 text-center">
                  <h4 className="font-semibold text-xl mb-4">{pkg.name}</h4>
                  <div className="text-3xl md:text-4xl font-bold mb-2">{pkg.price}</div>
                  <div className="text-white/80 text-base mb-1">{pkg.credits}</div>
                  <div className="text-white/60 text-sm">{pkg.subtitle}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-10">
            <p className="text-white/60 text-sm max-w-2xl mx-auto">
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
