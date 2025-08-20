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
    const { sessionId } = await req.json();

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify the session belongs to this user
    if (session.metadata?.user_id !== user.id) {
      throw new Error("Session does not belong to user");
    }

    // Check if payment was successful
    if (session.payment_status === "paid") {
      const creditsToAdd = parseInt(session.metadata?.credits || "0");
      
      if (creditsToAdd > 0) {
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

        // Update user credits
        const { error } = await supabaseService
          .from("profiles")
          .update({ 
            credits: newCredits,
            stripe_customer_id: session.customer as string
          })
          .eq("user_id", user.id);

        if (error) {
          console.error("Error updating credits:", error);
          throw new Error("Failed to update credits");
        }

        console.log(`Added ${creditsToAdd} credits to user ${user.id}`);

        if (user.email) {
          await sendPurchaseConfirmationEmail(user.email, creditsToAdd);
        }

        return new Response(JSON.stringify({
          success: true,
          credits: creditsToAdd,
          message: `Successfully added ${creditsToAdd} credits to your account!`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    throw new Error("Payment was not successful");

  } catch (error) {
    console.error("Payment verification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});