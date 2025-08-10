import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !ideogramApiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No auth header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user = userData.user

    // Check user credits (1 credit per edit)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Unable to verify credits' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if ((profile.credits ?? 0) < 1) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits. You need 1 credit to apply an edit.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Expect multipart form-data with: mask (file), prompt (text), cover_id (text), and either image (file) or image_url (text)
    const form = await req.formData()
    let imageFile = form.get('image') as File | null
    const imageUrlFromForm = (form.get('image_url') as string | null) ?? ''
    const maskFile = form.get('mask') as File | null
    const prompt = (form.get('prompt') as string | null) ?? ''
    const coverId = (form.get('cover_id') as string | null) ?? ''

    if (!maskFile) {
      return new Response(
        JSON.stringify({ error: 'Missing mask file' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If image file not provided, try fetching from image_url server-side
    if (!imageFile && imageUrlFromForm) {
      try {
        const fetched = await fetch(imageUrlFromForm)
        if (!fetched.ok) throw new Error(`Failed to fetch image: ${fetched.status}`)
        const buf = await fetched.arrayBuffer()
        const blob = new Blob([buf], { type: fetched.headers.get('content-type') || 'image/png' })
        imageFile = new File([blob], 'image.png', { type: blob.type })
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Unable to retrieve source image from URL', details: (e as any)?.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!imageFile) {
      return new Response(
        JSON.stringify({ error: 'Missing source image. Provide image file or image_url.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build Ideogram edit request (multipart)
    const ideogramForm = new FormData()
    ideogramForm.append('image', imageFile, imageFile.name || 'image.jpg')
    ideogramForm.append('mask', maskFile, maskFile.name || 'mask.png')

    const imageRequest = {
      prompt: prompt || 'Remove unwanted text and fill background naturally',
      magic_prompt_option: 'AUTO',
      // Some APIs require explicit mode or strength; include generic fields for compatibility
      // mode: 'EDIT',
    }
    ideogramForm.append('image_request', JSON.stringify(imageRequest))

    const ideogramResp = await fetch('https://api.ideogram.ai/v1/ideogram-v3/edit', {
      method: 'POST',
      headers: {
        'Api-Key': ideogramApiKey,
      },
      body: ideogramForm,
    })

    if (!ideogramResp.ok) {
      const t = await ideogramResp.text()
      return new Response(
        JSON.stringify({ error: 'Ideogram edit failed', details: t, status: ideogramResp.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const editData = await ideogramResp.json().catch(() => null)
    const editedUrl = editData?.data?.[0]?.url || editData?.image_url || editData?.url

    if (!editedUrl) {
      return new Response(
        JSON.stringify({ error: 'No edited image URL returned from Ideogram' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download the edited image and save to Storage, then update the creation record
    const downloaded = await fetch(editedUrl)
    if (!downloaded.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to download edited image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const buffer = await downloaded.arrayBuffer()
    const filePath = `${user.id}/edited/${coverId || 'cover'}_${Date.now()}.png`

    const { error: uploadError } = await supabase.storage
      .from('upscaled-covers')
      .upload(filePath, buffer, { contentType: 'image/png', upsert: false })

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: 'Failed to upload edited image to storage', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: publicUrlData } = supabase.storage.from('upscaled-covers').getPublicUrl(filePath)
    const storedUrl = publicUrlData.publicUrl

    if (coverId) {
      // Update the creation record with the new version URL (overwrite upscaled_image_url for simplicity)
      const { error: updateError } = await supabase
        .from('creations')
        .update({ upscaled_image_url: storedUrl })
        .eq('id', coverId)
        .eq('user_id', user.id)

      if (updateError) {
        // Continue returning the URL even if DB update fails
        console.error('Failed to update creation with edited image URL:', updateError)
      }
    }

    // Deduct 1 credit for successful edit
    const newCredits = (profile.credits ?? 0) - 1
    const { error: creditError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('user_id', user.id)

    if (creditError) {
      console.error('Failed to deduct credits after edit:', creditError)
      return new Response(
        JSON.stringify({ error: 'Failed to process credits after edit' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, editedImage: editedUrl, storedImageUrl: storedUrl, creditsRemaining: newCredits }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: e?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
