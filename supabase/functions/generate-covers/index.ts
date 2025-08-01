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

    // Use service role client to validate the JWT token
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
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

    // Get Ideogram API key
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY');
    if (!ideogramApiKey) {
      throw new Error('Ideogram API key not configured. Please add IDEOGRAM_API_KEY to your Supabase secrets.');
    }

    // Generate AI images using Ideogram FIRST, then deduct credit
    console.log('Generating covers with Ideogram...');
    
    // Create detailed prompt for book cover
    const prompt = `Professional book cover design for "${title}" by ${author}. ${genre} genre, ${style} style. ${description}. High quality, publishable book cover with title and author text, professional typography, book cover layout, 2:3 aspect ratio`;
    
    console.log(`Generating covers with prompt: ${prompt}`);

    try {
      const response = await fetch('https://api.ideogram.ai/generate', {
        method: 'POST',
        headers: {
          'Api-Key': ideogramApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_request: {
            prompt: prompt,
            aspect_ratio: "ASPECT_2_3",
            model: "V_2",
            magic_prompt_option: "AUTO",
            seed: Math.floor(Math.random() * 1000000),
            style_type: "AUTO"
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ideogram API error:', response.status, errorText);
        throw new Error(`Ideogram API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('Ideogram generation result:', result);
      
      if (result.data && result.data.length > 0) {
        const generatedImages = result.data.map((item: any) => item.url);
        console.log('Generated images:', generatedImages);

        // Only deduct credit AFTER successful generation
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ credits: profile.credits - 1 })
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating credits:', updateError);
          // Still return images even if credit update fails
        }

        console.log(`Credit deducted. User now has ${profile.credits - 1} credits`);

        return new Response(JSON.stringify({
          success: true,
          message: `Generated ${generatedImages.length} covers for "${title}"`,
          images: generatedImages,
          creditsRemaining: profile.credits - 1
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        throw new Error('No images generated by Ideogram');
      }
    } catch (error) {
      console.error('Error generating with Ideogram:', error);
      throw new Error(`Failed to generate covers: ${error.message}`);
    }

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