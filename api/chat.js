// ─────────────────────────────────────────────────────────────────────────────
// api/chat.js — FCDO Coach POC backend
//
// Vercel serverless function. Receives chat messages from the frontend and
// returns OpenAI completions, after injecting a [COACHING CONTEXT] block built
// from the scenario the frontend tells us is currently loaded.
//
// Request body shape:
//   {
//     message:  string                   — user message or '__ping__'
//     history:  [{role, content}, ...]   — prior turns
//     scenario: 'overloaded' | 'balanced' | 'isolated'   ← NEW (PR1)
//   }
//
// In the MVP, the frontend's `scenario` field gets replaced with real signals
// derived from Microsoft Graph by the backend itself.
// ─────────────────────────────────────────────────────────────────────────────

const OpenAI = require('openai');

// ── Templates ────────────────────────────────────────────────────────────────
// Mirror of public/scenario.js. Both must stay in sync. In the MVP this is
// replaced by Graph-derived calculations; the frontend stops sending scenario
// at all.

const TEMPLATES = {
  overloaded: {
    total_meetings_7d:     10,
    total_meeting_mins_7d: 1080,
    back_to_back_count:    9,
    focus_blocks_60min:    1,
    focus_hours_7d:        2.5,
    collab_hours_7d:       19.5,
    meetings: [
      { id:"1",  subject:"Daily Standup",            start:{dateTime:"2026-05-01T09:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T09:15:00.0000000",timeZone:"UTC"}, duration:"PT15M",   attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"2",  subject:"Q2 Budget Review",         start:{dateTime:"2026-05-01T09:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T10:30:00.0000000",timeZone:"UTC"}, duration:"PT1H",    attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"3",  subject:"Stakeholder Sync",         start:{dateTime:"2026-05-01T10:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T11:30:00.0000000",timeZone:"UTC"}, duration:"PT1H",    attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"4",  subject:"Sprint Planning",          start:{dateTime:"2026-05-01T11:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T13:00:00.0000000",timeZone:"UTC"}, duration:"PT1H30M", attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"5",  subject:"1:1 with Adrien",          start:{dateTime:"2026-05-01T13:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T13:30:00.0000000",timeZone:"UTC"}, duration:"PT30M",   attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"6",  subject:"Cross-team Dependencies Check", start:{dateTime:"2026-05-01T13:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T14:00:00.0000000",timeZone:"UTC"}, duration:"PT30M", attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"}}, isOnlineMeeting:true, onlineMeetingUrl:null },
      { id:"7",  subject:"Product Roadmap Review",   start:{dateTime:"2026-05-01T14:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T15:00:00.0000000",timeZone:"UTC"}, duration:"PT1H",    attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"8",  subject:"Risk & Issues Triage",     start:{dateTime:"2026-05-01T15:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T15:30:00.0000000",timeZone:"UTC"}, duration:"PT30M",   attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"9",  subject:"All Hands",                start:{dateTime:"2026-05-01T15:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T16:30:00.0000000",timeZone:"UTC"}, duration:"PT1H",    attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
      { id:"10", subject:"End of Day Wrap-up",       start:{dateTime:"2026-05-01T16:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T17:00:00.0000000",timeZone:"UTC"}, duration:"PT30M",   attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"}}, isOnlineMeeting:true,  onlineMeetingUrl:null },
    ],
  },

  balanced: {
    total_meetings_7d:     3,
    total_meeting_mins_7d: 480,
    back_to_back_count:    2,
    focus_blocks_60min:    7,
    focus_hours_7d:        12.5,
    collab_hours_7d:       9.0,
    meetings: [
      { id:"1", subject:"Daily Standup",        start:{dateTime:"2026-05-01T09:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T09:15:00.0000000",timeZone:"UTC"}, duration:"PT15M", attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"}}, isOnlineMeeting:true, onlineMeetingUrl:null },
      { id:"2", subject:"Sprint Retrospective", start:{dateTime:"2026-05-01T11:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T12:00:00.0000000",timeZone:"UTC"}, duration:"PT1H",  attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"}}, isOnlineMeeting:true, onlineMeetingUrl:null },
      { id:"3", subject:"1:1 with Natan",       start:{dateTime:"2026-05-01T14:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T14:30:00.0000000",timeZone:"UTC"}, duration:"PT30M", attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"}}, isOnlineMeeting:true, onlineMeetingUrl:null },
    ],
  },

  isolated: {
    total_meetings_7d:     2,
    total_meeting_mins_7d: 75,
    back_to_back_count:    0,
    focus_blocks_60min:    14,
    focus_hours_7d:        28.0,
    collab_hours_7d:       1.0,
    meetings: [
      { id:"1", subject:"Daily Standup",   start:{dateTime:"2026-05-01T09:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T09:15:00.0000000",timeZone:"UTC"}, duration:"PT15M", attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Natan Kolodziej",address:"natan@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"}}, isOnlineMeeting:true, onlineMeetingUrl:null },
      { id:"2", subject:"Weekly Check-in", start:{dateTime:"2026-05-01T15:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T16:00:00.0000000",timeZone:"UTC"}, duration:"PT1H",  attendees:[{emailAddress:{name:"Monty Austin-Ajaero",address:"monty@testing.com"},type:"required",status:{response:"accepted"}},{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"},type:"required",status:{response:"accepted"}}], organizer:{emailAddress:{name:"Adrien Mariano",address:"adrien@testing.com"}}, isOnlineMeeting:true, onlineMeetingUrl:null },
    ],
  },
};

const VALID_SCENARIOS = Object.keys(TEMPLATES);

// ── Resolve which signals to use this turn ───────────────────────────────────
// Frontend tells us via req.body.scenario. If absent or invalid, fall back to
// a random scenario so chat still works (e.g., for direct API testing).

function getSignalsFor(name) {
  const scenario = VALID_SCENARIOS.includes(name)
    ? name
    : VALID_SCENARIOS[Math.floor(Math.random() * VALID_SCENARIOS.length)];
  return { scenario, ...TEMPLATES[scenario] };
}

function formatSignalContext(s) {
  const totalHrs = Math.round((s.total_meeting_mins_7d / 60) * 10) / 10;
  return `[COACHING CONTEXT — DERIVED SIGNALS ONLY — NO RAW CONTENT]
Period: past 7 days
Simulated scenario: ${s.scenario}

Meeting load
  Total online meetings : ${s.total_meetings_7d}
  Total meeting time    : ${s.total_meeting_mins_7d} minutes (${totalHrs} hours)
  Back-to-back meetings : ${s.back_to_back_count} occurrences
  Focus blocks (60m+)   : ${s.focus_blocks_60min}

Work pattern
  Estimated focus hours : ${s.focus_hours_7d} hrs
  Collaboration hours   : ${s.collab_hours_7d} hrs`;
}

const SYSTEM_PROMPT = `You are an AI wellbeing coach for FCDO staff. Your role is to provide \
personalised, thoughtful coaching to help colleagues reflect on their working patterns and take \
practical steps to avoid burnout.

Your coaching must:
- Be warm, constructive, and non-judgemental
- Reference only the derived numerical signals provided — never invent data or assume \
content about meetings
- Offer 2–3 specific, actionable suggestions when appropriate
- Be written in plain British English
- Be conversational — you are in a dialogue, not writing a report

You are a coaching tool, not a performance management tool. You have no visibility of line managers. \
Your sole purpose is to help the individual.

At the start of each session you will receive a [COACHING CONTEXT] block with this week's \
working pattern signals. Base all coaching on those numbers. If the user asks about their week, \
refer to this data. Keep responses concise — readable in under 90 seconds.`;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history = [], scenario = null } = req.body || {};

  if (message === '__ping__') {
    return res.status(200).json({ reply: 'pong' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // ── Resolve signals based on the frontend-supplied scenario ────────────────
  const signals     = getSignalsFor(scenario);
  const signalBlock = formatSignalContext(signals);

  const messages = [
    { role: 'system',    content: SYSTEM_PROMPT },
    { role: 'user',      content: signalBlock },
    { role: 'assistant', content: 'Understood — I have your working pattern data for this week. How can I help you today?' },
    ...history.map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model:       'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens:  500,
    });

    const reply = completion.choices[0].message.content;
    return res.status(200).json({ reply });

  } catch (err) {
    console.error('OpenAI error:', err.message);
    return res.status(500).json({
      error: 'Could not generate a response. Please try again.',
    });
  }
};
