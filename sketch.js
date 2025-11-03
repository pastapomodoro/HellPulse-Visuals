let subjectList = [
  { file: 'gengar.png', label: 'Gengar' },
  { file: 'tribalHeart.png', label: 'TribalHeart' },
  { file: 'HellPulse.png', label: 'HellPulse' }
];
let gengarImg;
let currentSubject = 'gengar.png';
let sound;
let amp;
let playing = false;
let volumeSlider, seekSlider, playPauseBtn, subjectSelect, backgroundSelect;
let fpsToggle;
let effectsToggle;
let muteToggle;
let lastSeekUpdate = 0;
let particles = [];
let subjectBuffer = null; // buffer riutilizzato per il soggetto
let effectsEnabled = true; // stato degli effetti (particles, spirali, distorsione)
let previousVolume = 0.5; // volume salvato prima del mute
let isMuted = false;

let backgroundList = [
  { file: 'bg1.gif', label: 'BG 1' },
  { file: 'bg2.gif', label: 'BG 2' },
  { file: 'bg3.gif', label: 'BG 3' }
];
let currentBackground = 'bg1.gif';
let bgImg;

let glitchSlider, distortionSlider;
let glitchIntensity = 0;
let distortionIntensity = 0;
let showFPS = false;

// Sync (BPM) state
let syncToggle;
let bpmReadout;
let syncEnabled = false;
let estimatedBPM = 120;
let amplitudeHistory = [];
let amplitudeTimes = [];
let bpmLastEstimateMs = 0;
let syncAnchorMs = 0;
let lastWasPlaying = false;

// Simple image caches to avoid reloading assets repeatedly
let subjectImageCache = {};
let backgroundImageCache = {};

function preload() {
  bgImg = loadImage('bg/' + currentBackground);
  gengarImg = loadImage('subj/' + currentSubject);
  sound = loadSound('sound.mp3');
  // Seed caches with initial assets
  backgroundImageCache[currentBackground] = bgImg;
  subjectImageCache[currentSubject] = gengarImg;
}

function setup() {
  let container = document.getElementById('canvas-container');
  let w = 1280;
  let h = 720;
  if (container) {
    let rect = container.getBoundingClientRect();
    w = Math.min(rect.width, 1280);
    h = Math.min(rect.height, 720);
    pixelDensity(1);
    createCanvas(w, h).parent('canvas-container');
  } else {
    pixelDensity(1);
    createCanvas(w, h);
  }
  noSmooth();
  frameRate(45);
  imageMode(CENTER);
  amp = new p5.Amplitude();
  amp.smooth(0.8);

  // Collega controlli
  volumeSlider = document.getElementById('volume-slider');
  seekSlider = document.getElementById('seek-slider');
  playPauseBtn = document.getElementById('play-pause-btn');
  subjectSelect = document.getElementById('subject-select');
  backgroundSelect = document.getElementById('background-select');
  glitchSlider = document.getElementById('glitch-slider');
  distortionSlider = document.getElementById('distortion-slider');
  fpsToggle = document.getElementById('fps-toggle');
  syncToggle = document.getElementById('sync-toggle');
  bpmReadout = document.getElementById('bpm-readout');
  effectsToggle = document.getElementById('effects-toggle');
  muteToggle = document.getElementById('mute-toggle');

  if (volumeSlider) {
    // Imposta il valore dello slider in base al volume attuale
    let initialVolume = sound && sound.getVolume ? sound.getVolume() : 0.5;
    volumeSlider.value = initialVolume;
    previousVolume = initialVolume;
    sound.setVolume(initialVolume);
    volumeSlider.addEventListener('input', () => {
      if (!isMuted) {
        let v = parseFloat(volumeSlider.value);
        if (sound && sound.setVolume) sound.setVolume(v);
        previousVolume = v; // salva il volume quando viene modificato manualmente
      }
    });
  }

  if (muteToggle) {
    muteToggle.checked = false;
    muteToggle.addEventListener('change', () => {
      isMuted = muteToggle.checked;
      if (isMuted) {
        // Salva il volume corrente e muta
        previousVolume = parseFloat(volumeSlider.value) || 0.5;
        if (sound && sound.setVolume) sound.setVolume(0);
      } else {
        // Ripristina il volume salvato
        if (sound && sound.setVolume) sound.setVolume(previousVolume);
        volumeSlider.value = previousVolume;
      }
    });
  }

  if (seekSlider) {
    seekSlider.value = 0;
    seekSlider.addEventListener('input', () => {
      if (sound.isLoaded()) {
        let t = seekSlider.value * sound.duration();
        sound.jump(t);
      }
    });
  }

  // Soggetto selezionabile
  if (subjectSelect) {
    subjectSelect.value = currentSubject;
    subjectSelect.addEventListener('change', () => {
      currentSubject = subjectSelect.value;
      loadNewSubject(currentSubject);
    });
  }

  // Crea pulsante play/pause se non esiste
  if (!playPauseBtn) {
    playPauseBtn = document.createElement('button');
    playPauseBtn.id = 'play-pause-btn';
    playPauseBtn.textContent = 'Play';
    let controlsRow = document.getElementById('controls-row');
    if (controlsRow) controlsRow.appendChild(playPauseBtn);
  }
  playPauseBtn.addEventListener('click', togglePlayPause);

  if (backgroundSelect) {
    backgroundSelect.value = currentBackground;
    backgroundSelect.addEventListener('change', () => {
      const value = backgroundSelect.value;
      if (value === 'custom') {
        // Lo script HTML gestirà l'apertura del file input
        return;
      }
      currentBackground = value;
      loadNewBackground(currentBackground);
    });
  }
  
  if (subjectSelect) {
    subjectSelect.value = currentSubject;
    subjectSelect.addEventListener('change', () => {
      const value = subjectSelect.value;
      if (value === 'custom') {
        // Lo script HTML gestirà l'apertura del file input
        return;
      }
      currentSubject = value;
      loadNewSubject(currentSubject);
    });
  }

  if (glitchSlider) {
    glitchSlider.value = 0;
    setSliderThumbColor(glitchSlider, '#0f0');
    glitchSlider.addEventListener('input', () => {
      glitchIntensity = parseFloat(glitchSlider.value);
      // Da verde a rosso
      let c = lerpColorHex('#0f0', '#f00', glitchIntensity);
      setSliderThumbColor(glitchSlider, c);
    });
  }
  if (distortionSlider) {
    distortionSlider.value = 0;
    setSliderThumbColor(distortionSlider, '#0ff');
    distortionSlider.addEventListener('input', () => {
      distortionIntensity = parseFloat(distortionSlider.value);
      // Da azzurro a viola
      let c = lerpColorHex('#0ff', '#f0f', distortionIntensity);
      setSliderThumbColor(distortionSlider, c);
    });
  }

  if (fpsToggle) {
    fpsToggle.checked = false;
    fpsToggle.addEventListener('change', () => {
      showFPS = fpsToggle.checked;
    });
  }

  if (syncToggle) {
    syncToggle.checked = false;
    syncToggle.addEventListener('change', () => {
      syncEnabled = syncToggle.checked;
      // re-ancora il clock sul momento di attivazione
      syncAnchorMs = millis();
    });
  }

  if (effectsToggle) {
    effectsToggle.checked = true; // di default attivo
    effectsEnabled = true;
    effectsToggle.addEventListener('change', () => {
      effectsEnabled = effectsToggle.checked;
      // Se gli effetti vengono disattivati, pulisci le particles esistenti
      if (!effectsEnabled) {
        particles = [];
      }
    });
  }

  // --- Audio upload: carica file locale ---
  const audioInput = document.getElementById('audio-upload-input');
  if (audioInput) {
    audioInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        if (sound && sound.isPlaying()) sound.stop();
        if (sound) sound.disconnect();
        loadSound(file, (loadedSound) => {
          sound = loadedSound;
          amp.setInput(sound);
          sound.setVolume(parseFloat(volumeSlider.value) || 0.5);
          sound.play();
        }, (err) => {
          alert('Errore nel caricamento del file audio.');
        });
      }
    });
  }

  // --- Background upload: carica file immagine locale ---
  const backgroundInput = document.getElementById('background-upload-input');
  if (backgroundInput) {
    backgroundInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        // Verifica che sia un file immagine
        if (!file.type.match('image.*')) {
          alert('Per favore seleziona un file immagine.');
          if (backgroundSelect) backgroundSelect.value = currentBackground;
          return;
        }
        // Crea un URL locale per l'immagine
        const reader = new FileReader();
        reader.onload = function(event) {
          const imgUrl = event.target.result;
          // Carica l'immagine usando p5.js
          loadImage(imgUrl, (img) => {
            bgImg = img;
            // Salva nell'cache con una chiave speciale per il background custom
            backgroundImageCache['custom'] = img;
            // Imposta il select su "custom" per mantenere la selezione
            if (backgroundSelect) {
              backgroundSelect.value = 'custom';
              currentBackground = 'custom';
            }
          }, (err) => {
            alert('Errore nel caricamento del file immagine.');
            if (backgroundSelect) backgroundSelect.value = currentBackground;
          });
        };
        reader.readAsDataURL(file);
      } else {
        // Se non c'è file, ripristina il valore precedente
        if (backgroundSelect) backgroundSelect.value = currentBackground;
      }
    });
  }

  // --- Subject upload: carica file PNG locale come soggetto ---
  const subjectInput = document.getElementById('subject-upload-input');
  if (subjectInput) {
    subjectInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        // Verifica che sia un file immagine
        if (!file.type.match('image.*')) {
          alert('Per favore seleziona un file immagine.');
          if (subjectSelect) subjectSelect.value = currentSubject;
          return;
        }
        // Crea un URL locale per l'immagine
        const reader = new FileReader();
        reader.onload = function(event) {
          const imgUrl = event.target.result;
          // Carica l'immagine usando p5.js
          loadImage(imgUrl, (img) => {
            gengarImg = img;
            // Salva nell'cache con una chiave speciale per il soggetto custom
            subjectImageCache['custom'] = img;
            // Imposta il select su "custom" per mantenere la selezione
            if (subjectSelect) {
              subjectSelect.value = 'custom';
              currentSubject = 'custom';
            }
            // Forza il ricalcolo del buffer alla prossima draw con le nuove dimensioni
            subjectBuffer = null;
          }, (err) => {
            alert('Errore nel caricamento del file immagine.');
            if (subjectSelect) subjectSelect.value = currentSubject;
          });
        };
        reader.readAsDataURL(file);
      } else {
        // Se non c'è file, ripristina il valore precedente
        if (subjectSelect) subjectSelect.value = currentSubject;
      }
    });
  }
}

function loadNewSubject(filename) {
  if (filename === 'custom') {
    // Se è custom, usa l'immagine dalla cache se presente
    if (subjectImageCache['custom']) {
      gengarImg = subjectImageCache['custom'];
    }
    // Forza il ricalcolo del buffer alla prossima draw con le nuove dimensioni
    subjectBuffer = null;
    return;
  }
  if (subjectImageCache[filename]) {
    gengarImg = subjectImageCache[filename];
  } else {
    loadImage('subj/' + filename, (img) => {
      subjectImageCache[filename] = img;
      gengarImg = img;
    });
  }
  // Forza il ricalcolo del buffer alla prossima draw con le nuove dimensioni
  subjectBuffer = null;
}

function loadNewBackground(filename) {
  if (filename === 'none') {
    bgImg = null;
    return;
  }
  if (filename === 'custom') {
    // Se è custom, usa l'immagine dalla cache se presente
    if (backgroundImageCache['custom']) {
      bgImg = backgroundImageCache['custom'];
    }
    return;
  }
  if (backgroundImageCache[filename]) {
    bgImg = backgroundImageCache[filename];
  } else {
    loadImage('bg/' + filename, (img) => {
      backgroundImageCache[filename] = img;
      bgImg = img;
    });
  }
}

function setSliderThumbColor(slider, color) {
  if (!slider) return;
  slider.style.setProperty('--slider-thumb-color', color);
}

function lerpColorHex(a, b, t) {
  let ca = color(a), cb = color(b);
  let cc = lerpColor(ca, cb, t);
  return '#' + hex(cc.levels[0],2) + hex(cc.levels[1],2) + hex(cc.levels[2],2);
}

function getSpectrumColor(t) {
  // t da 0 a 1, restituisce un colore che attraversa tutto lo spettro
  let c = color(0, 0, 0);
  let h = t * 360; // Hue da 0 a 360
  colorMode(HSB, 360, 100, 100, 255);
  c = color(h, 100, 100, 255);
  colorMode(RGB, 255, 255, 255, 255);
  return c;
}

function draw() {
  // --- Background ---
  if (bgImg) {
    imageMode(CORNER);
    image(bgImg, 0, 0, width, height);
    imageMode(CENTER);
  } else {
    background(0);
  }

  // --- Effetti a tempo ---
  let level = amp.getLevel();
  let scale = map(level, 0, 0.4, 1, 1.22, true);
  let rot = map(level, 0, 0.4, 0, PI/48, true) * sin(frameCount * 0.5);
  let glow = map(level, 0, 0.4, 0, 28, true);
  let tintR = 255;
  let tintG = map(level, 0, 0.4, 255, 60, true);
  let tintB = map(level, 0, 0.4, 255, 180, true);

  // --- Sync BPM update & pulse ---
  let nowMs = millis();
  let isPlaying = sound && sound.isLoaded() && sound.isPlaying();
  if (!lastWasPlaying && isPlaying) {
    syncAnchorMs = nowMs;
  }
  lastWasPlaying = isPlaying;
  
  // Calcola sempre il BPM quando c'è musica in riproduzione
  if (isPlaying) {
    amplitudeHistory.push(level);
    amplitudeTimes.push(nowMs);
    // mantieni ~8s di storico
    while (amplitudeTimes.length && nowMs - amplitudeTimes[0] > 8000) {
      amplitudeTimes.shift();
      amplitudeHistory.shift();
    }
    if (nowMs - bpmLastEstimateMs > 2500 && amplitudeHistory.length > 30) {
      let bpm = estimateBPMFromEnvelope(amplitudeHistory, amplitudeTimes, 60, 180);
      if (bpm) estimatedBPM = bpm;
      bpmLastEstimateMs = nowMs;
      if (bpmReadout) bpmReadout.textContent = Math.round(estimatedBPM) + ' BPM';
    }
    
    // Applica sempre il pulse basato sul BPM quando c'è musica
    let beatPeriodMs = 60000 / Math.max(estimatedBPM, 1);
    let phase = ((nowMs - syncAnchorMs) % beatPeriodMs) / beatPeriodMs; // 0..1
    let pulse = beatPulseShape(phase);
    // Pulse più forte e visibile: combinazione di pulse BPM e livello audio
    let bpmPulse = 1 + 0.45 * pulse; // intensità pulsazione BPM aumentata
    let audioBoost = 1 + 0.08 * level; // leggero boost basato sul volume per più dinamismo
    scale *= bpmPulse * audioBoost; // combinazione per effetto più pronunciato
  } else {
    if (bpmReadout && !syncEnabled) bpmReadout.textContent = '-- BPM';
    // Mantieni il BPM visibile se sync è attivo anche quando non c'è musica
    if (syncEnabled && bpmReadout && estimatedBPM) {
      bpmReadout.textContent = Math.round(estimatedBPM) + ' BPM';
    }
  }

  // --- Spirali colorate dietro ---
  if (effectsEnabled) {
    push();
    translate(width/2, height/2);
    let spiralCount = 2;
    for (let s = 0; s < spiralCount; s++) {
      let spiralRot = frameCount * 0.01 * (s%2===0?1:-1) + s*PI/spiralCount + level*2;
      let spiralColor = color(
        180 + 60*sin(frameCount*0.02 + s),
        100 + 120*cos(frameCount*0.015 + s*2),
        255,
        80 + 80*level
      );
      noFill();
      stroke(spiralColor);
      strokeWeight(2.5 + 2*level);
      beginShape();
      for (let a = 0; a < TWO_PI*2; a += 0.12) {
        let r = 90 + 60*s + 30*level + 18*sin(a*3 + frameCount*0.03 + s);
        let x = cos(a + spiralRot) * r;
        let y = sin(a + spiralRot) * r;
        vertex(x, y);
      }
      endShape();
    }
    pop();
  }

  // --- Particles a tempo ---
  if (effectsEnabled && sound.isPlaying() && level > 0.18 && random() < 0.08 + 0.14*level) {
    let pCount = 1 + int(level*6);
    for (let i = 0; i < pCount; i++) {
      if (particles.length < 90) { // Limite massimo particelle
        let angle = random(TWO_PI);
        let speed = random(2, 5 + 10*level);
        let col = color(
          180 + 60*sin(frameCount*0.1 + i),
          100 + 120*cos(frameCount*0.13 + i*2),
          255,
          180
        );
        particles.push({
          x: width/2,
          y: height/2,
          vx: cos(angle)*speed,
          vy: sin(angle)*speed,
          alpha: 180,
          col: col,
          size: random(4, 10 + 10*level)
        });
      }
    }
  }
  if (effectsEnabled) {
    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      fill(p.col);
      noStroke();
      ellipse(p.x, p.y, p.size);
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.alpha -= 3;
      p.col.setAlpha(p.alpha);
      if (p.alpha <= 0) particles.splice(i, 1);
    }
  } else {
    // Pulisci le particles se gli effetti sono disattivati
    particles = [];
  }

  // Glitch visivo applicato dopo il disegno dell'immagine (chromatic aberration + slice jitter)

  // --- Effetto distorsione raro ---
  let distortionFactor = distortionIntensity; // 0 = normale, 1 = massimo
  if (effectsEnabled && sound.isPlaying() && level > 0.22 && random() < (0.012 + 0.028*level + 0.045*distortionFactor)) {
    let y = int(random(height*0.25, height*0.75));
    let h = int(random(12, 32 + 60*distortionFactor));
    let shift = int(random(-30 - 80*distortionFactor, 30 + 80*distortionFactor));
    copy(0, y, width, h, shift, y, width, h);
  }

  // --- Glow sull'immagine ---
  if (glow > 0) {
    drawingContext.shadowBlur = glow;
    drawingContext.shadowColor = 'magenta';
  } else {
    drawingContext.shadowBlur = 0;
  }

  // --- Immagine principale con glitch allineato ---
  if (gengarImg) {
    push();
    translate(width / 2, height / 2);
    rotate(rot);

    let imgW = min(width, 260) * scale;
    let imgH = (gengarImg.height / gengarImg.width) * imgW;
    if (currentSubject === 'tribalHeart.png') { imgW *= 2; imgH *= 2; }

    // prepara buffer del soggetto (dimensione fissa sull'immagine sorgente, non dipende dalla scala)
    if (!subjectBuffer) {
      let bw = Math.max(1, gengarImg ? gengarImg.width : 256);
      let bh = Math.max(1, gengarImg ? gengarImg.height : 256);
      subjectBuffer = createGraphics(int(bw), int(bh));
      subjectBuffer.pixelDensity(1);
      subjectBuffer.imageMode(CENTER);
    }
    subjectBuffer.clear();
    subjectBuffer.image(gengarImg, subjectBuffer.width/2, subjectBuffer.height/2, subjectBuffer.width, subjectBuffer.height);

    // slice jitter sul buffer (non sul canvas intero)
    applySliceJitterToBuffer(subjectBuffer, glitchIntensity, level);

    // Disegno base senza tint
    noTint();
    image(subjectBuffer, 0, 0, imgW, imgH);

    // chromatic aberration leggero, allineato al soggetto
    if (glitchIntensity > 0) {
      let off = (1 + level * 2) * glitchIntensity * 6;
      tint(255, 0, 0, 70 + 100 * glitchIntensity);
      image(subjectBuffer, -off, 0, imgW, imgH);
      tint(0, 255, 255, 70 + 100 * glitchIntensity);
      image(subjectBuffer, off, 0, imgW, imgH);
      noTint();
    }

    pop();
  }
  noTint();
  drawingContext.shadowBlur = 0;

  // Glitch già applicato al buffer del soggetto

  // --- Slider seek ---
  if (sound.isLoaded() && sound.isPlaying() && seekSlider && millis() - lastSeekUpdate > 100) {
    seekSlider.value = sound.currentTime() / sound.duration();
    lastSeekUpdate = millis();
  }

  // --- Testo pulsante ---
  if (playPauseBtn) {
    playPauseBtn.textContent = (sound.isPlaying() ? 'Pause' : 'Play');
  }

  // --- FPS counter ---
  if (showFPS) {
    fill(255,0,0);
    noStroke();
    textSize(16);
    text('FPS: ' + nf(frameRate(), 2, 1), 10, 22);
  }
}

function togglePlayPause() {
  if (sound.isLoaded()) {
    if (sound.isPlaying()) {
      sound.pause();
    } else {
      sound.play();
    }
  }
}

function windowResized() {
  let container = document.getElementById('canvas-container');
  if (container) {
    let rect = container.getBoundingClientRect();
    resizeCanvas(rect.width, rect.height);
  } else {
    resizeCanvas(windowWidth, windowHeight);
  }
} 

// --- Minimal glitch helpers ---
function applySliceJitterToBuffer(gfx, intensity, level) {
  if (!gfx || !intensity || intensity <= 0) return;
  let prob = 0.02 + 0.10 * intensity + 0.08 * level;
  if (random() < prob) {
    let slices = 1 + int(2 * intensity + 2 * level);
    for (let i = 0; i < slices; i++) {
      let y = int(random(gfx.height * 0.1, gfx.height * 0.9));
      let h = int(random(4, 14 + intensity * 24));
      let shift = int(random(-8 - 24 * intensity, 8 + 24 * intensity));
      gfx.copy(0, y, gfx.width, h, shift, y, gfx.width, h);
    }
  }
}

function applyChromaticAberration(intensity, level) {
  if (!intensity || intensity <= 0) return;
  let snap = get();
  let off = (1 + level * 2) * intensity * 6;
  push();
  blendMode(ADD);
  tint(255, 0, 0, 80 + 100 * intensity);
  image(snap, -off, 0, width, height);
  tint(0, 255, 255, 80 + 100 * intensity);
  image(snap, off, 0, width, height);
  pop();
}

function applySliceJitter(intensity, level) {
  if (!intensity || intensity <= 0) return;
  let prob = 0.02 + 0.10 * intensity + 0.08 * level;
  if (random() < prob) {
    let slices = 1 + int(2 * intensity + 2 * level);
    for (let i = 0; i < slices; i++) {
      let y = int(random(height * 0.1, height * 0.9));
      let h = int(random(4, 14 + intensity * 24));
      let shift = int(random(-8 - 24 * intensity, 8 + 24 * intensity));
      copy(0, y, width, h, shift, y, width, h);
    }
  }
}

// --- BPM estimation ---
function estimateBPMFromEnvelope(levels, times, bpmMin, bpmMax) {
  if (!levels || levels.length < 24) return null;
  // normalizza (rimuovi media)
  let n = levels.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += levels[i];
  mean /= n;
  let sig = new Array(n);
  let varSum = 0;
  for (let i = 0; i < n; i++) { sig[i] = levels[i] - mean; varSum += sig[i]*sig[i]; }
  if (varSum <= 1e-6) return null;

  // intervallo lag in ms
  let minPeriod = 60000 / Math.max(bpmMax, 1); // ms
  let maxPeriod = 60000 / Math.max(bpmMin, 1);
  // converti lag in numero di campioni (usiamo tempi reali, non frameRate fisso)
  let bestLag = -1, bestCorr = -1;
  // prova ~60 lag uniformi tra min e max
  for (let k = 0; k < 60; k++) {
    let periodMs = minPeriod + (maxPeriod - minPeriod) * (k / 59);
    // trova lag come numero di campioni medio per questo periodo
    // stimiamo delta medio tra campioni
    let dt = (times[n-1] - times[0]) / Math.max(n-1,1);
    if (dt <= 0) continue;
    let lag = Math.max(1, Math.round(periodMs / dt));
    if (lag >= n-2) continue;
    // autocorrelazione per questo lag
    let corr = 0;
    for (let i = lag; i < n; i++) {
      corr += sig[i] * sig[i-lag];
    }
    corr /= (n - lag);
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  if (bestLag <= 0) return null;
  let dtAvg = (times[n-1] - times[0]) / Math.max(n-1,1);
  let periodEstimate = dtAvg * bestLag;
  let bpm = 60000 / Math.max(periodEstimate, 1);
  // clamp range
  bpm = constrain(bpm, bpmMin, bpmMax);
  return bpm;
}

function beatPulseShape(phase) {
  // 0..1 -> picco rapido e pronunciato con decadimento morbido
  // Forma più aggressiva per un pulse più visibile
  if (phase < 0.15) {
    // Snap rapido nella prima parte del beat
    let snapPhase = phase / 0.15;
    return pow(snapPhase, 0.3); // curva più aggressiva per il picco
  } else {
    // Decadimento esponenziale più veloce dopo il picco
    let decayPhase = (phase - 0.15) / 0.85;
    return pow(1 - decayPhase, 2.5); // decay più veloce e pronunciato
  }
}