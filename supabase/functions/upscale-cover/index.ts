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

    // Check user credits and deduct 2 credits for upscaling
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError)
      return new Response(
        JSON.stringify({ error: 'Unable to verify credits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (profile.credits < 2) {
      console.error('Insufficient credits:', profile.credits)
      return new Response(
        JSON.stringify({ error: 'Insufficient credits. You need 2 credits to upscale an image.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Deduct 2 credits
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ credits: profile.credits - 2 })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating credits:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to process credits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    console.log('Image download response status:', imageResponse.status)
    
    if (!imageResponse.ok) {
      console.error('Failed to download image:', imageResponse.status, imageResponse.statusText)
      
      // Check if it's an expired URL (common with Ideogram temporary URLs)
      if (imageResponse.status === 403 || imageResponse.status === 404) {
        return new Response(
          JSON.stringify({ 
            error: 'The image URL has expired. This happens with images that are several hours old. Please try regenerating the cover in the Studio instead.',
            expired: true
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to download the image for upscaling' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    console.log('Downloaded image size:', imageBuffer.byteLength, 'bytes')
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' })

    // Create FormData for the upscale API
    const formData = new FormData()
    formData.append('image_file', imageBlob, 'cover.jpg')
    
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

    const upscaledImageUrl = upscaleData.data?.[0]?.url || upscaleData.url
    
    if (!upscaledImageUrl) {
      console.error('No upscaled image URL in response')
      return new Response(
        JSON.stringify({ error: 'Failed to get upscaled image URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Background task to download and store the upscaled image
    const storeImageTask = async () => {
      try {
        console.log('Downloading upscaled image for storage:', upscaledImageUrl)
        
        // Download the upscaled image
        const upscaledImageResponse = await fetch(upscaledImageUrl)
        if (!upscaledImageResponse.ok) {
          console.error('Failed to download upscaled image:', upscaledImageResponse.status)
          return
        }

        const upscaledImageBuffer = await upscaledImageResponse.arrayBuffer()
        const timestamp = Date.now()
        const fileName = `${user.id}/${timestamp}_upscaled.jpg`
        
        console.log('Storing upscaled image in Supabase Storage:', fileName)
        
        // Store in Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('upscaled-covers')
          .upload(fileName, upscaledImageBuffer, {
            contentType: 'image/jpeg',
            upsert: false
          })

        if (uploadError) {
          console.error('Error uploading to storage:', uploadError)
          return
        }

        // Get the public URL
        const { data: publicUrlData } = supabaseClient.storage
          .from('upscaled-covers')
          .getPublicUrl(fileName)

        const storedImageUrl = publicUrlData.publicUrl
        console.log('Stored image URL:', storedImageUrl)

        // Find the creation record to update (match by original image URL)
        const { data: creations, error: findError } = await supabaseClient
          .from('creations')
          .select('id')
          .eq('user_id', user.id)
          .or(`image_url1.eq.${imageUrl},image_url2.eq.${imageUrl},image_url3.eq.${imageUrl},image_url4.eq.${imageUrl}`)
          .order('created_at', { ascending: false })
          .limit(1)

        if (findError || !creations?.length) {
          console.error('Could not find creation to update:', findError)
          return
        }

        // Update the creation record with the stored image URL
        const { error: updateError } = await supabaseClient
          .from('creations')
          .update({ upscaled_image_url: storedImageUrl })
          .eq('id', creations[0].id)

        if (updateError) {
          console.error('Error updating creation with stored image URL:', updateError)
        } else {
          console.log('Successfully updated creation with stored image URL')
        }

      } catch (error) {
        console.error('Error in background storage task:', error)
      }
    }

    // Start background task (don't await)
    EdgeRuntime.waitUntil(storeImageTask())

    // Return immediate response with temporary upscaled image
    return new Response(
      JSON.stringify({ 
        success: true,
        upscaledImage: upscaledImageUrl,
        message: "Image upscaled successfully! It will be permanently saved to your collection shortly.",
        creditsRemaining: profile.credits - 2
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