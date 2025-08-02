import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client using the same pattern as generate-covers
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authorization header and extract user
    const authHeader = req.headers.get('authorization')
    console.log('Auth header present:', !!authHeader)
    if (!authHeader) {
      console.error('No authorization header provided')
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No auth header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract the JWT token from the authorization header
    const token = authHeader.replace('Bearer ', '')
    console.log('Token extracted:', !!token)

    // Use service role client to validate the JWT token
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !userData.user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user = userData.user
    console.log('Authenticated user:', user.id)

    const { imageUrl, prompt } = await req.json()
    console.log('Received upscale request with imageUrl:', imageUrl)

    if (!imageUrl) {
      console.error('No image URL provided')
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check user credits
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (profile.credits < 1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits. You need at least 1 credit to upscale an image.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Ideogram API key
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY')
    if (!ideogramApiKey) {
      console.error('IDEOGRAM_API_KEY not found')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download the image from the provided URL
    console.log('Downloading image from URL:', imageUrl)
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      console.error('Failed to download image:', imageResponse.status)
      return new Response(
        JSON.stringify({ error: 'Failed to download the image for upscaling' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const imageBlob = new Blob([imageBuffer], { type: 'image/png' })

    // Create FormData for the upscale API
    const formData = new FormData()
    formData.append('image_file', imageBlob, 'cover.png')
    
    const imageRequest = {
      prompt: prompt || 'High quality book cover, sharp details, professional appearance',
      resolution: 'RESOLUTION_1024_1024',
      aspect_ratio: 'ASPECT_2_3'
    }
    formData.append('image_request', JSON.stringify(imageRequest))

    // Call Ideogram upscale API with the correct format
    console.log('Calling Ideogram upscale API with image file')
    const upscaleResponse = await fetch('https://api.ideogram.ai/upscale', {
      method: 'POST',
      headers: {
        'Api-Key': ideogramApiKey,
      },
      body: formData,
    })

    if (!upscaleResponse.ok) {
      const errorText = await upscaleResponse.text()
      console.error('Ideogram upscale API error:', upscaleResponse.status, errorText)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to upscale image. The generation ID may be invalid or expired.',
          details: errorText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const upscaleData = await upscaleResponse.json()
    console.log('Upscale response:', upscaleData)

    // Deduct credit only on successful upscale
    const { error: creditError } = await supabaseClient
      .from('profiles')
      .update({ credits: profile.credits - 1 })
      .eq('user_id', user.id)

    if (creditError) {
      console.error('Failed to deduct credit:', creditError)
      // Note: This is a critical error but the upscale was successful
      // We should still return the upscaled image but log this issue
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        upscaledImage: upscaleData.data?.[0]?.url || upscaleData.url,
        creditsRemaining: profile.credits - 1
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in upscale-cover function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'An unexpected error occurred',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})