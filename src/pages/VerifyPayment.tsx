import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";

const VerifyPayment = () => {
  const { user, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerifyPayment = async () => {
    if (!paymentIntentId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a payment intent ID",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { paymentIntentId: paymentIntentId.trim() }
      });

      if (error) {
        console.error('Payment verification error:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to verify payment. Please check the payment ID.",
          variant: "destructive"
        });
      } else {
        console.log('Payment verified:', data);
        await refreshCredits();
        toast({
          title: "Success!",
          description: data.message || "Credits have been added to your account.",
        });
        // Clear the input
        setPaymentIntentId("");
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      toast({
        title: "Error",
        description: "Failed to verify payment. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Verify Payment</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate("/buy-credits")}
            >
              Back to Buy Credits
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card className="shadow-creative">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Verify Your Payment</CardTitle>
              <CardDescription>
                Enter your Stripe payment intent ID to manually add credits to your account
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paymentId">Payment Intent ID</Label>
                <Input
                  id="paymentId"
                  placeholder="pi_1234567890abcdef..."
                  value={paymentIntentId}
                  onChange={(e) => setPaymentIntentId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Payment intent IDs start with "pi_" and can be found in your Stripe dashboard or email receipt
                </p>
              </div>
              
              <Button 
                onClick={handleVerifyPayment}
                disabled={loading || !paymentIntentId.trim()}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify Payment
              </Button>
              
              <div className="text-center text-sm text-muted-foreground">
                <p>Need help finding your payment ID?</p>
                <p>Check your email receipt or Stripe dashboard</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VerifyPayment;