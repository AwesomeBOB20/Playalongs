document.addEventListener('DOMContentLoaded', function () {
  // Data
  const exercises  = Array.isArray(window.EXERCISES)  ? window.EXERCISES  : [];
  const playlists  = Array.isArray(window.PLAYLISTS)  ? window.PLAYLISTS  : [];

  // DOM
  const audio                      = document.getElementById('audio');
  const totalTimeDisplay           = document.getElementById('totalTime');
  const currentTimeDisplay         = document.getElementById('currentTime');
  const playPauseBtn               = document.getElementById('playPauseBtn');
  const tempoSlider                = document.getElementById('tempoSlider');
  const tempoLabel                 = document.getElementById('tempoLabel');
  const sheetMusicImg              = document.querySelector('.sheet-music img');

  // Progress bar
  const progressContainer          = document.querySelector('.progress-container .bar');
  let   progress                   = document.getElementById('progress') || document.querySelector('.bar__fill');

  // Controls
  const randomExerciseBtn          = document.getElementById('randomExerciseBtn');
  const randomTempoBtn             = document.getElementById('randomTempoBtn');
  const minTempoInput              = document.getElementById('minTempo');
  const maxTempoInput              = document.getElementById('maxTempo');
  const stopPlaylistBtn            = document.getElementById('stopPlaylistBtn');
  const prevPlaylistItemBtn        = document.getElementById('prevPlaylistItemBtn');
  const nextPlaylistItemBtn        = document.getElementById('nextPlaylistItemBtn');

  const playlistProgressContainer  = document.querySelector('.playlist-progress-container');
  const playlistProgress           = document.getElementById('playlistProgress');
  const playlistProgressPercentage = document.getElementById('playlistProgressPercentage');

  const prevExerciseBtn            = document.getElementById('prevExerciseBtn');
  const nextExerciseBtn            = document.getElementById('nextExerciseBtn');
  const autoRandomizeToggle        = document.getElementById('autoRandomizeToggle');
  const repsPerTempoInput          = document.getElementById('repsPerTempo');

  const categorySearchInput        = document.getElementById('categorySearch');
  const categoryList               = document.getElementById('categoryList');
  const exerciseSearchInput        = document.getElementById('exerciseSearch');
  const exerciseList               = document.getElementById('exerciseList');
  const playlistSearchInput        = document.getElementById('playlistSearch');
  const playlistList               = document.getElementById('playlistList');
  const playlistQueueSearchInput   = document.getElementById('playlistQueueSearch');
  const playlistQueueList          = document.getElementById('playlistQueueList');

  // ---- Feature detection / flags ----
  const isTouchDevice =
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0);

  // ---- iOS focus guard + Auto debounce/throttle ----
  let autoChangeCooldown = false;              // prevents duplicate tempo changes on a single "ended"
  let inEndedCycle       = false;              // guards re-entrant ended bursts
  let lastTempoChangeAt  = 0;                  // throttles programmatic tempo moves

  function defocusSlider() {
    if (tempoSlider && document.activeElement === tempoSlider) tempoSlider.blur();
    userIsAdjustingTempo = false;
  }

  // Blur the slider whenever you touch/click anything that is NOT the slider
  document.addEventListener('pointerdown', (e) => {
    if (e.target !== tempoSlider) defocusSlider();
  }, { capture: true, passive: true });

  // State
  let isDragging = false; // progress bar drag
  if (playlistQueueSearchInput) playlistQueueSearchInput.disabled = true;
  if (stopPlaylistBtn)          stopPlaylistBtn.disabled          = true;
  if (prevPlaylistItemBtn)      prevPlaylistItemBtn.disabled      = true;
  if (nextPlaylistItemBtn)      nextPlaylistItemBtn.disabled      = true;

  let currentPlaylist = null;
  let currentPlaylistItemIndex = 0;
  let currentTempoIndex = 0;
  let currentRepetition = 0;
  let isPlayingPlaylist = false;
  let playlistQueueMap = [];

  let isRandomizeEnabled = false;
  let repsBeforeChange   = 1;
  let currentRepCount    = 0;
  let displayedExercises = [];
  let currentExerciseIndex = 0;
  let currentSelectedExercise = null;
  let prevTempo = null;

  // tempo guards
  let currentOriginalTempo = null;
  let userIsAdjustingTempo = false;
  let suppressTempoInput   = false;

  // Categories
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
  let displayedPlaylists = playlists.map((p, i) => ({ index: i, name: p.name }));

  // Audio defaults
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

  // Reset on refresh or iOS back
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

  // Button intent and propagation safety
  const clickableIds = [
    'playPauseBtn','randomExerciseBtn','randomTempoBtn',
    'prevExerciseBtn','nextExerciseBtn',
    'prevPlaylistItemBtn','nextPlaylistItemBtn','stopPlaylistBtn'
  ];
  clickableIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.type = 'button'; } catch {}
    el.style.touchAction = 'manipulation';
    const stop = (e) => e.stopPropagation();
    el.addEventListener('pointerdown', stop, { passive: true });
    el.addEventListener('click', stop);
  });

  // Init lists
  initializeCategoryList();
  initializePlaylistList();
  populateExerciseList();
  if (exerciseList)      exerciseList.style.display = 'none';
  if (categoryList)      categoryList.style.display = 'none';
  if (playlistList)      playlistList.style.display = 'none';
  if (playlistQueueList) playlistQueueList.style.display = 'none';

  displayedExercises = filterExercisesForMode();
  if (displayedExercises.length > 0) {
    currentExerciseIndex    = 0;
    currentSelectedExercise = displayedExercises[currentExerciseIndex];
    initializeExercise(currentSelectedExercise);
    if (exerciseSearchInput) exerciseSearchInput.placeholder = currentSelectedExercise.name;
  } else {
    if (exerciseSearchInput) exerciseSearchInput.placeholder = "Search Exercises...";
  }

  // Randomize
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

  // Buttons
  randomExerciseBtn?.addEventListener('click', function () {
    quietRandomize();
    if (isPlayingPlaylist) stopPlaylist();
    pickRandomExercise();
  });

  randomTempoBtn?.addEventListener('click', function () {
    if (isPlayingPlaylist) return;
    const wasPlaying = audio && !audio.paused;
    quietRandomize();
    pickRandomTempo(); // will blur slider after programmatic change
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

  // Ended behavior (longer guard window)
  if (audio) {
    audio.addEventListener('ended', function () {
      stopProgressTicker();
      if (isPlayingPlaylist) return;
      if (inEndedCycle) return;
      inEndedCycle = true;
      try {
        if (isRandomizeEnabled && currentSelectedExercise) {
          currentRepCount++;
          if (currentRepCount >= repsBeforeChange) {
            currentRepCount = 0;
            if (!autoChangeCooldown) {
              autoChangeCooldown = true;
              pickRandomTempo(); // moves knob + blurs slider
              setTimeout(() => { autoChangeCooldown = false; }, 250);
            }
          }
          audio.currentTime = 0;
          resetProgressBarInstant();
          Promise.resolve().then(() => audio.play().catch(()=>{}));
          if (playPauseBtn) playPauseBtn.textContent = 'Pause';
          startProgressTicker();
          return;
        }
        if (!audio.loop) {
          if (playPauseBtn) playPauseBtn.textContent = 'Play';
          resetProgressBarInstant();
        }
      } finally {
        setTimeout(() => { inEndedCycle = false; }, 250); // was 0; give iOS time
      }
    });

    audio.addEventListener('loadedmetadata', updateTotalTime);
    audio.addEventListener('ratechange',     updateTotalTime);
    audio.addEventListener('ratechange',     updateCurrentTime);
    audio.addEventListener('pause',          stopProgressTicker);
    audio.addEventListener('play',           startProgressTicker);
    audio.addEventListener('seeking',        startProgressTicker);
  }

  // --- TEMPO SLIDER ---
  // iOS-only shield: block track taps; allow thumb drag via custom handling (prevents button hijack)
  (function () {
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isiOS || !tempoSlider) return;

    // Wrap slider so we can position a shield above it
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.display  = 'block';
    wrap.style.width    = '100%';
    tempoSlider.parentNode.insertBefore(wrap, tempoSlider);
    wrap.appendChild(tempoSlider);

    // Transparent shield that intercepts taps
    const shield = document.createElement('div');
    Object.assign(shield.style, {
      position: 'absolute',
      inset: '0',
      background: 'transparent',
      zIndex: '5',
      touchAction: 'none'
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
      // Manual UI update (don’t rely on native input event)
      tempoSlider.value = String(val);
      updatePlaybackRate();
      updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    }

    function start(e) {
      const t = e.touches ? e.touches[0] : e;
      const onThumb = Math.abs(t.clientX - thumbCenterX()) <= THUMB_RADIUS;

      if (!onThumb) {
        // Block track taps completely (no jump; no sticky focus)
        e.preventDefault();
        e.stopPropagation();
        defocusSlider();
        return;
      }

      // Begin custom drag
      dragging = true;
      userIsAdjustingTempo = true;
      e.preventDefault();
      e.stopPropagation();
      try { tempoSlider.focus({ preventScroll: true }); } catch {}
      move(e);

      // Attach move/end listeners to window so drag keeps working if finger leaves shield
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

  // B) Pointer fallback (mouse / stylus): allow normal behavior
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

    // Also blur on value commit (extra iOS safety)
    tempoSlider.addEventListener('change', defocusSlider);
  }

  // Progress bar with pointer capture (also defocus slider on touch)
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

  // Exercise nav
  prevExerciseBtn?.addEventListener('click', () => { quietRandomize(); navigateExercise(-1); });
  nextExerciseBtn?.addEventListener('click', () => { quietRandomize(); navigateExercise(1);  });

  // Playlist buttons
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

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.exercise-container')       && exerciseList)        exerciseList.style.display = 'none';
    if (!e.target.closest('.category-container')       && categoryList)        categoryList.style.display = 'none';
    if (!e.target.closest('.playlist-container')       && playlistList)        playlistList.style.display = 'none';
    if (!e.target.closest('.playlist-queue-container') && playlistQueueList)   playlistQueueList.style.display = 'none';
  });

  // Open and filter dropdowns
  exerciseSearchInput?.addEventListener('focus', () => populateExerciseList(exerciseSearchInput.value));
  exerciseSearchInput?.addEventListener('input', () => populateExerciseList(exerciseSearchInput.value));
  categorySearchInput?.addEventListener('focus', () => populateCategoryList(categorySearchInput.value));
  categorySearchInput?.addEventListener('input', () => populateCategoryList(categorySearchInput.value));
  playlistSearchInput?.addEventListener('focus', () => populatePlaylistList(playlistSearchInput.value));
  playlistSearchInput?.addEventListener('input', () => populatePlaylistList(playlistSearchInput.value));
  playlistQueueSearchInput?.addEventListener('focus', () => populatePlaylistQueueList(playlistQueueSearchInput.value));
  playlistQueueSearchInput?.addEventListener('input', () => populatePlaylistQueueList(playlistQueueSearchInput.value));

  // Helpers
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
    if (!categorySearchInput) return 'all';
    const ph = categorySearchInput.placeholder;
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
    }

    updatePlaybackRate();
    updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    applyLoopMode();
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

  // Throttled programmatic setter (prevents "frantic" bursts)
  function setTempoThrottled(bpm, { blur = false } = {}) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastTempoChangeAt < 180) return; // ~ one change per animation frame cluster
    lastTempoChangeAt = now;
    setTempoSilently(bpm, { blur });
  }

  // Programmatic set that optionally blurs
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

  // Progress ticker
  let progressRafId = null;
  if (progress) {
    progress.style.transformOrigin = 'left center';
    progress.style.transform = 'scaleX(0)';
  }
  function resetProgressBarInstant() {
    if (!progress) return;
    progress.style.transform = 'scaleX(0)';
    void progress.offsetWidth; // Safari repaint
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

  function updateSliderBackground(slider, c1, c2) {
    if (!slider) return;
    const v = Number(slider.value), min = Number(slider.min), max = Number(slider.max);
    const pct = ((v - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, ${c1} 0%, ${c1} ${pct}%, ${c2} ${pct}%, ${c2} 100%)`;
  }

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

  function pickRandomExercise() {
    const filtered = filterExercisesForMode();
    if (filtered.length === 0) return;
    const idx = Math.floor(Math.random() * filtered.length);
    currentExerciseIndex    = idx;
    currentSelectedExercise = filtered[idx];
    if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = currentSelectedExercise.name; }
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
    // blur after programmatic change so buttons stay independent on iOS
    setTempoThrottled(randomTempo, { blur: true });
  }

  function navigateExercise(step) {
    displayedExercises = filterExercisesForMode();
    if (displayedExercises.length === 0) return;

    const len = displayedExercises.length;
    currentExerciseIndex = (currentExerciseIndex + step + len) % len;
    currentSelectedExercise = displayedExercises[currentExerciseIndex];

    if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = currentSelectedExercise.name; }

    initializeExercise(currentSelectedExercise);
    if (audio) { audio.pause(); resetProgressBarInstant(); if (playPauseBtn) playPauseBtn.textContent = 'Play'; }

    if (isPlayingPlaylist && currentPlaylist) {
      syncPlaylistIndexToExercise(currentSelectedExercise.id);
      updatePlaylistQueueDisplay?.();
      updatePlaylistProgressBar?.();
      playCurrentPlaylistItem?.();
    }
  }

  function populateExerciseList(filter = '') {
    if (!exerciseList) return;

    const searchResults = filterExercisesForMode()
      .filter(ex => ex.name.toLowerCase().includes(filter.toLowerCase()));

    exerciseList.innerHTML = '';
    searchResults.forEach((exercise) => {
      const li = document.createElement('li');
      li.textContent = exercise.name;
      li.dataset.id  = exercise.id;
      if (exercise === currentSelectedExercise) li.classList.add('active-option');
      li.addEventListener('click', () => {
        currentSelectedExercise = exercise;
        displayedExercises      = filterExercisesForMode();
        currentExerciseIndex    = displayedExercises.findIndex(ex => ex.id === exercise.id);
        initializeExercise(exercise);
        if (exerciseSearchInput) exerciseSearchInput.value = '';
        exerciseList.style.display = 'none';

        if (isPlayingPlaylist && currentPlaylist) {
          syncPlaylistIndexToExercise(exercise.id);
          updatePlaylistQueueDisplay();
          updatePlaylistProgressBar();
          playCurrentPlaylistItem();
        }
      });
      exerciseList.appendChild(li);
    });

    const focused = (document.activeElement === exerciseSearchInput);
    exerciseList.style.display = (searchResults.length && focused) ? 'block' : 'none';
  }

  function initializeCategoryList() {
    if (categorySearchInput) categorySearchInput.placeholder = "All Categories";
  }

  function populateCategoryList(filter = '') {
    if (!categoryList) return;
    categoryList.innerHTML = '';
    const filteredCats = displayedCategories.filter(cat => cat.toLowerCase().includes(filter.toLowerCase()));
    filteredCats.forEach(cat => {
      const li = document.createElement('li');
      const displayName = categoryDisplayMap[cat] || cat;
      li.textContent = displayName;
      if (categorySearchInput && li.textContent === categorySearchInput.placeholder) li.classList.add('active-option');
      li.addEventListener('click', () => {
        if (categorySearchInput) { categorySearchInput.value = ''; categorySearchInput.placeholder = displayName; }
        categoryList.style.display = 'none';
        if (isPlayingPlaylist) stopPlaylist();

        currentExerciseIndex = 0;
        const filtered = filterExercisesForMode();
        if (filtered.length > 0) {
          currentSelectedExercise = filtered[currentExerciseIndex];
          initializeExercise(currentSelectedExercise);
          if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = currentSelectedExercise.name; }
          if (audio) { audio.pause(); resetProgressBarInstant(); }
          if (playPauseBtn) playPauseBtn.textContent = 'Play';
        } else {
          currentSelectedExercise = null;
          if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = "Search Exercises..."; }
        }
        populateExerciseList();
      });
      categoryList.appendChild(li);
    });
    categoryList.style.display = (filteredCats.length > 0 && document.activeElement === categorySearchInput) ? 'block' : 'none';
  }

  function initializePlaylistList() {
    if (playlistSearchInput) playlistSearchInput.placeholder = "Select a Playlist";
  }

  function populatePlaylistList(filter = '') {
    if (!playlistList) return;
    playlistList.innerHTML = '';
    const filteredPlaylists = displayedPlaylists.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));
    filteredPlaylists.forEach(pl => {
      const li = document.createElement('li');
      li.textContent   = pl.name;
      li.dataset.index = pl.index;
      if (currentPlaylist && currentPlaylist.name === pl.name) li.classList.add('active-option');
      li.addEventListener('click', () => {
        if (playlistSearchInput) { playlistSearchInput.value = ''; playlistSearchInput.placeholder = li.textContent; }
        playlistList.style.display = 'none';
        if (isPlayingPlaylist) stopPlaylist();
        startPlaylist(pl.index);
      });
      playlistList.appendChild(li);
    });
    playlistList.style.display = (filteredPlaylists.length > 0 && document.activeElement === playlistSearchInput) ? 'block' : 'none';
  }

  function populatePlaylistQueueList(filter = '') {
    if (!playlistQueueList) return;
    playlistQueueList.innerHTML = '';
    if (!isPlayingPlaylist || !currentPlaylist || playlistQueueMap.length === 0) {
      playlistQueueList.style.display = 'none';
      return;
    }
    const filteredQueue = playlistQueueMap
      .map((pos) => {
        const pItem = currentPlaylist.items[pos.playlistItemIndex];
        const ex    = exercises.find(exx => exx.id === pItem.exerciseId);
        if (!ex) return null;
        const tempoVal = pItem.tempos[pos.tempoIndex];
        return { text: `${ex.name} at ${tempoVal} BPM`, pos };
      })
      .filter(x => x && x.text.toLowerCase().includes(filter.toLowerCase()));

    filteredQueue.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item.text;
      if (item.pos.playlistItemIndex === currentPlaylistItemIndex &&
          item.pos.tempoIndex        === currentTempoIndex &&
          item.pos.repetition        === currentRepetition) {
        li.classList.add('active-option');
      }
      li.addEventListener('click', () => {
        currentPlaylistItemIndex = item.pos.playlistItemIndex;
        currentTempoIndex        = item.pos.tempoIndex;
        currentRepetition        = item.pos.repetition;
        if (playlistQueueSearchInput) { playlistQueueSearchInput.value = ''; playlistQueueSearchInput.placeholder = 'Playlist Queue'; }
        playlistQueueList.style.display = 'none';
        updatePlaylistQueueDisplay();
        updatePlaylistProgressBar();
        playCurrentPlaylistItem();
      });
      playlistQueueList.appendChild(li);
    });
    playlistQueueList.style.display = (filteredQueue.length > 0 && document.activeElement === playlistQueueSearchInput) ? 'block' : 'none';
  }

  function startPlaylist(playlistId) {
    currentPlaylist = playlists[playlistId];
    currentPlaylistItemIndex = 0;
    currentTempoIndex = 0;
    currentRepetition = 0;
    isPlayingPlaylist = true;

    document.body.classList.add('playlist-mode');
    if (categorySearchInput) categorySearchInput.placeholder = "All Categories";

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

    if (exerciseList) exerciseList.style.display = 'none';

    displayedExercises = filterExercisesForMode();
    if (displayedExercises.length > 0) {
      currentExerciseIndex    = 0;
      currentSelectedExercise = displayedExercises[0];
    }
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

    if (exerciseSearchInput) { exerciseSearchInput.value = ''; exerciseSearchInput.placeholder = exercise.name; }
    initializeExercise(exercise);

    const tempo = item.tempos[currentTempoIndex];
    setTempoSilently(tempo); // playlist already disables the slider

    if (playlistQueueSearchInput) {
      playlistQueueSearchInput.placeholder = exercise.name + " at " + tempo + " BPM";
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
    displayedExercises = filterExercisesForMode();
    populateExerciseList();

    if (playPauseBtn) playPauseBtn.classList.remove('playlist-mode');

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

    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = currentSelectedExercise ? currentSelectedExercise.name : "Search Exercises...";
    }

    document.body.classList.remove('playlist-mode');
    if (playlistQueueSearchInput) {
      playlistQueueSearchInput.placeholder = 'Playlist Queue';
      playlistQueueSearchInput.disabled = true;
      playlistQueueSearchInput.setAttribute('disabled','');
    }

    if (exerciseList) exerciseList.style.display = 'none';

    applyLoopMode();
  }

  function resetPlaylistControls() {
    if (stopPlaylistBtn)            stopPlaylistBtn.disabled = true;
    if (playlistQueueSearchInput)   playlistQueueSearchInput.disabled = true;
    if (prevPlaylistItemBtn)        prevPlaylistItemBtn.disabled = true;
    if (nextPlaylistItemBtn)        nextPlaylistItemBtn.disabled = true;
    if (playPauseBtn)               playPauseBtn.textContent = 'Play';
    if (playlistSearchInput)        playlistSearchInput.placeholder = 'Select a Playlist';
    if (playlistQueueSearchInput)   playlistQueueSearchInput.placeholder = 'Playlist Queue';
    if (playlistProgressContainer)  playlistProgressContainer.style.display = 'none';
    updatePlaylistQueueDisplay();
    updatePlaylistProgressBar();
  }

  function updatePlaylistQueueDisplay() {
    if (!playlistQueueList) return;
    playlistQueueList.innerHTML = '';
    playlistQueueMap = [];

    if (!isPlayingPlaylist || !currentPlaylist) {
      playlistQueueList.style.display = 'none';
      return;
    }

    currentPlaylist.items.forEach((item, i) => {
      item.tempos.forEach((t, ti) => {
        for (let r = 0; r < item.repetitionsPerTempo; r++) {
          playlistQueueMap.push({ playlistItemIndex: i, tempoIndex: ti, repetition: r });
        }
      });
    });
    populatePlaylistQueueList();
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
});
