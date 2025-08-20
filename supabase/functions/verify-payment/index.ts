import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendPurchaseConfirmationEmail(email: string, credits: number) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  if (!from) {
    throw new Error("Missing RESEND_FROM_EMAIL");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Purchase Confirmation",
      html: `<p>Thank you for your purchase! ${credits} credits have been added to your account.</p>`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send confirmation email: ${errorText}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client for user authentication
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Parse request body
    const { paymentIntentId } = await req.json();
    
    console.log(`Verifying payment intent: ${paymentIntentId} for user: ${user.id}`);

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Retrieve the payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log(`Payment intent status: ${paymentIntent.status}, amount: ${paymentIntent.amount}`);

    // Check if payment was successful
    if (paymentIntent.status === "succeeded") {
      // Determine credits based on amount
      let creditsToAdd = 0;
      const amountInDollars = paymentIntent.amount / 100;
      
      if (amountInDollars === 10) {
        creditsToAdd = 25; // Starter Pack
      } else if (amountInDollars === 25) {
        creditsToAdd = 75; // Author Pack
      } else if (amountInDollars === 50) {
        creditsToAdd = 200; // Pro Pack
      } else {
        throw new Error(`Unknown payment amount: $${amountInDollars}`);
      }
      
      console.log(`Adding ${creditsToAdd} credits for $${amountInDollars} payment`);

      // Create Supabase service client to bypass RLS
      const supabaseService = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );

      // Get current credits and add new ones
      const { data: profile } = await supabaseService
        .from("profiles")
        .select("credits")
        .eq("user_id", user.id)
        .single();

      const currentCredits = profile?.credits || 0;
      const newCredits = currentCredits + creditsToAdd;
      
      console.log(`Current credits: ${currentCredits}, adding: ${creditsToAdd}, new total: ${newCredits}`);

      // Update user credits
      const { error } = await supabaseService
        .from("profiles")
        .update({ 
          credits: newCredits,
          stripe_customer_id: paymentIntent.customer as string
        })
        .eq("user_id", user.id);

      if (error) {
        console.error("Error updating credits:", error);
        throw new Error("Failed to update credits");
      }

      console.log(`Successfully added ${creditsToAdd} credits to user ${user.id}`);

      if (user.email) {
        await sendPurchaseConfirmationEmail(user.email, creditsToAdd);
      }

      return new Response(JSON.stringify({
        success: true,
        credits: creditsToAdd,
        newTotal: newCredits,
        message: `Successfully added ${creditsToAdd} credits to your account! New total: ${newCredits}`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Payment was not successful. Status: ${paymentIntent.status}`);

  } catch (error) {
    console.error("Payment verification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});