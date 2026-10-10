// netlify/functions/tts.js
// Serverless proxy to ElevenLabs Text-to-Speech.
// Keeps the API key on the server — never exposed to the browser.
//
// Required environment variable (set in Netlify dashboard, NOT in code):
//   ELEVENLABS_API_KEY = your secret key
//
// Optional environment variable to override the default voice:
//   ELEVENLABS_VOICE_ID = a voice ID from your ElevenLabs "Voices" library
//   (defaults to "Rachel", a built-in ElevenLabs voice good for narration)

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // ElevenLabs "Rachel" voice
const MODEL_ID = 'eleven_monolingual_v1'; // English-only model (fast, cheap)
const MAX_CHARS = 2000; // safety cap per request to control cost/latency

exports.handler = async function (event) {
  // CORS / method guard
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server is not configured with an ElevenLabs API key.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body.' }),
    };
  }

  const text = (payload.text || '').toString().trim();
  if (!text) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing "text" field.' }),
    };
  }
  if (text.length > MAX_CHARS) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Text too long. Max ${MAX_CHARS} characters per request.` }),
    };
  }

  const voiceId = (payload.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID).toString();

  try {
    const elevenResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!elevenResp.ok) {
      const errText = await elevenResp.text().catch(() => '');
      return {
        statusCode: elevenResp.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ElevenLabs request failed.',
          status: elevenResp.status,
          detail: errText.slice(0, 500),
        }),
      };
    }

    const arrayBuffer = await elevenResp.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        audio: base64Audio,
        mime: 'audio/mpeg',
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unexpected error calling ElevenLabs.', detail: String(err) }),
    };
  }
};
