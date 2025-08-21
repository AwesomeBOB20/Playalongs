document.addEventListener('DOMContentLoaded', function () {
  // ===== Data =====
  const exercises  = Array.isArray(window.EXERCISES)  ? window.EXERCISES  : [];
  const playlists  = Array.isArray(window.PLAYLISTS)  ? window.PLAYLISTS  : [];

  // ===== DOM =====
  // Core UI
  const audio               = document.getElementById('audio');
  const totalTimeDisplay    = document.getElementById('totalTime');
  const currentTimeDisplay  = document.getElementById('currentTime');
  const playPauseBtn        = document.getElementById('playPauseBtn');
  const tempoSlider         = document.getElementById('tempoSlider');
  const tempoLabel          = document.getElementById('tempoLabel');
  const sheetMusicImg       = document.querySelector('.sheet-music img');

  // Progress bar
  const progressContainer   = document.querySelector('.progress-container .bar');
  let   progress            = document.getElementById('progress') || document.querySelector('.bar__fill');

  // Transport / randomize / limits
  const randomExerciseBtn   = document.getElementById('randomExerciseBtn');
  const randomTempoBtn      = document.getElementById('randomTempoBtn');
  const minTempoInput       = document.getElementById('minTempo');
  const maxTempoInput       = document.getElementById('maxTempo');
  const autoRandomizeToggle = document.getElementById('autoRandomizeToggle');
  const repsPerTempoInput   = document.getElementById('repsPerTempo');

  // Playlist buttons and progress
  const stopPlaylistBtn            = document.getElementById('stopPlaylistBtn');
  const prevPlaylistItemBtn        = document.getElementById('prevPlaylistItemBtn');
  const nextPlaylistItemBtn        = document.getElementById('nextPlaylistItemBtn');
  const playlistProgressContainer  = document.querySelector('.playlist-progress-container');
  const playlistProgress           = document.getElementById('playlistProgress');
  const playlistProgressPercentage = document.getElementById('playlistProgressPercentage');

  // Top selectors (we make these readonly to avoid mobile keyboard)
  const categorySearchInput      = document.getElementById('categorySearch');
  const exerciseSearchInput      = document.getElementById('exerciseSearch');
  const playlistSearchInput      = document.getElementById('playlistSearch');
  const playlistQueueSearchInput = document.getElementById('playlistQueueSearch');

  // Picker overlay
  const pickerOverlay = document.getElementById('pickerOverlay');
  const pickerTitle   = document.getElementById('pickerTitle');
  const pickerSearch  = document.getElementById('pickerSearch');
  const pickerList    = document.getElementById('pickerList');
  const pickerClose   = document.getElementById('pickerClose');

  // ===== Feature flags =====
  const isTouchDevice =
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0);

  // ===== Helpers: selector value/data-id =====
  function setSelectorValue(input, label, id) {
    if (!input) return;
    input.value = label ?? '';
    if (id == null) delete input.dataset.id;
    else input.dataset.id = String(id);
  }
  function getSelectorId(input) {
    return input?.dataset?.id ?? null;
  }

  // ===== State =====
  let isDragging              = false; // progress bar drag
  let isPlayingPlaylist       = false;
  let currentPlaylist         = null;
  let currentPlaylistItemIndex = 0;
  let currentTempoIndex       = 0;
  let currentRepetition       = 0;
  let playlistQueueMap        = [];    // flattened queue

  let isRandomizeEnabled      = false;
  let repsBeforeChange        = 1;
  let currentRepCount         = 0;

  let displayedExercises      = [];
  let currentExerciseIndex    = 0;
  let currentSelectedExercise = null;

  let currentOriginalTempo    = null;
  let userIsAdjustingTempo    = false;
  let suppressTempoInput      = false;
  let lastTempoChangeAt       = 0;
  let prevTempo               = null;

  // Category set & display names
  let displayedCategories = [
    "all","one-handers","accent-tap","rhythms","rudiments","timing",
    "paradiddles","singles","rolls","natural-decays","flams","hybrids",
    "78-grids","exercises","etudes","requests"
  ];
  const categoryDisplayMap = {
    "accent-tap":"Accent Tap","rhythms":"Rhythms","rudiments":"Rudiments","requests":"Requests",
    "one-handers":"One Handers","timing":"Timing","paradiddles":"Paradiddles","singles":"Singles",
    "rolls":"Rolls","natural-decays":"Natural Decays","flams":"Flams","hybrids":"Hybrids",
    "78-grids":"7/8 Grids","exercises":"Exercises","etudes":"Etudes","all":"All Categories"
  };

  const displayedPlaylists = playlists.map((p, i) => ({ index: i, name: p.name }));

  // ===== Audio defaults =====
  if (audio) {
    audio.loop = false;
    if ('preservesPitch' in audio)       audio.preservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
    if ('mozPreservesPitch' in audio)    audio.mozPreservesPitch = true;
  }
  function applyLoopMode() {
    if (!audio) return;
    audio.loop = !isPlayingPlaylist && !isRandomizeEnabled;
  }

  // Reset on first load and iOS back-forward cache
  function resetPracticeControls() {
    if (autoRandomizeToggle) autoRandomizeToggle.checked = false;
    if (repsPerTempoInput)   repsPerTempoInput.value = '';
    if (minTempoInput)       minTempoInput.value = '';
    if (maxTempoInput)       maxTempoInput.value = '';
    isRandomizeEnabled = false;
    repsBeforeChange   = 1;
    currentRepCount    = 0;
    applyLoopMode();
  }
  resetPracticeControls();
  window.addEventListener('pageshow', (e) => { if (e.persisted) resetPracticeControls(); });

  // Make buttons "real buttons" and stop event leaks
  [
    'playPauseBtn','randomExerciseBtn','randomTempoBtn',
    'prevExerciseBtn','nextExerciseBtn',
    'prevPlaylistItemBtn','nextPlaylistItemBtn','stopPlaylistBtn'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.type = 'button'; } catch {}
    el.style.touchAction = 'manipulation';
    const stop = (e) => e.stopPropagation();
    el.addEventListener('pointerdown', stop, { passive: true });
    el.addEventListener('click', stop);
  });

  // Initial UI setup
  initializeCategoryPlaceholder();
  initializePlaylistPlaceholder();

  displayedExercises = filterExercisesForMode();
  if (displayedExercises.length > 0) {
    currentExerciseIndex    = 0;
    currentSelectedExercise = displayedExercises[currentExerciseIndex];
    initializeExercise(currentSelectedExercise);
    if (exerciseSearchInput) exerciseSearchInput.placeholder = currentSelectedExercise.name;
  } else {
    if (exerciseSearchInput) exerciseSearchInput.placeholder = "Search Exercises...";
  }

  // Disable queue & playlist controls initially
  if (playlistQueueSearchInput) playlistQueueSearchInput.disabled = true;
  if (stopPlaylistBtn)          stopPlaylistBtn.disabled          = true;
  if (prevPlaylistItemBtn)      prevPlaylistItemBtn.disabled      = true;
  if (nextPlaylistItemBtn)      nextPlaylistItemBtn.disabled      = true;

  // ===== Randomize toggles =====
  if (autoRandomizeToggle) {
    autoRandomizeToggle.addEventListener('change', function () {
      isRandomizeEnabled = this.checked;
      currentRepCount = 0;
      applyLoopMode();
      if (isRandomizeEnabled) defocusSlider();
    });
  }
  if (repsPerTempoInput) {
    repsPerTempoInput.addEventListener('input', function () {
      const val = parseInt(this.value, 10);
      repsBeforeChange = (!isNaN(val) && val > 0) ? val : 1;
    });
  }

  // ===== Buttons =====
  randomExerciseBtn?.addEventListener('click', function () {
    quietRandomize();
    if (isPlayingPlaylist) stopPlaylist();
    pickRandomExercise();
  });

  randomTempoBtn?.addEventListener('click', function () {
    if (isPlayingPlaylist) return;
    const wasPlaying = audio && !audio.paused;
    quietRandomize();
    pickRandomTempo();
    if (wasPlaying) startProgressTicker();
  });

  if (playPauseBtn && audio) {
    playPauseBtn.addEventListener('click', function () {
      if (audio.ended || (isFinite(audio.duration) && audio.currentTime >= audio.duration)) {
        audio.currentTime = 0;
        resetProgressBarInstant();
      }
      if (audio.paused) {
        if (audio.readyState < 3) audio.load();
        audio.play().then(() => {
          this.textContent = 'Pause';
          startProgressTicker();
        }).catch((error) => {
          console.error('Error playing audio:', error);
          alert('Audio is not ready yet. Please wait a moment.');
        });
      } else {
        quietRandomize();
        audio.pause();
        this.textContent = 'Play';
      }
    });
  }

  // ===== Audio ended (single exercise / randomize loop) =====
  let autoStepLock = false;
  let playbackCycleId = 0;
  const onEnded = async () => {
    stopProgressTicker();
    if (isPlayingPlaylist) return;
    if (autoStepLock) return;
    autoStepLock = true;
    const cycleId = ++playbackCycleId;

    try {
      if (isRandomizeEnabled && currentSelectedExercise) {
        currentRepCount++;
        if (currentRepCount >= repsBeforeChange) {
          currentRepCount = 0;
          pickRandomTempo(); // throttled + blur
        }

        resetProgressBarInstant();
        audio.currentTime = 0;
        await new Promise(r => requestAnimationFrame(r));
        if (cycleId !== playbackCycleId) return;
        try { await audio.play(); } catch {}
        if (playPauseBtn) playPauseBtn.textContent = 'Pause';
        startProgressTicker();
        return;
      }

      if (!audio.loop) {
        if (playPauseBtn) playPauseBtn.textContent = 'Play';
        resetProgressBarInstant();
      }
    } finally {
      setTimeout(() => { if (cycleId === playbackCycleId) autoStepLock = false; }, 400);
    }
  };
  audio.addEventListener('ended', onEnded);

  // ===== Tempo slider guards (iOS-friendly) =====
  function defocusSlider() {
    if (tempoSlider && document.activeElement === tempoSlider) tempoSlider.blur();
    userIsAdjustingTempo = false;
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.target !== tempoSlider) defocusSlider();
  }, { capture: true, passive: true });

  // iOS tap shield (unchanged)
  (function () {
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isiOS || !tempoSlider) return;

    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.display  = 'block';
    wrap.style.width    = '100%';
    tempoSlider.parentNode.insertBefore(wrap, tempoSlider);
    wrap.appendChild(tempoSlider);

    const shield = document.createElement('div');
    Object.assign(shield.style, {
      position: 'absolute', inset: '0', background: 'transparent', zIndex: '5', touchAction: 'none'
    });
    wrap.appendChild(shield);

    const THUMB_RADIUS = 24;
    let dragging = false;

    function thumbCenterX() {
      const rect = tempoSlider.getBoundingClientRect();
      const min  = Number(tempoSlider.min) || 0;
      const max  = Number(tempoSlider.max) || 100;
      const v    = Number(tempoSlider.value);
      const pct  = (v - min) / (max - min || 1);
      return rect.left + pct * rect.width;
    }

    function setFromClientX(clientX) {
      const rect = tempoSlider.getBoundingClientRect();
      const x    = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const min  = Number(tempoSlider.min) || 0;
      const max  = Number(tempoSlider.max) || 100;
      const val  = Math.round(min + (x / (rect.width || 1)) * (max - min));
      tempoSlider.value = String(val);
      updatePlaybackRate();
      updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    }

    function start(e) {
      const t = e.touches ? e.touches[0] : e;
      const onThumb = Math.abs(t.clientX - thumbCenterX()) <= THUMB_RADIUS;

      if (!onThumb) {
        e.preventDefault();
        e.stopPropagation();
        defocusSlider();
        return;
      }

      dragging = true;
      userIsAdjustingTempo = true;
      e.preventDefault();
      e.stopPropagation();
      try { tempoSlider.focus({ preventScroll: true }); } catch {}
      move(e);

      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup',   end,  { passive: true, once: true });
      window.addEventListener('pointercancel', end, { passive: true, once: true });
      window.addEventListener('touchmove',   move, { passive: false });
      window.addEventListener('touchend',    end,  { passive: true, once: true });
      window.addEventListener('touchcancel', end,  { passive: true, once: true });
    }

    function move(e) {
      if (!dragging) return;
      const t = e.touches ? e.touches[0] : e;
      setFromClientX(t.clientX);
      e.preventDefault();
    }

    function end() {
      if (!dragging) return;
      dragging = false;
      userIsAdjustingTempo = false;
      defocusSlider();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('touchmove',   move);
    }

    shield.addEventListener('pointerdown', start, { passive: false });
    shield.addEventListener('touchstart',  start, { passive: false });
  })();

  // Pointer fallback (mouse / stylus)
  if (tempoSlider) {
    tempoSlider.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') userIsAdjustingTempo = true;
    }, { passive: true });

    const endTempoDrag = () => { userIsAdjustingTempo = false; };
    tempoSlider.addEventListener('pointerup', endTempoDrag, { passive: true });
    tempoSlider.addEventListener('pointercancel', endTempoDrag, { passive: true });

    tempoSlider.addEventListener('input', function () {
      if (suppressTempoInput) return;
      updatePlaybackRate();
      updateSliderBackground(this, '#96318d', '#ffffff');
    });

    tempoSlider.addEventListener('change', defocusSlider);
  }

  // ===== Progress bar =====
  let progressRafId = null;
  if (progress) {
    progress.style.transformOrigin = 'left center';
    progress.style.transform = 'scaleX(0)';
  }
  function resetProgressBarInstant() {
    if (!progress) return;
    progress.style.transform = 'scaleX(0)';
    void progress.offsetWidth;
    if (currentTimeDisplay) currentTimeDisplay.textContent = '0:00';
  }
  function startProgressTicker() {
    if (!audio || !progress) return;
    cancelAnimationFrame(progressRafId);
    const tick = () => {
      if (!audio || !progress) return;
      const dur = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 1;
      const pct = Math.min(1, Math.max(0, (audio.currentTime || 0) / dur));
      progress.style.transform = `scaleX(${pct})`;
      updateCurrentTime();
      if (!audio.paused && !audio.ended) {
        progressRafId = requestAnimationFrame(tick);
      }
    };
    progressRafId = requestAnimationFrame(tick);
  }
  function stopProgressTicker() {
    cancelAnimationFrame(progressRafId);
    progressRafId = null;
  }

  if (progressContainer) {
    progressContainer.addEventListener('pointerdown', (e) => {
      isDragging = true;
      try { progressContainer.setPointerCapture(e.pointerId); } catch {}
      updateProgress(e);
      defocusSlider();
    });
    progressContainer.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      updateProgress(e);
    });
    const endProgressDrag = (e) => {
      isDragging = false;
      try { progressContainer.releasePointerCapture(e.pointerId); } catch {}
    };
    progressContainer.addEventListener('pointerup', endProgressDrag, { passive: true });
    progressContainer.addEventListener('pointercancel', endProgressDrag, { passive: true });
    window.addEventListener('pointerup',   () => { isDragging = false; }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) isDragging = false; });
  }

  function updateProgress(e) {
    if (!audio || !progressContainer || !progress) return;
    const rect = progressContainer.getBoundingClientRect();
    const clientX = (e.clientX != null) ? e.clientX : (e.touches?.[0]?.clientX ?? 0);
    let x = clientX - rect.left;
    const width = rect.width || 1;
    let clickedValue = Math.min(1, Math.max(0, x / width));
    const dur = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 1;
    audio.currentTime = clickedValue * dur;
    const pct = Math.min(1, Math.max(0, (audio.currentTime || 0) / dur));
    progress.style.transform = `scaleX(${pct})`;
    updateCurrentTime();
  }

  // ===== Helpers =====
  function formatTime(t) {
    const minutes = Math.floor(t / 60);
    const seconds = Math.floor(t % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function updateTotalTime() {
    if (!audio || !totalTimeDisplay) return;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    const duration = audio.duration / (audio.playbackRate || 1);
    totalTimeDisplay.textContent = formatTime(duration);
  }

  function updateCurrentTime() {
    if (!audio || !currentTimeDisplay) return;
    const rate = audio.playbackRate || 1;
    const current = (audio.currentTime || 0) / rate;
    currentTimeDisplay.textContent = formatTime(current);
  }

  function updateSliderBackground(slider, c1, c2) {
    if (!slider) return;
    const v = Number(slider.value), min = Number(slider.min), max = Number(slider.max);
    const pct = ((v - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, ${c1} 0%, ${c1} ${pct}%, ${c2} ${pct}%, ${c2} 100%)`;
  }

  function updatePlaybackRate() {
    if (!audio || !tempoSlider || !currentOriginalTempo) return;
    const currentTempo = parseInt(tempoSlider.value, 10);
    const playbackRate = currentTempo / currentOriginalTempo;
    audio.playbackRate = playbackRate;
    if (tempoLabel) tempoLabel.textContent = 'BPM: ' + currentTempo;
    updateTotalTime();
    updateCurrentTime();
  }

  function setTempoThrottled(bpm, { blur = false } = {}) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastTempoChangeAt < 400) return;
    lastTempoChangeAt = now;
    setTempoSilently(bpm, { blur });
  }

  function setTempoSilently(bpm, { blur = false } = {}) {
    if (!tempoSlider) return;
    suppressTempoInput = true;
    tempoSlider.value = String(bpm);
    updatePlaybackRate();
    updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    requestAnimationFrame(() => {
      suppressTempoInput = false;
      if (blur) tempoSlider.blur();
    });
  }

  // ===== Exercise flow =====
  function filterExercisesForMode() {
    if (isPlayingPlaylist && currentPlaylist) {
      const ids = currentPlaylist.items.map(i => i.exerciseId);
      return exercises.filter(ex => ids.includes(ex.id));
    } else {
      const selectedCategory = getSelectedCategory();
      return exercises.filter(ex => selectedCategory === 'all' || ex.category.includes(selectedCategory));
    }
  }

  function getSelectedCategory() {
    // Prefer data-id on the input; fallback to placeholder mapping
    const id = getSelectorId(categorySearchInput);
    if (id) return id;
    const ph = categorySearchInput?.placeholder ?? 'All Categories';
    if (ph === '' || ph === 'All Categories') return 'all';
    const entry = Object.entries(categoryDisplayMap).find(([key, val]) => val.toLowerCase() === ph.toLowerCase());
    return entry ? entry[0] : 'all';
  }

  function initializeExercise(ex) {
    if (!audio || !tempoSlider || !tempoLabel || !sheetMusicImg) return;

    audio.src     = ex.audioSrc;
    audio.preload = 'auto';
    audio.load();

    if ('preservesPitch' in audio)       audio.preservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
    if ('mozPreservesPitch' in audio)    audio.mozPreservesPitch = true;

    sheetMusicImg.src = ex.sheetMusicSrc;

    currentOriginalTempo = ex.originalTempo;
    tempoSlider.min      = ex.originalTempo / 2;
    tempoSlider.max      = ex.originalTempo * 2;
    tempoSlider.value    = ex.originalTempo;
    tempoLabel.textContent = 'BPM: ' + ex.originalTempo;

    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = ex.name;
      exerciseSearchInput.dataset.id = String(ex.id);
    }

    updatePlaybackRate();
    updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    applyLoopMode();
  }

  function pickRandomExercise() {
    const filtered = filterExercisesForMode();
    if (filtered.length === 0) return;
    const idx = Math.floor(Math.random() * filtered.length);
    currentExerciseIndex    = idx;
    currentSelectedExercise = filtered[idx];
    if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = currentSelectedExercise.name; exerciseSearchInput.dataset.id = String(currentSelectedExercise.id); }
    initializeExercise(currentSelectedExercise);
    if (audio) { audio.pause(); resetProgressBarInstant(); }
    if (playPauseBtn) playPauseBtn.textContent = 'Play';

    if (isPlayingPlaylist && currentPlaylist) {
      syncPlaylistIndexToExercise(currentSelectedExercise.id);
      playCurrentPlaylistItem();
    }
  }

  function pickRandomTempo() {
    if (!currentSelectedExercise || !tempoSlider) return;
    if (userIsAdjustingTempo) return;

    let minTempo = parseInt(minTempoInput?.value, 10);
    let maxTempo = parseInt(maxTempoInput?.value, 10);
    const defMin = Math.floor(currentSelectedExercise.originalTempo / 2);
    const defMax = currentSelectedExercise.originalTempo * 2;

    if (isNaN(minTempo) || minTempo < 1 || minTempo > 999) minTempo = defMin;
    if (isNaN(maxTempo) || maxTempo < 1 || maxTempo > 999) maxTempo = defMax;
    if (minTempo > maxTempo) [minTempo, maxTempo] = [maxTempo, minTempo];

    minTempo = Math.max(minTempo, Number(tempoSlider.min));
    maxTempo = Math.min(maxTempo, Number(tempoSlider.max));

    let randomTempo;
    do {
      randomTempo = Math.floor(Math.random() * (maxTempo - minTempo + 1)) + minTempo;
    } while (prevTempo !== null && (Math.abs(randomTempo - prevTempo) < 8 || Math.abs(randomTempo - prevTempo) > 90));

    prevTempo = randomTempo;
    setTempoThrottled(randomTempo, { blur: true });
  }

  function navigateExercise(step) {
    displayedExercises = filterExercisesForMode();
    if (displayedExercises.length === 0) return;

    const len = displayedExercises.length;
    currentExerciseIndex = (currentExerciseIndex + step + len) % len;
    currentSelectedExercise = displayedExercises[currentExerciseIndex];

    if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = currentSelectedExercise.name; exerciseSearchInput.dataset.id = String(currentSelectedExercise.id); }

    initializeExercise(currentSelectedExercise);
    if (audio) { audio.pause(); resetProgressBarInstant(); if (playPauseBtn) playPauseBtn.textContent = 'Play'; }

    if (isPlayingPlaylist && currentPlaylist) {
      syncPlaylistIndexToExercise(currentSelectedExercise.id);
      updatePlaylistQueueDisplay();
      updatePlaylistProgressBar();
      playCurrentPlaylistItem();
    }
  }

  // Exercise nav buttons
  document.getElementById('prevExerciseBtn')?.addEventListener('click', () => { quietRandomize(); navigateExercise(-1); });
  document.getElementById('nextExerciseBtn')?.addEventListener('click', () => { quietRandomize(); navigateExercise(1);  });

  // ===== Playlist flow =====
  function startPlaylist(playlistId) {
    currentPlaylist = playlists[playlistId];
    currentPlaylistItemIndex = 0;
    currentTempoIndex = 0;
    currentRepetition = 0;
    isPlayingPlaylist = true;

    document.body.classList.add('playlist-mode');
    if (categorySearchInput) {
      categorySearchInput.placeholder = "All Categories";
      categorySearchInput.dataset.id = 'all';
    }

    if (categorySearchInput)   categorySearchInput.disabled   = true;
    if (minTempoInput)         minTempoInput.disabled         = true;
    if (maxTempoInput)         maxTempoInput.disabled         = true;
    if (randomExerciseBtn)     randomExerciseBtn.disabled     = true;
    if (randomTempoBtn)        randomTempoBtn.disabled        = true;
    if (autoRandomizeToggle)   autoRandomizeToggle.disabled   = true;
    if (repsPerTempoInput)     repsPerTempoInput.disabled     = true;
    if (tempoSlider)           tempoSlider.disabled           = true;

    const autoLabel = document.querySelector('.auto-label');
    if (autoLabel) autoLabel.classList.add('disabled');
    const randomContainer = document.querySelector('.random-container');
    if (randomContainer) randomContainer.classList.add('disabled');

    if (prevPlaylistItemBtn) prevPlaylistItemBtn.disabled = false;
    if (nextPlaylistItemBtn) nextPlaylistItemBtn.disabled = false;
    if (stopPlaylistBtn)     stopPlaylistBtn.disabled     = false;

    if (playlistQueueSearchInput) {
      playlistQueueSearchInput.disabled = false;
      playlistQueueSearchInput.removeAttribute('disabled');
      playlistQueueSearchInput.style.opacity = '1';
    }
    if (playlistProgressContainer) playlistProgressContainer.style.display = 'block';

    displayedExercises = filterExercisesForMode();
    if (displayedExercises.length > 0) {
      currentExerciseIndex    = 0;
      currentSelectedExercise = displayedExercises[0];
    }

    updatePlaylistQueueDisplay(); // builds queue map
    playCurrentPlaylistItem();
    applyLoopMode();
  }

  function playCurrentPlaylistItem() {
    if (!currentPlaylist) return;
    const item       = currentPlaylist.items[currentPlaylistItemIndex];
    const exerciseId = item.exerciseId;
    const exercise   = exercises.find(ex => ex.id === exerciseId);
    if (!exercise) { console.error('Exercise not found: ' + exerciseId); return; }

    currentSelectedExercise = exercise;
    displayedExercises      = filterExercisesForMode();
    currentExerciseIndex    = displayedExercises.indexOf(exercise);

    if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = exercise.name; exerciseSearchInput.dataset.id = String(exercise.id); }
    initializeExercise(exercise);

    const tempo = item.tempos[currentTempoIndex];
    setTempoSilently(tempo); // slider is disabled in playlist mode

    if (playlistQueueSearchInput) {
      setSelectorValue(playlistQueueSearchInput, `${exercise.name} at ${tempo} BPM`, `${currentPlaylistItemIndex}-${currentTempoIndex}-${currentRepetition}`);
    }

    playExerciseRepetitions(item.repetitionsPerTempo);
    updatePlaylistQueueDisplay();
    updatePlaylistProgressBar();
  }

  function playExerciseRepetitions(repetitions) {
    function playNextRepetition() {
      if (!audio) return;
      if (currentRepetition < repetitions) {
        audio.currentTime = 0;
        audio.onended = null;
        audio.play();
        if (playPauseBtn) playPauseBtn.textContent = 'Pause';
        startProgressTicker();

        audio.onended = function () {
          currentRepetition++;
          updatePlaylistQueueDisplay();
          updatePlaylistProgressBar();
          playNextRepetition();
        };
      } else {
        currentTempoIndex++;
        currentRepetition = 0;
        if (currentTempoIndex >= currentPlaylist.items[currentPlaylistItemIndex].tempos.length) {
          currentPlaylistItemIndex++;
          currentTempoIndex = 0;
          if (currentPlaylistItemIndex >= currentPlaylist.items.length) {
            isPlayingPlaylist = false;
            currentPlaylist = null;
            stopPlaylist();
            return;
          }
        }
        updatePlaylistQueueDisplay();
        updatePlaylistProgressBar();
        playCurrentPlaylistItem();
      }
    }
    playNextRepetition();
  }

  function stopPlaylist() {
  if (audio) audio.pause();
  isPlayingPlaylist = false;
  currentPlaylist   = null;
  if (playPauseBtn) playPauseBtn.textContent = 'Play';
  resetPlaylistControls();
  resetProgressBarInstant();

  // Re-enable controls
  if (categorySearchInput) categorySearchInput.disabled = false;
  if (minTempoInput)      minTempoInput.disabled        = false;
  if (maxTempoInput)      maxTempoInput.disabled        = false;
  if (randomExerciseBtn)  randomExerciseBtn.disabled    = false;
  if (randomTempoBtn)     randomTempoBtn.disabled       = false;
  if (autoRandomizeToggle) autoRandomizeToggle.disabled = false;
  if (repsPerTempoInput)  repsPerTempoInput.disabled    = false;
  if (tempoSlider)        tempoSlider.disabled          = false;

  const autoLabel = document.querySelector('.auto-label');
  if (autoLabel) autoLabel.classList.remove('disabled');
  const randomContainer = document.querySelector('.random-container');
  if (randomContainer) randomContainer.classList.remove('disabled');

  document.body.classList.remove('playlist-mode');

  // Reset queue field
  if (playlistQueueSearchInput) {
    playlistQueueSearchInput.value = '';
    playlistQueueSearchInput.placeholder = 'Playlist Queue';
    delete playlistQueueSearchInput.dataset.id;
    playlistQueueSearchInput.disabled = true;
    playlistQueueSearchInput.setAttribute('disabled','');
  }

  // Reset playlist selector to prompt text
  if (playlistSearchInput) {
    playlistSearchInput.value = '';
    playlistSearchInput.placeholder = 'Select a Playlist';
    delete playlistSearchInput.dataset.id;
  }

  // ✅ Reset Category to "All Categories"
  if (categorySearchInput) {
    categorySearchInput.value = '';
    categorySearchInput.placeholder = 'All Categories';
    categorySearchInput.dataset.id = 'all';
  }

  // Recompute exercises under "All" and sync exercise field
  displayedExercises = filterExercisesForMode();
  if (displayedExercises.length) {
    if (!currentSelectedExercise || !displayedExercises.some(ex => ex.id === currentSelectedExercise.id)) {
      currentSelectedExercise = displayedExercises[0];
      initializeExercise(currentSelectedExercise);
    }
    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = currentSelectedExercise.name;
      exerciseSearchInput.dataset.id = String(currentSelectedExercise.id);
    }
  } else {
    currentSelectedExercise = null;
    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = 'Search Exercises...';
      delete exerciseSearchInput.dataset.id;
    }
  }

  applyLoopMode();
}



  function resetPlaylistControls() {
    if (stopPlaylistBtn)            stopPlaylistBtn.disabled = true;
    if (playlistQueueSearchInput)   playlistQueueSearchInput.disabled = true;
    if (prevPlaylistItemBtn)        prevPlaylistItemBtn.disabled = true;
    if (nextPlaylistItemBtn)        nextPlaylistItemBtn.disabled = true;
    if (playPauseBtn)               playPauseBtn.textContent = 'Play';
    // Do NOT clear playlistSearchInput.value; keep last selection visible.
    if (playlistProgressContainer)  playlistProgressContainer.style.display = 'none';
    updatePlaylistQueueDisplay();
    updatePlaylistProgressBar();
  }

  function updatePlaylistQueueDisplay() {
    playlistQueueMap = [];
    if (!isPlayingPlaylist || !currentPlaylist) return;

    currentPlaylist.items.forEach((item, i) => {
      item.tempos.forEach((t, ti) => {
        for (let r = 0; r < item.repetitionsPerTempo; r++) {
          playlistQueueMap.push({ playlistItemIndex: i, tempoIndex: ti, repetition: r });
        }
      });
    });
  }

  function getCurrentPlaylistQueueIndex() {
    return playlistQueueMap.findIndex(pos =>
      pos.playlistItemIndex === currentPlaylistItemIndex &&
      pos.tempoIndex        === currentTempoIndex &&
      pos.repetition        === currentRepetition
    );
  }

  function updatePlaylistProgressBar() {
    if (!playlistProgress || !playlistProgressPercentage) return;
    if (!isPlayingPlaylist || !currentPlaylist || playlistQueueMap.length === 0) {
      playlistProgress.style.width = '0%';
      playlistProgressPercentage.textContent = '0%';
      return;
    }
    const currentIndex = getCurrentPlaylistQueueIndex();
    if (currentIndex === -1) {
      playlistProgress.style.width = '0%';
      playlistProgressPercentage.textContent = '0%';
      return;
    }
    const totalItems = playlistQueueMap.length;
    const progressPercent = ((currentIndex + 1) / totalItems) * 100;
    playlistProgress.style.width = progressPercent + '%';
    playlistProgressPercentage.textContent = Math.floor(progressPercent) + '%';
  }

  function syncPlaylistIndexToExercise(exerciseId) {
    if (!currentPlaylist || !Array.isArray(currentPlaylist.items)) return;
    const idx = currentPlaylist.items.findIndex(i => i.exerciseId === exerciseId);
    if (idx >= 0) {
      currentPlaylistItemIndex = idx;
      currentTempoIndex = 0;
      currentRepetition = 0;
      updatePlaylistQueueDisplay();
      updatePlaylistProgressBar();
    }
  }

  function quietRandomize() {
    currentRepCount = 0;
    if (audio) audio.onended = null;
  }

  // ===== Placeholders / initial ids =====
  function initializeCategoryPlaceholder() {
    if (categorySearchInput) {
      categorySearchInput.placeholder = "All Categories";
      categorySearchInput.dataset.id = 'all';
    }
  }
  function initializePlaylistPlaceholder() {
    if (playlistSearchInput) playlistSearchInput.placeholder = "Select a Playlist";
  }

  // ===== Picker overlay (no auto-focus; active item scrolls into view) =====
  function showPicker({ theme = 'orange', title = 'Select', getItems, onSelect, getActiveId, getInitialIndex }) {
    return new Promise((resolve) => {
      // Theme
      pickerOverlay.classList.remove('picker--orange', 'picker--purple');
      pickerOverlay.classList.add(theme === 'purple' ? 'picker--purple' : 'picker--orange');

      // Title + open
      pickerTitle.textContent = title;
      pickerOverlay.hidden = false;
      pickerOverlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');

      pickerSearch.value = '';
      pickerSearch.placeholder = 'Search...';
      // IMPORTANT: do NOT focus automatically (prevents keyboard popup)

      let items = [];
      let activeIndex = -1;

      function computeInitialIndex() {
        if (typeof getInitialIndex === 'function') {
          const idx = getInitialIndex(items);
          if (Number.isInteger(idx) && idx >= 0 && idx < items.length) return idx;
        }
        if (typeof getActiveId === 'function') {
          const want = getActiveId();
          if (want != null) {
            const i = items.findIndex(it => String(it.id) === String(want));
            if (i !== -1) return i;
          }
        }
        return items.length ? 0 : -1;
      }

      function render() {
        pickerList.innerHTML = '';
        if (!items.length) return;

        activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
        items.forEach((it, i) => {
          const li = document.createElement('li');
          li.className = 'picker__item' + (i === activeIndex ? ' is-active' : '');
          li.setAttribute('role', 'option');
          li.dataset.idx = i;
          li.textContent = it.label;
          li.addEventListener('click', () => choose(i));
          pickerList.appendChild(li);
        });

        // Keep active item in view on (re)render
        if (activeIndex >= 0) {
          const el = pickerList.querySelector(`[data-idx="${activeIndex}"]`);
          if (el) el.scrollIntoView({ block: 'nearest' });
        }
      }

      function refresh() {
        const q = pickerSearch.value.trim().toLowerCase();
        items = getItems(q);
        activeIndex = computeInitialIndex();
        render();
      }

      function choose(i) {
        const it = items[i];
        cleanup();
        onSelect?.(it);
        resolve(it || null);
      }

      function close() {
        cleanup();
        resolve(null);
      }

      function onKey(e) {
        if (!items.length) {
          if (e.key === 'Escape') { e.preventDefault(); close(); }
          return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); render(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(); }
        if (e.key === 'Enter')     { e.preventDefault(); choose(activeIndex); }
        if (e.key === 'Escape')    { e.preventDefault(); close(); }
      }

      function onOverlayClick(e) {
        if (e.target === pickerOverlay) close();
      }

      function cleanup() {
        pickerOverlay.hidden = true;
        pickerOverlay.setAttribute('aria-hidden', 'true');
        pickerSearch.value = '';
        pickerList.innerHTML = '';
        document.body.classList.remove('modal-open');
        pickerSearch.removeEventListener('input', refresh);
        document.removeEventListener('keydown', onKey);
        pickerOverlay.removeEventListener('click', onOverlayClick);
        pickerClose.removeEventListener('click', close);
      }

      pickerSearch.addEventListener('input', refresh);
      document.addEventListener('keydown', onKey);
      pickerOverlay.addEventListener('click', onOverlayClick);
      pickerClose.addEventListener('click', close);

      refresh();
    });
  }

  // ===== Specific pickers =====
  function openCategoryPicker() {
    showPicker({
      theme: 'orange',
      title: 'Select Category',
      getItems: (q) => displayedCategories
        .filter(cat => (categoryDisplayMap[cat] || cat).toLowerCase().includes(q))
        .map(cat => ({ id: cat, label: categoryDisplayMap[cat] || cat })),
      getActiveId: () => getSelectedCategory(),
      onSelect: (it) => {
        if (!it) return;
        setSelectorValue(categorySearchInput, it.label, it.id);
        if (isPlayingPlaylist) stopPlaylist();

        currentExerciseIndex = 0;
        const filtered = filterExercisesForMode();
        if (filtered.length > 0) {
          currentSelectedExercise = filtered[currentExerciseIndex];
          initializeExercise(currentSelectedExercise);
          if (exerciseSearchInput) {
            exerciseSearchInput.value = '';
            exerciseSearchInput.placeholder = currentSelectedExercise.name;
            exerciseSearchInput.dataset.id = String(currentSelectedExercise.id);
          }
          if (audio) { audio.pause(); resetProgressBarInstant(); }
          if (playPauseBtn) playPauseBtn.textContent = 'Play';
        } else {
          currentSelectedExercise = null;
          if (exerciseSearchInput) {
            exerciseSearchInput.value = '';
            exerciseSearchInput.placeholder = "Search Exercises...";
            delete exerciseSearchInput.dataset.id;
          }
        }
      }
    });
  }

  function openExercisePicker() {
    showPicker({
      theme: document.body.classList.contains('playlist-mode') ? 'purple' : 'orange',
      title: 'Select Exercise',
      getItems: (q) => filterExercisesForMode()
        .filter(ex => ex.name.toLowerCase().includes(q))
        .map(ex => ({ id: ex.id, label: ex.name, ex })),
      getActiveId: () => currentSelectedExercise?.id ?? exerciseSearchInput?.dataset?.id ?? null,
      onSelect: (it) => {
        if (!it) return;
        const exercise = it.ex || exercises.find(e => e.id === it.id);
        if (!exercise) return;

        currentSelectedExercise = exercise;
        displayedExercises      = filterExercisesForMode();
        currentExerciseIndex    = displayedExercises.findIndex(ex => ex.id === exercise.id);
        initializeExercise(exercise);

        if (exerciseSearchInput) {
          exerciseSearchInput.value = '';
          exerciseSearchInput.placeholder = exercise.name;
          exerciseSearchInput.dataset.id = String(exercise.id);
        }

        if (isPlayingPlaylist && currentPlaylist) {
          syncPlaylistIndexToExercise(exercise.id);
          updatePlaylistQueueDisplay();
          updatePlaylistProgressBar();
          playCurrentPlaylistItem();
        } else {
          if (audio) { audio.pause(); resetProgressBarInstant(); }
          if (playPauseBtn) playPauseBtn.textContent = 'Play';
        }
      }
    });
  }

  function openPlaylistPicker() {
    showPicker({
      theme: 'purple',
      title: 'Select Playlist',
      getItems: (q) => displayedPlaylists
        .filter(p => p.name.toLowerCase().includes(q))
        .map(p => ({ id: p.index, label: p.name })),
      getActiveId: () => {
        if (currentPlaylist) return playlists.indexOf(currentPlaylist);
        return getSelectorId(playlistSearchInput);
      },
      onSelect: (it) => {
        if (!it) return;
        // Ensure previous run is fully stopped before updating UI
        if (isPlayingPlaylist) stopPlaylist();
        startPlaylist(it.id);
        setSelectorValue(playlistSearchInput, it.label, it.id);
      }
    });
  }

  function openQueuePicker() {
    if (!isPlayingPlaylist || !currentPlaylist || playlistQueueMap.length === 0) return;
    showPicker({
      theme: 'purple',
      title: 'Playlist Queue',
      getItems: (q) => {
        return playlistQueueMap.map(pos => {
          const pItem = currentPlaylist.items[pos.playlistItemIndex];
          const ex    = exercises.find(e => e.id === pItem.exerciseId);
          const tempo = pItem.tempos[pos.tempoIndex];
          const repIx = pos.repetition + 1;
          const label = `${ex ? ex.name : 'Exercise'} at ${tempo} BPM (rep ${repIx}/${pItem.repetitionsPerTempo})`;
          return { pos, label, id: `${pos.playlistItemIndex}-${pos.tempoIndex}-${pos.repetition}`, qText: `${(ex?.name||'').toLowerCase()} ${String(tempo)}` };
        }).filter(vm => vm.qText.includes(q));
      },
      getActiveId: () => `${currentPlaylistItemIndex}-${currentTempoIndex}-${currentRepetition}`,
      onSelect: (it) => {
        if (!it) return;
        const pos = it.pos;
        currentPlaylistItemIndex = pos.playlistItemIndex;
        currentTempoIndex        = pos.tempoIndex;
        currentRepetition        = pos.repetition;
        if (playlistQueueSearchInput) setSelectorValue(playlistQueueSearchInput, it.label, it.id);
        updatePlaylistQueueDisplay();
        updatePlaylistProgressBar();
        playCurrentPlaylistItem();
      }
    });
  }

  // ===== Open pickers from inputs (open on release with movement threshold; no keyboard) =====
  function wireOpener(input, fn) {
  if (!input) return;
  try { input.readOnly = true; } catch {}
  input.setAttribute('inputmode','none');

  // Open on release
  input.addEventListener('click', (e) => {
    e.preventDefault();
    fn();
  });

  // Keyboard support
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  });
}


  wireOpener(categorySearchInput, openCategoryPicker);
  wireOpener(exerciseSearchInput, openExercisePicker);
  wireOpener(playlistSearchInput, openPlaylistPicker);
  wireOpener(playlistQueueSearchInput, openQueuePicker);

  // Playlist navigation buttons
  stopPlaylistBtn?.addEventListener('click', function () { if (isPlayingPlaylist) stopPlaylist(); });
  prevPlaylistItemBtn?.addEventListener('click', function () {
    if (isPlayingPlaylist && playlistQueueMap.length > 0) {
      let i = getCurrentPlaylistQueueIndex();
      if (i > 0) {
        i--;
        const pos = playlistQueueMap[i];
        currentPlaylistItemIndex = pos.playlistItemIndex;
        currentTempoIndex        = pos.tempoIndex;
        currentRepetition        = pos.repetition;
        updatePlaylistQueueDisplay();
        updatePlaylistProgressBar();
        playCurrentPlaylistItem();
      }
    }
  });
  nextPlaylistItemBtn?.addEventListener('click', function () {
    if (isPlayingPlaylist && playlistQueueMap.length > 0) {
      let i = getCurrentPlaylistQueueIndex();
      if (i < playlistQueueMap.length - 1) {
        i++;
        const pos = playlistQueueMap[i];
        currentPlaylistItemIndex = pos.playlistItemIndex;
        currentTempoIndex        = pos.tempoIndex;
        currentRepetition        = pos.repetition;
        updatePlaylistQueueDisplay();
        updatePlaylistProgressBar();
        playCurrentPlaylistItem();
      }
    }
  });
});
