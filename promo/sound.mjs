// Composes the film's sound from nothing but arithmetic, so there is no track to license: a quiet bed of slow
// tones, a soft tick for each key, a tap for each press, a two-note chime when the building is picked, and a
// brighter layer that comes in while the map flies to it. Every sound is laid to a moment film.mjs noted.
// Usage: node sound.mjs     Reads out/frames/marks.json, writes out/sound.wav.
import { readFileSync, writeFileSync } from "node:fs";

const OUT = new URL("./out/", import.meta.url).pathname;
const { seconds, marks } = JSON.parse(readFileSync(`${OUT}frames/marks.json`, "utf8"));

const RATE = 48_000;
const TURN = Math.PI * 2;
const length = Math.ceil((seconds + 0.2) * RATE);
const left = new Float32Array(length);
const right = new Float32Array(length);

const presses = marks.filter(({ name }) => name === "press").map(({ at }) => at);
const keys = marks.filter(({ name }) => name === "key").map(({ at }) => at);
const end = marks.find(({ name }) => name === "end").at;
// The second press is the one that picks the building: the first only puts the pointer in the search.
const [, pick, ...opened] = presses;
const taps = [presses[0], ...opened];

/** Eases from 0 to 1 as x goes from 0 to 1, and holds outside. */
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// The bed: an open chord on D, each voice breathing at its own slow pace and a hair apart in each ear. Most of
// it sits between 200 and 450 Hz: a phone's speaker plays almost nothing below that, and would leave a lower
// bed silent. The two lowest voices are for headphones.
const BED = [
  [110.0, 0.5, 0.05],
  [146.83, 0.8, 0.07],
  [220.0, 0.8, 0.06],
  [293.66, 0.6, 0.09],
  [369.99, 0.45, 0.11],
  [440.0, 0.35, 0.08],
];
// The lift: higher voices of the same chord, in over the four seconds after the pick.
const LIFT = [
  [554.37, 0.3, 0.1],
  [587.33, 0.3, 0.07],
  [659.25, 0.35, 0.12],
  [880.0, 0.2, 0.09],
];
const APART_HZ = 0.18;
for (let i = 0; i < length; i++) {
  const t = i / RATE;
  // In over the opening, out under the closing card.
  const whole = ease(t / 2.2) * (1 - ease((t - (seconds - 2.6)) / 2.4));
  const lifted = ease((t - pick) / 4);
  let l = 0;
  let r = 0;
  for (const [voices, gain, level] of [
    [BED, 0.045, 1],
    [LIFT, 0.035, lifted],
  ]) {
    if (level === 0) continue;
    for (const [hz, weight, breath] of voices) {
      const loud = gain * level * weight * (0.75 + 0.25 * Math.sin(TURN * breath * t + hz));
      l += loud * Math.sin(TURN * (hz - APART_HZ) * t);
      r += loud * Math.sin(TURN * (hz + APART_HZ) * t);
    }
  }
  left[i] += whole * l;
  right[i] += whole * r;
}

/** Adds a tone that starts at `at` and dies away: `fade` is the seconds it takes to fall to about a third. */
function ring(at, hz, loud, fade, lasts = fade * 7) {
  const from = Math.floor(at * RATE);
  const until = Math.min(length, from + Math.floor(lasts * RATE));
  for (let i = Math.max(0, from); i < until; i++) {
    const t = (i - from) / RATE;
    // Four milliseconds to come in, so no tone starts with a click of its own.
    const sample = loud * Math.min(1, t / 0.004) * Math.exp(-t / fade) * Math.sin(TURN * hz * t);
    left[i] += sample;
    right[i] += sample;
  }
}

/** A soft bell: the note, and its octave above dying faster. */
function chime(at, hz, loud) {
  ring(at, hz, loud, 0.55);
  ring(at, hz * 2, loud * 0.28, 0.22);
}

// A key: a short high tick over a small low knock, never quite the same twice.
keys.forEach((at, index) => {
  const varied = 1 + 0.05 * Math.sin(index * 2.4);
  ring(at, 1900 * varied, 0.05, 0.008);
  ring(at, 2650 * varied, 0.022, 0.006);
  ring(at, 180, 0.035, 0.022);
});
// A press of the pointer: lower and rounder than a key.
for (const at of taps) {
  ring(at, 210, 0.07, 0.04);
  ring(at, 900, 0.025, 0.009);
}
// Picking the building: two notes of the chord, the second a moment after the first.
chime(pick, 440.0, 0.1);
chime(pick + 0.14, 659.25, 0.085);
// The closing card: the chord's root and fifth, an octave up, quieter.
chime(end + 0.15, 587.33, 0.07);
chime(end + 0.3, 880.0, 0.055);

// How loud it came out, since nobody has heard it yet.
let peak = 0;
let squares = 0;
for (let i = 0; i < length; i++) {
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  squares += left[i] ** 2 + right[i] ** 2;
}
const decibels = (level) => (20 * Math.log10(level)).toFixed(1);
console.log(`peak ${decibels(peak)} dB, average ${decibels(Math.sqrt(squares / (2 * length)))} dB, of a full scale of 0`);
if (peak >= 0.5) throw new Error("Too loud: something in the mix has run away.");

// A plain 16-bit stereo WAV.
const data = Buffer.alloc(length * 4);
for (let i = 0; i < length; i++) {
  data.writeInt16LE(Math.round(left[i] * 32767), i * 4);
  data.writeInt16LE(Math.round(right[i] * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(`${OUT}sound.wav`, Buffer.concat([header, data]));
console.log(`wrote sound.wav: ${(length / RATE).toFixed(1)} s | keys at ${keys.map((at) => at.toFixed(1)).join(", ")} | pick at ${pick.toFixed(1)} | closing card at ${end.toFixed(1)}`);
