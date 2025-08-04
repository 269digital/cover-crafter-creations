import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log(`=== REMIX COVER FUNCTION START ===`);
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
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !ideogramApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header and extract user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      console.error('Auth error:', authError);
      throw new Error('User not authenticated');
    }

    const userId = userData.user.id;
    console.log(`Authenticated user: ${userId}`);

    // Get request body
    const { originalImageUrl, originalPrompt, additionalPrompt, ideogramId } = await req.json();
    console.log(`Remix request from user ${userId}`);
    console.log(`Original prompt: ${originalPrompt}`);
    console.log(`Additional prompt: ${additionalPrompt}`);
    console.log(`Ideogram ID: ${ideogramId}`);

    // Check user credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    if (profile.credits < 2) {
      throw new Error('Insufficient credits. Remix costs 2 credits.');
    }

    // Create combined prompt
    const combinedPrompt = `${originalPrompt}. ${additionalPrompt}`;
    console.log(`Combined prompt: ${combinedPrompt}`);

    // Extract image ID from original URL if ideogramId not provided
    let imageId = ideogramId;
    if (!imageId && originalImageUrl) {
      // Try to extract ID from Ideogram URL pattern
      const urlMatch = originalImageUrl.match(/\/ephemeral\/([a-zA-Z0-9_-]+)\./);
      if (urlMatch) {
        imageId = urlMatch[1];
        console.log(`Extracted image ID from URL: ${imageId}`);
      } else {
        // Try to extract from stored upscaled cover URL pattern
        const storedMatch = originalImageUrl.match(/\/upscaled-covers\/[^\/]+\/(\d+)_upscaled/);
        if (storedMatch) {
          // For stored images, we need to find the original creation to get the ideogram_id
          console.log('Image is stored, need to find original ideogram_id from database');
          throw new Error('Cannot remix stored images without original Ideogram ID. Please remix from recently generated covers.');
        }
      }
    }

    if (!imageId) {
      throw new Error('Could not determine image ID for remix');
    }

    // Start remix process
    console.log('Starting remix with Ideogram...');
    
    const remixResponse = await fetch('https://api.ideogram.ai/images/remix/v3', {
      method: 'POST',
      headers: {
        'Api-Key': ideogramApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_id: imageId,
        prompt: combinedPrompt,
        remix_strength: 0.4, // Balanced remix strength
        aspect_ratio: "ASPECT_2_3",
        model: "V_2",
        magic_prompt_option: "AUTO"
      })
    });

    if (!remixResponse.ok) {
      const errorText = await remixResponse.text();
      console.error(`Ideogram remix API error:`, remixResponse.status, errorText);
      throw new Error(`Remix failed: ${errorText}`);
    }

    const remixResult = await remixResponse.json();
    console.log('Remix initiated:', remixResult);
    
    const requestId = remixResult.request_id;
    if (!requestId) {
      throw new Error('No request ID received from Ideogram');
    }

    // Polling function
    const pollForCompletion = async (requestId: string, maxAttempts = 30): Promise<any> => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Polling attempt ${attempt}/${maxAttempts} for request ${requestId}`);
        
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        const pollResponse = await fetch(`https://api.ideogram.ai/images/${requestId}`, {
          headers: {
            'Api-Key': ideogramApiKey,
          }
        });

        if (!pollResponse.ok) {
          console.error(`Polling error: ${pollResponse.status}`);
          continue;
        }

        const pollResult = await pollResponse.json();
        console.log(`Poll result:`, pollResult);

        if (pollResult.state === 'completed' && pollResult.data && pollResult.data.length > 0) {
          return pollResult.data[0];
        } else if (pollResult.state === 'failed') {
          throw new Error('Remix failed during processing');
        }
        
        // If still processing, continue polling
        if (pollResult.state !== 'processing') {
          console.log(`Unexpected state: ${pollResult.state}`);
        }
      }
      
      throw new Error('Remix timed out after maximum polling attempts');
    };

    // Poll for completion
    const completedResult = await pollForCompletion(requestId);
    console.log('Remix completed:', completedResult);

    if (!completedResult.url) {
      throw new Error('No image URL in completed result');
    }

    // Save the remixed creation to database
    const { error: insertError } = await supabase
      .from('creations')
      .insert({
        user_id: userId,
        prompt: combinedPrompt,
        image_url1: completedResult.url,
        upscaled_image_url: completedResult.url, // Store as upscaled since it's high quality
        ideogram_id: completedResult.id,
      });

    if (insertError) {
      console.error('Error saving remixed creation:', insertError);
      throw new Error('Failed to save remixed creation');
    }

    // Deduct credits
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - 2 })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating credits:', updateError);
      // Don't throw error here, the remix was successful
    }

    console.log('Remix process completed successfully');

    return new Response(JSON.stringify({
      success: true,
      message: "Cover remixed successfully!",
      imageUrl: completedResult.url,
      creditsRemaining: profile.credits - 2
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Remix error:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});