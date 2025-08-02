import React from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const BuyCredits = () => {
  const { user, credits, signOut } = useAuth();
  const navigate = useNavigate();

  const creditPackages = [
    {
      name: "Starter Pack",
      credits: 8,
      price: "$10",
      description: "Perfect for trying out Covers by AI",
      subtitle: "(Up to 2 complete cover projects)",
      features: ["8 AI-generated covers", "High-resolution downloads", "Commercial use rights"]
    },
    {
      name: "Author Pack",
      credits: 24,
      price: "$25",
      description: "Great for indie authors",
      subtitle: "(Up to 6 complete cover projects)",
      features: ["24 AI-generated covers", "High-resolution downloads", "Commercial use rights", "Priority support"],
      popular: true
    },
    {
      name: "Pro Pack", 
      credits: 60,
      price: "$50",
      description: "Best value for publishers",
      subtitle: "(Up to 15 complete cover projects)",
      features: ["60 AI-generated covers", "High-resolution downloads", "Commercial use rights", "Priority support"]
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
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Buy Credits</h1>
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
              Back to Studio
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate("/my-covers")}
            >
              My Covers
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => navigate("/verify-payment")}
            >
              Verify Payment
            </Button>
            <Button variant="ghost" onClick={handleSignOut}>
              Sign Out
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

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
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
                  <div className="text-sm text-muted-foreground">{pkg.credits} credits</div>
                  <div className="text-xs text-muted-foreground mt-1">{pkg.subtitle}</div>
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
          <p className="text-sm text-muted-foreground">
            *A "complete project" includes generating multiple concepts and one final high-resolution upscale.
          </p>
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