// ============================================================
// HellPulse VJ Engine v3.0 — Three.js + Web Audio + Web MIDI
// ============================================================
import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GlitchPass }      from 'three/addons/postprocessing/GlitchPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
import { OBJLoader }       from 'three/addons/loaders/OBJLoader.js';

// ============================================================
// CENTRAL PARAMETER STORE — every knob maps to one entry
// ============================================================
const P = {
  // Post-FX
  bloomStrength: { v: 1.5,  min: 0,   max: 3,   def: 1.5,  label: 'POWER'  },
  bloomRadius:   { v: 0.4,  min: 0,   max: 1,   def: 0.4,  label: 'RADIUS' },
  glitchAmt:     { v: 0,    min: 0,   max: 1,   def: 0,    label: 'AMT'    },
  // Tunnel
  tunnelSpeed:   { v: 1,    min: 0,   max: 3,   def: 1,    label: 'SPEED'  },
  tunnelGlow:    { v: 0.55, min: 0,   max: 1,   def: 0.55, label: 'GLOW'   },
  // Sphere
  sphereSize:    { v: 1,    min: 0.2, max: 2.5, def: 1,    label: 'SIZE'   },
  sphereSpeed:   { v: 0.5,  min: 0,   max: 3,   def: 0.5,  label: 'SPEED'  },
  // Storm
  stormSpeed:    { v: 1,    min: 0,   max: 4,   def: 1,    label: 'SPEED'  },
  stormSize:     { v: 1,    min: 0.1, max: 3,   def: 1,    label: 'SIZE'   },
  // Wave
  waveRadius:    { v: 3.2,  min: 1,   max: 7,   def: 3.2,  label: 'RADIUS' },
  waveSens:      { v: 1,    min: 0,   max: 3,   def: 1,    label: 'SENS'   },
  // Bars
  barsHeight:    { v: 1,    min: 0,   max: 4,   def: 1,    label: 'HEIGHT' },
  barsScale:     { v: 1,    min: 0.3, max: 2,   def: 1,    label: 'SCALE'  },
  // Grid
  gridSpeed:     { v: 1,    min: 0,   max: 4,   def: 1,    label: 'SPEED'  },
  gridGlow:      { v: 0.7,  min: 0,   max: 1,   def: 0.7,  label: 'GLOW'   },
  // Chromatic Aberration
  chromaAmt:     { v: 0,    min: 0,    max: 0.02, def: 0,    label: 'AMT'    },
  // Feedback Loop
  feedbackAmt:   { v: 0,    min: 0,    max: 0.95, def: 0,    label: 'AMT'    },
  feedbackZoom:  { v: 1.01, min: 1.0,  max: 1.05, def: 1.01, label: 'ZOOM'   },
  // Master
  masterVolume:  { v: 0.8,  min: 0,   max: 1,   def: 0.8,  label: 'VOL'    },
};

// ============================================================
// MIDI STATE
// ============================================================
let midiAccess       = null;
let midiActive       = false;
let midiLearnParam   = null;          // param name waiting for a CC
const midiBindings   = {};            // cc (number) → param name

const MIDIMIX_DEFAULTS = {            // AKAI MIDImix factory CC map → params
  16: 'tunnelSpeed',  17: 'tunnelGlow',
  20: 'sphereSize',   21: 'sphereSpeed',
  24: 'stormSpeed',   25: 'stormSize',
  28: 'waveRadius',   29: 'waveSens',
  46: 'barsHeight',   47: 'barsScale',
  50: 'gridSpeed',    51: 'gridGlow',
  54: 'bloomStrength',55: 'bloomRadius',
  58: 'glitchAmt',
  62: 'masterVolume',
  66: 'chromaAmt',
  70: 'feedbackAmt',   74: 'feedbackZoom',
};

// ============================================================
// AUDIO STATE
// ============================================================
let audioCtx   = null, analyser = null, waveAnalyser = null;
let freqData   = null, waveData = null;
let audioEl    = null, audioInitialized = false;
let isMuted    = false;
let lastSeekUpdateMs = 0;

const bands       = { sub: 0, bass: 0, mid: 0, high: 0 };
const bandsSmooth = { sub: 0, bass: 0, mid: 0, high: 0 };

let beatDetected = false, beatDecay = 0, lastBeatMs = 0;
let bpm = 140, glitchBeatFrames = 0, tapTimes = [];

// Ring buffer for beat detection — avoids per-frame object allocation
const ONSET_SIZE = 120; // ~2s at 60fps
const _onsetE    = new Float32Array(ONSET_SIZE);
const _onsetT    = new Float64Array(ONSET_SIZE);
let   _onsetHead = 0, _onsetLen = 0;

// Cached audio band bin indices (set once in initAudio)
let _bandBins = null;

// ============================================================
// THREE.JS STATE
// ============================================================
let renderer, scene, camera, clock;
let composer, bloomPass, glitchPass, chromaPass, feedbackPass, feedbackTex;
let pointLight1, pointLight2, bgMesh;
let objGroup = null;
let subjectScene;

let tunnel, freqSphere, stormParticles, waveRing, freqBars, gridFloor, subjectBillboard;
let strobeOverlay;
let subjectAspect = 1;

// ============================================================
// PALETTES & SCENES
// ============================================================
const PALETTES = {
  tekno:      { c1: new THREE.Color(0x00ffff), c2: new THREE.Color(0xff00ff), c3: new THREE.Color(0xffffff), fog: 0x000000 },
  acid:       { c1: new THREE.Color(0x00ff44), c2: new THREE.Color(0xddff00), c3: new THREE.Color(0xff8800), fog: 0x001100 },
  rave:       { c1: new THREE.Color(0xff00cc), c2: new THREE.Color(0x9900ff), c3: new THREE.Color(0xff5500), fog: 0x050010 },
  industrial: { c1: new THREE.Color(0xff2200), c2: new THREE.Color(0xff7700), c3: new THREE.Color(0xffcc00), fog: 0x0a0200 },
  mono:       { c1: new THREE.Color(0xffffff), c2: new THREE.Color(0x888888), c3: new THREE.Color(0x333333), fog: 0x000000 },
};

const SCENES = {
  vortex: { tunnel: true,  sphere: false, particles: true,  waveform: true,  bars: false, grid: false },
  rave:   { tunnel: false, sphere: true,  particles: true,  waveform: false, bars: true,  grid: true  },
  grid:   { tunnel: false, sphere: false, particles: false, waveform: true,  bars: true,  grid: true  },
  chaos:  { tunnel: true,  sphere: true,  particles: true,  waveform: true,  bars: true,  grid: true  },
  chill:  { tunnel: false, sphere: true,  particles: false, waveform: true,  bars: false, grid: true  },
};

let currentPalette  = 'tekno';
let strobeEnabled   = false;

const effectState = { tunnel: true, sphere: false, particles: true, waveform: true, bars: false, grid: false };

// SC state
let scWidget = null, scPlaying = false, scDuration = 0, usingSoundCloud = false;

// ============================================================
// PARAM SYSTEM
// ============================================================
function setParam(name, rawValue, isNormalized = false) {
  const p = P[name];
  if (!p) return;
  const v = isNormalized
    ? p.min + Math.max(0, Math.min(1, rawValue)) * (p.max - p.min)
    : Math.max(p.min, Math.min(p.max, rawValue));
  p.v = v;
  applyParam(name, v);
  const norm = (v - p.min) / (p.max - p.min);
  refreshKnob(name, norm);
}

function applyParam(name, v) {
  switch (name) {
    case 'bloomStrength': if (bloomPass)  bloomPass.strength = v; break;
    case 'bloomRadius':   if (bloomPass)  bloomPass.radius   = v; break;
    case 'glitchAmt':     glitchIntensity = v; break;
    case 'chromaAmt':     if (chromaPass) chromaPass.uniforms.uAmt.value = v; break;
    case 'masterVolume':
      if (!isMuted && audioEl) audioEl.volume = v;
      break;
    // All others are read by update* functions from P.*
  }
}

let glitchIntensity = 0;

// Pre-allocated reusable objects — avoids GC pressure from per-frame allocations
const _tmpColor  = new THREE.Color();
const _fogTarget = new THREE.Color();

// ============================================================
// MIDI ENGINE
// ============================================================
async function initMIDI() {
  const btn = document.getElementById('midi-btn');
  if (!navigator.requestMIDIAccess) {
    if (btn) btn.textContent = 'NO MIDI';
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess();
    midiActive = true;
    midiAccess.inputs.forEach(inp => { inp.onmidimessage = onMIDIMsg; });
    midiAccess.onstatechange = e => {
      if (e.port.type === 'input' && e.port.state === 'connected')
        e.port.onmidimessage = onMIDIMsg;
      updateMidiBtn();
    };
    updateMidiBtn();
  } catch { if (btn) { btn.textContent = 'MIDI DENIED'; btn.classList.add('err'); } }
}

function onMIDIMsg(e) {
  const [st, b1, b2] = e.data;
  const type = st & 0xf0;

  if (type === 0xb0) {                       // CC message
    if (midiLearnParam) {
      midiBindings[b1] = midiLearnParam;
      const knob = document.querySelector(`.vj-knob[data-param="${midiLearnParam}"]`);
      if (knob) { knob.classList.remove('midi-learn'); knob.dataset.midiCc = b1; }
      midiLearnParam = null;
    }
    const param = midiBindings[b1];
    if (param) setParam(param, b2 / 127, true);
  }

  if (type === 0x90 && b2 > 0) {             // Note on — toggle effects
    const toggleMap = { 1:'tunnel', 4:'sphere', 7:'particles', 10:'waveform', 13:'bars', 16:'grid' };
    const fx = toggleMap[b1];
    if (fx) { effectState[fx] = !effectState[fx]; syncCellLed(fx); }
  }
}

function applyMidiMixDefaults() {
  Object.assign(midiBindings, MIDIMIX_DEFAULTS);
  document.querySelectorAll('.vj-knob[data-param]').forEach(k => {
    const cc = Object.entries(midiBindings).find(([, v]) => v === k.dataset.param)?.[0];
    if (cc) k.dataset.midiCc = cc;
  });
  updateMidiBtn();
}

function startMidiLearn(paramName) {
  if (midiLearnParam) {
    document.querySelector(`.vj-knob[data-param="${midiLearnParam}"]`)?.classList.remove('midi-learn');
  }
  midiLearnParam = paramName;
  document.querySelector(`.vj-knob[data-param="${paramName}"]`)?.classList.add('midi-learn');
}

function updateMidiBtn() {
  const btn  = document.getElementById('midi-btn');
  const stat = document.getElementById('midi-status');
  if (!btn) return;
  const count = midiAccess ? [...midiAccess.inputs.values()].length : 0;
  btn.classList.toggle('active', midiActive && count > 0);
  if (stat) stat.textContent = count > 0 ? `${count} DEV` : 'NO DEV';
}

// ============================================================
// KNOB SYSTEM
// ============================================================
const K_R  = 17, K_CX = 22, K_CY = 22;
const K_C  = 2 * Math.PI * K_R;         // ~106.81
const K_ARC = K_C * 0.75;               // 270° = ~80.11
const K_GAP = K_C - K_ARC;              // 90°  = ~26.70
const K_ROT = 135;                       // Rotation: start at 7 o'clock

function renderKnob(svgEl, norm, color) {
  const col  = color || 'currentColor';
  const valL = Math.max(0.01, norm * K_ARC);
  const aDeg = K_ROT + norm * 270;
  const aRad = aDeg * Math.PI / 180;
  const ix   = K_CX + 12 * Math.cos(aRad);
  const iy   = K_CY + 12 * Math.sin(aRad);
  svgEl.innerHTML = `
    <circle cx="${K_CX}" cy="${K_CY}" r="${K_R}" class="k-bg"
      stroke-dasharray="${K_ARC} ${K_GAP}" transform="rotate(${K_ROT},${K_CX},${K_CY})"/>
    <circle cx="${K_CX}" cy="${K_CY}" r="${K_R}" class="k-fg" stroke="${col}"
      stroke-dasharray="${valL} 999" transform="rotate(${K_ROT},${K_CX},${K_CY})"/>
    <circle cx="${ix}" cy="${iy}" r="2.5" class="k-dot" fill="${col}"/>
    <circle cx="${K_CX}" cy="${K_CY}" r="4.5" class="k-hub"/>
  `;
}

function refreshKnob(paramName, norm) {
  const el = document.querySelector(`.vj-knob[data-param="${paramName}"]`);
  if (!el) return;
  const svg = el.querySelector('svg');
  const val = el.querySelector('.kv');
  if (svg) renderKnob(svg, norm, el.dataset.color);
  if (val) {
    const p = P[paramName];
    val.textContent = (p.min + norm * (p.max - p.min)).toFixed(2);
  }
}

function initKnobs() {
  document.querySelectorAll('.vj-knob[data-param]').forEach(knob => {
    const pname = knob.dataset.param;
    const p = P[pname];
    if (!p) return;

    // Initial render
    const norm = (p.v - p.min) / (p.max - p.min);
    const svg  = knob.querySelector('svg');
    if (svg) renderKnob(svg, norm, knob.dataset.color);
    const valEl = knob.querySelector('.kv');
    if (valEl) valEl.textContent = p.v.toFixed(2);

    // Drag (vertical)
    let startY, startNorm;
    knob.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      startY    = e.clientY;
      startNorm = (P[pname].v - P[pname].min) / (P[pname].max - P[pname].min);
    });
    knob.addEventListener('pointermove', e => {
      if (!knob.hasPointerCapture(e.pointerId)) return;
      const sens = e.shiftKey ? 0.003 : 0.012;
      const n    = Math.max(0, Math.min(1, startNorm + (startY - e.clientY) * sens));
      setParam(pname, n, true);
    });

    // Double-click → reset
    knob.addEventListener('dblclick', () => {
      const pd = P[pname].def ?? (P[pname].min + (P[pname].max - P[pname].min) * 0.5);
      setParam(pname, pd);
    });

    // Right-click → MIDI learn
    knob.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (midiActive) startMidiLearn(pname);
    });
  });
}

// ============================================================
// AUDIO ENGINE
// ============================================================
function initAudio() {
  if (audioInitialized) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  waveAnalyser = audioCtx.createAnalyser();
  waveAnalyser.fftSize = 1024;
  waveData = new Uint8Array(waveAnalyser.fftSize);
  audioInitialized = true;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  // Cache frequency bin index ranges once — avoids computing bw/floor/ceil every frame
  const nyquist = audioCtx.sampleRate / 2;
  const bw = nyquist / analyser.frequencyBinCount;
  const bins = (lo, hi) => [Math.floor(lo / bw), Math.min(Math.ceil(hi / bw), freqData.length - 1)];
  _bandBins = { sub: bins(20, 60), bass: bins(60, 250), mid: bins(250, 2500), high: bins(2500, 12000) };
}

function loadAudioFile(url, autoPlay = true) {
  initAudio();
  if (usingSoundCloud && scWidget) { scWidget.pause(); usingSoundCloud = false; }
  if (audioEl) audioEl.pause();
  audioEl = new Audio(url);
  audioEl.crossOrigin = 'anonymous';
  audioEl.volume = isMuted ? 0 : P.masterVolume.v;
  const src = audioCtx.createMediaElementSource(audioEl);
  src.connect(analyser);
  src.connect(waveAnalyser);
  analyser.connect(audioCtx.destination);
  if (autoPlay) audioEl.play().catch(() => {});
}

function togglePlayPause() {
  if (usingSoundCloud && scWidget) { scPlaying ? scWidget.pause() : scWidget.play(); return; }
  if (!audioInitialized) { loadAudioFile('sound.mp3', true); return; }
  if (!audioEl) return;
  if (audioEl.paused) { if (audioCtx.state === 'suspended') audioCtx.resume(); audioEl.play().catch(() => {}); }
  else audioEl.pause();
}

function _bandSum(a, b) {
  if (a > b) return 0;
  let s = 0; for (let i = a; i <= b; i++) s += freqData[i];
  return s / ((b - a + 1) * 255);
}

function updateAudio() {
  if (!audioCtx || !analyser) return;
  analyser.getByteFrequencyData(freqData);
  if (waveAnalyser) waveAnalyser.getByteTimeDomainData(waveData);

  if (_bandBins) {
    bands.sub  = _bandSum(_bandBins.sub[0],  _bandBins.sub[1]);
    bands.bass = _bandSum(_bandBins.bass[0], _bandBins.bass[1]);
    bands.mid  = _bandSum(_bandBins.mid[0],  _bandBins.mid[1]);
    bands.high = _bandSum(_bandBins.high[0], _bandBins.high[1]);
  }
  const a = 0.18;
  bandsSmooth.sub  = bandsSmooth.sub  * (1 - a) + bands.sub  * a;
  bandsSmooth.bass = bandsSmooth.bass * (1 - a) + bands.bass * a;
  bandsSmooth.mid  = bandsSmooth.mid  * (1 - a) + bands.mid  * a;
  bandsSmooth.high = bandsSmooth.high * (1 - a) + bands.high * a;

  // Beat detection — ring buffer, zero allocations
  const energy = bands.sub * 0.55 + bands.bass * 0.45;
  const now    = performance.now();
  _onsetE[_onsetHead] = energy;
  _onsetT[_onsetHead] = now;
  _onsetHead = (_onsetHead + 1) % ONSET_SIZE;
  if (_onsetLen < ONSET_SIZE) _onsetLen++;

  let avg = 0, variance = 0, wCnt = 0;
  if (_onsetLen > 5) {
    for (let j = 0; j < _onsetLen; j++) {
      const idx = (_onsetHead - 1 - j + ONSET_SIZE) % ONSET_SIZE;
      if (now - _onsetT[idx] > 1800) break;
      avg += _onsetE[idx]; wCnt++;
    }
    if (wCnt > 5) {
      avg /= wCnt;
      for (let j = 0; j < wCnt; j++) {
        const idx = (_onsetHead - 1 - j + ONSET_SIZE) % ONSET_SIZE;
        const d = _onsetE[idx] - avg; variance += d * d;
      }
      variance /= wCnt;
    } else { avg = 0; }
  }
  const thr = avg + 1.3 * Math.sqrt(variance);
  if (energy > thr && energy > 0.12 && now - lastBeatMs > 300) {
    const gap = now - lastBeatMs;
    beatDetected = true; beatDecay = 1;
    if (gap > 180 && gap < 2100) {
      bpm = bpm * 0.88 + (60000 / gap) * 0.12;
      bpm = Math.max(55, Math.min(220, bpm));
    }
    lastBeatMs = now;
    if (_uiBpmEl) _uiBpmEl.textContent = Math.round(bpm);
  } else { beatDetected = false; }
  beatDecay = Math.max(0, beatDecay - 0.06);
}

// ============================================================
// EFFECT — TUNNEL
// ============================================================
function buildTunnel() {
  const group = new THREE.Group(), rings = [], COUNT = 60, SPREAD = 7;
  const sides = [5, 6, 7, 8];
  for (let i = 0; i < COUNT; i++) {
    const s = sides[i % sides.length], r = 1.7 + Math.random() * 0.4;
    const geo = new THREE.RingGeometry(r, r + 0.12 + Math.random() * 0.08, s);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, side: THREE.DoubleSide,
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = -i * SPREAD;
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.rotation.x = (Math.random() - 0.5) * 0.25;
    rings.push({ mesh, rotSpeed: (Math.random() - 0.5) * 0.6 });
    group.add(mesh);
  }
  scene.add(group);
  return { group, rings, COUNT, SPREAD };
}

function updateTunnel(delta) {
  if (!tunnel) return;
  tunnel.group.visible = effectState.tunnel;
  if (!effectState.tunnel) return;
  const pal = PALETTES[currentPalette];
  const isOn = (audioEl && !audioEl.paused) || (usingSoundCloud && scPlaying);
  const speed = 18 * P.tunnelSpeed.v * (1 + bandsSmooth.bass * 2.5);
  tunnel.rings.forEach(r => {
    if (isOn) {
      r.mesh.position.z += delta * speed;
      if (r.mesh.position.z > 4) r.mesh.position.z -= tunnel.COUNT * tunnel.SPREAD;
    }
    r.mesh.rotation.z += delta * r.rotSpeed * (1 + bandsSmooth.mid * 0.8);
    const prox = Math.max(0, 1 - Math.abs(r.mesh.position.z) / (tunnel.COUNT * tunnel.SPREAD * 0.5));
    if (beatDetected) { r.mesh.material.color.copy(pal.c2); r.mesh.material.opacity = 0.95; }
    else { r.mesh.material.color.lerp(pal.c1, 0.06); r.mesh.material.opacity = 0.08 + prox * P.tunnelGlow.v + bandsSmooth.sub * 0.3; }
  });
}

// ============================================================
// EFFECT — FREQ SPHERE
// ============================================================
function buildFreqSphere() {
  const freqTexData = new Uint8Array(256 * 4).fill(0);
  const freqTex = new THREE.DataTexture(freqTexData, 256, 1, THREE.RGBAFormat);
  freqTex.needsUpdate = true;
  const geo = new THREE.IcosahedronGeometry(1.5, 4);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFreqTex: { value: freqTex },
      uBass: { value: 0 }, uMid: { value: 0 }, uTime: { value: 0 },
      uCol1: { value: new THREE.Color(0x00ffff) },
      uCol2: { value: new THREE.Color(0xff00ff) },
    },
    vertexShader: /* glsl */`
      uniform sampler2D uFreqTex;
      uniform float uBass, uMid, uTime;
      varying float vFreq;
      void main() {
        vec3 n = normalize(position);
        float freq = texture2D(uFreqTex, vec2(atan(n.z,n.x)/(2.*3.14159)+.5, .5)).r;
        float d = freq*uBass*2.8 + uMid*.45*sin(n.x*9.+uTime*2.1+n.y*6.) + .08*sin(n.y*14.+uTime*3.5);
        vFreq = freq;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal*d, 1.);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uCol1, uCol2;
      uniform float uBass;
      varying float vFreq;
      void main() {
        gl_FragColor = vec4(mix(uCol1,uCol2,vFreq+uBass*.3), .55+vFreq*.45);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, wireframe: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return { mesh, mat, freqTex, freqTexData };
}

function updateFreqSphere(delta, time) {
  if (!freqSphere) return;
  freqSphere.mesh.visible = effectState.sphere;
  if (!effectState.sphere) return;
  const pal = PALETTES[currentPalette];
  if (freqData) {
    const d = freqSphere.freqTexData;
    for (let i = 0; i < 256; i++) { const v = freqData[i]||0; d[i*4]=v; d[i*4+1]=v; d[i*4+2]=v; d[i*4+3]=255; }
    freqSphere.freqTex.needsUpdate = true;
  }
  const u = freqSphere.mat.uniforms;
  u.uBass.value = bandsSmooth.bass;
  u.uMid.value  = bandsSmooth.mid;
  u.uTime.value = time;
  u.uCol1.value.lerp(pal.c1, 0.07);
  u.uCol2.value.lerp(pal.c2, 0.07);
  const isOn = (audioEl && !audioEl.paused) || (usingSoundCloud && scPlaying);
  const rot  = P.sphereSpeed.v * (isOn ? 0.22 + bandsSmooth.mid * 0.6 : 0.04);
  freqSphere.mesh.rotation.y += delta * rot;
  freqSphere.mesh.rotation.x += delta * 0.09 * (1 + bandsSmooth.high);
  const ts = P.sphereSize.v * (1 + bandsSmooth.bass * 0.25 + (beatDetected ? 0.12 : 0));
  const s  = freqSphere.mesh.scale.x;
  freqSphere.mesh.scale.setScalar(s + (ts - s) * 0.18);
}

// ============================================================
// EFFECT — PARTICLES
// ============================================================
function buildParticles(count = 5000) {
  const positions = new Float32Array(count * 3);
  // Pack velocity data into TypedArrays: vx, vy, vz, life, maxLife — avoids per-particle object overhead
  const velX    = new Float32Array(count);
  const velY    = new Float32Array(count);
  const velZ    = new Float32Array(count);
  const life    = new Float32Array(count);
  const maxLife = new Float32Array(count);
  const reset = (i, burst = false) => {
    const t = Math.random()*Math.PI*2, p = Math.acos(2*Math.random()-1), r = Math.random()*.3;
    positions[i*3]   = Math.sin(p)*Math.cos(t)*r;
    positions[i*3+1] = Math.sin(p)*Math.sin(t)*r;
    positions[i*3+2] = Math.cos(p)*r;
    const sp = burst ? 1.5+Math.random()*2.5 : 0.2+Math.random()*0.8;
    velX[i]    = (Math.random()-.5)*sp;
    velY[i]    = (Math.random()-.5)*sp;
    velZ[i]    = (Math.random()-.5)*sp;
    life[i]    = Math.random()*2;
    maxLife[i] = 1.5+Math.random()*2.5;
  };
  for (let i = 0; i < count; i++) reset(i, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x00ffff, size: 0.04, sizeAttenuation: true,
    transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.Points(geo, mat);
  scene.add(mesh);
  return { mesh, positions, velX, velY, velZ, life, maxLife, count, reset };
}

function updateParticles(delta) {
  if (!stormParticles) return;
  stormParticles.mesh.visible = effectState.particles;
  if (!effectState.particles) return;
  const pal = PALETTES[currentPalette];
  const isOn = (audioEl && !audioEl.paused) || (usingSoundCloud && scPlaying);
  const spMul = P.stormSpeed.v * (1 + bandsSmooth.bass * 4 + (beatDetected ? 2 : 0));
  const { positions, velX, velY, velZ, life, maxLife } = stormParticles;
  for (let i = 0; i < stormParticles.count; i++) {
    life[i] -= delta;
    if (life[i] <= 0) { stormParticles.reset(i, beatDetected); life[i] = maxLife[i]; }
    else if (isOn) {
      positions[i*3]   += velX[i] * delta * spMul;
      positions[i*3+1] += velY[i] * delta * spMul;
      positions[i*3+2] += velZ[i] * delta * spMul;
    }
  }
  stormParticles.mesh.geometry.attributes.position.needsUpdate = true;
  stormParticles.mesh.material.color.lerp(pal.c1, 0.05);
  stormParticles.mesh.material.size = 0.035 * P.stormSize.v + bandsSmooth.bass * 0.08;
}

// ============================================================
// EFFECT — WAVEFORM RING
// ============================================================
function buildWaveformRing(segs = 512) {
  // Pre-cache angles to avoid 512 sin/cos calls every frame
  const cosCache = new Float32Array(segs);
  const sinCache = new Float32Array(segs);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    cosCache[i] = Math.cos(a);
    sinCache[i] = Math.sin(a);
  }
  const mkLine = (col, op) => {
    const pos = new Float32Array((segs+1)*3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.LineLoop(geo, mat);
    line.position.z = 0.5;
    scene.add(line);
    return { line, pos };
  };
  return { ...mkLine(0x00ffff, 0.85), segs, cosCache, sinCache, l2: mkLine(0xff00ff, 0.35) };
}

function updateWaveformRing() {
  if (!waveRing) return;
  waveRing.line.visible  = effectState.waveform;
  waveRing.l2.line.visible = effectState.waveform;
  if (!effectState.waveform) return;
  const pal = PALETTES[currentPalette];
  const R1 = P.waveRadius.v + bandsSmooth.bass * 0.6;
  const R2 = R1 + 0.35 + bandsSmooth.mid * 0.2;
  const waveStep = waveData ? waveData.length / waveRing.segs : 0;
  for (let i = 0; i < waveRing.segs; i++) {
    const sample = waveData ? (waveData[Math.floor(i * waveStep)] / 128 - 1) : 0;
    const disp = sample * P.waveSens.v * 1.1 * (1 + bandsSmooth.mid * 0.6);
    const r1 = R1 + disp, r2 = R2 - disp * 0.5;
    const cx = waveRing.cosCache[i], sx = waveRing.sinCache[i];
    waveRing.pos[i*3]   = cx * r1;
    waveRing.pos[i*3+1] = sx * r1;
    waveRing.pos[i*3+2] = 0;
    waveRing.l2.pos[i*3]   = cx * r2;
    waveRing.l2.pos[i*3+1] = sx * r2;
    waveRing.l2.pos[i*3+2] = 0;
  }
  waveRing.line.geometry.attributes.position.needsUpdate = true;
  waveRing.l2.line.geometry.attributes.position.needsUpdate = true;
  waveRing.line.material.color.lerp(pal.c1, 0.06);
  waveRing.l2.line.material.color.lerp(pal.c2, 0.06);
  waveRing.line.rotation.z  += 0.0008;
  waveRing.l2.line.rotation.z -= 0.0006;
}

// ============================================================
// EFFECT — FREQ BARS
// ============================================================
function buildFreqBars(numBars = 64) {
  const group = new THREE.Group(), bars = [], R = 5.8;
  for (let i = 0; i < numBars; i++) {
    const angle = (i / numBars) * Math.PI * 2;
    const geo = new THREE.BoxGeometry(0.12, 1, 0.12);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle)*R, -2.5, Math.sin(angle)*R);
    mesh.rotation.y = -angle;
    bars.push(mesh);
    group.add(mesh);
  }
  scene.add(group);
  return { group, bars, numBars };
}

function updateFreqBars() {
  if (!freqBars) return;
  freqBars.group.visible = effectState.bars;
  if (!effectState.bars) return;
  const pal = PALETTES[currentPalette];
  const half = freqBars.numBars / 2, maxB = freqData ? Math.floor(freqData.length * 0.5) : 1;
  for (let i = 0; i < freqBars.numBars; i++) {
    const binIdx = i < half ? i : freqBars.numBars - 1 - i;
    const val    = freqData ? freqData[Math.floor(binIdx * maxB / half)] / 255 : 0;
    const th     = val * P.barsHeight.v * 5.5 * P.barsScale.v + 0.05;
    freqBars.bars[i].scale.y += (th - freqBars.bars[i].scale.y) * 0.28;
    _tmpColor.lerpColors(pal.c1, pal.c2, val);
    freqBars.bars[i].material.color.copy(_tmpColor);
  }
  freqBars.group.rotation.y += 0.0025;
}

// ============================================================
// EFFECT — GRID
// ============================================================
function buildGridFloor() {
  const group = new THREE.Group();
  const grid  = new THREE.GridHelper(80, 80, 0x00ffff, 0x003333);
  grid.position.y = -3;
  grid.material.transparent = true;
  grid.material.opacity = 0.7;
  group.add(grid);
  const lMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
  for (let i = -5; i <= 5; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i*4,-3,0), new THREE.Vector3(i*.1,-3,-80)]);
    group.add(new THREE.Line(g, lMat));
  }
  scene.add(group);
  return { group, grid, scrollZ: 0 };
}

function updateGridFloor(delta) {
  if (!gridFloor) return;
  gridFloor.group.visible = effectState.grid;
  if (!effectState.grid) return;
  const pal = PALETTES[currentPalette];
  const isOn = (audioEl && !audioEl.paused) || (usingSoundCloud && scPlaying);
  if (isOn) { gridFloor.scrollZ += delta * P.gridSpeed.v * 4 * (1 + bandsSmooth.bass * 1.8); gridFloor.group.position.z = gridFloor.scrollZ % 1; }
  gridFloor.grid.material[0].color.lerp(pal.c1, 0.04);
  gridFloor.grid.material[0].opacity = P.gridGlow.v * (0.4 + bandsSmooth.bass * 0.35);
}

// ============================================================
// EFFECT — SUBJECT BILLBOARD (separate scene, no bloom)
// ============================================================
function buildSubjectBillboard() {
  const geo  = new THREE.PlaneGeometry(2.5, 2.5);
  const mat  = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = 3;
  mesh.visible    = false;
  subjectScene    = new THREE.Scene();
  subjectScene.add(mesh);
  return { mesh, mat };
}

function loadSubjectTexture(url) {
  if (!subjectBillboard) return;
  new THREE.TextureLoader().load(url, tex => {
    subjectAspect = tex.image.width / tex.image.height;
    subjectBillboard.mat.map = tex;
    subjectBillboard.mat.needsUpdate = true;
    subjectBillboard.mesh.scale.set(subjectAspect, 1, 1);
    subjectBillboard.mesh.visible = true;
  });
}

function updateSubjectBillboard(time) {
  if (!subjectBillboard?.mesh.visible) return;
  subjectBillboard.mesh.position.y = Math.sin(time * 1.15) * 0.09;
  subjectBillboard.mesh.position.x = Math.cos(time * 0.73) * 0.05;
  subjectBillboard.mesh.rotation.z = Math.sin(time * 0.48) * 0.025;
  const isOn = (audioEl && !audioEl.paused) || (usingSoundCloud && scPlaying);
  let pulse = 0;
  if (isOn) {
    pulse = bandsSmooth.bass * 0.18 + (beatDetected ? 0.18 : 0);
  } else {
    const phase = (time % (60 / bpm)) / (60 / bpm);
    pulse = phase < 0.12 ? Math.pow(1 - phase / 0.12, 2) * 0.14 : 0;
  }
  const ts = 1 + pulse;
  const cx = subjectBillboard.mesh.scale.x, cy = subjectBillboard.mesh.scale.y;
  subjectBillboard.mesh.scale.set(cx + (subjectAspect*ts-cx)*0.2, cy + (ts-cy)*0.2, 1);
}

// ============================================================
// POST-FX — CHROMATIC ABERRATION
// ============================================================
function buildChromaPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uAmt:     { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uAmt;
      varying vec2 vUv;
      void main() {
        vec2 dir    = vUv - 0.5;
        vec2 offset = normalize(dir + 0.0001) * uAmt * length(dir) * 2.0;
        float r = texture2D(tDiffuse, vUv + offset).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv - offset).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `,
  });
}

// ============================================================
// POST-FX — FEEDBACK LOOP
// ============================================================
function buildFeedbackPass(w, h) {
  feedbackTex = new THREE.FramebufferTexture(w, h, THREE.RGBAFormat);
  feedbackTex.minFilter = THREE.LinearFilter;
  feedbackTex.magFilter = THREE.LinearFilter;
  return new ShaderPass({
    uniforms: {
      tDiffuse:     { value: null },
      uFeedbackTex: { value: feedbackTex },
      uAmt:         { value: 0 },
      uZoom:        { value: 1.01 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform sampler2D uFeedbackTex;
      uniform float uAmt;
      uniform float uZoom;
      varying vec2 vUv;
      void main() {
        vec2 zuv = (vUv - 0.5) / uZoom + 0.5;
        vec4 prev = (zuv.x < 0.0 || zuv.x > 1.0 || zuv.y < 0.0 || zuv.y > 1.0)
          ? vec4(0.0) : texture2D(uFeedbackTex, zuv);
        vec4 cur  = texture2D(tDiffuse, vUv);
        gl_FragColor = clamp(cur + prev * uAmt, 0.0, 1.5);
      }
    `,
  });
}

// ============================================================
// EFFECT — OBJ MODEL
// ============================================================
function loadOBJFile(url) {
  if (objGroup) {
    scene.remove(objGroup);
    objGroup.traverse(c => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
    objGroup = null;
  }
  new OBJLoader().load(url, obj => {
    const box    = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale  = 2.5 / maxDim;
    obj.position.sub(center.multiplyScalar(scale));
    obj.scale.setScalar(scale);
    obj.userData.baseScale = scale;
    const pal = PALETTES[currentPalette];
    obj.traverse(c => {
      if (!c.isMesh) return;
      c.material = new THREE.MeshBasicMaterial({
        color: pal.c1.clone(), wireframe: true,
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
    });
    objGroup = obj;
    scene.add(objGroup);
  }, undefined, err => console.warn('OBJ load error:', err));
}

function updateOBJModel(delta, time) {
  if (!objGroup) return;
  const pal  = PALETTES[currentPalette];
  const base = objGroup.userData.baseScale || 1;
  const ts   = base * (1 + bandsSmooth.bass * 0.35 + (beatDetected ? 0.18 : 0));
  const s    = objGroup.scale.x;
  objGroup.scale.setScalar(s + (ts - s) * 0.15);
  objGroup.rotation.y += delta * (0.4 + bandsSmooth.mid * 1.8);
  objGroup.rotation.x  = Math.sin(time * 0.28) * 0.18;
  objGroup.traverse(c => {
    if (c.isMesh) c.material.color.lerp(pal.c1, 0.06);
  });
}

// ============================================================
// BACKGROUND
// ============================================================
function loadBackground(urlOrNull) {
  if (bgMesh) { scene.remove(bgMesh); bgMesh.geometry.dispose(); bgMesh.material.dispose(); bgMesh = null; }
  if (!urlOrNull) return;
  new THREE.TextureLoader().load(urlOrNull, tex => {
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(60,34), new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, side: THREE.DoubleSide }));
    bgMesh.position.z = -30;
    scene.add(bgMesh);
  });
}

// ============================================================
// INIT
// ============================================================
function init() {
  const container = document.getElementById('canvas-container');
  if (!container) return;
  container.style.position = 'relative';

  // Strobe overlay
  strobeOverlay = document.createElement('div');
  strobeOverlay.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:20;transition:opacity 25ms';
  container.appendChild(strobeOverlay);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog        = new THREE.FogExp2(0x000000, 0.018);

  camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.1, 800);
  camera.position.set(0, 0, 8);
  scene.add(camera);

  clock = new THREE.Clock();

  scene.add(new THREE.AmbientLight(0x111111, 1));
  pointLight1 = new THREE.PointLight(0x00ffff, 2, 40);
  pointLight1.position.set(5, 5, 3); scene.add(pointLight1);
  pointLight2 = new THREE.PointLight(0xff00ff, 2, 40);
  pointLight2.position.set(-5, -5, 3); scene.add(pointLight2);

  composer  = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bW = Math.floor(container.clientWidth * 0.6), bH = Math.floor(container.clientHeight * 0.6);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(bW, bH), P.bloomStrength.v, P.bloomRadius.v, 0.06);
  composer.addPass(bloomPass);
  glitchPass = new GlitchPass(); glitchPass.enabled = false;
  composer.addPass(glitchPass);
  chromaPass = buildChromaPass();
  composer.addPass(chromaPass);
  feedbackPass = buildFeedbackPass(container.clientWidth, container.clientHeight);
  composer.addPass(feedbackPass);

  tunnel          = buildTunnel();
  freqSphere      = buildFreqSphere();
  stormParticles  = buildParticles();
  waveRing        = buildWaveformRing();
  freqBars        = buildFreqBars();
  gridFloor       = buildGridFloor();
  subjectBillboard = buildSubjectBillboard();

  // No subject loaded by default — user picks one

  // Force-compile all shaders NOW before user interaction — prevents freeze on first scene switch
  renderer.compile(scene, camera);

  applyScene('vortex');

  initKnobs();
  initUICache();
  initMIDI();
  setupControls();

  window.addEventListener('resize', onResize);
  animate();
}

// ============================================================
// ANIMATE LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const time  = clock.getElapsedTime();

  updateAudio();
  updateTunnel(delta);
  updateFreqSphere(delta, time);
  updateParticles(delta);
  updateWaveformRing();
  updateFreqBars();
  updateGridFloor(delta);
  updateSubjectBillboard(time);
  updateOBJModel(delta, time);

  const pal = PALETTES[currentPalette];
  pointLight1.color.lerp(pal.c1, 0.05);
  pointLight2.color.lerp(pal.c2, 0.05);
  pointLight1.intensity = 1.5 + bandsSmooth.bass * 4;
  pointLight2.intensity = 1   + bandsSmooth.mid  * 3;

  if (beatDetected) {
    camera.position.x += (Math.random() - 0.5) * 0.12;
    camera.position.y += (Math.random() - 0.5) * 0.08;
  } else {
    camera.position.x += (0 - camera.position.x) * 0.06;
    camera.position.y += (0 - camera.position.y) * 0.06;
  }

  if (strobeEnabled && beatDetected) {
    strobeOverlay.style.opacity = '0.8';
    setTimeout(() => { if (strobeOverlay) strobeOverlay.style.opacity = '0'; }, 28);
  }

  if (glitchPass) {
    glitchPass.enabled = glitchIntensity > 0.04;
    if (beatDetected && glitchIntensity > 0.15) glitchBeatFrames = 4;
    glitchPass.goWild = glitchIntensity > 0.65 || glitchBeatFrames > 0;
    glitchBeatFrames  = Math.max(0, glitchBeatFrames - 1);
  }

  // Beat-reactive chromatic aberration
  if (chromaPass) {
    chromaPass.uniforms.uAmt.value = P.chromaAmt.v + (beatDetected ? P.chromaAmt.v * 0.8 : 0);
  }

  // Feedback loop uniforms
  if (feedbackPass) {
    feedbackPass.uniforms.uAmt.value  = P.feedbackAmt.v;
    feedbackPass.uniforms.uZoom.value = P.feedbackZoom.v + (beatDetected ? 0.006 : 0);
  }

  _fogTarget.set(pal.fog); scene.fog.color.lerp(_fogTarget, 0.04);

  composer.render();

  // Subject: rendered AFTER bloom, never washed out
  if (subjectScene && subjectBillboard?.mesh.visible) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(subjectScene, camera);
    renderer.autoClear = true;
  }

  // Capture final frame into feedback texture (GPU→GPU, no readback)
  if (feedbackTex && P.feedbackAmt.v > 0.01) {
    renderer.copyFramebufferToTexture(feedbackTex, new THREE.Vector2(0, 0));
  }

  updateUI();
}

// ============================================================
// UI UPDATES
// ============================================================
let _uiPpBtn = null, _uiPpSpan = null, _uiPpIcon = null, _uiBpmEl = null, _uiSeekEl = null;
let _uiPrevIsOn = null, _uiPrevOpacity = '';

function initUICache() {
  _uiPpBtn  = document.getElementById('play-pause-btn');
  _uiPpSpan = _uiPpBtn?.querySelector('span') ?? null;
  _uiPpIcon = _uiPpBtn?.querySelector('i') ?? null;
  _uiBpmEl  = document.getElementById('bpm-readout');
  _uiSeekEl = document.getElementById('seek-slider');
}

function updateUI() {
  const isOn = (audioEl && !audioEl.paused) || (usingSoundCloud && scPlaying);
  if (isOn !== _uiPrevIsOn) {
    _uiPrevIsOn = isOn;
    if (_uiPpSpan) _uiPpSpan.textContent = isOn ? 'PAUSE' : 'PLAY';
    if (_uiPpIcon) _uiPpIcon.className = isOn ? 'fas fa-pause' : 'fas fa-play';
  }
  if (_uiBpmEl) {
    const op = beatDetected ? '1' : (0.4 + bandsSmooth.bass * 0.6).toFixed(2);
    if (op !== _uiPrevOpacity) { _uiPrevOpacity = op; _uiBpmEl.style.opacity = op; }
  }

  const now = performance.now();
  if (now - lastSeekUpdateMs > 120) {
    const seekEl = _uiSeekEl;
    if (seekEl) {
      if (usingSoundCloud && scWidget && scDuration > 0) {
        scWidget.getPosition(pos => { seekEl.value = (pos/1000)/scDuration; });
      } else if (audioEl && !isNaN(audioEl.duration) && isOn) {
        seekEl.value = audioEl.currentTime / audioEl.duration;
      }
    }
    lastSeekUpdateMs = now;
  }
}

// ============================================================
// HELPERS
// ============================================================
function applyScene(name) {
  const preset = SCENES[name];
  if (!preset) return;
  for (const k in preset) {
    effectState[k] = preset[k];
    const cb = document.getElementById(`fx-${k}`);
    if (cb) cb.checked = preset[k];
    syncCellLed(k);
  }
}

function syncCellLed(fxName) {
  const cell = document.querySelector(`.vj-cell[data-effect="${fxName}"]`);
  if (!cell) return;
  const on = effectState[fxName];
  cell.classList.toggle('cell-on', on);
  const cb = document.getElementById(`fx-${fxName}`);
  if (cb) cb.checked = on;
}

function onResize() {
  const c = document.getElementById('canvas-container');
  if (!c) return;
  const w = c.clientWidth, h = c.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
  bloomPass.resolution.set(Math.floor(w * 0.6), Math.floor(h * 0.6));
  // Recreate feedback texture at new resolution
  if (feedbackTex) {
    feedbackTex.dispose();
    feedbackTex = new THREE.FramebufferTexture(w, h, THREE.RGBAFormat);
    feedbackTex.minFilter = THREE.LinearFilter;
    feedbackTex.magFilter = THREE.LinearFilter;
    if (feedbackPass) feedbackPass.uniforms.uFeedbackTex.value = feedbackTex;
  }
}

// ============================================================
// CONTROLS
// ============================================================
function setupControls() {
  document.getElementById('play-pause-btn')?.addEventListener('click', togglePlayPause);

  document.getElementById('audio-upload-input')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    loadAudioFile(URL.createObjectURL(f), true);
    const btn = document.getElementById('upload-track-btn');
    if (btn) btn.innerHTML = `<i class="fas fa-music"></i><span>${f.name.length>14?f.name.slice(0,11)+'…':f.name}</span>`;
  });

  // Volume knob fallback (seek is a slider, volume is a knob)
  document.getElementById('seek-slider')?.addEventListener('input', e => {
    if (usingSoundCloud && scWidget && scDuration > 0) scWidget.seekTo(parseFloat(e.target.value)*scDuration*1000);
    else if (audioEl && !isNaN(audioEl.duration)) audioEl.currentTime = parseFloat(e.target.value)*audioEl.duration;
  });

  document.getElementById('mute-toggle')?.addEventListener('change', e => {
    isMuted = e.target.checked;
    if (audioEl) audioEl.volume = isMuted ? 0 : P.masterVolume.v;
  });

  document.getElementById('subject-select')?.addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'none') {
      if (subjectBillboard) subjectBillboard.mesh.visible = false;
    } else if (v === 'obj') {
      // handled by OBJ upload, no action here
    } else if (v !== 'custom') {
      if (objGroup) { scene.remove(objGroup); objGroup = null; }
      loadSubjectTexture('subj/' + v);
    }
  });
  document.getElementById('obj-upload-input')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (subjectBillboard) subjectBillboard.mesh.visible = false;
    loadOBJFile(URL.createObjectURL(f));
    const sel = document.getElementById('subject-select');
    if (sel) {
      let o = sel.querySelector('[value="obj"]');
      if (!o) { o = document.createElement('option'); o.value = 'obj'; sel.appendChild(o); }
      o.textContent = f.name.length > 14 ? f.name.slice(0,11) + '…' : f.name;
      sel.value = 'obj';
    }
  });
  document.getElementById('subject-upload-input')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => loadSubjectTexture(ev.target.result); r.readAsDataURL(f);
    const sel = document.getElementById('subject-select');
    if (sel) { let o=sel.querySelector('[value="custom"]'); if (!o){o=document.createElement('option');o.value='custom';sel.appendChild(o);} o.textContent=f.name.slice(0,10); sel.value='custom'; }
  });
  document.getElementById('background-select')?.addEventListener('change', e => {
    const v = e.target.value;
    if (v !== 'custom') loadBackground(v === 'none' ? null : 'bg/' + v);
  });
  document.getElementById('background-upload-input')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => loadBackground(ev.target.result); r.readAsDataURL(f);
    const sel = document.getElementById('background-select');
    if (sel) { let o=sel.querySelector('[value="custom"]'); if (!o){o=document.createElement('option');o.value='custom';sel.appendChild(o);} o.textContent='BG:'+f.name.slice(0,8); sel.value='custom'; }
  });

  // Strobe toggle
  document.getElementById('strobe-toggle')?.addEventListener('change', e => { strobeEnabled = e.target.checked; });

  // Effect cell LED buttons
  document.querySelectorAll('.cell-led-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fx = btn.dataset.effect;
      effectState[fx] = !effectState[fx];
      syncCellLed(fx);
    });
  });

  // Scene presets
  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scene-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyScene(btn.dataset.scene);
    });
  });

  // Color palettes
  document.querySelectorAll('.palette-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPalette = btn.dataset.palette;
    });
  });

  // Tap Tempo
  document.getElementById('tap-tempo-btn')?.addEventListener('click', () => {
    const now = performance.now(); tapTimes.push(now); if (tapTimes.length > 8) tapTimes.shift();
    if (tapTimes.length >= 2) {
      let tot = 0; for (let i=1;i<tapTimes.length;i++) tot+=tapTimes[i]-tapTimes[i-1];
      bpm = Math.max(55,Math.min(220, 60000/(tot/(tapTimes.length-1))));
      const el = document.getElementById('bpm-readout'); if (el) el.textContent = Math.round(bpm);
    }
  });

  // MIDI button
  document.getElementById('midi-btn')?.addEventListener('click', () => {
    if (!midiActive) initMIDI();
    else updateMidiBtn();
  });
  // MIDImix defaults
  document.getElementById('midimix-btn')?.addEventListener('click', applyMidiMixDefaults);

  setupSoundCloud();
}

// ============================================================
// SOUNDCLOUD
// ============================================================
function setupSoundCloud() {
  const btn=document.getElementById('soundcloud-btn'), modal=document.getElementById('soundcloud-modal');
  const close=document.getElementById('modal-close'), inp=document.getElementById('soundcloud-url'), load=document.getElementById('soundcloud-load');
  if (!btn||!modal) return;
  btn.addEventListener('click',()=>{modal.classList.remove('hidden');inp?.focus();});
  close?.addEventListener('click',()=>modal.classList.add('hidden'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')modal.classList.add('hidden');});
  load?.addEventListener('click',()=>{
    const url=inp?.value.trim(); if(!url||!url.includes('soundcloud.com')){alert('URL SoundCloud non valido');return;}
    loadSCTrack(url); modal.classList.add('hidden');
  });
  inp?.addEventListener('keydown',e=>{if(e.key==='Enter')load?.click();});
}

function loadSCTrack(url) {
  const iframe=document.getElementById('soundcloud-widget'); if(!iframe) return;
  if (audioEl&&!audioEl.paused) audioEl.pause();
  iframe.src=`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&buying=false&sharing=false&download=false&show_artwork=false&hide_related=true&visual=false`;
  usingSoundCloud=true;
  const setup=()=>{
    scWidget=SC.Widget(iframe);
    scWidget.bind(SC.Widget.Events.READY,()=>{
      scWidget.getCurrentSound(s=>{
        if(!s){usingSoundCloud=false;return;}
        scWidget.play(); scPlaying=true;
        scWidget.getDuration(d=>{scDuration=d/1000;});
        initAudio();
      });
    });
    scWidget.bind(SC.Widget.Events.PLAY,()=>{scPlaying=true;});
    scWidget.bind(SC.Widget.Events.PAUSE,()=>{scPlaying=false;});
    scWidget.bind(SC.Widget.Events.FINISH,()=>{scPlaying=false;});
  };
  if (!window.SC){const s=document.createElement('script');s.src='https://w.soundcloud.com/player/api.js';s.onload=setup;document.head.appendChild(s);}
  else setup();
}

document.addEventListener('DOMContentLoaded', init);
