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

// a safety net for Nom slipping into talking about himself by name (Barry does that on purpose): in his own line his name
// can only mean himself, so it becomes "I" (doing something), "me" (having something done to him) or "my"/"I've" ("Barry's…")
const BE = { is: 'am', was: 'was', has: 'have', does: 'do', "doesn't": "don't", "isn't": "am not", "wasn't": "wasn't", "hasn't": "haven't" };
const LEADS = new Set(['and', 'but', 'so', 'then', 'because', 'when', 'if', 'that', 'oh', 'ah', 'well', 'now', 'yes', 'sure']);
const toI = (verb) => BE[verb] || (/s$/.test(verb) && !/ss$/.test(verb)
  ? verb.replace(/ies$/, 'y').replace(/(ss|sh|ch|x|z|o)es$/, '$1').replace(/([^s])s$/, '$1') : verb);
function firstPerson(who, text) {
  const name = NAME[who], t = text.split(/(\s+)/), prevWord = (i) => { for (let j = i - 2; j >= 0; j -= 2) if (t[j]) return t[j]; return ''; };
  for (let i = 0; i < t.length; i += 2) {
    const m = t[i].match(new RegExp(`^(["'(]?)${name}('s)?([.,!?…:;"')]*)$`));
    if (!m) continue;
    const prev = prevWord(i), start = !prev || /[.!?…]["')]*$/.test(prev);
    if (!start && /^[A-Z]/.test(prev) && !/[,;:]$/.test(prev)) continue;          // a persona name: "Business Nom", "Goth Nom"
    const subject = start || /[,;:]$/.test(prev) || LEADS.has(prev.toLowerCase());
    const next = t[i + 2] || '', cap = (w) => (start ? w[0].toUpperCase() + w.slice(1) : w);
    if (m[2]) {                                                                  // "Barry's"
      if (!m[3] && /^(got|been)$/.test(next)) t[i] = `${m[1]}I've`; else t[i] = m[1] + cap('my') + m[3];
    } else if (subject && !m[3] && /^[a-z']+$/.test(next)) { t[i] = `${m[1]}I`; t[i + 2] = toI(next); }
    else t[i] = m[1] + (subject && m[3] && !/^[,]/.test(m[3]) ? 'I' : cap('me')) + m[3];
  }
  return t.join('');
}

// and the other way round for Barry, who always talks about himself as "Barry": "I think" -> "Barry thinks",
// "I'm" -> "Barry is", "I've" -> "Barry has", "my pancakes" -> "Barry's pancakes", "me" -> "Barry"
const MODAL = new Set(['can', 'could', 'will', 'would', 'should', 'might', 'must', 'may', 'shall', 'did', 'had', 'was', "can't", "won't", "wouldn't", "couldn't", "shouldn't", "didn't", "wasn't", "hadn't"]);
const THIRD = { am: 'is', have: 'has', do: 'does', go: 'goes', "don't": "doesn't", "haven't": "hasn't", "aren't": "isn't", were: 'was', "weren't": "wasn't" };
const third = (v) => THIRD[v] || (MODAL.has(v) ? v : /(s|sh|ch|x|z|o)$/.test(v) ? v + 'es' : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'ies' : v + 's');
function thirdPerson(text) {
  return text
    .replace(/\bI'm\b/g, 'Barry is').replace(/\bI've\b/g, 'Barry has').replace(/\bI'll\b/g, 'Barry will').replace(/\bI'd\b/g, 'Barry would')
    .replace(/\bI (really |just |also |still |never |always |once |often )?([a-z']+)\b/g, (m, adv, v) => `Barry ${adv || ''}${adv ? third(v) : third(v)}`)
    .replace(/\bI\b/g, 'Barry')
    .replace(/\bmine\b/g, "Barry's").replace(/\b(me|myself)\b/g, 'Barry')
    // "my": dropped when Barry is already in the sentence ("Barry has finished pancakes"), otherwise "Barry's"
    .split(/([.!?…]\s+)/).map(sen => sen.replace(/\b([Mm])y (\w)/g, (m, c, w, at) => (/Barry/.test(sen.slice(0, at)) ? w : "Barry's " + w))).join('');
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
    messages: [{ role: 'user', content: `${describeScene(window.sceneState(), userName)}\n\nThe conversation so far:\n${transcript}\n\n${(v => v ? v + '\n\n' : '')(variety(who))}Your turn, ${NAME[who]}. ${who === 'B' ? 'Remember: Barry always talks about himself as "Barry", never "I".' : 'Speak as yourself: "I", never "Nom".'}` }],
  });
  if (res.stop_reason === 'refusal') return { say: who === 'B' ? "Barry thinks it's time for nap." : 'Hmm! New topic?', face: 'normal', activity: 'none' };
  const text = res.content.find(b => b.type === 'text');
  return JSON.parse(text ? text.text : '{}');
}

// A little variety for each reply, so they don't keep reaching for the same stories: usually nothing in particular,
// sometimes a moment from Barry's long life (a random one each time), and only now and then Nom's mysterious origins.
const HISTORY = ['the Sydney Harbour Bridge opening in 1932', 'Prohibition in 1920s Chicago', 'the Hindenburg flights in the 1930s',
  'the first televised Olympics, 1936', 'the opening of the Golden Gate Bridge, 1937', 'the first McDonald\'s, 1948',
  'the climb of Everest, 1953', 'the opening of Disneyland, 1955', 'the first Elvis records, 1954', 'the Sydney Opera House build',
  'the Beatles in Hamburg, 1960', 'the first James Bond film shoot, 1962', 'the 1966 World Cup final', 'Woodstock, 1969',
  'the first jumbo jet flight, 1970', 'the first email, 1971', 'the first Star Wars premiere, 1977', 'the first Rubik\'s Cube, 1974',
  'the Concorde\'s first passenger flight, 1976', 'the Sony Walkman launch, 1979', 'the first Pac-Man arcade, 1980',
  'Live Aid, 1985', 'the first Nintendo in America, 1985', 'Halley\'s Comet, 1986', 'the first website, 1991',
  'the Channel Tunnel opening, 1994', 'Dolly the sheep, 1996', 'the Sydney 2000 Olympics', 'the first iPod, 2001',
  'the first Harry Potter film premiere, 2001', 'the 1928 Tour de France', 'the invention of sliced bread, 1928',
  'Mickey Mouse\'s first cartoon, 1928', 'the first Monopoly sets, 1935', 'the first ballpoint pens, 1945',
  'the first Polaroid camera, 1948', 'the first credit card dinner, 1950', 'Sputnik, 1957', 'the first Barbie doll, 1959',
  'the first Moog synthesiser, 1964', 'the first Earth Day, 1970', 'the first video game console, 1972'];
const FORTUNES = [ 'a diner he opened by accident', 'a hat business that took off for no reason', 'shares in a company he thought made honey',
  'a racehorse he bought because it looked sleepy', 'a patent for a very comfortable chair', 'a gold mine he bought as a picnic spot',
  'an umbrella shop in a very rainy year', 'a toy he invented while bored'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function variety(who) {
  if (who !== 'B') return Math.random() < 0.01 ? 'If it fits, this is a rare good moment for Nom to mention where he might be from (New York? space? Space New York?).' : '';
  // Barry's stories are rare: at most one offered a day (remembered on this device)
  const today = new Date().toDateString();
  let last = null; try { last = localStorage.getItem('buddies.storyDay'); } catch (e) {}
  if (last !== today && Math.random() < 0.25) {
    try { localStorage.setItem('buddies.storyDay', today); } catch (e) {}
    return Math.random() < 0.7
      ? `Today's one story, if it fits naturally: Barry might mention he was around for ${pick(HISTORY)}. Briefly, the Barry way.`
      : `Today's one story, if it fits naturally: Barry might mention ${pick(FORTUNES)} (lost it all in Vegas).`;
  }
  const r = Math.random();
  if (r < 0.04) return 'Barry is thinking about pancakes, if that fits. No stories about his past.';
  if (r < 0.16) return `Barry is thinking about ${pick(['a nap', 'the comfortable chair', 'his coffee', 'the weather', 'how nice it is having Nom around', 'a quiet afternoon'])}, if that fits. No stories about his past, and no pancakes.`;
  return 'No stories about Barry\'s past this time (unless the user asks), and no pancakes: just answer as Barry.';
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
      window.sayLines([line('B', 'Barry would like chat.', 'happy'), line('N', 'Add a chat key in the ☕ menu!', 'curious')]);
      return;
    }
    history.push({ who: userName || 'You', text: msg }); history.splice(0, Math.max(0, history.length - KEEP));
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    const first = firstSpeaker(msg), second = first === 'B' ? 'N' : 'B';
    let then = null;
    for (const who of [first, second]) {
      const r = await ask(client, who, userName);
      const say = who === 'N' ? firstPerson(who, (r.say || '').trim()) : thirdPerson((r.say || '').trim());   // (Nom says "I", Barry says "Barry")
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
    window.sayLines(key ? [line('B', 'Barry thinks key is wrong.', 'normal'), line('N', 'Check it in the ☕ menu?', 'curious')]
      : limit ? [line('N', 'Too much talking! Phew.', 'groan'), line('B', 'Barry needs minute.', 'sleepy')]
      : [line('B', 'Barry can\'t hear. Line is crackly.', 'normal'), line('N', 'Try again in a sec?', 'curious')]);
  } finally {
    busy = false;
  }
}
export const isBusy = () => busy;
