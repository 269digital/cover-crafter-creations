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

    // Get Runware API key
    const runwareApiKey = Deno.env.get('RUNWARE_API_KEY');
    if (!runwareApiKey) {
      throw new Error('Runware API key not configured. Please add RUNWARE_API_KEY to your Supabase secrets.');
    }

    // Generate AI images using Runware
    console.log('Generating covers with AI...');
    
    // Create detailed prompts for book covers
    const basePrompt = `Professional book cover design for "${title}" by ${author}, ${genre} genre, ${style} style. ${description}. High quality, publishable book cover, 400x600 aspect ratio`;
    
    const prompts = [
      `${basePrompt}, dramatic lighting, professional typography space`,
      `${basePrompt}, artistic composition, bold design elements`,
      `${basePrompt}, cinematic atmosphere, premium book cover design`,
      `${basePrompt}, elegant layout, sophisticated visual style`
    ];

    const generatedImages = [];

    for (let i = 0; i < 4; i++) {
      try {
        console.log(`Generating image ${i + 1} with prompt: ${prompts[i]}`);
        
        const response = await fetch('https://api.runware.ai/v1', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            {
              taskType: "authentication",
              apiKey: runwareApiKey
            },
            {
              taskType: "imageInference",
              taskUUID: crypto.randomUUID(),
              positivePrompt: prompts[i],
              width: 400,
              height: 600,
              model: "runware:100@1",
              numberResults: 1,
              outputFormat: "WEBP",
              CFGScale: 1,
              scheduler: "FlowMatchEulerDiscreteScheduler"
            }
          ])
        });

        if (!response.ok) {
          throw new Error(`Runware API error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`Image ${i + 1} generation result:`, result);
        
        if (result.data && result.data.length > 1 && result.data[1].imageURL) {
          generatedImages.push(result.data[1].imageURL);
        } else {
          console.error(`Failed to generate image ${i + 1}:`, result);
          generatedImages.push(`https://via.placeholder.com/400x600/FF6B6B/FFFFFF?text=Error+${i + 1}`);
        }
      } catch (error) {
        console.error(`Error generating image ${i + 1}:`, error);
        generatedImages.push(`https://via.placeholder.com/400x600/FF6B6B/FFFFFF?text=Error+${i + 1}`);
      }
    }

    console.log('Generated images:', generatedImages);

    return new Response(JSON.stringify({
      success: true,
      message: `Generated ${generatedImages.length} covers for "${title}"`,
      images: generatedImages,
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