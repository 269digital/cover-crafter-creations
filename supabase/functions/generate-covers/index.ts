import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== GENERATE COVERS FUNCTION START ===");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Step 1: Getting environment variables");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY');
    
    console.log("Step 2: Checking API key");
    if (!ideogramApiKey) {
      throw new Error('IDEOGRAM_API_KEY not configured');
    }

    console.log("Step 3: Creating Supabase client");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Step 4: Getting authorization header");
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    console.log("Step 5: Parsing request body");
    // Parse request body
    const { title, author, genre, style, description, tagline } = await req.json();
    console.log("Generating covers for:", { title, author, genre, style });

    console.log("Step 6: Getting user from JWT");
    // Get user from JWT token
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    
    if (userError || !user) {
      console.error("User error:", userError);
      throw new Error('Invalid authentication');
    }
    console.log("User authenticated:", user.id);

    console.log("Step 7: Checking user credits");
    // Check user credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();

    console.log("Profile query result:", { profile, profileError });

    if (profileError || !profile) {
      console.error("Profile error details:", profileError);
      throw new Error(`Could not fetch user profile: ${profileError?.message || 'No profile found'}`);
    }

    if (profile.credits < 2) {
      return new Response(JSON.stringify({
        error: 'Insufficient credits',
        message: 'You need at least 2 credits to generate book covers',
        remainingCredits: profile.credits
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Build dynamic prompt for book cover
    const buildPrompt = (bookData: any) => {
      const { title, author, genre, style, description, tagline } = bookData;
      
      let prompt = `Professional book cover design for "${title}" by ${author}. `;
      prompt += `Genre: ${genre}. Style: ${style}. `;
      
      if (description) {
        prompt += `Book description: ${description}. `;
      }
      
      if (tagline) {
        prompt += `Tagline: "${tagline}". `;
      }
      
      prompt += `Create an eye-catching, professional book cover with the title and author name prominently displayed. `;
      prompt += `High-quality, commercial book cover design, clean typography, professional layout, `;
      prompt += `suitable for ${genre} genre with ${style} aesthetic.`;
      
      return prompt;
    };

    const prompt = buildPrompt({ title, author, genre, style, description, tagline });
    console.log("Generated prompt:", prompt);

    // Call Ideogram API
    const requestBody = {
      image_request: {
        prompt: prompt,
        num_images: 4,
        aspect_ratio: 'PORTRAIT_2_3'
      }
    };

    const ideogramResponse = await fetch('https://api.ideogram.ai/generate', {
      method: 'POST',
      headers: {
        'Api-Key': ideogramApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!ideogramResponse.ok) {
      const errorText = await ideogramResponse.text();
      console.error('Ideogram API error:', errorText);
      throw new Error(`Ideogram API error: ${ideogramResponse.status} ${errorText}`);
    }

    const ideogramData = await ideogramResponse.json();
    console.log('Ideogram API response:', JSON.stringify(ideogramData, null, 2));

    // Check if we got the expected number of images
    if (!ideogramData.data || ideogramData.data.length !== 4) {
      throw new Error(`Expected 4 images, got ${ideogramData.data?.length || 0}`);
    }

    // Extract image URLs
    const images = ideogramData.data.map((item: any) => ({
      url: item.url
    }));

    // Deduct credits only after successful generation
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - 2 })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating credits:', updateError);
      // Continue anyway - don't fail the whole request for credit update issues
    }

    const remainingCredits = profile.credits - 2;
    console.log(`Successfully generated ${images.length} covers. Credits remaining: ${remainingCredits}`);

    return new Response(JSON.stringify({
      success: true,
      images,
      remainingCredits,
      message: `Successfully generated ${images.length} book covers`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Generate covers error:", error.message);
    console.error("Error stack:", error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack,
      type: "generate_covers_error"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});