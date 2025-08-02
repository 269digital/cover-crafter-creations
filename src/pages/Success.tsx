import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Success = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshCredits } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    
    if (!sessionId || !user) {
      navigate("/");
      return;
    }

    const handlePaymentSuccess = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('handle-payment-success', {
          body: { sessionId }
        });

        if (error) {
          console.error('Payment verification error:', error);
          toast({
            title: "Error",
            description: "Failed to verify payment. Please contact support.",
            variant: "destructive"
          });
        } else {
          console.log('Payment verified:', data);
          setProcessed(true);
          await refreshCredits();
          toast({
            title: "Payment Successful!",
            description: data.message || "Credits have been added to your account.",
          });
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        toast({
          title: "Error",
          description: "Failed to verify payment. Please contact support.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    handlePaymentSuccess();
  }, [searchParams, user, navigate, refreshCredits, toast]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-creative">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {loading ? (
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
            ) : (
              <CheckCircle className="h-16 w-16 text-success" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {loading ? "Processing Payment..." : "Payment Successful!"}
          </CardTitle>
          <CardDescription>
            {loading 
              ? "We're verifying your payment and updating your credits."
              : "Your credits have been added to your account."
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="text-center">
            <CreditCard className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground">
              Thank you for your purchase!
            </p>
          </div>
          
          <div className="flex flex-col space-y-2">
            <Button 
              onClick={() => navigate("/studio")}
              disabled={loading}
              className="w-full"
            >
              Start Creating Covers
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate("/my-covers")}
              disabled={loading}
              className="w-full"
            >
              View My Covers
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Success;