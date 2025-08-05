import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== MINIMAL TEST FUNCTION START ===");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Method:", req.method);
    
    // Test environment variables
    const ideogramKey = Deno.env.get('IDEOGRAM_API_KEY');
    console.log("Ideogram Key exists:", !!ideogramKey);
    
    if (!ideogramKey) {
      throw new Error("IDEOGRAM_API_KEY not found in environment");
    }
    
    // Parse request body
    const body = await req.json();
    console.log("Request body keys:", Object.keys(body));
    
    // Just return success with mock data for now
    const mockImages = [
      { url: "https://via.placeholder.com/400x600/000000/FFFFFF?text=Cover+1" },
      { url: "https://via.placeholder.com/400x600/333333/FFFFFF?text=Cover+2" },
      { url: "https://via.placeholder.com/400x600/666666/FFFFFF?text=Cover+3" },
      { url: "https://via.placeholder.com/400x600/999999/FFFFFF?text=Cover+4" }
    ];
    
    return new Response(JSON.stringify({
      success: true,
      images: mockImages,
      remainingCredits: 9,
      message: "Mock covers generated successfully"
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