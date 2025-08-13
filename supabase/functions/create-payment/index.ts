import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    
    if (!user?.email) {
      throw new Error("User not authenticated");
    }

    // Parse request body (frontend may send price/credits but we will enforce server-side mapping)
    const body = await req.json();
    const packageName: string = body.packageName;
    const clientPrice: string | undefined = body.price;
    const clientCredits: number | undefined = body.credits;

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
        },
      });
      customerId = customer.id;
    }

    // Map package to Stripe Price ID and server-authoritative credits
    const PRICE_AUTHOR = Deno.env.get("STRIPE_PRICE_AUTHOR");
    const PRICE_PRO = Deno.env.get("STRIPE_PRICE_PRO");

    let chosenPriceId: string | null = null;
    let serverCredits: number | null = null;

    if (packageName === "Author Pack") {
      chosenPriceId = PRICE_AUTHOR || null;
      serverCredits = 24; // Keep in sync with UI
    } else if (packageName === "Pro Pack") {
      chosenPriceId = PRICE_PRO || null;
      serverCredits = 60; // Keep in sync with UI
    } else if (packageName === "Starter Pack") {
      // No Price ID configured; fall back to ad-hoc price and credits from UI
      serverCredits = typeof clientCredits === 'number' ? clientCredits : 6;
    }

    if ((packageName === "Author Pack" || packageName === "Pro Pack") && !chosenPriceId) {
      throw new Error(`Missing Stripe Price ID secret for ${packageName}`);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: chosenPriceId ? [
        { price: chosenPriceId, quantity: 1 }
      ] : [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Covers by AI - ${packageName}`,
              description: `${serverCredits ?? clientCredits ?? ''} AI-generated book cover credits`,
            },
            unit_amount: clientPrice ? Math.round(parseFloat(clientPrice.replace('$', '')) * 100) : undefined,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/buy-credits?payment=canceled`,
      metadata: {
        user_id: user.id,
        credits: String(serverCredits ?? clientCredits ?? ''),
        package_name: packageName,
      },
    });

    console.log(`Created checkout session ${session.id} for user ${user.id} [${packageName}]`);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});