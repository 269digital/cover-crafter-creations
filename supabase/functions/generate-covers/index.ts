import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log(`=== EDGE FUNCTION START ===`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log(`Handling CORS preflight request`);
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnon) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header and extract user
    const authHeader = req.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    // Extract the JWT token from the authorization header
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted:', !!token);

    // Create client with user's token for RLS
    const userSupabase = createClient(supabaseUrl, supabaseAnon, {
      global: {
        headers: {
          authorization: authHeader,
        },
      },
    });

    // Get authenticated user using the token directly
    const { data: userData, error: authError } = await userSupabase.auth.getUser(token);
    if (authError || !userData.user) {
      console.error('Auth error:', authError);
      console.error('Auth header was:', authHeader);
      throw new Error('User not authenticated');
    }

    const userId = userData.user.id;
    console.log(`Authenticated user: ${userId}`);

    // Get request body
    const { title, author, genre, style, description } = await req.json();
    console.log(`Request from user ${userId} for: ${title} by ${author}`);

    // Get user profile and check credits - using maybeSingle to avoid errors
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Profile error:', profileError);
      throw new Error('Failed to fetch user profile');
    }

    if (!profile) {
      console.error('No profile found for user:', userId);
      throw new Error('User profile not found. Please ensure your account is properly set up.');
    }

    console.log(`User has ${profile.credits} credits`);

    if (profile.credits < 1) {
      throw new Error('Insufficient credits. Please purchase more credits to generate covers.');
    }

    // Deduct credit first
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - 1 })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating credits:', updateError);
      throw new Error('Failed to process credit deduction');
    }

    console.log(`Credit deducted. User now has ${profile.credits - 1} credits`);

    // For now, return mock generated covers
    // In a real implementation, you would call an AI image generation API here
    const mockImages = [
      'https://via.placeholder.com/400x600/FF6B6B/FFFFFF?text=Cover+1',
      'https://via.placeholder.com/400x600/4ECDC4/FFFFFF?text=Cover+2', 
      'https://via.placeholder.com/400x600/45B7D1/FFFFFF?text=Cover+3',
      'https://via.placeholder.com/400x600/96CEB4/FFFFFF?text=Cover+4'
    ];

    return new Response(JSON.stringify({
      success: true,
      message: `Generated ${mockImages.length} covers for "${title}"`,
      images: mockImages,
      creditsRemaining: profile.credits - 1
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Cover generation error:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});