// Films "Pick one", the short video for X, from the running site. Every frame is the real page, driven by hand
// as a visitor would: only the captions, the pointer and the closing card are laid over it.
// Usage: node film.mjs [site address]     Then: swift encode.swift out/frames out/pick-one.mp4
// For sound: node sound.mjs, then swift mix.swift out/pick-one.mp4 out/sound.m4a out/pick-one-sound.mp4
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "../app/node_modules/@playwright/test/index.mjs";

const SITE = process.argv[2] ?? "http://localhost:4180";
const ADDRESS = "building-record-ecru.vercel.app";
const FRAMES = new URL("./out/frames/", import.meta.url).pathname;
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

// The real graphics card, with no window on screen. The browser itself runs 1280 by 720 at one and a half times,
// which films as a 1920 by 1080 picture whose interface is large enough to read in a feed. Asking Playwright for
// that scale instead films at 1280 by 720: the browser only hands over real pixels when the scale is its own.
const browser = await chromium.launch({
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--force-device-scale-factor=1.5",
    "--window-size=1280,720",
  ],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

/** The moments the sound is laid to: each key, each press, the closing card. */
const marks = [];
const mark = (name) => marks.push({ name, at: Date.now() });

await page.goto(SITE);
await page.locator('main[data-map="ready"]').waitFor({ state: "attached", timeout: 60000 });
await pause(3000);

// The caption, the pointer and the closing card, in the site's own type and colors.
await page.addStyleTag({
  content: `
    #film-pointer { position: fixed; left: 0; top: 0; z-index: 1000; width: 22px; pointer-events: none;
      transition: scale 120ms ease-out; transform-origin: 3px 2px; }
    #film-pointer.pressed { scale: 0.86; }
    #film-caption { position: fixed; left: 44px; top: 468px; z-index: 900; max-width: 760px; pointer-events: none;
      font-family: var(--font-display); font-style: italic; font-size: 58px; line-height: 1.04; letter-spacing: -0.01em;
      color: var(--color-deep); opacity: 0; transition: opacity 380ms ease-out, translate 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
      translate: 0 10px; text-wrap: balance;
      text-shadow: 0 0 26px rgb(232 239 243 / 0.95), 0 0 8px rgb(232 239 243 / 0.9), 0 0 2px rgb(232 239 243 / 0.9); }
    #film-caption.shown { opacity: 1; translate: 0 0; }
    #film-end { position: fixed; inset: 0; z-index: 950; display: grid; place-content: center; justify-items: center; gap: 14px;
      background: linear-gradient(180deg, var(--color-ice), var(--color-mist)); opacity: 0; transition: opacity 600ms ease-out;
      pointer-events: none; text-align: center; }
    #film-end.shown { opacity: 1; }
    /* The closing card is the title alone: the pointer leaves with the page. */
    #film-end.shown ~ #film-pointer { opacity: 0; transition: opacity 300ms; }
    #film-end h1 { font-family: var(--font-display); font-style: italic; font-weight: 400; font-size: 112px; line-height: 1;
      letter-spacing: -0.01em; color: var(--color-deep); }
    #film-end p { font-size: 23px; color: var(--color-slate); }
    #film-end small { margin-top: 18px; font-size: 17px; letter-spacing: 0.02em; color: var(--color-steel); }
  `,
});
await page.evaluate((address) => {
  const pointer = document.createElement("div");
  pointer.id = "film-pointer";
  pointer.innerHTML =
    '<svg viewBox="0 0 22 30"><path d="M3 2v22l5.6-5.2 3.6 8.4 3.4-1.5-3.6-8.3H20z" fill="#0b131f" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const caption = document.createElement("p");
  caption.id = "film-caption";
  const end = document.createElement("div");
  end.id = "film-end";
  end.innerHTML = `<h1>Building Record</h1><p>Austin apartments, seen through the city's own complaint files.</p><small>${address}</small>`;
  document.body.append(caption, end, pointer);
  document.addEventListener("mousemove", (event) => (pointer.style.translate = `${event.clientX - 3}px ${event.clientY - 2}px`), true);
  document.addEventListener("mousedown", () => pointer.classList.add("pressed"), true);
  document.addEventListener("mouseup", () => pointer.classList.remove("pressed"), true);
}, ADDRESS);

/** Changes the caption: the old line fades, the new one rises in. */
async function say(text) {
  await page.evaluate(() => document.getElementById("film-caption").classList.remove("shown"));
  await pause(260);
  await page.evaluate((line) => {
    const caption = document.getElementById("film-caption");
    caption.textContent = line;
    if (line) caption.classList.add("shown");
  }, text);
}

/** Moves the pointer as a hand does: off quickly, in gently. */
let at = { x: 660, y: 400 };
async function glide(x, y, ms = 750) {
  const from = at;
  const started = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - started) / ms);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
    if (t === 1) break;
  }
  at = { x, y };
}
const middleOf = async (locator) => {
  const box = await locator.boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
};
async function press(locator, ms) {
  await glide(...(await middleOf(locator)), ms);
  await pause(140);
  mark("press");
  await page.mouse.down();
  await pause(90);
  await page.mouse.up();
}

await page.mouse.move(at.x, at.y);

// Film from here: each frame as the browser presents it, with the moment it was shown.
const times = [];
const browserSession = await context.newCDPSession(page);
browserSession.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  writeFileSync(`${FRAMES}${String(times.length).padStart(6, "0")}.jpg`, Buffer.from(data, "base64"));
  times.push(metadata.timestamp * 1000);
  browserSession.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await browserSession.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080 });
await pause(350);

// 1. The city, turned a little by hand.
await say("Every apartment complex in Austin.");
await glide(770, 392, 500);
await page.mouse.down({ button: "right" });
await glide(600, 392, 3300);
await page.mouse.up({ button: "right" });
await pause(300);

// 2. One building, picked by name.
await say("Pick one.");
const search = page.getByRole("combobox");
await press(search, 800);
for (const letter of "Folio") {
  mark("key");
  await page.keyboard.type(letter);
  await pause(130);
}
await pause(450);
await press(page.getByRole("option").filter({ hasText: "Folio Apartments" }).first(), 600);
await glide(520, 330, 900);
await page.locator("[data-spotlight]").waitFor({ state: "attached", timeout: 30000 });
await pause(5200);

// 3. Its record, a line at a time.
await say("Read what the city has on file.");
const lines = page.locator('ul[aria-label="What the record shows"] > li > button');
await press(lines.nth(0), 900);
await pause(1900);
await press(lines.nth(1), 650);
await pause(2200);

// 4. The name, and where to find it.
await say("");
mark("end");
await page.evaluate(() => document.getElementById("film-end").classList.add("shown"));
await glide(1180, 690, 500);
await pause(3200);

await browserSession.send("Page.stopScreencast");
await pause(200);
const first = times[0];
writeFileSync(`${FRAMES}times.txt`, times.map((time) => (time - first).toFixed(1)).join("\n") + "\n");
// Each mark as seconds into the film, for sound.mjs.
writeFileSync(
  `${FRAMES}marks.json`,
  JSON.stringify({
    seconds: (times.at(-1) - first) / 1000,
    marks: marks.map(({ name, at }) => ({ name, at: (at - first) / 1000 })),
  }),
);
console.log(`filmed ${times.length} frames over ${((times.at(-1) - first) / 1000).toFixed(1)} s into ${FRAMES}`);
await browser.close();
