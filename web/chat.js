// Chatting with Barry and Nom: each one is his own Claude call (Claude Haiku 5.5: quick and very cheap) with his own personality.
// One answers first, then the other sees that and may chip in or stay quiet. Their lines go into the scene's speech
// bubbles with matching faces (window.sayLines), and they can start an activity when asked.
// The API key is the user's own, kept only in this browser's storage; it is sent only to Anthropic.
import Anthropic from '@anthropic-ai/sdk';
import { PERSONAS, FACES, ACTIVITIES, COSTUMES } from '../scene/src/personas.js';

const MODEL = 'claude-haiku-5-5';
const NAME = { B: 'Barry', N: 'Nom' };
// (each reply also says which activity to start and whether to dress up: see REQUESTS in personas.js)
const history = [];            // [{ who: 'You' | 'Barry' | 'Nom', text }], the last few lines only (keeps every call small)
const KEEP = 14;

const schema = (who) => ({
  type: 'object',
  properties: {
    say: { type: 'string', description: 'Your line, or "" to stay quiet' },
    face: { type: 'string', enum: FACES[who] },
    activity: { type: 'string', enum: ACTIVITIES },
    costume: { type: 'string', enum: COSTUMES },
  },
  required: ['say', 'face', 'activity', 'costume'],
  additionalProperties: false,
});

function describeScene(s, userName) {
  const when = s.hour < 5 ? 'the middle of the night' : s.hour < 12 ? 'morning' : s.hour < 17 ? 'afternoon' : s.hour < 21 ? 'evening' : 'late at night';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const bits = [`It's ${days[s.weekday]} ${when} (${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}), ${s.date}/${s.month}.`];
  if (s.month === 10 && s.date >= 24) bits.push("It's Halloween week.");
  if (s.costume) bits.push(`You're both dressed up as ${s.costume === 'captain' ? 'starship captains' : s.costume + 's'}.`);
  if (s.festive) bits.push("It's the festive season: Santa hats and a little tree.");
  if (s.weather) bits.push(`Weather where the user is: ${s.weather.temp}°C${s.rain ? ', raining' : ''}${s.hot ? ' (hot: sunglasses and iced coffee)' : ''}${s.cold ? ' (cold: scarves on)' : ''}.`);
  if (s.activity) bits.push(`Right now you're in the middle of: ${{ toast: 'a toast', croc: 'a Greg cuddle', story: "Barry's story time", refill: 'a coffee top-up', movie: 'movie night', presents: 'opening presents' }[s.activity] || s.activity}.`);
  const mood = nomOfTheDay(s);
  if (mood) bits.push(`Nom seems to be in a ${mood} mood today (he might drift in and out of it).`);
  if (userName) bits.push(`The user likes to be called ${userName}.`);
  return bits.join(' ');
}

// a different side of Nom some days (the same all day, so it doesn't flip every message); plain Nom on the others
function nomOfTheDay(s) {
  const moods = [null, null, null, 'Business Nom', 'Goth Nom', 'Nurse Nom'];
  return moods[((s.month * 37 + s.date) * 7919) % moods.length];
}

// short bubbles: split a reply into sentence-sized lines (the scene shows one bubble per line)
function bubbles(text) {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*["')]?\s*/g) || [text];
  const out = [];
  for (const p of parts.map(x => x.trim()).filter(Boolean)) {
    if (out.length && (out[out.length - 1] + ' ' + p).length <= 34) out[out.length - 1] += ' ' + p; else out.push(p);
  }
  return out.slice(0, 3);
}
const line = (who, text, face) => who === 'B' ? ['B', text, face, 'normal'] : ['N', text, 'normal', face];

async function ask(client, who, userName) {
  const transcript = history.map(h => `${h.who}: ${h.text}`).join('\n');
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(who) } },
    system: PERSONAS[who],
    messages: [{ role: 'user', content: `${describeScene(window.sceneState(), userName)}\n\nThe conversation so far:\n${transcript}\n\nYour turn, ${NAME[who]}.` }],
  });
  if (res.stop_reason === 'refusal') return { say: who === 'B' ? "Let's talk about something else, huh?" : 'Hmm! New topic?', face: 'normal', activity: 'none' };
  const text = res.content.find(b => b.type === 'text');
  return JSON.parse(text ? text.text : '{}');
}

// who should answer first: whoever was named, Nom for space and Greg things, otherwise mostly Barry
function firstSpeaker(msg) {
  const m = msg.toLowerCase();
  const b = /\bbarry\b/.test(m), n = /\bnom\b/.test(m);
  if (b !== n) return b ? 'B' : 'N';
  if (/\b(greg|croc|space|star|stars|planet|moon|alien|universe|galaxy|rocket)\b/.test(m)) return 'N';
  return Math.random() < 0.6 ? 'B' : 'N';
}

let busy = false;
/** the user said something; resolves when both have had their say */
export async function talk(msg, { apiKey, userName }) {
  msg = msg.trim().slice(0, 300);
  if (!msg || busy) return;
  busy = true;
  try {
    if (!apiKey) {
      window.sayLines([line('B', "We'd love a chat!", 'happy'), line('N', 'Add a chat key in the ☕ menu!', 'curious')]);
      return;
    }
    history.push({ who: userName || 'You', text: msg }); history.splice(0, Math.max(0, history.length - KEEP));
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    const first = firstSpeaker(msg), second = first === 'B' ? 'N' : 'B';
    let then = null;
    for (const who of [first, second]) {
      const r = await ask(client, who, userName);
      const say = (r.say || '').trim();
      if (r.activity && r.activity !== 'none' && !then) then = r.activity;
      if (r.costume && r.costume !== 'none') window.wearCostume(r.costume === 'off' ? null : r.costume);   // poof!
      if (!say) continue;
      history.push({ who: NAME[who], text: say });
      window.sayLines(bubbles(say).map(t => line(who, t, FACES[who].includes(r.face) ? r.face : 'normal')));
    }
    if (then) window.sayLines([], then);   // starts once they've both finished talking
  } catch (e) {
    const key = e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError;
    const limit = e instanceof Anthropic.RateLimitError;
    window.sayLines(key ? [line('B', "That key doesn't seem to work.", 'normal'), line('N', 'Check it in the ☕ menu?', 'curious')]
      : limit ? [line('N', 'Too much talking! Phew.', 'groan'), line('B', 'Give us a minute, pal.', 'sleepy')]
      : [line('B', 'Line\'s a bit crackly…', 'normal'), line('N', 'Try again in a sec?', 'curious')]);
  } finally {
    busy = false;
  }
}
export const isBusy = () => busy;
