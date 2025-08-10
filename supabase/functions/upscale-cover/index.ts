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

    const { imageUrl, prompt, aspectRatio, coverId, scale } = await req.json()
    console.log('Received upscale request with imageUrl:', imageUrl, 'coverId:', coverId, 'scale:', scale)

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

// Defer credits deduction until after successful task creation/upscale


    // Use Ideogram Upscale API
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

    // Helper to call Ideogram Upscale once
    const callUpscale = async (srcBuffer: ArrayBuffer, contentType: string) => {
      console.log('Calling Ideogram Upscale API')
      const formData = new FormData()
      const fileExt = contentType.includes('png') ? 'png' : (contentType.includes('webp') ? 'webp' : 'jpg')
      const imageBlob = new Blob([srcBuffer], { type: contentType })
      formData.append('image_file', imageBlob, `image.${fileExt}`)
      formData.append('image_request', JSON.stringify({}))

      const resp = await fetch('https://api.ideogram.ai/upscale', {
        method: 'POST',
        headers: { 'Api-Key': ideogramApiKey },
        body: formData
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        console.error('Ideogram upscale error:', resp.status, errorText)
        return { error: { status: resp.status, message: errorText } }
      }

      const data = await resp.json()
      console.log('Ideogram upscale response:', data)

      const firstItem = data?.data?.[0] || {}
      const url = firstItem.download_url || firstItem.downloadUrl || firstItem.url || data?.url || data?.image_url
      const resolutionStr = String(firstItem.resolution || '')
      let w = 0, h = 0
      const match = resolutionStr.match(/(\d+)x(\d+)/)
      if (match) { w = parseInt(match[1], 10); h = parseInt(match[2], 10) }

      console.log('Upscale first item keys:', Object.keys(firstItem || {}))
      console.log('Chosen url:', url, 'resolution:', w, 'x', h)

      if (!url) {
        return { error: { status: 500, message: 'No upscaled image URL' } }
      }

      // Download the upscaled image
      const upRes = await fetch(url)
      if (!upRes.ok) {
        console.error('Failed to download upscaled image:', upRes.status)
        return { error: { status: upRes.status, message: 'Download upscaled image failed' } }
      }
      const upBuf = await upRes.arrayBuffer()
      const upType = upRes.headers.get('content-type') || 'image/jpeg'
      return { url, buffer: upBuf, contentType: upType, width: w, height: h }
    }

    // First pass
    const first = await callUpscale(imageBuffer, imageResponse.headers.get('content-type') || 'image/jpeg')
    if ((first as any).error) {
      const e = (first as any).error
      return new Response(JSON.stringify({ error: e.message, status: e.status }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let finalBuf = (first as any).buffer as ArrayBuffer
    let finalType = (first as any).contentType as string
    let finalUrl = (first as any).url as string
    let finalW = (first as any).width as number
    let finalH = (first as any).height as number

    let passes = 1

    // If still too small (long edge < 2000px), run a second upscale pass once
    const longEdge = Math.max(finalW || 0, finalH || 0)
    if (longEdge && longEdge < 2000) {
      console.log('Result too small after first pass (', finalW, 'x', finalH, '), running second pass')
      const second = await callUpscale(finalBuf, finalType)
      if (!(second as any).error) {
        finalBuf = (second as any).buffer
        finalType = (second as any).contentType
        finalUrl = (second as any).url
        finalW = (second as any).width
        finalH = (second as any).height
        passes = 2
      } else {
        console.warn('Second pass failed, keeping first pass result:', (second as any).error)
      }
    }

    // Proceed to store final upscaled image
    const upscaledImageBuffer = finalBuf
    const upscaledContentType = finalType
    const upscaledExt = upscaledContentType.includes('png') ? 'png' : (upscaledContentType.includes('webp') ? 'webp' : 'jpg')
    const upscaledImageUrl = finalUrl


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
        const upscaledContentType = upscaledImageResponse.headers.get('content-type') || 'image/jpeg'
        const upscaledExt = upscaledContentType.includes('png') ? 'png' : (upscaledContentType.includes('webp') ? 'webp' : 'jpg')
        const timestamp = Date.now()
        const fileName = `${user.id}/${timestamp}_upscaled.${upscaledExt}`
        
        console.log('Storing upscaled image in Supabase Storage:', fileName)
        
        // Store in Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('upscaled-covers')
          .upload(fileName, upscaledImageBuffer, {
            contentType: upscaledContentType,
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

        // If coverId is provided, update that creation directly; otherwise, best-effort match by original URLs
        if (coverId) {
          const { error: updateByIdError } = await supabaseClient
            .from('creations')
            .update({ upscaled_image_url: storedImageUrl })
            .eq('id', coverId)
            .eq('user_id', user.id)
          if (updateByIdError) {
            console.error('Error updating creation by id with stored image URL:', updateByIdError)
          } else {
            console.log('Successfully updated creation by id with stored image URL')
          }
        } else {
          // Fallback lookup by original image URLs
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
        }

      } catch (error) {
        console.error('Error in background storage task:', error)
      }
    }

// Deduct credits now that the task succeeded and we have a URL
const creditsToDeduct = (passes || 1) * 2
const newCredits = (profile.credits ?? 0) - creditsToDeduct
const { error: lateUpdateError } = await supabaseClient
  .from('profiles')
  .update({ credits: newCredits })
  .eq('user_id', user.id)

if (lateUpdateError) {
  console.error('Error updating credits after upscaling:', lateUpdateError)
  return new Response(
    JSON.stringify({ error: 'Failed to process credits after upscaling' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Start background task (don't await)
EdgeRuntime.waitUntil(storeImageTask())

// Return immediate response with temporary upscaled image
return new Response(
  JSON.stringify({ 
    success: true,
    upscaledImage: upscaledImageUrl,
    resolution: { width: finalW, height: finalH },
    passes,
    message: passes > 1 
      ? "Image upscaled (2 passes) to meet target resolution. It will be saved to your collection shortly."
      : "Image upscaled successfully! It will be permanently saved to your collection shortly.",
    creditsRemaining: newCredits
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