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

    const { imageUrl, prompt, aspectRatio } = await req.json()
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

    // Use Freepik Magnific (Precision) Upscaler API
    const freepikApiKey = Deno.env.get('FREEPIK_API_KEY')
    if (!freepikApiKey) {
      console.error('FREEPIK_API_KEY not found')
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
      
      // Check if it's an expired URL (common with temporary URLs)
      if (imageResponse.status === 403 || imageResponse.status === 404) {
        return new Response(
          JSON.stringify({ 
            error: 'The image URL has expired. Please try regenerating the cover in the Studio instead.',
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

    // Create FormData for the Freepik upscaler API (2x, JPEG)
    const formData = new FormData()
    formData.append('image', imageBlob, 'cover.jpg')
    formData.append('scale', '2')
    formData.append('format', 'jpeg')
    formData.append('mode', 'magnific')

    // Call Freepik Magnific Upscaler API
    console.log('Calling Freepik Magnific Upscaler API with image file')
    const createTaskResp = await fetch('https://api.freepik.com/v1/image-upscaler', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${freepikApiKey}`,
      },
      body: formData,
    })

    if (!createTaskResp.ok) {
      const errorText = await createTaskResp.text()
      console.error('Freepik create task error:', createTaskResp.status, errorText)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create upscaling task',
          details: errorText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const taskData = await createTaskResp.json()
    console.log('Freepik create task response:', taskData)

    // Try to extract immediate URL if provided (some responses might be synchronous)
    let upscaledImageUrl: string | undefined =
      taskData?.result?.url || taskData?.data?.url || taskData?.url

    // Otherwise, poll for task completion
    let taskId: string | undefined = taskData?.id || taskData?.data?.id || taskData?.task_id || taskData?.taskId

    if (!upscaledImageUrl && taskId) {
      const statusUrl = `https://api.freepik.com/v1/image-upscaler/${taskId}`
      console.log('Polling Freepik task status at:', statusUrl)

      const wait = (ms: number) => new Promise((res) => setTimeout(res, ms))

      let attempts = 0
      const maxAttempts = 30 // up to ~60s with 2s backoff
      while (attempts < maxAttempts) {
        attempts++
        const statusResp = await fetch(statusUrl, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${freepikApiKey}` },
        })
        if (!statusResp.ok) {
          const txt = await statusResp.text()
          console.error('Freepik status error:', statusResp.status, txt)
          break
        }
        const statusData = await statusResp.json()
        const status = statusData?.status || statusData?.state || statusData?.data?.status
        console.log(`Poll ${attempts}:`, statusData)

        if (status && ['completed', 'succeeded', 'success', 'finished'].includes(String(status).toLowerCase())) {
          upscaledImageUrl = statusData?.result?.url || statusData?.data?.result?.url || statusData?.data?.url || statusData?.output?.url
          break
        }
        if (status && ['failed', 'error'].includes(String(status).toLowerCase())) {
          console.error('Upscaling task failed:', statusData)
          return new Response(
            JSON.stringify({ error: 'Upscaling failed', details: statusData }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        await wait(2000)
      }
    }

    if (!upscaledImageUrl) {
      console.error('No upscaled image URL received from Freepik API')
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
          .or(`image_url1.eq."${imageUrl}",image_url2.eq."${imageUrl}",image_url3.eq."${imageUrl}",image_url4.eq."${imageUrl}"`)
          .order('created_at', { ascending: false })
          .maybeSingle()

        if (findError) {
          console.error('Error finding creation to update:', findError)
        }

        if (creations) {
          // Update the creation record with the stored image URL
          const { error: updateError } = await supabaseClient
            .from('creations')
            .update({ upscaled_image_url: storedImageUrl })
            .eq('id', creations.id)

          if (updateError) {
            console.error('Error updating creation with stored image URL:', updateError)
          } else {
            console.log('Successfully updated creation with stored image URL')
          }
        } else {
          console.error('Could not find creation record to update for image URL:', imageUrl)
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