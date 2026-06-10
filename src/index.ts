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

// 2. Vapi API Caller
async function initiateVapiCall(customerPhoneNumber: string, dynamicPrompt: string) {
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
        // We override the assistant's prompt here to inject the dynamic data
        assistantOverrides: {
          model: {
            provider: "anthropic",
            model: "claude-3-haiku-20240307",
            messages: [
              {
                role: "system",
                content: dynamicPrompt
              }
            ]
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

// WORKFLOW 1: New Lead Prequalification (2-Minute Delay)
app.post('/webhook/new-lead', async (req: Request, res: Response) => {
  const { name, phoneNumber, interest, budget } = req.body;
  
  console.log(`[New Lead] Received lead: ${name}. Waiting 2 minutes before calling...`);
  
  // Respond immediately so the ads platform (Zapier/Make) doesn't timeout
  res.status(200).json({ message: "Lead received, call scheduled in 2 minutes." });

  // Wait 2 minutes (120,000 milliseconds)
  // For testing purposes, you can change this to 10 seconds (10000)
  const delayMs = 120000; 
  await wait(delayMs);

  console.log(`[New Lead] 2 minutes passed. Initiating call to ${name}...`);

  const dynamicPrompt = `You are a pre-qualification agent calling ${name}. They showed interest in ${interest}. Their stated budget is ${budget}. Ask them 3 pre-qualification questions to see if they are a good fit. If they are, offer to book them on the Calendly.`;
  
  await initiateVapiCall(phoneNumber, dynamicPrompt);
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
