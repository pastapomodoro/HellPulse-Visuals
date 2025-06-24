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
let lastSeekUpdate = 0;
let glitchLines = [];
let particles = [];

let backgroundList = [
  { file: 'bg1.gif', label: 'BG 1' },
  { file: 'bg2.gif', label: 'BG 2' },
  { file: 'bg3.gif', label: 'BG 3' }
];
let currentBackground = 'bg1.gif';
let bgImg;

let glitchSlider, distortionSlider, tintSlider;
let glitchIntensity = 0;
let distortionIntensity = 0;
let tintIntensity = 0;
let tintAutoCheckbox;
let tintAuto = false;
let tintAutoTime = 0;

function preload() {
  bgImg = loadImage('bg/' + currentBackground);
  gengarImg = loadImage('subj/' + currentSubject);
  sound = loadSound('sound.mp3');
}

function setup() {
  let container = document.getElementById('canvas-container');
  if (container) {
    let rect = container.getBoundingClientRect();
    createCanvas(rect.width, rect.height).parent('canvas-container');
  } else {
    createCanvas(windowWidth, windowHeight);
  }
  imageMode(CENTER);
  amp = new p5.Amplitude();

  // Collega controlli
  volumeSlider = document.getElementById('volume-slider');
  seekSlider = document.getElementById('seek-slider');
  playPauseBtn = document.getElementById('play-pause-btn');
  subjectSelect = document.getElementById('subject-select');
  backgroundSelect = document.getElementById('background-select');
  glitchSlider = document.getElementById('glitch-slider');
  distortionSlider = document.getElementById('distortion-slider');
  tintSlider = document.getElementById('tint-slider');
  tintAutoCheckbox = document.getElementById('tint-auto-checkbox');

  if (volumeSlider) {
    // Imposta il valore dello slider in base al volume attuale
    let initialVolume = sound && sound.getVolume ? sound.getVolume() : 0.5;
    volumeSlider.value = initialVolume;
    sound.setVolume(initialVolume);
    volumeSlider.addEventListener('input', () => {
      let v = parseFloat(volumeSlider.value);
      if (sound && sound.setVolume) sound.setVolume(v);
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
      currentBackground = backgroundSelect.value;
      loadNewBackground(currentBackground);
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
  if (tintSlider) {
    tintSlider.value = 0;
    tintSlider.addEventListener('input', () => {
      tintIntensity = parseFloat(tintSlider.value);
    });
  }

  if (tintAutoCheckbox) {
    tintAutoCheckbox.checked = false;
    tintAutoCheckbox.addEventListener('change', () => {
      tintAuto = tintAutoCheckbox.checked;
    });
  }
}

function loadNewSubject(filename) {
  gengarImg = loadImage('subj/' + filename);
}

function loadNewBackground(filename) {
  bgImg = loadImage('bg/' + filename);
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

  // --- Spirali colorate dietro ---
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

  // --- Particles a tempo ---
  if (sound.isPlaying() && level > 0.18 && random() < 0.13 + 0.18*level) {
    let pCount = 2 + int(level*8);
    for (let i = 0; i < pCount; i++) {
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

  // --- Effetti glitch soft ---
  let glitchFactor = glitchIntensity; // 0 = normale, 1 = massimo
  if (sound.isPlaying() && frameCount % 7 === 0 && random() < (0.5 + glitchFactor) * level) {
    for (let i = 0; i < 1 + int((level + glitchFactor) * 3); i++) {
      let x1 = random(width*0.2, width*0.8);
      let y1 = random(height*0.2, height*0.8);
      let x2 = x1 + random(-40 - 60*glitchFactor, 40 + 60*glitchFactor);
      let y2 = y1 + random(-3 - 10*glitchFactor, 3 + 10*glitchFactor);
      glitchLines.push({ x1, y1, x2, y2, alpha: 100 + 60*level + 100*glitchFactor });
    }
  }
  for (let i = glitchLines.length - 1; i >= 0; i--) {
    let l = glitchLines[i];
    stroke(0, 255, 255, l.alpha);
    strokeWeight(2);
    line(l.x1, l.y1, l.x2, l.y2);
    l.alpha -= 5;
    if (l.alpha <= 0) glitchLines.splice(i, 1);
  }
  if (random() < 0.02 + 0.05*level) {
    fill(255, 0, 255, 30 + 60*level);
    noStroke();
    let w = random(10, 60);
    let h = random(3, 12);
    rect(random(width*0.2, width*0.8), random(height*0.2, height*0.8), w, h);
    noFill();
    stroke(255);
  }

  // --- Effetto distorsione raro ---
  let distortionFactor = distortionIntensity; // 0 = normale, 1 = massimo
  if (sound.isPlaying() && level > 0.22 && random() < (0.018 + 0.03*level + 0.05*distortionFactor)) {
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

  // --- Immagine principale ---
  push();
  translate(width / 2, height / 2);
  rotate(rot);
  // Tint personalizzato spettro
  if (tintIntensity === 0) {
    noTint();
  } else {
    let spectrumCol = getSpectrumColor(tintIntensity);
    let customTintR = red(spectrumCol);
    let customTintG = green(spectrumCol);
    let customTintB = blue(spectrumCol);
    tint(customTintR, customTintG, customTintB, 255);
  }
  let imgW = min(width, 260) * scale;
  let imgH = (gengarImg.height / gengarImg.width) * imgW;
  // Se il soggetto è tribalHeart, ingrandisci del 200%
  if (currentSubject === 'tribalHeart.png') {
    imgW *= 2;
    imgH *= 2;
  }
  if (distortionIntensity > 0.7) {
    // Effetto onda: distorce l'immagine principale
    let tiles = int(8 + 16 * distortionIntensity);
    let tileH = imgH / tiles;
    for (let i = 0; i < tiles; i++) {
      let sy = i * tileH;
      let sw = imgW;
      let sh = tileH;
      let dx = sin(frameCount*0.08 + i*0.5) * 12 * distortionIntensity;
      image(gengarImg, dx, sy - imgH/2, sw, sh, 0, sy, gengarImg.width, sh);
    }
  } else {
    image(gengarImg, 0, 0, imgW, imgH);
  }
  pop();
  noTint();
  drawingContext.shadowBlur = 0;

  // --- Slider seek ---
  if (sound.isLoaded() && sound.isPlaying() && seekSlider && millis() - lastSeekUpdate > 100) {
    seekSlider.value = sound.currentTime() / sound.duration();
    lastSeekUpdate = millis();
  }

  // --- Testo pulsante ---
  if (playPauseBtn) {
    playPauseBtn.textContent = (sound.isPlaying() ? 'Pause' : 'Play');
  }

  // Tint automatico
  if (tintAuto) {
    tintAutoTime += deltaTime * 0.00018; // velocità ciclo
    tintIntensity = (sin(tintAutoTime * TWO_PI) + 1) / 2;
    if (tintSlider) tintSlider.value = tintIntensity;
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