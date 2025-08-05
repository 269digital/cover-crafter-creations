import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== SUPER SIMPLE TEST FUNCTION START ===");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Method:", req.method);
    console.log("URL:", req.url);
    
    // Return success immediately with mock data
    const mockImages = [
      { url: "https://via.placeholder.com/400x600/FF6B6B/FFFFFF?text=Cover+1" },
      { url: "https://via.placeholder.com/400x600/4ECDC4/FFFFFF?text=Cover+2" },
      { url: "https://via.placeholder.com/400x600/45B7D1/FFFFFF?text=Cover+3" },
      { url: "https://via.placeholder.com/400x600/96CEB4/FFFFFF?text=Cover+4" }
    ];
    
    console.log("Returning mock data with", mockImages.length, "images");
    
    return new Response(JSON.stringify({
      success: true,
      images: mockImages,
      remainingCredits: 9,
      message: "Test mode - Mock covers generated successfully"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Super simple test error:", error.message);
    console.error("Error stack:", error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack,
      type: "super_simple_test_error"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});