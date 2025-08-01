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

    // Generate 4 variations using OpenAI DALL-E API (more reliable than Ideogram)
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    console.log(`Using OpenAI API key: ${openaiApiKey ? `Key present (${openaiApiKey.length} chars)` : 'Key missing'}`);
    
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set. Please add your OpenAI API key to use image generation.");
    }
    
    const imageUrls: string[] = [];

    for (let i = 0; i < 4; i++) {
      try {
        console.log(`Generating variation ${i + 1} with prompt: ${prompt.substring(0, 100)}...`);
        
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1792", // Portrait orientation for book covers
            quality: "standard",
            style: "vivid"
          }),
        });

        console.log(`OpenAI API response status for variation ${i + 1}: ${response.status}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`OpenAI API error for variation ${i + 1} (${response.status}): ${errorText}`);
          // If we get a critical error on the first attempt, throw it
          if (i === 0 && response.status === 401) {
            throw new Error(`OpenAI API authentication failed: ${errorText}`);
          }
          continue;
        }

        const result = await response.json();
        console.log(`Generated image for variation ${i + 1}:`, result.data[0].url);
        
        if (result.data && result.data.length > 0) {
          imageUrls.push(result.data[0].url);
        } else {
          console.error(`No data returned for variation ${i + 1}:`, result);
        }
      } catch (error) {
        console.error(`Error generating variation ${i + 1}:`, error);
        // If it's the first variation and we get a critical error, re-throw it
        if (i === 0 && (error.message.includes('authentication') || error.message.includes('API key'))) {
          throw error;
        }
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