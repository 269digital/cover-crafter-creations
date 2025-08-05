import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== GENERATE COVERS FUNCTION START ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
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
    const testMode = Deno.env.get('TEST_MODE') === 'true';
    
    console.log("Step 2: Checking API key");
    if (!ideogramApiKey && !testMode) {
      throw new Error('IDEOGRAM_API_KEY not configured');
    }
    
    if (testMode) {
      console.log("Running in TEST MODE - returning mock data");
      const mockImages = [
        { url: "https://images.unsplash.com/photo-1649972904349-6e44c42644a7" },
        { url: "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b" },
        { url: "https://images.unsplash.com/photo-1518770660439-4636190af475" },
        { url: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6" }
      ];
      
      return new Response(JSON.stringify({
        success: true,
        images: mockImages,
        remainingCredits: 999,
        message: "Test mode - Mock covers generated successfully"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log("Step 3: Creating Supabase client for database operations");
    // Use service key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Step 4: Getting JWT token from request");
    // Supabase automatically validates JWT when verify_jwt = true
    // Extract user info from the JWT token in Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error("No valid authorization header found");
      return new Response(JSON.stringify({
        error: 'Authentication required',
        message: 'Please sign in to generate covers'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Parse JWT token to get user ID (Supabase has already validated it)
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;
    
    if (!userId) {
      console.error("No user ID found in JWT token");
      return new Response(JSON.stringify({
        error: 'Invalid authentication token',
        message: 'Please sign in again'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    console.log("Step 5: Parsing request body");
    const { title, author, genre, style, description, tagline } = await req.json();
    
    console.log("Generating covers for user:", userId, "- Book:", { title, author, genre, style });

    console.log("Step 6: Checking user credits");
    // Check user credits using service role client
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();

    console.log("Profile query result:", { profile, profileError });

    if (profileError) {
      console.error("Profile error details:", profileError);
      throw new Error(`Database error: ${profileError.message}`);
    }

    let userProfile = profile;

    if (!userProfile) {
      console.log("No profile found, creating one...");
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .upsert({
          user_id: userId,
          credits: 10 // Give new users 10 credits to start
        }, {
          onConflict: 'user_id'
        })
        .select('credits')
        .single();

      if (createError) {
        console.error("Error creating profile:", createError);
        throw new Error(`Could not create user profile: ${createError.message}`);
      }

      userProfile = newProfile;
      console.log("Created/updated profile with credits:", newProfile.credits);
    }

    if (userProfile.credits < 2) {
      return new Response(JSON.stringify({
        error: 'Insufficient credits',
        message: 'You need at least 2 credits to generate book covers',
        remainingCredits: userProfile.credits
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
      
      prompt += `Create an eye-catching, professional book cover with ONLY the book title "${title}" and author name "${author}" displayed as text. `;
      prompt += `Do not include any other text, quotes, descriptions, or additional words on the cover. `;
      prompt += `High-quality, commercial book cover design, clean typography, professional layout, `;
      prompt += `suitable for ${genre} genre with ${style} aesthetic. `;
      prompt += `Text should be limited to: title "${title}" and author "${author}" only.`;
      
      return prompt;
    };

    const prompt = buildPrompt({ title, author, genre, style, description, tagline });
    console.log("Generated prompt:", prompt);

    // Call Ideogram API
    const requestBody = {
      image_request: {
        prompt: prompt,
        num_images: 4,
        aspect_ratio: 'ASPECT_2_3'
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
      .update({ credits: userProfile.credits - 2 })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating credits:', updateError);
      // Continue anyway - don't fail the whole request for credit update issues
    }

    const remainingCredits = userProfile.credits - 2;
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