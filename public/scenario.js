// ─────────────────────────────────────────────────────────────────────────────
// scenario.js — Shared scenario state for the FCDO Coach POC frontend
//
// One file is the source of truth for "which simulated working pattern is the
// user currently exploring?" Lives in /public/ so Vite serves it at /scenario.js.
//
// Loaded from every HTML page via:   <script src="/scenario.js"></script>
//
// Globals it exposes:
//   window.currentScenario   → 'overloaded' | 'balanced' | 'isolated'
//   window.signals           → the resolved signal object for the current scenario
//   window.rerollScenario()  → switch to a *different* scenario, fire event
//
// Event fired on reroll:
//   'scenariochanged' on window, detail = { scenario, signals }
//   Pages should listen for this and re-render their panels.
//
// Storage:
//   sessionStorage['current_scenario']  → survives refresh, resets on new tab
//
// This file is duplicated across frontend (here) and backend (api/chat.js).
// In the MVP both will be replaced by real Microsoft Graph data.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const STORAGE_KEY = 'current_scenario';
  const SCENARIOS = ['overloaded', 'balanced', 'isolated'];

  // ── Templates ──────────────────────────────────────────────────────────────
  // Mirror of the templates in api/chat.js. Both must stay in sync.
  // Kept as static canonical examples (not re-randomised per call) so signal
  // values stay stable across refreshes within the same session.

  const TEMPLATES = {
    overloaded: {
      total_meetings_7d:     10,
      total_meeting_mins_7d: 1080,
      back_to_back_count:    9,
      focus_blocks_60min:    1,
      focus_hours_7d:        2.5,
      collab_hours_7d:       19.5,
      meetings: [
        { id:"1",  subject:"Daily Standup",            start:{dateTime:"2026-05-01T09:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T09:15:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"2",  subject:"Q2 Budget Review",         start:{dateTime:"2026-05-01T09:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T10:30:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"3",  subject:"Stakeholder Sync",         start:{dateTime:"2026-05-01T10:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T11:30:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"4",  subject:"Sprint Planning",          start:{dateTime:"2026-05-01T11:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T13:00:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"5",  subject:"1:1 with Adrien",          start:{dateTime:"2026-05-01T13:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T13:30:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"6",  subject:"Cross-team Dependencies",  start:{dateTime:"2026-05-01T13:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T14:00:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}}] },
        { id:"7",  subject:"Product Roadmap Review",   start:{dateTime:"2026-05-01T14:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T15:00:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"8",  subject:"Risk & Issues Triage",     start:{dateTime:"2026-05-01T15:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T15:30:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"9",  subject:"All Hands",                start:{dateTime:"2026-05-01T15:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T16:30:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"10", subject:"End of Day Wrap-up",       start:{dateTime:"2026-05-01T16:30:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T17:00:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
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
        { id:"1", subject:"Daily Standup",        start:{dateTime:"2026-05-01T09:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T09:15:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"2", subject:"Sprint Retrospective", start:{dateTime:"2026-05-01T11:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T12:00:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"3", subject:"1:1 with Natan",       start:{dateTime:"2026-05-01T14:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T14:30:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}}] },
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
        { id:"1", subject:"Daily Standup",   start:{dateTime:"2026-05-01T09:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T09:15:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Natan Kolodziej"}},{emailAddress:{name:"Adrien Mariano"}}] },
        { id:"2", subject:"Weekly Check-in", start:{dateTime:"2026-05-01T15:00:00.0000000",timeZone:"UTC"}, end:{dateTime:"2026-05-01T16:00:00.0000000",timeZone:"UTC"}, attendees:[{emailAddress:{name:"Monty Austin-Ajaero"}},{emailAddress:{name:"Adrien Mariano"}}] },
      ],
    },
  };

  // ── Pickers ────────────────────────────────────────────────────────────────

  function pickRandom() {
    return SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
  }

  // For reroll: pick a scenario different from the current one. With three
  // scenarios this guarantees the demo always changes visibly when rerolled.
  function pickDifferent(current) {
    const others = SCENARIOS.filter(s => s !== current);
    return others[Math.floor(Math.random() * others.length)];
  }

  // ── Initial load ───────────────────────────────────────────────────────────
  // Read from sessionStorage; if absent or invalid, pick a fresh random one.

  function load() {
    let s = null;
    try { s = sessionStorage.getItem(STORAGE_KEY); } catch (_) { /* private mode */ }

    if (!s || !SCENARIOS.includes(s)) {
      s = pickRandom();
      try { sessionStorage.setItem(STORAGE_KEY, s); } catch (_) {}
    }

    apply(s);
  }

  function apply(scenarioName) {
    window.currentScenario = scenarioName;
    window.signals         = { scenario: scenarioName, ...TEMPLATES[scenarioName] };
  }

  // ── Public reroll ──────────────────────────────────────────────────────────
  // Called from the Settings page demo controls. Picks a different scenario,
  // persists it, and notifies all listening panels so they re-render.

  window.rerollScenario = function () {
    const next = pickDifferent(window.currentScenario);
    try { sessionStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    apply(next);
    window.dispatchEvent(new CustomEvent('scenariochanged', {
      detail: { scenario: next, signals: window.signals },
    }));
    return next;
  };

  // ── Boot ───────────────────────────────────────────────────────────────────
  load();
})();
