import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EmailRequest = {
  type: string;
  to: string;
  data?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, to, data }: EmailRequest = await req.json();
    if (!type || !to) {
      return new Response(JSON.stringify({ error: "Missing 'type' or 'to'" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");

    let subject = "";
    let html = "";

    switch (type) {
      case "welcome": {
        const name = (data?.name as string) || to.split("@")[0];
        subject = "Welcome to Cover Artisan";
        html = `
          <h1>Welcome, ${name}!</h1>
          <p>We're excited to have you on board. You now have starter credits to begin creating AI book covers.</p>
          <p>Need help? Just reply to this email.</p>
          <p>— The Cover Artisan Team</p>
        `;
        break;
      }
      case "purchase_confirmation": {
        const credits = (data?.credits as number) ?? (data?.creditsAdded as number) ?? 0;
        const newBalance = (data?.newCredits as number) ?? undefined;
        subject = "Thanks — your credits are ready";
        html = `
          <h2>Payment received</h2>
          <p>We've added <strong>${credits}</strong> credits to your account.</p>
          ${newBalance !== undefined ? `<p>Your new balance: <strong>${newBalance}</strong> credits.</p>` : ""}
          <p>Happy creating!<br/>— Cover Artisan</p>
        `;
        break;
      }
      default: {
        subject = "Notification from Cover Artisan";
        html = `<p>${data?.message ?? "Hello from Cover Artisan."}</p>`;
      }
    }

    const result = await resend.emails.send({
      from: "Cover Artisan <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("send-email error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
