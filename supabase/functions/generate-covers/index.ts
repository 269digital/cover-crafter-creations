import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const { data, error: authError } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    
    console.log(`Auth result - User: ${user?.id || 'null'}, Error: ${authError?.message || 'none'}`);
    
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Parse request body
    const { title, author, genre, style, description } = await req.json();
    console.log(`Request from user ${user.id} for: ${title} by ${author}`);

    // Check user credits first using maybeSingle to avoid the single() error
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log(`Profile query result - Data: ${profile ? JSON.stringify(profile) : 'null'}, Error: ${profileError?.message || 'none'}`);

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      throw new Error(`Could not fetch user profile: ${profileError.message}`);
    }

    if (!profile) {
      console.error(`No profile found for user ${user.id}`);
      throw new Error("User profile not found. Please ensure your account is properly set up.");
    }

    if (profile.credits < 1) {
      return new Response(JSON.stringify({ 
        error: "Insufficient credits. Please purchase more credits to generate covers." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Create prompt for book cover
    const prompt = `Professional book cover design for "${title}" by ${author}. 
    Genre: ${genre}. Style: ${style}. 
    ${description ? `Description: ${description}.` : ''}
    High-quality, commercial book cover with title and author name clearly visible. 
    Professional typography, eye-catching design, suitable for ${genre} genre.`;

    console.log(`Generating cover for user ${user.id} with prompt: ${prompt}`);

    // Generate 4 variations using Ideogram API
    const ideogramApiKey = Deno.env.get("IDEOGRAM_API_KEY");
    console.log(`=== IDEOGRAM DEBUG START ===`);
    console.log(`API Key present: ${ideogramApiKey ? 'YES' : 'NO'}`);
    console.log(`API Key length: ${ideogramApiKey ? ideogramApiKey.length : 0}`);
    console.log(`API Key first 10 chars: ${ideogramApiKey ? ideogramApiKey.substring(0, 10) + '...' : 'N/A'}`);
    
    if (!ideogramApiKey) {
      console.error("CRITICAL: IDEOGRAM_API_KEY environment variable is not set");
      throw new Error("IDEOGRAM_API_KEY environment variable is not set");
    }
    
    const imageUrls: string[] = [];

    // Test with just one generation first
    for (let i = 0; i < 1; i++) {
      try {
        console.log(`\n=== GENERATING VARIATION ${i + 1} ===`);
        console.log(`Prompt: ${prompt}`);
        
        const requestBody = {
          image_request: {
            prompt: prompt,
            aspect_ratio: "ASPECT_3_4",
            model: "V_2",
            magic_prompt_option: "ON",
            speed: "STANDARD",
          },
        };
        
        console.log(`Request body:`, JSON.stringify(requestBody, null, 2));
        console.log(`Making request to: https://api.ideogram.ai/generate`);
        console.log(`Headers: Api-Key: ${ideogramApiKey.substring(0, 10)}..., Content-Type: application/json`);
        
        const startTime = Date.now();
        
        const response = await fetch("https://api.ideogram.ai/generate", {
          method: "POST",
          headers: {
            "Api-Key": ideogramApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const endTime = Date.now();
        console.log(`Request completed in ${endTime - startTime}ms`);
        console.log(`Response status: ${response.status}`);
        console.log(`Response status text: ${response.statusText}`);
        console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));
        
        const responseText = await response.text();
        console.log(`Response body length: ${responseText.length}`);
        console.log(`Response body (first 1000 chars): ${responseText.substring(0, 1000)}`);
        
        if (!response.ok) {
          console.error(`ERROR: Ideogram API returned ${response.status}: ${response.statusText}`);
          console.error(`Full error response: ${responseText}`);
          throw new Error(`Ideogram API error (${response.status}): ${responseText}`);
        }

        let result;
        try {
          result = JSON.parse(responseText);
          console.log(`Parsed JSON successfully:`, JSON.stringify(result, null, 2));
        } catch (parseError) {
          console.error(`JSON Parse Error: ${parseError}`);
          console.error(`Raw response: ${responseText}`);
          throw new Error(`Invalid JSON response from Ideogram API: ${parseError}`);
        }
        
        if (result.data && result.data.length > 0) {
          imageUrls.push(result.data[0].url);
          console.log(`SUCCESS: Generated image URL: ${result.data[0].url}`);
        } else {
          console.error(`No image data in response:`, result);
          throw new Error("No image data returned from Ideogram API");
        }
        
      } catch (error) {
        console.error(`CRITICAL ERROR in variation ${i + 1}:`, error);
        console.error(`Error type: ${error.constructor.name}`);
        console.error(`Error message: ${error.message}`);
        console.error(`Error stack: ${error.stack}`);
        throw error; // Re-throw to fail the entire function
      }
    }

    if (imageUrls.length === 0) {
      throw new Error("Failed to generate any cover variations");
    }

    // Create Supabase service client to bypass RLS for database updates
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Background task to save to database and deduct credits
    const backgroundTask = async () => {
      try {
        // Save the generation to database
        const { error: insertError } = await supabaseService
          .from("creations")
          .insert({
            user_id: user.id,
            prompt: `${title} by ${author} - ${genre} - ${style}${description ? ` - ${description}` : ''}`,
            image_url1: imageUrls[0] || null,
            image_url2: imageUrls[1] || null,
            image_url3: imageUrls[2] || null,
            image_url4: imageUrls[3] || null,
          });

        if (insertError) {
          console.error("Error saving creation:", insertError);
          return;
        }

        // Deduct 1 credit from user
        const { error: updateError } = await supabaseService
          .from("profiles")
          .update({ credits: profile.credits - 1 })
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Error updating credits:", updateError);
        } else {
          console.log(`Deducted 1 credit from user ${user.id}. Remaining: ${profile.credits - 1}`);
        }
      } catch (error) {
        console.error("Background task error:", error);
      }
    };

    // Start background task
    EdgeRuntime.waitUntil(backgroundTask());

    // Return immediate response with generated images
    return new Response(JSON.stringify({ 
      success: true,
      images: imageUrls,
      creditsRemaining: profile.credits - 1,
      message: `Generated ${imageUrls.length} cover variations! 1 credit deducted.`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Cover generation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});