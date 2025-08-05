import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== BASIC TEST FUNCTION START ===");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Method:", req.method);
    console.log("URL:", req.url);
    
    // Test environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const ideogramKey = Deno.env.get('IDEOGRAM_API_KEY');
    
    console.log("Environment check:");
    console.log("- Supabase URL:", !!supabaseUrl);
    console.log("- Ideogram Key:", !!ideogramKey);
    
    if (!ideogramKey) {
      throw new Error("IDEOGRAM_API_KEY not found in environment");
    }
    
    // Test request body parsing
    const body = await req.json();
    console.log("Request body received:", Object.keys(body));
    
    // Return a test response
    return new Response(JSON.stringify({
      success: true,
      message: "Test function working",
      receivedFields: Object.keys(body),
      hasIdeogramKey: !!ideogramKey
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Test function error:", error.message);
    console.error("Error stack:", error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack,
      type: "test_function_error"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});