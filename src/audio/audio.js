// All sound is made live with Web Audio (no files to download).
// Louie doesn't like sudden loud noises, so: every sound has a soft attack, nothing
// goes "bang", and a limiter sits on the output.

const PENTA = [0, 2, 4, 7, 9];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor(store) {
    this.store = store;
    this.ctx = null;
    this.ready = false;
    this.night = 0;
    this.world = 'earth';
    this.altitude = 0;
    this.cityLife = 0;
    this._tickTimes = [];
    this._musicTimer = null;
    this._nextBeat = 0;
    this._beat = 0;
    this._ambTimer = 0;
  }

  get on() {
    return this.store.setting('sound') !== false;
  }

  // Must be called from a tap (browsers only allow sound after the user interacts).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.85 : 0;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.16;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2600;
    this.musicFilter.connect(this.music).connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.22;
    this.amb.connect(this.master);
    this.noise = this._makeNoise();
    this._startAmbience();
    this._startMusic();
    this.ready = true;
    // iOS: play a silent buffer to fully unlock.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  }

  setOn(on) {
    this.store.setting('sound', on);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.85 : 0, t, 0.15);
  }

  duck(seconds = 2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0.06, t, 0.1);
    this.music.gain.setTargetAtTime(0.16, t + seconds, 0.6);
  }

  _makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- building blocks ----------

  _tone({ freq, freq2 = null, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.008, when = 0, dest = null, pan = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.2, vol = 0.2, type = 'lowpass', freq = 1000, freq2 = null, q = 1, attack = 0.01, when = 0, dest = null }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- sound effects ----------

  place() {
    this._tone({ freq: 150, freq2: 62, dur: 0.32, vol: 0.36, attack: 0.01 });
    this._noise({ dur: 0.22, vol: 0.14, freq: 700, freq2: 200, attack: 0.004 });
    this._tone({ freq: midi(76), dur: 0.25, vol: 0.06, when: 0.05, type: 'triangle' });
  }

  // Called repeatedly while stretching: a soft rising tick per floor.
  tick(step) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this._tickTimes = this._tickTimes.filter((t) => now - t < 1);
    if (this._tickTimes.length > 14) return;
    this._tickTimes.push(now);
    const n = 64 + PENTA[step % 5] + 12 * (Math.floor(step / 5) % 3);
    this._tone({ freq: midi(n), dur: 0.09, vol: 0.09, type: 'triangle', attack: 0.004 });
  }

  resize(up = true) {
    this._tone({ freq: up ? 320 : 520, freq2: up ? 560 : 300, dur: 0.16, vol: 0.18, type: 'sine' });
  }

  undo() {
    this._tone({ freq: 620, freq2: 260, dur: 0.22, vol: 0.16, type: 'triangle' });
    this._noise({ dur: 0.18, vol: 0.05, type: 'bandpass', freq: 2500, freq2: 600 });
  }

  click() {
    this._tone({ freq: 900, dur: 0.05, vol: 0.06, type: 'sine', attack: 0.003 });
  }

  coin(i = 0) {
    const w = i * 0.07;
    this._tone({ freq: midi(88), dur: 0.12, vol: 0.12, type: 'triangle', when: w });
    this._tone({ freq: midi(95), dur: 0.3, vol: 0.12, type: 'triangle', when: w + 0.07 });
  }

  unlockPiece() {
    [72, 76, 79, 84, 88].forEach((n, i) => this._tone({ freq: midi(n), dur: 0.35, vol: 0.12, type: 'triangle', when: i * 0.07 }));
  }

  denied() {
    this._tone({ freq: midi(55), dur: 0.18, vol: 0.14, type: 'sine' });
    this._tone({ freq: midi(52), dur: 0.26, vol: 0.14, type: 'sine', when: 0.16 });
  }

  milestone() {
    [84, 88, 91, 96].forEach((n, i) =>
      this._tone({ freq: midi(n), dur: 0.7, vol: 0.09, type: 'sine', when: i * 0.09, pan: (i - 1.5) * 0.3 }),
    );
    this._noise({ dur: 0.8, vol: 0.03, type: 'highpass', freq: 6000, attack: 0.05 });
  }

  // Happy fanfare with gentle clapping (no bangs).
  cheer() {
    const notes = [60, 64, 67, 72, 67, 72, 76, 79];
    notes.forEach((n, i) => {
      this._tone({ freq: midi(n), dur: 0.5, vol: 0.12, type: 'triangle', when: i * 0.11 });
      this._tone({ freq: midi(n + 12), dur: 0.35, vol: 0.04, type: 'sine', when: i * 0.11 });
    });
    this._tone({ freq: midi(48), dur: 1.4, vol: 0.12, type: 'sine', when: 0.88, attack: 0.05 });
    // Soft applause: lots of little filtered noise claps.
    for (let i = 0; i < 70; i++) {
      this._noise({
        dur: 0.05 + Math.random() * 0.04,
        vol: 0.025 + Math.random() * 0.02,
        type: 'bandpass',
        freq: 1200 + Math.random() * 1800,
        q: 1.5,
        attack: 0.004,
        when: 0.25 + Math.random() * 2.2,
      });
    }
  }

  whoosh(up = true) {
    this._noise({ dur: 1.2, vol: 0.08, type: 'bandpass', freq: up ? 300 : 1800, freq2: up ? 1800 : 300, q: 2, attack: 0.3 });
  }

  // Firework: a rising whistle and a soft sparkly fizz, never a bang.
  firework() {
    this._tone({ freq: 500, freq2: 1300, dur: 0.9, vol: 0.03, type: 'sine', attack: 0.1 });
    for (let i = 0; i < 18; i++) {
      this._tone({
        freq: 2500 + Math.random() * 3000,
        dur: 0.08,
        vol: 0.02,
        type: 'sine',
        when: 0.9 + Math.random() * 0.8,
        pan: Math.random() * 1.6 - 0.8,
      });
    }
    this._noise({ dur: 1.0, vol: 0.035, type: 'highpass', freq: 4000, attack: 0.08, when: 0.9 });
  }

  bubble() {
    this._tone({ freq: 600, freq2: 1400, dur: 0.12, vol: 0.12, type: 'sine' });
  }

  // ---------- background music ----------

  _startMusic() {
    const ctx = this.ctx;
    this._nextBeat = ctx.currentTime + 0.5;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 120);
  }

  _scheduleMusic() {
    if (!this.ready || this.store.setting('music') === false) return;
    const ctx = this.ctx;
    const spb = 60 / 70;
    const chords = [
      [48, 55, 60, 64],
      [45, 52, 57, 60],
      [41, 48, 53, 57],
      [43, 50, 55, 59],
    ];
    while (this._nextBeat < ctx.currentTime + 0.6) {
      const beat = this._beat;
      const bar = Math.floor(beat / 4) % chords.length;
      const chord = chords[bar];
      const when = this._nextBeat - ctx.currentTime;
      const dest = this.musicFilter;
      if (beat % 4 === 0) {
        // Soft pad and bass at the start of each bar.
        for (const n of chord.slice(1)) {
          this._tone({ freq: midi(n), dur: spb * 4.2, vol: 0.05, type: 'triangle', attack: 0.6, when, dest });
          this._tone({ freq: midi(n) * 1.004, dur: spb * 4.2, vol: 0.03, type: 'sine', attack: 0.8, when, dest });
        }
        this._tone({ freq: midi(chord[0] - 12), dur: spb * 3.5, vol: 0.12, type: 'sine', attack: 0.08, when, dest });
      }
      // A gentle melody, sparser at night.
      const chance = this.night > 0.5 ? 0.35 : 0.6;
      if (Math.random() < chance) {
        const root = chord[0] + 24;
        const n = root + PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0);
        this._tone({ freq: midi(n), dur: 0.9, vol: 0.07, type: 'sine', attack: 0.01, when, dest });
        if (Math.random() < 0.3)
          this._tone({ freq: midi(n + PENTA[Math.floor(Math.random() * 3)]), dur: 0.7, vol: 0.05, type: 'sine', when: when + spb / 2, dest });
      }
      this._beat++;
      this._nextBeat += spb;
    }
  }

  // ---------- ambience ----------

  _startAmbience() {
    const ctx = this.ctx;
    // City hum: brown-ish noise, very low.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    src.connect(f).connect(this.humGain).connect(this.amb);
    src.start();
    // Wind (high up, or on Mars).
    const w = ctx.createBufferSource();
    w.buffer = this.noise;
    w.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    w.connect(this.windFilter).connect(this.windGain).connect(this.amb);
    w.start();
  }

  // Called every frame with the current scene state.
  update(dt, { night = 0, world = 'earth', altitude = 0, cityLife = 0 } = {}) {
    this.night = night;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const earth = world === 'earth';
    const high = Math.min(1, altitude / 3000);
    this.humGain.gain.setTargetAtTime(earth ? 0.35 * cityLife * (1 - high) * (1 - night * 0.5) : 0, t, 0.5);
    const windy = world === 'mars' ? 0.25 : earth ? 0.1 + 0.35 * high * (altitude < 60000 ? 1 : 0) : 0;
    this.windGain.gain.setTargetAtTime(windy, t, 0.8);
    this.windFilter.frequency.setTargetAtTime(400 + Math.sin(t * 0.3) * 150, t, 0.5);

    this._ambTimer -= dt;
    if (this._ambTimer <= 0 && earth && altitude < 1500) {
      if (night < 0.5) {
        this._bird();
        this._ambTimer = 2 + Math.random() * 5;
      } else {
        this._crickets();
        this._ambTimer = 0.6 + Math.random() * 1.2;
      }
    }
  }

  _bird() {
    const dest = this.amb;
    const base = 2600 + Math.random() * 1600;
    const pan = Math.random() * 1.6 - 0.8;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      this._tone({
        freq: base * (1 + Math.random() * 0.2),
        freq2: base * (1.3 + Math.random() * 0.4),
        dur: 0.08 + Math.random() * 0.05,
        vol: 0.05,
        type: 'sine',
        when: i * 0.13,
        dest,
        pan,
      });
    }
  }

  _crickets() {
    const dest = this.amb;
    const pan = Math.random() * 1.6 - 0.8;
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) this._tone({ freq: f, dur: 0.035, vol: 0.025, type: 'sine', when: i * 0.05, dest, pan, attack: 0.004 });
  }
}
