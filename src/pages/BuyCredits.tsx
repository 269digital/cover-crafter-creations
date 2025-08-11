import React from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check, Sparkles, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";

const BuyCredits = () => {
  const { user, credits, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const creditPackages = [
    {
      name: "Starter Pack",
      credits: 6,
      price: "$10",
      description: "Perfect for trying out Cover Artisan",
      subtitle: "(Up to 2 complete cover projects)",
      detailsLines: [
        "$10  | 6 credits | 1 cover",
        "Great for trying Cover Artisan",
        "Cost per cover: $6.67"
      ],
      features: ["High-resolution downloads", "Commercial use rights"]
    },
    {
      name: "Author Pack",
      credits: 24,
      price: "$25",
      description: "Great for indie authors",
      subtitle: "(Up to 6 complete cover projects)",
      detailsLines: [
        "$25  | 24 credits | 6 covers",
        "Save 17% per cover vs Starter",
        "Perfect for authors with multiple projects or cover variations.",
        "Cost per cover: $4.17"
      ],
      features: ["High-resolution downloads", "Commercial use rights", "Priority support"],
      popular: true
    },
    {
      name: "Pro Pack", 
      credits: 60,
      price: "$50",
      description: "Best value for publishers",
      subtitle: "(Up to 15 complete cover projects)",
      detailsLines: [
        "$50  | 60 credits | 15 covers",
        "Save 33% per cover vs Starter.",
        "For prolific authors or agencies.",
        "Cost per cover: $3.33"
      ],
      features: ["High-resolution downloads", "Commercial use rights", "Priority support"]
    }
  ];

  const handlePurchase = async (packageName: string, credits: number, price: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { packageName, credits, price }
      });

      if (error) {
        console.error('Payment error:', error);
        alert('Failed to create payment session. Please try again.');
        return;
      }

      if (data?.url) {
        // Open Stripe checkout in a new tab
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to create payment session. Please try again.');
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
              <CreditCard className="h-6 w-6 text-white" />
              <h1 className="text-xl font-bold text-white">Buy Credits</h1>
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
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-3 py-1 text-sm font-medium bg-white/10 text-white border-white/20">
                <CreditCard className="h-4 w-4 mr-1" />
                {credits} Credits
              </Badge>
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
              Studio
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/studio")}
              className="sm:hidden bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              Studio
            </Button>
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
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Unlock the power of AI-generated book covers. Each credit generates 4 unique cover variations for you to choose from.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {creditPackages.map((pkg, index) => (
            <Card 
              key={pkg.name} 
              className={`relative shadow-card ${pkg.popular ? 'ring-2 ring-primary shadow-glow' : ''}`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-primary text-primary-foreground px-3 py-1">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{pkg.name}</CardTitle>
                <CardDescription>{pkg.description}</CardDescription>
                <div className="py-4">
                  <div className="text-3xl font-bold">{pkg.price}</div>
                  {Array.isArray((pkg as any).detailsLines) ? (
                    <div className="mt-2 space-y-1">
                      {(pkg as any).detailsLines.map((line: string, i: number) => (
                        <div key={i} className={`text-sm text-muted-foreground ${i === 0 ? 'font-medium' : ''}`}>
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-muted-foreground">{pkg.credits} credits</div>
                      <div className="text-xs text-muted-foreground mt-1">{pkg.subtitle}</div>
                    </>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {pkg.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-sm">
                      <Check className="h-4 w-4 text-accent mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <Button 
                  className="w-full" 
                  variant={pkg.popular ? "default" : "outline"}
                  onClick={() => handlePurchase(pkg.name, pkg.credits, pkg.price)}
                >
                  Buy Now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 text-center mb-8">
        </div>

        <div className="mt-12 text-center">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">Need More Credits?</h3>
              <p className="text-sm text-muted-foreground">
                Contact our team for custom enterprise packages and volume discounts.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BuyCredits;