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

    // Credit check temporarily disabled for testing
    // Get user profile and check credits - using maybeSingle to avoid errors
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Profile error:', profileError);
      // Don't throw error for testing mode
      console.log('Profile check disabled for testing');
    }

    if (!profile) {
      console.error('No profile found for user:', userId);
      // Don't throw error for testing mode
      console.log('Profile check disabled for testing');
    }

    console.log(`Credit check disabled - testing mode enabled`);

    // Get Ideogram API key
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY');
    if (!ideogramApiKey) {
      throw new Error('Ideogram API key not configured. Please add IDEOGRAM_API_KEY to your Supabase secrets.');
    }

    // Generate AI images using Ideogram FIRST, then deduct credit
    console.log('Generating 4 covers with Ideogram...');
    
    // Create detailed prompt for book cover
    const basePrompt = `Professional book cover design for "${title}" by ${author}. ${genre} genre, ${style} style. ${description}. High quality, publishable book cover with title and author text, professional typography, book cover layout, 2:3 aspect ratio`;
    
    console.log(`Generating 4 covers with base prompt: ${basePrompt}`);

    try {
      // Generate 4 different covers with variations
      const coverPromises = [];
      const variations = [
        basePrompt + ", vibrant colors, dramatic lighting",
        basePrompt + ", dark and moody atmosphere, shadows",
        basePrompt + ", elegant and sophisticated design",
        basePrompt + ", bold and eye-catching composition"
      ];

      for (let i = 0; i < 4; i++) {
        const promise = fetch('https://api.ideogram.ai/generate', {
          method: 'POST',
          headers: {
            'Api-Key': ideogramApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_request: {
              prompt: variations[i],
              aspect_ratio: "ASPECT_2_3",
              model: "V_2",
              magic_prompt_option: "AUTO",
              seed: Math.floor(Math.random() * 1000000),
              style_type: "AUTO"
            }
          })
        });
        coverPromises.push(promise);
      }

      console.log('Making 4 parallel requests to Ideogram...');
      const responses = await Promise.all(coverPromises);
      
      const generatedImages = [];
      const generationIds = [];
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Ideogram API error for cover ${i + 1}:`, response.status, errorText);
          continue; // Skip this one but continue with others
        }

        const result = await response.json();
        console.log(`Ideogram generation result for cover ${i + 1}:`, result);
        console.log(`Full response structure:`, JSON.stringify(result, null, 2));
        
        if (result.data && result.data.length > 0) {
          generatedImages.push(result.data[0].url);
          // The generation ID should be at the top level of the response
          const genId = result.id || result.generation_id || result.data[0].id;
          console.log(`Extracted generation ID for cover ${i + 1}:`, genId);
          generationIds.push(genId || `gen_${Date.now()}_${i}`);
        }
      }

      if (generatedImages.length === 0) {
        throw new Error('No images generated by Ideogram');
      }

      console.log(`Generated ${generatedImages.length} images:`, generatedImages);

      // Credit deduction temporarily disabled for testing
      console.log(`Credit deduction disabled - testing mode`);

      return new Response(JSON.stringify({
        success: true,
        message: `Generated ${generatedImages.length} covers for "${title}" (Testing Mode)`,
        images: generatedImages,
        generationIds: generationIds,
        creditsRemaining: 999
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

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