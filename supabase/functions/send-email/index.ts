import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type: 'welcome' | 'purchase_confirmation';
  to: string;
  data?: {
    name?: string;
    credits?: number;
    amount?: number;
    transactionId?: string;
  };
}

const getWelcomeEmailTemplate = (name: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Cover Artisan</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Welcome to Cover Artisan!</h1>
      <p style="color: #e2e8f0; margin: 10px 0 0 0; font-size: 16px;">Create stunning book covers with AI</p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 20px;">
      <h2 style="color: #1a202c; margin: 0 0 20px 0; font-size: 24px;">Hi ${name || 'there'}! 👋</h2>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0; font-size: 16px;">
        Welcome to Cover Artisan! We're excited to have you on board. You're now ready to create stunning, professional book covers using the power of AI.
      </p>
      
      <div style="background-color: #f7fafc; border-left: 4px solid #4299e1; padding: 20px; margin: 20px 0; border-radius: 4px;">
        <h3 style="color: #2d3748; margin: 0 0 10px 0; font-size: 18px;">🎁 You've got 2 free credits!</h3>
        <p style="color: #4a5568; margin: 0; line-height: 1.5;">
          Your account comes with 2 starter credits so you can begin creating right away. Each credit lets you generate 4 unique cover designs.
        </p>
      </div>
      
      <h3 style="color: #2d3748; margin: 30px 0 15px 0; font-size: 20px;">Getting Started:</h3>
      <ul style="color: #4a5568; line-height: 1.6; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Head to the Studio to create your first cover</li>
        <li style="margin-bottom: 8px;">Enter your book title, author name, and describe your vision</li>
        <li style="margin-bottom: 8px;">Choose from eBook covers, paperback, or hardcover formats</li>
        <li style="margin-bottom: 8px;">Download high-resolution files ready for print or digital publishing</li>
      </ul>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${Deno.env.get("SUPABASE_URL")?.replace('/rest/v1', '') || 'https://your-app.com'}/studio" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
          Start Creating Covers
        </a>
      </div>
      
      <p style="color: #718096; font-size: 14px; line-height: 1.5; margin: 30px 0 0 0;">
        Questions? Just reply to this email and we'll be happy to help!
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #a0aec0; margin: 0; font-size: 14px;">
        Cover Artisan - Professional Book Covers Made Easy
      </p>
    </div>
  </div>
</body>
</html>
`;

const getPurchaseConfirmationTemplate = (data: { credits: number; amount: number; transactionId: string }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Confirmation - Cover Artisan</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Payment Successful! ✅</h1>
      <p style="color: #d1fae5; margin: 10px 0 0 0; font-size: 16px;">Your credits have been added to your account</p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 20px;">
      <h2 style="color: #1a202c; margin: 0 0 20px 0; font-size: 24px;">Thank you for your purchase!</h2>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 0 0 30px 0; font-size: 16px;">
        Your payment has been processed successfully and your credits are now available in your account.
      </p>
      
      <!-- Transaction Details -->
      <div style="background-color: #f7fafc; padding: 25px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #2d3748; margin: 0 0 20px 0; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Purchase Details</h3>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <span style="color: #4a5568; font-size: 16px;">Credits Purchased:</span>
          <span style="color: #1a202c; font-weight: bold; font-size: 18px;">${data.credits} credits</span>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <span style="color: #4a5568; font-size: 16px;">Amount Paid:</span>
          <span style="color: #1a202c; font-weight: bold; font-size: 18px;">$${(data.amount / 100).toFixed(2)}</span>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #4a5568; font-size: 16px;">Transaction ID:</span>
          <span style="color: #718096; font-family: monospace; font-size: 14px;">${data.transactionId}</span>
        </div>
      </div>
      
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px;">
        <h3 style="color: #065f46; margin: 0 0 10px 0; font-size: 18px;">🎉 Ready to Create!</h3>
        <p style="color: #047857; margin: 0; line-height: 1.5;">
          Your new credits are now available in your account. Each credit generates 4 unique cover designs, so you can create ${data.credits * 4} new covers!
        </p>
      </div>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${Deno.env.get("SUPABASE_URL")?.replace('/rest/v1', '') || 'https://your-app.com'}/studio" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; margin-right: 10px;">
          Create New Covers
        </a>
        
        <a href="${Deno.env.get("SUPABASE_URL")?.replace('/rest/v1', '') || 'https://your-app.com'}/my-covers" 
           style="background-color: transparent; color: #667eea; text-decoration: none; padding: 15px 30px; border: 2px solid #667eea; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
          View My Covers
        </a>
      </div>
      
      <p style="color: #718096; font-size: 14px; line-height: 1.5; margin: 30px 0 0 0;">
        Questions about your purchase? Just reply to this email and we'll help you out!
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #a0aec0; margin: 0; font-size: 14px;">
        Cover Artisan - Professional Book Covers Made Easy
      </p>
    </div>
  </div>
</body>
</html>
`;

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, to, data }: EmailRequest = await req.json();

    let emailResponse;

    if (type === 'welcome') {
      console.log(`Sending welcome email to: ${to}`);
      
      emailResponse = await resend.emails.send({
        from: "Cover Artisan <onboarding@send.coverartisan.com>",
        to: [to],
        subject: "Welcome to Cover Artisan! 🎨 Your creative journey starts now",
        html: getWelcomeEmailTemplate(data?.name || ''),
      });
    } 
    else if (type === 'purchase_confirmation' && data) {
      console.log(`Sending purchase confirmation email to: ${to} for ${data.credits} credits`);
      
      emailResponse = await resend.emails.send({
        from: "Cover Artisan <purchases@send.coverartisan.com>",
        to: [to],
        subject: `Payment Confirmed! ${data.credits} Credits Added to Your Account ✅`,
        html: getPurchaseConfirmationTemplate({
          credits: data.credits,
          amount: data.amount || 0,
          transactionId: data.transactionId || 'N/A'
        }),
      });
    }
    else {
      throw new Error('Invalid email type or missing data');
    }

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);