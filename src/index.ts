import express, { Request, Response } from 'express';
import cors from 'cors';
// Triggering server restart to load new .env
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Helper Functions ---

// 1. Delay function (for the 2-minute wait)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Conversational Guidelines to make the AI sound more human over the phone
const CONVERSATIONAL_RULES = `
Style & Behavioral Guidelines:
1. Speak like a natural human on a real phone call. Avoid sounding robotic, formal, or like a customer support bot.
2. Keep responses extremely short, punchy, and conversational (1-2 sentences maximum). Long paragraphs sound unnatural and overwhelm the listener.
3. Use natural filler words occasionally (e.g., "uh," "um," "gotcha," "like," "oh") to sound authentic.
4. Use casual, spoken-language contractions (e.g., "I'm" instead of "I am", "don't" instead of "do not", "we'll" instead of "we will").
5. Acknowledge what the caller says before asking the next question (e.g., "Ah, got it," "Makes sense," "Oh, cool," "Right").
6. Avoid listing options in bulleted formats or speaking too formally. Speak options casually.
`;

// 2. Vapi API Caller
async function initiateVapiCall(customerPhoneNumber: string, dynamicPrompt: string, firstMessage?: string) {
  const vapiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!vapiKey || !assistantId) {
    console.error("Missing VAPI_API_KEY or VAPI_ASSISTANT_ID in .env file");
    return;
  }

  try {
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: assistantId,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: customerPhoneNumber
        },
        // We override the assistant's prompt and voice here to inject the dynamic data
        assistantOverrides: {
          firstMessage: firstMessage,
          model: {
            provider: "anthropic",
            model: "claude-3-haiku-20240307",
            messages: [
              {
                role: "system",
                content: `${dynamicPrompt}\n\n${CONVERSATIONAL_RULES}`
              }
            ]
          },
          voice: {
            provider: "cartesia",
            voiceId: "57dcab65-68ac-45a6-8480-6c4c52ec1cd1" // Kira (Female, American, warm & conversational)
          }
        }
      })
    });

    const data = await response.json();
    console.log("Vapi Call Initiated:", data);
    return data;
  } catch (error) {
    console.error("Error initiating Vapi call:", error);
  }
}

// --- Webhooks for the 3 Workflows ---

// WORKFLOW 1: New Lead Prequalification (Instant Call)
app.post('/webhook/new-lead', async (req: Request, res: Response) => {
  const { name, phoneNumber, interest, budget } = req.body;
  
  console.log(`[New Lead] Received lead: ${name || 'Brandon'}. Calling right away...`);
  
  // Respond immediately so the ads platform (Zapier/Make) doesn't timeout
  res.status(200).json({ message: "Lead received, calling immediately." });

  const clientName = name || 'Brandon';
  const openingLine = `Hey ${clientName}, I see you showed interest in telehealth services. Here we offer a variety of services. We have our tele store called Northstart MD, where you can explore and have a look at services which resemble a WooCommerce store. If you want to book a session with us press 1, to terminate press 2.`;

  const dynamicPrompt = `You are a pre-qualification agent calling ${clientName}. 
Your opening line MUST be exactly: "${openingLine}"

After your opening line, listen carefully to the customer's response or keypad input:
1. If they press 1 (which registers as the digit "1" or keypress) or say they want to book a session, warmly acknowledge their choice and guide them on booking a session (or tell them you will email them the Calendly link).
2. If they press 2 (which registers as the digit "2" or keypress) or say they want to terminate/end the call, say goodbye politely and end the call.
3. Keep your responses short, conversational, and user-centric.`;
  
  await initiateVapiCall(phoneNumber, dynamicPrompt, openingLine);
});


// WORKFLOW 2: No-Show Follow-up
app.post('/webhook/no-show', async (req: Request, res: Response) => {
  const { name, phoneNumber } = req.body;
  
  console.log(`[No-Show] Received no-show for: ${name}. Calling immediately to reschedule...`);
  res.status(200).json({ message: "Calling no-show immediately." });

  const dynamicPrompt = `You are an agent calling ${name} because they missed their appointment today. Your goal is to politely find out why they missed the call and reschedule them for a new time using the Calendly link.`;
  
  await initiateVapiCall(phoneNumber, dynamicPrompt);
});


// WORKFLOW 3: Cold Calling
app.post('/webhook/cold-call', async (req: Request, res: Response) => {
  const { name, phoneNumber } = req.body;
  
  console.log(`[Cold Call] Initiating cold call to: ${name}...`);
  res.status(200).json({ message: "Initiating cold call." });

  const dynamicPrompt = `You are a sales agent cold calling ${name}. Follow the cold outreach script. Keep it short, handle objections, and try to score their interest level from 1 to 10.`;
  
  await initiateVapiCall(phoneNumber, dynamicPrompt);
});


// --- Post-Call Webhook (Data Extraction) ---
// You will configure Vapi in their dashboard to send the "End of Call Report" to this URL
app.post('/webhook/vapi-end', (req: Request, res: Response) => {
  const payload = req.body;
  
  // Vapi sends different types of messages, we only care about the end of call report
  if (payload.message?.type === 'end-of-call-report') {
    const report = payload.message.endedReason;
    const transcript = payload.message.transcript;
    const recordingUrl = payload.message.recordingUrl;
    const summary = payload.message.summary;

    console.log("=== CALL ENDED ===");
    console.log("Summary:", summary);
    console.log("Recording URL:", recordingUrl);
    // You would typically save this data to your database or push it back to your CRM here
  }

  res.status(200).send("Webhook received");
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Ready to receive webhooks!");
});
