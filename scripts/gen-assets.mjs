// AURA v2 asset generator
//  - 360 image memes (SVG): 90 hand-curated + 270 format/template combos
//  - 120 video reels (ffmpeg gradients + star overlays) with real meme captions
//  - emits lib/server/meme-assets.json consumed by the seed
import zlib from "zlib";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const PUB = path.join(ROOT, "public");
const MEMES_DIR = path.join(PUB, "memes");
const VIDEOS_DIR = path.join(PUB, "videos");
for (const d of [MEMES_DIR, VIDEOS_DIR]) fs.mkdirSync(d, { recursive: true });

// clean previous generation
for (const f of fs.readdirSync(MEMES_DIR)) if (f.startsWith("meme-") || f.startsWith("reel-") || f.startsWith("img-")) fs.rmSync(path.join(MEMES_DIR, f));
for (const f of fs.readdirSync(VIDEOS_DIR)) if (f.endsWith(".mp4")) fs.rmSync(path.join(VIDEOS_DIR, f));

const C = {
  purple: "#7C4DFF", lime: "#C8FF3D", yellow: "#FFE33D", blue: "#315BEF",
  coral: "#FF6B57", black: "#080808", green: "#22A565", pink: "#FF7BAC", orange: "#FF9F1C",
};
const BGS = [C.purple, C.lime, C.yellow, C.blue, C.coral, C.green, C.pink, C.orange];
const ACCENTS = [C.lime, C.yellow, C.coral, C.purple, C.blue, C.black];

// ---------------------------------------------------------- curated memes (caption, punch, emoji, cat)
const CURATED = [
  ["Professor: the exam will be easy", "TRUST ME BRO", "📝😭", "college"],
  ["when bro says he studied for the test", "HE LIED.", "😤📚", "college"],
  ["hostel wifi at 2am hits different", "SPEED: 2KBPS", "📶🤡", "college"],
  ["me pretending to take notes so the professor thinks I'm working", "CERTIFIED NOTES", "✍️😏", "college"],
  ["one more game and then I sleep (it is 4am)", "ONE MORE GAME", "🎮🌙", "gaming"],
  ["blaming lag for losing is a personality trait", "SKILL ISSUE", "🐌🔥", "gaming"],
  ["watching one episode turns into finishing the whole season", "JUST ONE EPISODE", "🍜📺", "anime"],
  ["anime protagonists arriving late to everything like it's a personality", "MAIN CHARACTER", "🏃💨", "anime"],
  ["my team defending a 1-0 lead like their lives depend on it", "PARK THE BUS", "🧱🧤", "football"],
  ["celebrating the winner just to see the offside flag", "OFFSIDE AGAIN", "🚩⚽", "football"],
  ["it works on my machine is a valid shipping strategy", "MY MACHINE", "💻🤷", "programming"],
  ["99 little bugs in the code, take one down, 127 little bugs in the code", "99 BUGS", "🐛🎵", "programming"],
  ["5 years of experience and CSS centering still wins", "FINAL BOSS", "📐💀", "programming"],
  ["hero entering in slow motion while the villain politely waits", "HERO ENTRY", "🕶️🎬", "bollywood"],
  ["tension at its peak, time for a 7 minute song break", "SONG BREAK", "💃⏸️", "bollywood"],
  ["phone at 1% turns everyone into an olympic sprinter", "1% BATTERY", "🔋😱", "technology"],
  ["new phone day one vs after one month in my pocket", "DAY 1 VS 365", "📱✨", "technology"],
  ["monday morning standup: everyone reciting yesterday's ticket", "MONDAY STANDUP", "☕🧟", "workplace"],
  ["a quick call that could've been an email, now 47 minutes long", "QUICK CALL", "📞⏰", "workplace"],
  ["aunty detection accuracy: 99.9%, nobody escapes the society whatsapp group", "RADAR LOCKED", "👵📡", "indian"],
  ["shaadi season means the buffet is the main character", "BUFFET LOADING", "💃🍛", "indian"],
  ["chai is not a drink, it is an emotion and a personality", "CHAI > ALL", "☕🫖", "indian"],
  ["pigeons on the ledge are clearly plotting something", "PIGEONS KNOW", "🐦🧠", "chaos"],
  ["this cat has seen everything and judged everyone", "SEEN IT ALL", "🐈👁️", "chaos"],
  ["duck walking into the office like he owns the building", "CEO ENERGY", "🦆💼", "chaos"],
  ["engineering students the night before the exam", "NIGHT BEFORE", "📖🫠", "college"],
  ["engineering students 10 minutes before the exam", "10 MINS LEFT", "⏰🚨", "college"],
  ["engineering students discovering the syllabus during viva", "VIVA MODE", "🎤🫡", "college"],
  ["commerce students watching engineering students suffer", "FRONT ROW", "🍿😎", "college"],
  ["gym membership: active. me: professional couch athlete", "GYM MEMBERSHIP", "🏋️🛋️", "workplace"],
  ["syllabus week me vs finals week me", "TWO DIFFERENT PEOPLE", "🧑‍🎓🫥", "college"],
  ["group project where I do everything and we all get the same grade", "TEAMWORK", "🧑‍🤝‍🧑➡️🧍", "college"],
  ["attendance policy vs my bed, the bed is winning", "THE BED WON", "🛏️🏆", "college"],
  ["backbenchers assembling like avengers when the test starts", "ASSEMBLE", "🪑⚡", "college"],
  ["internal marks dropped and my villain arc began", "VILLAIN ARC", "😇➡️😈", "college"],
  ["respawning with full confidence and zero skill", "CONFIDENCE 100", "💀😎", "gaming"],
  ["my teammate's masterplan: run straight at them", "GENIUS PLAN", "🧠🚫", "gaming"],
  ["buying skins instead of getting good at the game", "PRIORITIES", "💸👟", "gaming"],
  ["the whole lobby going silent after one person types gg", "POST-GG SILENCE", "🤫🎮", "gaming"],
  ["trying to heal my teammate who is already across the map", "DISTANCE ISSUE", "🧑‍⚕️🗺️", "gaming"],
  ["training arc but it's just me watching training arcs", "META TRAINING", "📺💪", "anime"],
  ["powering up for 3 episodes just to miss the attack", "CHARGE TIME", "🔋💨", "anime"],
  ["the filler episode nobody skips because it's actually peak", "PEAK FILLER", "💎📺", "anime"],
  ["the opening song hits and suddenly I can do anything", "OP ENERGY", "🎵⚡", "anime"],
  ["tiki-taka but the ball immediately hits my own player", "TIKI-TAKA-OOPS", "⚽😵", "football"],
  ["the manager's masterplan is hope, pure hope", "TACTICS: HOPE", "📋🙏", "football"],
  ["clean sheet alive for 89 minutes and then heartbreak", "89TH MINUTE", "🧽💔", "football"],
  ["var checking for 4 minutes to find an offside by one toe", "VAR DRAMA", "📺🔍", "football"],
  ["reading the documentation vs pasting the error into the chat", "RESEARCH STYLE", "📄🤖", "programming"],
  ["it's not a bug, it's an undocumented feature", "FEATURE", "🐛✨", "programming"],
  ["refactoring at 2am, reverting everything at 9am", "FULL CIRCLE", "🔄🌅", "programming"],
  ["my code works and I refuse to investigate why", "SACRED CODE", "🙏💻", "programming"],
  ["the test only passes when I watch it run", "AUDIENCE REQUIRED", "👀✅", "programming"],
  ["background dancers appearing from nowhere and that's completely canon", "DANCE SQUAD", "💃🌀", "bollywood"],
  ["hero gets shot in the shoulder and walks it off for 3 hours", "FLESH WOUND", "🩹💪", "bollywood"],
  ["villain monologue giving the hero enough time for a full comeback", "THANKS FOR WAITING", "🎤⏳", "bollywood"],
  ["wifi speed drops the exact moment the video call starts", "CALL DETECTED", "📶📉", "technology"],
  ["starting a software update at 3% battery, pure gamble", "THE GAMBLE", "🔄🔋", "technology"],
  ["bluetooth device not found while it sits right next to me", "PAIRING RITUAL", "🎧❓", "technology"],
  ["cloud storage full of screenshots I will never see again", "DIGITAL ATTIC", "☁️📦", "technology"],
  ["reply all was a choice and it was absolutely the wrong one", "REPLY ALL", "📧😱", "workplace"],
  ["correcting my own typo in a follow-up email, full shame", "CORRECTION EMAIL", "✉️🙈", "workplace"],
  ["team building event where fun is mandatory, therefore not fun", "FORCED FUN", "🎉🫠", "workplace"],
  ["salary day joy vs day 29 reality of the month", "WEALTH CYCLE", "💰📉", "workplace"],
  ["the printer senses my deadline and chooses violence", "PRINTER SENSES", "🖨️😈", "workplace"],
  ["guests arriving exactly at lunch time, every single time", "SIXTH SENSE", "🔔🍛", "indian"],
  ["mom says bring one plate and means set the table for ten", "PLATE MATH", "🍽️📦", "indian"],
  ["missing calls like it's an olympic sport I trained for", "GOLD IN MISSED CALLS", "📵🥇", "indian"],
  ["weather app says 40° but it feels like the sun's living room", "FEELS LIKE 55°", "🌡️🔥", "indian"],
  ["saving mangoes for summer like they're state treasure", "MANGO VAULT", "🥭🔒", "indian"],
  ["the last braincell leaving the group chat at 3am", "BRAINCELL EVACUATION", "🧠🚪", "chaos"],
  ["greek statues silently judging my screen time report", "7H 42M DAILY", "🗿📱", "chaos"],
  ["my sleep schedule has left the chat permanently", "SLEEP: OFFLINE", "😴📴", "chaos"],
  ["a crow stole my fries and honestly, respect the heist", "FRY HEIST", "🐦🍟", "chaos"],
  ["the washing machine eating exactly one sock every cycle", "SOCK RIFT", "🧦🌀", "chaos"],
  ["the gym mirror making me look stronger, thanks bro", "GAINZ MIRROR", "🪞💪", "workplace"],
  ["autocorrect changing nice to noice is genuine character development", "NOICE", "⌨️📈", "chaos"],
  ["traffic light turns green and my phone lights up like a casino", "GREEN LIGHT RUSH", "🚦📱", "chaos"],
  ["eating instant noodles at 2am like a michelin critic", "MIDNIGHT CHEF", "🍜⭐", "chaos"],
  ["my plant died so I bought a plastic one with full confidence", "PLANT 2.0", "🪴🤖", "chaos"],
  ["semicolons are optional until suddenly they are not", "SEMICOLON TRUTH", "😉❌", "programming"],
  ["localhost: the only place my app truly shines", "SHINES LOCALLY", "🌐✨", "programming"],
  ["git blame revealed the criminal and it was me", "IT WAS ME", "🔍🙋", "programming"],
  ["watching the CI pipeline like a movie where I know the ending", "SPOILER: FAILS", "🎬❌", "programming"],
  ["canteen samosa quality control is vibes based only", "VIBES QC", "🥟✅", "college"],
  ["the topper who says I didn't study and then scores 98", "VERY SUS", "🤨📚", "college"],
  ["the hostel mess menu is a suggestion, never a promise", "MENU FICTION", "📋🍽️", "college"],
  ["the rain scene but I have a real exam tomorrow morning", "RAIN + REALITY", "🌧️📖", "bollywood"],
  ["a 10 year friendship montage legally requires two songs", "FRIENDSHIP MONTAGE", "🎵🤝", "bollywood"],
  ["my out of office reply is currently living my dream life", "OOO DREAM", "🏖️📧", "workplace"],
];

// ---------------------------------------------------------- topic × format generator
const TOPICS = [
  ["college", "📚", "the night before the exam"], ["college", "🕳️", "backbench philosophy"], ["college", "📝", "last-minute cramming"], ["college", "🎓", "convocation photo poses"],
  ["gaming", "🎮", "blaming the controller"], ["gaming", "🕹️", "the final boss attempt"], ["gaming", "🎧", "sweaty lobby energy"], ["gaming", "🛡️", "tank mains protecting nobody"],
  ["anime", "⛩️", "the training arc skip"], ["anime", "🍜", "mid-episode snack runs"], ["anime", "⚔️", "final form unlocking"], ["anime", "🌊", "filler plot energy"],
  ["football", "⚽", "rain match energy"], ["football", "🥅", "the goalkeeper's holiday"], ["football", "🧦", "pre-match sock rituals"], ["football", "📢", "touchline screaming"],
  ["programming", "💻", "production deploy fridays"], ["programming", "☕", "coffee-driven development"], ["programming", "🧪", "tests that test nothing"], ["programming", "🐛", "heisenbug hunting"],
  ["bollywood", "🎬", "slow-motion entrances"], ["bollywood", "🌺", "sarson ke khet running"], ["bollywood", "🕺", "wedding dance reveals"], ["bollywood", "🔥", "interval climax faces"],
  ["technology", "📱", "battery anxiety"], ["technology", "🌐", "router restarting rituals"], ["technology", "💾", "cloud sync anxiety"], ["technology", "🔔", "notification overload"],
  ["workplace", "🧊", "office ac temperature wars"], ["workplace", "🗓️", "calendar tetris mastery"], ["workplace", "💬", "corporate slack reactions"], ["workplace", "📊", "quarterly report faces"],
  ["indian", "🍛", "tiffin box economics"], ["indian", "🚂", "train pantry negotiations"], ["indian", "🛺", "auto meter conversations"], ["indian", "🫖", "cutting chai mathematics"],
  ["chaos", "🌀", "3am life decisions"], ["chaos", "🧦", "sock dimension research"], ["chaos", "🪑", "the wobbly table lifestyle"], ["chaos", "🍌", "grocery store impulse runs"],
];
const FORMATS = [
  (t) => ({ caption: `nobody: absolutely nobody: me: ${t}`, punch: "NOBODY: ME" }),
  (t) => ({ caption: `${t} speedrun: any% world record attempt`, punch: "SPEEDRUN" }),
  (t) => ({ caption: `day 47 of ${t} and the results are in`, punch: "DAY 47" }),
  (t) => ({ caption: `POV: you are the last hope of ${t}`, punch: "POV: FINAL HOPE" }),
  (t) => ({ caption: `me explaining ${t} for the 47th time today`, punch: "47TH TIME" }),
  (t) => ({ caption: `${t} but somehow it actually works`, punch: "IT WORKS?!" }),
];

// ---------------------------------------------------------- reels
const REEL_CAPTIONS = [
  ["when the build passes on the first try", "programming"], ["when the plot twist actually hits", "anime"], ["me explaining my 4am startup idea", "technology"],
  ["monday energy loading at 2%", "workplace"], ["autocorrect ruining friendships since 2010", "chaos"], ["signature move: disappear after texting", "chaos"],
  ["POV: the code deploys itself on friday", "programming"], ["when the beat drops and so does my GPA", "college"], ["watching my portfolio like a hawk, the hawk is also losing", "chaos"],
  ["the group chat at 2am is fully unhinged", "chaos"], ["me pretending to understand the meeting", "workplace"], ["when mom says come here for a second, 45 minutes", "indian"],
  ["speedrunning the assignment due in one hour", "college"], ["the wifi bar dropping during the boss fight", "gaming"], ["my last braincell waving goodbye", "chaos"],
  ["when the DJ plays the song you claimed in the group", "bollywood"], ["keyboard smash speedrun, world record pace", "chaos"], ["the printer jamming in glorious 4K", "workplace"],
  ["when the autosave actually saves your entire life", "programming"], ["arriving late with full main character energy", "anime"], ["sigma cat has entered the group chat", "chaos"],
  ["the timeout I asked for vs the timeout I got", "gaming"], ["explaining offside to my family during dinner", "football"], ["when the snack arrives mid-episode", "anime"],
  ["my sleep schedule evaporating in real time", "chaos"], ["the lecture slide that is one paragraph of pure fear", "college"], ["refreshing the marks portal like a ritual", "college"],
  ["when chai hits at exactly the right temperature", "indian"], ["the group project documentary: nobody helped", "college"], ["lag switching is a lifestyle choice apparently", "gaming"],
  ["when the sequel is somehow better", "anime"], ["email chain rising from the dead after 3 weeks", "workplace"], ["the one friend who says 5 more minutes for 2 hours", "chaos"],
  ["watching the oven like it owes me money", "chaos"], ["when the selfie camera flips and reality hits", "technology"], ["presenting a slide I have never seen before", "workplace"],
  ["the victory lap after one singular push-up", "workplace"], ["when the auto-rickshaw meter is feeling creative", "indian"], ["following the recipe and the recipe lying", "chaos"],
  ["my camera roll: 4000 photos of the same sunset", "technology"], ["the headphone cable tangle speedrun", "technology"], ["when they say the exam is open book", "college"],
  ["goalkeeper remembering he can use his hands", "football"], ["the interval twist of my monthly budget", "bollywood"], ["me narrating my own cooking show alone", "chaos"],
  ["when the professor extends the deadline by 2 days", "college"], ["ping going from 20 to 400 at the worst moment", "gaming"], ["the group photo where everyone blinks", "chaos"],
  ["when the outro song is better than the whole season", "anime"], ["reply all aftermath: 74 messages of stop replying all", "workplace"], ["my plant thriving on pure neglect", "chaos"],
];

const REEL_TOPICS = [
  ["programming", "🐸", "debugging at 3am"], ["gaming", "🎮", "clutch attempt number 47"], ["college", "📚", "submission night chaos"], ["chaos", "🌀", "3am fridge visits"],
  ["indian", "🫖", "chai refill rituals"], ["workplace", "📊", "the spreadsheet era"], ["anime", "⛩️", "episode one energy"], ["football", "⚽", "the last minute equalizer"],
  ["bollywood", "💃", "the wedding dance practice"], ["technology", "🔋", "one percent battery survival"], ["college", "🛏️", "the 5 minute nap that failed"], ["chaos", "🧦", "the sock that vanished"],
  ["programming", "🤖", "letting the AI write it"], ["gaming", "🏆", "the world's most average player"], ["anime", "🍜", "the snack break arc"], ["workplace", "☕", "the coffee machine summit"],
];

// ---------------------------------------------------------------- svg
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function wrap(text, max) {
  const words = text.split(" ");
  const lines = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(77);
const SIZES = [[800, 800], [800, 1000], [800, 640], [800, 1100]];

function memeSvg(m) {
  const { w, h, bg, accent, punch, emoji, category } = m;
  const bandH = Math.max(110, Math.round(w * 0.15));
  const lines = wrap(punch, 15);
  const fsize = bandH / (lines.length + 0.9);
  const lh = fsize * 1.06;
  const startY = h - bandH / 2 - ((lines.length - 1) * lh) / 2;
  const tspans = lines.map((l, i) => `<tspan x="${w / 2}" y="${startY + i * lh}">${esc(l)}</tspan>`).join("");
  const pattern = rand() < 0.5 ? "dots" : "stripes";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="3.2" fill="#080808" opacity="0.09"/></pattern>
<pattern id="stripes" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="13" height="30" fill="#080808" opacity="0.06"/></pattern></defs>
<rect width="${w}" height="${h}" fill="${bg}"/>
<rect width="${w}" height="${h}" fill="url(#${pattern})"/>
<rect x="${w * 0.06}" y="${h * 0.06}" width="${w * 0.88}" height="${h * 0.5}" rx="26" fill="#080808" opacity="0.05"/>
<text x="${w / 2}" y="${h * 0.42}" font-size="${Math.round(w * 0.3)}" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
<rect x="26" y="30" rx="30" height="60" width="${category.length * 22 + 90}" fill="${accent}" stroke="#080808" stroke-width="5"/>
<text x="${26 + (category.length * 22 + 90) / 2}" y="68" font-family="'Arial Black', Impact, sans-serif" font-size="30" font-weight="900" text-anchor="middle" fill="#080808">✦ ${category.toUpperCase()}</text>
<rect x="0" y="${h - bandH}" width="${w}" height="${bandH}" fill="#080808"/>
<text x="${w / 2}" y="${startY}" font-family="'Arial Black', Impact, sans-serif" font-size="${fsize}" font-weight="900" fill="#F7F7F2" text-anchor="middle" letter-spacing="2">${tspans}</text>
<rect x="5" y="5" width="${w - 10}" height="${h - 10}" rx="30" fill="none" stroke="#080808" stroke-width="10"/>
</svg>`;
}

// ---------------------------------------------------------------- png star
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngChunk(type, data) { const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); out.write(type, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length); return out; }
function encodePNG(width, height, rgba) {
  const stride = width * 4; const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(raw, { level: 6 })), pngChunk("IEND", Buffer.alloc(0))]);
}
function hexToRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
function starPoints(size, cx, cy, R) { const r = R * 0.28; return [[cx, cy - R], [cx + r, cy - r], [cx + R, cy], [cx + r, cy + r], [cx, cy + R], [cx - r, cy + r], [cx - R, cy], [cx - r, cy - r]]; }
function inPoly(x, y, pts) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
function renderStarPng(size, colorHex) {
  const [r, g, b] = hexToRgb(colorHex); const rgba = Buffer.alloc(size * size * 4);
  const R = size * 0.46, cx = size / 2, cy = size / 2; const pts = starPoints(size, cx, cy, R);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cov = 0; for (const dx of [0.25, 0.75]) for (const dy of [0.25, 0.75]) if (inPoly(x + dx, y + dy, pts)) cov += 0.25;
    const i = (y * size + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = Math.round(cov * 255);
  }
  return encodePNG(size, size, rgba);
}

// ---------------------------------------------------------------- build content list
const images = [];
CURATED.forEach(([caption, punch, emoji, cat], i) => {
  const [w, h] = SIZES[i % SIZES.length];
  images.push({ caption, punch, emoji, category: cat, bg: BGS[i % BGS.length], accent: ACCENTS[i % ACCENTS.length], w, h });
});
let gi = CURATED.length;
for (const [cat, emoji, topic] of TOPICS) {
  for (const fmt of FORMATS) {
    if (images.length >= 360) break;
    const { caption, punch } = fmt(topic);
    const [w, h] = SIZES[gi % SIZES.length];
    images.push({ caption, punch, emoji, category: cat, bg: BGS[gi % BGS.length], accent: ACCENTS[gi % ACCENTS.length], w, h });
    gi++;
  }
}

const reels = [];
const REEL_COLORS = [["#7C4DFF", "#C8FF3D"], ["#315BEF", "#FF6B57"], ["#C8FF3D", "#315BEF"], ["#FFE33D", "#7C4DFF"], ["#FF6B57", "#FFE33D"], ["#22A565", "#7C4DFF"], ["#FF7BAC", "#315BEF"], ["#FF9F1C", "#22A565"]];
const REEL_STARS = [C.yellow, C.lime, C.coral, C.blue, C.purple, "#F7F7F2"];
REEL_CAPTIONS.forEach(([caption, cat], i) => reels.push({ caption, category: cat, c0: REEL_COLORS[i % REEL_COLORS.length][0], c1: REEL_COLORS[i % REEL_COLORS.length][1], s1: REEL_STARS[i % REEL_STARS.length], s2: REEL_STARS[(i + 3) % REEL_STARS.length] }));
for (const [cat, emoji, topic] of REEL_TOPICS) {
  for (const fmt of FORMATS.slice(0, 5)) {
    if (reels.length >= 120) break;
    const { caption } = fmt(topic);
    const i = reels.length;
    reels.push({ caption, category: cat, c0: REEL_COLORS[i % REEL_COLORS.length][0], c1: REEL_COLORS[i % REEL_COLORS.length][1], s1: REEL_STARS[i % REEL_STARS.length], s2: REEL_STARS[(i + 3) % REEL_STARS.length] });
  }
}

// ---------------------------------------------------------------- write SVGs + stars
console.log(`writing ${images.length} meme SVGs…`);
const manifest = [];
images.forEach((m, i) => {
  const file = `img-${String(i + 1).padStart(3, "0")}`;
  fs.writeFileSync(path.join(MEMES_DIR, file + ".svg"), memeSvg(m));
  manifest.push({
    id: file, media_type: "image", media_url: `/memes/${file}.svg`, thumbnail_url: `/memes/${file}.svg`,
    width: m.w, height: m.h, duration: null, punch: m.punch, caption: m.caption, category: m.category, seedIndex: i,
  });
});

console.log("star overlays…");
const starNames = [...new Set(reels.map((r) => r.s1).concat(reels.map((r) => r.s2)))];
for (const hex of starNames) {
  const name = "star-" + hex.slice(1);
  fs.writeFileSync(path.join(VIDEOS_DIR, name + ".png"), renderStarPng(220, hex));
  reels.forEach((r) => { if (r.s1 === hex) r.s1file = name; if (r.s2 === hex) r.s2file = name; });
}

// ---------------------------------------------------------------- reels via ffmpeg
const REEL_H = 1280, REEL_W = 720, DUR = 4;
let reelsOk = 0;
for (let i = 0; i < reels.length; i++) {
  const r = reels[i];
  const file = `reel-${String(i + 1).padStart(3, "0")}`;
  const out = path.join(VIDEOS_DIR, file + ".mp4");
  const poster = path.join(MEMES_DIR, file + "-poster.jpg");
  try {
    execSync(
      `ffmpeg -y -f lavfi -i "gradients=s=${REEL_W}x${REEL_H}:c0=${r.c0.replace("#", "0x")}:c1=${r.c1.replace("#", "0x")}:speed=0.04:d=${DUR}" ` +
      `-loop 1 -i "${path.join(VIDEOS_DIR, r.s1file + ".png")}" -loop 1 -i "${path.join(VIDEOS_DIR, r.s2file + ".png")}" ` +
      `-filter_complex "[1]scale=260:-1[st1];[2]scale=150:-1[st2];` +
      `[0][st1]overlay=x='(W-w)/2+180*sin(1.6*t)':y='(H-h)/2+300*cos(1.1*t)':shortest=1[v1];` +
      `[v1][st2]overlay=x='(W-w)/2-260+120*sin(0.9*t+2)':y='(H-h)/2-200+160*cos(1.7*t)':shortest=1[v2];` +
      `[v2]format=yuv420p[out]" ` +
      `-map "[out]" -t ${DUR} -c:v libx264 -crf 32 -preset ultrafast -movflags +faststart "${out}"`,
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    execSync(`ffmpeg -y -i "${out}" -frames:v 1 -q:v 5 "${poster}"`, { stdio: ["pipe", "pipe", "pipe"] });
    reelsOk++;
    manifest.push({
      id: file, media_type: "video", media_url: `/videos/${file}.mp4`, thumbnail_url: `/memes/${file}-poster.jpg`,
      width: REEL_W, height: REEL_H, duration: DUR, punch: "", caption: r.caption, category: r.category, seedIndex: 1000 + i,
    });
    if ((i + 1) % 20 === 0) console.log(`  reels ${i + 1}/${reels.length}`);
  } catch (e) {
    console.warn(`reel FAILED: ${file} — ${(e.stderr?.toString() || e.message).slice(-200)}`);
  }
}
for (const hex of starNames) fs.rmSync(path.join(VIDEOS_DIR, "star-" + hex.slice(1) + ".png"), { force: true });

fs.mkdirSync(path.join(ROOT, "lib", "server"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "lib", "server", "meme-assets.json"), JSON.stringify(manifest, null, 1));
console.log(`done: ${images.length} images, ${reelsOk}/${reels.length} reels, manifest=${manifest.length}.`);
