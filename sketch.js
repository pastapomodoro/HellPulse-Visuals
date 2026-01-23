// HellPulse Visuals - p5.js Sketch with Web Audio API

let gengarImg = null;
let audio = null;
let audioContext = null;
let analyser = null;
let dataArray = null;
let subjectBuffer = null;
let particles = [];
let effectsEnabled = true;
let glitchIntensity = 0;
let currentSubject = 'gengar.png';
let currentBackground = 'none';
let bgImg = null;
let syncEnabled = false;
let estimatedBPM = 120;
let amplitudeHistory = [];
let amplitudeTimes = [];
let bpmLastEstimateMs = 0;
let syncAnchorMs = 0;
let lastWasPlaying = false;
let lastSeekUpdate = 0;
let previousVolume = 0.5;
let isMuted = false;
let subjectImageCache = {};
let backgroundImageCache = {};
let audioInitialized = false;

// DOM references
let volumeSlider, seekSlider, playPauseBtn, subjectSelect, backgroundSelect;
let glitchSlider, syncToggle, bpmReadout, effectsToggle, muteToggle;

function preload() {
  // Empty preload - assets loaded in setup
}

function setup() {
  // Create canvas
  let canvas = createCanvas(1280, 720);
  
  // Parent to container
  let container = document.getElementById('canvas-container');
  if (container) {
    canvas.parent('canvas-container');
    let rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      resizeCanvas(rect.width, rect.height);
    }
  }
  
  pixelDensity(1);
  noSmooth();
  frameRate(30);
  imageMode(CENTER);
  
  // Load image
  gengarImg = loadImage('subj/' + currentSubject, () => {
    subjectImageCache[currentSubject] = gengarImg;
  });
  
  // Setup controls
  setupControls();
}

function setupControls() {
  volumeSlider = document.getElementById('volume-slider');
  seekSlider = document.getElementById('seek-slider');
  playPauseBtn = document.getElementById('play-pause-btn');
  subjectSelect = document.getElementById('subject-select');
  backgroundSelect = document.getElementById('background-select');
  glitchSlider = document.getElementById('glitch-slider');
  syncToggle = document.getElementById('sync-toggle');
  bpmReadout = document.getElementById('bpm-readout');
  effectsToggle = document.getElementById('effects-toggle');
  muteToggle = document.getElementById('mute-toggle');
  
  if (volumeSlider) {
    volumeSlider.value = 0.5;
    volumeSlider.addEventListener('input', () => {
      if (!isMuted && audio) {
        audio.volume = parseFloat(volumeSlider.value);
        previousVolume = audio.volume;
      }
    });
  }
  
  if (muteToggle) {
    muteToggle.addEventListener('change', () => {
      isMuted = muteToggle.checked;
      if (audio) {
        audio.volume = isMuted ? 0 : previousVolume;
      }
    });
  }
  
  if (seekSlider) {
    seekSlider.addEventListener('input', () => {
      if (usingSoundCloud && scWidget && scDuration > 0) {
        scWidget.seekTo(seekSlider.value * scDuration * 1000);
      } else if (audio && !isNaN(audio.duration)) {
        audio.currentTime = seekSlider.value * audio.duration;
      }
    });
  }
  
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', togglePlayPause);
  }
  
  if (subjectSelect) {
    subjectSelect.addEventListener('change', () => {
      if (subjectSelect.value !== 'custom') {
        currentSubject = subjectSelect.value;
        loadNewSubject(currentSubject);
      }
    });
  }
  
  if (backgroundSelect) {
    backgroundSelect.addEventListener('change', () => {
      if (backgroundSelect.value !== 'custom') {
        currentBackground = backgroundSelect.value;
        loadNewBackground(currentBackground);
      }
    });
  }
  
  if (glitchSlider) {
    glitchSlider.addEventListener('input', () => {
      glitchIntensity = parseFloat(glitchSlider.value);
    });
  }
  
  if (syncToggle) {
    syncToggle.addEventListener('change', () => {
      syncEnabled = syncToggle.checked;
      syncAnchorMs = millis();
    });
  }
  
  if (effectsToggle) {
    effectsToggle.addEventListener('change', () => {
      effectsEnabled = effectsToggle.checked;
      if (!effectsEnabled) particles = [];
    });
  }
  
  // Audio upload
  let audioInput = document.getElementById('audio-upload-input');
  if (audioInput) {
    audioInput.addEventListener('change', (e) => {
      let file = e.target.files[0];
      if (file) {
        let url = URL.createObjectURL(file);
        loadAudioFile(url, true);
      }
    });
  }
  
  // Background upload
  let bgInput = document.getElementById('background-upload-input');
  if (bgInput) {
    bgInput.addEventListener('change', (e) => {
      let file = e.target.files[0];
      if (file) {
        let reader = new FileReader();
        reader.onload = (ev) => {
          bgImg = loadImage(ev.target.result);
          backgroundImageCache['custom'] = bgImg;
          currentBackground = 'custom';
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  // Subject upload  
  let subjInput = document.getElementById('subject-upload-input');
  if (subjInput) {
    subjInput.addEventListener('change', (e) => {
      let file = e.target.files[0];
      if (file) {
        let reader = new FileReader();
        reader.onload = (ev) => {
          gengarImg = loadImage(ev.target.result);
          subjectImageCache['custom'] = gengarImg;
          currentSubject = 'custom';
          subjectBuffer = null;
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  // SoundCloud modal
  setupSoundCloud();
}

// SoundCloud integration
let scWidget = null;
let scPlaying = false;
let scDuration = 0;
let usingSoundCloud = false;

function setupSoundCloud() {
  const scBtn = document.getElementById('soundcloud-btn');
  const scModal = document.getElementById('soundcloud-modal');
  const scClose = document.getElementById('modal-close');
  const scUrlInput = document.getElementById('soundcloud-url');
  const scLoadBtn = document.getElementById('soundcloud-load');
  const scIframe = document.getElementById('soundcloud-widget');
  const scError = document.getElementById('soundcloud-error');
  
  if (!scBtn || !scModal) return;
  
  // Open modal
  scBtn.addEventListener('click', () => {
    scModal.classList.remove('hidden');
    if (scUrlInput) {
      scUrlInput.value = '';
      scUrlInput.focus();
    }
    if (scError) scError.textContent = '';
  });
  
  // Close modal
  scClose.addEventListener('click', () => {
    scModal.classList.add('hidden');
  });
  
  // Close on backdrop click
  scModal.addEventListener('click', (e) => {
    if (e.target === scModal) {
      scModal.classList.add('hidden');
    }
  });
  
  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !scModal.classList.contains('hidden')) {
      scModal.classList.add('hidden');
    }
  });
  
  // Load SoundCloud track
  scLoadBtn.addEventListener('click', () => {
    const url = scUrlInput.value.trim();
    if (!url) return;
    
    if (!url.includes('soundcloud.com')) {
      alert('Inserisci un URL valido di SoundCloud');
      return;
    }
    
    loadSoundCloudTrack(url);
    scModal.classList.add('hidden');
  });
  
  // Enter to load
  scUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      scLoadBtn.click();
    }
  });
}

function loadSoundCloudTrack(url) {
  const scIframe = document.getElementById('soundcloud-widget');
  const scError = document.getElementById('soundcloud-error');
  const scModal = document.getElementById('soundcloud-modal');
  
  if (!scIframe) return;
  
  // Clear previous error
  if (scError) scError.textContent = '';
  
  // Stop current audio
  if (audio && !audio.paused) {
    audio.pause();
  }
  
  // Build widget URL
  const widgetUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&buying=false&sharing=false&download=false&show_artwork=false&show_playcount=false&show_user=false&hide_related=true&visual=false`;
  
  scIframe.src = widgetUrl;
  // Hide iframe completely - it should be invisible
  scIframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  
  usingSoundCloud = true;
  
  // Load SC Widget API if not loaded
  if (!window.SC) {
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.onload = () => initSCWidget(scIframe, scError, scModal);
    script.onerror = () => {
      if (scError) scError.textContent = 'Errore nel caricamento del player SoundCloud.';
      usingSoundCloud = false;
    };
    document.head.appendChild(script);
  } else {
    initSCWidget(scIframe, scError, scModal);
  }
}

function initSCWidget(iframe, errorEl, modal) {
  scWidget = SC.Widget(iframe);
  
  scWidget.bind(SC.Widget.Events.READY, () => {
    // Check if track loaded successfully
    scWidget.getCurrentSound((sound) => {
      if (!sound) {
        if (errorEl) errorEl.textContent = 'URL non valido o traccia non disponibile.';
        usingSoundCloud = false;
        return;
      }
      
      scWidget.play();
      scPlaying = true;
      
      scWidget.getDuration((duration) => {
        scDuration = duration / 1000; // Convert to seconds
      });
      
      // Setup audio context for visualization
      initAudioContext();
    });
  });
  
  scWidget.bind(SC.Widget.Events.PLAY, () => {
    scPlaying = true;
  });
  
  scWidget.bind(SC.Widget.Events.PAUSE, () => {
    scPlaying = false;
  });
  
  scWidget.bind(SC.Widget.Events.FINISH, () => {
    scPlaying = false;
  });
  
  scWidget.bind(SC.Widget.Events.ERROR, () => {
    if (errorEl) errorEl.textContent = 'Errore nel caricamento della traccia.';
    usingSoundCloud = false;
    scPlaying = false;
  });
}

function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function loadAudioFile(url, autoPlay) {
  initAudioContext();
  
  // Stop SoundCloud if playing
  if (usingSoundCloud && scWidget) {
    scWidget.pause();
    usingSoundCloud = false;
  }
  
  if (audio) {
    audio.pause();
  }
  
  audio = new Audio(url);
  audio.crossOrigin = 'anonymous';
  audio.volume = previousVolume;
  
  // Connect to Web Audio API for analysis
  let source = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  
  audioInitialized = true;
  
  if (autoPlay) {
    audio.play();
  }
}

function getAudioLevel() {
  if (!analyser || !dataArray) return 0;
  
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  return sum / (dataArray.length * 255);
}

function togglePlayPause() {
  // Handle SoundCloud
  if (usingSoundCloud && scWidget) {
    if (scPlaying) {
      scWidget.pause();
    } else {
      scWidget.play();
    }
    return;
  }
  
  // Handle local audio
  if (!audioInitialized) {
    loadAudioFile('sound.mp3', true);
  } else if (audio) {
    if (audio.paused) {
      initAudioContext();
      audio.play();
    } else {
      audio.pause();
    }
  }
}

function loadNewSubject(filename) {
  if (filename === 'custom' && subjectImageCache['custom']) {
    gengarImg = subjectImageCache['custom'];
  } else if (subjectImageCache[filename]) {
    gengarImg = subjectImageCache[filename];
  } else {
    gengarImg = loadImage('subj/' + filename, (img) => {
      subjectImageCache[filename] = img;
    });
  }
  subjectBuffer = null;
}

function loadNewBackground(filename) {
  if (filename === 'none') {
    bgImg = null;
  } else if (filename === 'custom' && backgroundImageCache['custom']) {
    bgImg = backgroundImageCache['custom'];
  } else if (backgroundImageCache[filename]) {
    bgImg = backgroundImageCache[filename];
  } else {
    bgImg = loadImage('bg/' + filename, (img) => {
      backgroundImageCache[filename] = img;
    });
  }
}

function draw() {
  // Background
  if (bgImg) {
    imageMode(CORNER);
    image(bgImg, 0, 0, width, height);
    imageMode(CENTER);
  } else {
    background(0);
  }
  
  // Audio level
  let level = getAudioLevel();
  let scale = map(level, 0, 0.4, 1, 1.25, true);
  let rot = map(level, 0, 0.4, 0, PI / 48, true) * sin(frameCount * 0.5);
  let glow = map(level, 0, 0.4, 0, 20, true);
  
  // Check if playing (local audio or SoundCloud)
  let isPlaying = (audio && !audio.paused) || (usingSoundCloud && scPlaying);
  let nowMs = millis();
  
  // BPM detection
  if (isPlaying) {
    amplitudeHistory.push(level);
    amplitudeTimes.push(nowMs);
    while (amplitudeTimes.length && nowMs - amplitudeTimes[0] > 8000) {
      amplitudeTimes.shift();
      amplitudeHistory.shift();
    }
    if (nowMs - bpmLastEstimateMs > 2500 && amplitudeHistory.length > 30) {
      let bpm = estimateBPM(amplitudeHistory, amplitudeTimes);
      if (bpm) estimatedBPM = bpm;
      bpmLastEstimateMs = nowMs;
      if (bpmReadout) bpmReadout.textContent = Math.round(estimatedBPM);
    }
    let beatPeriod = 60000 / estimatedBPM;
    let phase = ((nowMs - syncAnchorMs) % beatPeriod) / beatPeriod;
    let pulse = phase < 0.15 ? pow(phase / 0.15, 0.3) : pow(1 - (phase - 0.15) / 0.85, 2.5);
    scale *= 1 + 0.35 * pulse;
  } else {
    if (bpmReadout) bpmReadout.textContent = '--';
  }
  
  // Spirals
  if (effectsEnabled && isPlaying) {
    push();
    translate(width / 2, height / 2);
    for (let s = 0; s < 2; s++) {
      let spiralRot = frameCount * 0.008 * (s % 2 === 0 ? 1 : -1);
      noFill();
      stroke(255, 255, 255, 30 + 40 * level);
      strokeWeight(1 + 1.5 * level);
      beginShape();
      for (let a = 0; a < TWO_PI * 2; a += 0.15) {
        let r = 80 + 50 * s + 25 * level + 15 * sin(a * 3 + frameCount * 0.02);
        vertex(cos(a + spiralRot) * r, sin(a + spiralRot) * r);
      }
      endShape();
    }
    pop();
  }
  
  // Particles
  if (effectsEnabled && isPlaying && level > 0.15 && random() < 0.1) {
    for (let i = 0; i < 2; i++) {
      if (particles.length < 70) {
        let angle = random(TWO_PI);
        particles.push({
          x: width / 2, y: height / 2,
          vx: cos(angle) * random(2, 5),
          vy: sin(angle) * random(2, 5),
          alpha: 150,
          size: random(3, 8)
        });
      }
    }
  }
  
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    fill(255, p.alpha);
    noStroke();
    ellipse(p.x, p.y, p.size);
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 3;
    if (p.alpha <= 0) particles.splice(i, 1);
  }
  
  // Glow
  if (glow > 0) {
    drawingContext.shadowBlur = glow;
    drawingContext.shadowColor = 'rgba(255,255,255,0.5)';
  }
  
  // Main subject
  if (gengarImg && gengarImg.width > 0) {
    push();
    translate(width / 2, height / 2);
    rotate(rot);
    
    let imgW = min(width * 0.35, 280) * scale;
    let imgH = (gengarImg.height / gengarImg.width) * imgW;
    
    if (!subjectBuffer || subjectBuffer.width !== gengarImg.width) {
      subjectBuffer = createGraphics(gengarImg.width, gengarImg.height);
      subjectBuffer.pixelDensity(1);
      subjectBuffer.imageMode(CENTER);
    }
    subjectBuffer.clear();
    subjectBuffer.image(gengarImg, subjectBuffer.width / 2, subjectBuffer.height / 2);
    
    if (glitchIntensity > 0) {
      applyGlitch(subjectBuffer, glitchIntensity, level);
    }
    
    noTint();
    image(subjectBuffer, 0, 0, imgW, imgH);
    
    if (glitchIntensity > 0) {
      let off = glitchIntensity * 5;
      tint(255, 50, 50, 50 + 80 * glitchIntensity);
      image(subjectBuffer, -off, 0, imgW, imgH);
      tint(50, 255, 255, 50 + 80 * glitchIntensity);
      image(subjectBuffer, off, 0, imgW, imgH);
      noTint();
    }
    
    pop();
  }
  
  drawingContext.shadowBlur = 0;
  
  // Update UI
  if (nowMs - lastSeekUpdate > 100) {
    // Update seek slider
    if (seekSlider) {
      if (usingSoundCloud && scWidget && scDuration > 0) {
        scWidget.getPosition((pos) => {
          seekSlider.value = (pos / 1000) / scDuration;
        });
      } else if (audio && !isNaN(audio.duration) && isPlaying) {
        seekSlider.value = audio.currentTime / audio.duration;
      }
    }
    lastSeekUpdate = nowMs;
  }
  
  // Update play/pause button
  if (playPauseBtn) {
    let span = playPauseBtn.querySelector('span');
    let icon = playPauseBtn.querySelector('i');
    if (span) span.textContent = isPlaying ? 'Pause' : 'Play';
    if (icon) icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
  }
}

function applyGlitch(gfx, intensity, level) {
  if (random() < 0.05 + 0.1 * intensity) {
    let slices = 1 + int(2 * intensity);
    for (let i = 0; i < slices; i++) {
      let y = int(random(gfx.height * 0.1, gfx.height * 0.9));
      let h = int(random(4, 12 + intensity * 20));
      let shift = int(random(-10 * intensity, 10 * intensity));
      gfx.copy(0, y, gfx.width, h, shift, y, gfx.width, h);
    }
  }
}

function estimateBPM(levels, times) {
  if (levels.length < 24) return null;
  let n = levels.length;
  let mean = levels.reduce((a, b) => a + b, 0) / n;
  let sig = levels.map(l => l - mean);
  
  let bestLag = -1, bestCorr = -1;
  for (let k = 0; k < 60; k++) {
    let period = 333 + (1000 - 333) * (k / 59);
    let dt = (times[n - 1] - times[0]) / (n - 1);
    let lag = Math.round(period / dt);
    if (lag >= n - 2 || lag < 1) continue;
    
    let corr = 0;
    for (let i = lag; i < n; i++) corr += sig[i] * sig[i - lag];
    corr /= (n - lag);
    
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  
  if (bestLag <= 0) return null;
  let dtAvg = (times[n - 1] - times[0]) / (n - 1);
  return constrain(60000 / (dtAvg * bestLag), 60, 180);
}

function windowResized() {
  let container = document.getElementById('canvas-container');
  if (container) {
    let rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      resizeCanvas(rect.width, rect.height);
    }
  }
}
