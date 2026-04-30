const OpenAI = require('openai');

function getDailySignals() {
  const d = new Date();
  const seed = d.getFullYear() * 365 + d.getMonth() * 31 + d.getDate();

  function sr(n) {
    const x = Math.sin(seed * 9301 + n * 49297 + 233) * 73214;
    return x - Math.floor(x);
  }

  const scenarios = ['overloaded', 'balanced', 'isolated'];
  const scenario  = scenarios[Math.floor(sr(0) * 3)];

  const ri = (min, max, n) => Math.floor(sr(n) * (max - min + 1)) + min;
  const rf = (min, max, n) => Math.round((sr(n) * (max - min) + min) * 10) / 10;

  const templates = {
    overloaded: {
      total_meetings_7d:     ri(18, 26, 1),
      total_meeting_mins_7d: ri(900, 1200, 2),
      back_to_back_count:    ri(7, 12, 3),
      focus_blocks_60min:    ri(0, 2, 4),
      focus_hours_7d:        rf(1.5, 4.0, 5),
      collab_hours_7d:       rf(16.0, 22.0, 6),
    },
    balanced: {
      total_meetings_7d:     ri(8, 14, 1),
      total_meeting_mins_7d: ri(400, 600, 2),
      back_to_back_count:    ri(1, 4, 3),
      focus_blocks_60min:    ri(5, 9, 4),
      focus_hours_7d:        rf(10.0, 15.0, 5),
      collab_hours_7d:       rf(6.0, 12.0, 6),
    },
    isolated: {
      total_meetings_7d:     ri(1, 4, 1),
      total_meeting_mins_7d: ri(40, 120, 2),
      back_to_back_count:    0,
      focus_blocks_60min:    ri(10, 18, 4),
      focus_hours_7d:        rf(22.0, 32.0, 5),
      collab_hours_7d:       rf(0.5, 2.0, 6),
    },
  };

  return { scenario, ...templates[scenario] };
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

  const { message, history = [] } = req.body;

  if (message === '__ping__') {
    return res.status(200).json({ reply: 'pong' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const signals     = getDailySignals();
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