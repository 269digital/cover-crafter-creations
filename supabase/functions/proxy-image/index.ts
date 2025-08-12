import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require auth to avoid open proxy abuse
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow ideogram images (including subdomains)
    try {
      const t = new URL(target);
      const allowed = t.protocol === 'https:' && (t.hostname === 'ideogram.ai' || t.hostname.endsWith('.ideogram.ai'));
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden domain' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid target URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const upstream = await fetch(target);
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch image', status: upstream.status }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': contentType },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Unexpected error', details: e?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
