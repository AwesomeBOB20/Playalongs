document.addEventListener('DOMContentLoaded', function () {
  // --- Data from data.js ---
  const exercises  = Array.isArray(window.EXERCISES)  ? window.EXERCISES  : [];
  const playlists  = Array.isArray(window.PLAYLISTS)  ? window.PLAYLISTS  : [];

  // --- DOM ---
  const audio                      = document.getElementById('audio');
  const totalTimeDisplay           = document.getElementById('totalTime');
  const currentTimeDisplay         = document.getElementById('currentTime');
  const playPauseBtn               = document.getElementById('playPauseBtn');
  let   tempoSlider                = document.getElementById('tempoSlider'); // <-- let so we can replace it
  const tempoLabel                 = document.getElementById('tempoLabel');
  const sheetMusicImg              = document.querySelector('.sheet-music img');

  // Progress bar elements
  const progressContainer          = document.querySelector('.progress-container .bar');
  const progress                   = document.getElementById('progress'); // should be .bar__fill

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

  // --- UA detection (tight, iOS Safari only) ---
  const UA = navigator.userAgent || "";
  const IS_IOS =
    /iPad|iPhone|iPod/.test(UA) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(UA);
  const NEEDS_IOS_HACK = IS_IOS && IS_SAFARI;

  // --- State ---
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

  // tempo/randomize guards
  let currentOriginalTempo = null;
  let userIsAdjustingTempo = false;
  let suppressTempoInput   = false;
  let inEndedCycle         = false;

  // categories
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

  // audio defaults
  if (audio) {
    audio.loop = false; // controlled by applyLoopMode()
    if ('preservesPitch' in audio)       audio.preservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
    if ('mozPreservesPitch' in audio)    audio.mozPreservesPitch = true;
  }
  function applyLoopMode() {
    if (!audio) return;
    audio.loop = !isPlayingPlaylist && !isRandomizeEnabled;
  }

  // --- Reset inputs on refresh / bfcache (iOS back) ---
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

  // --- Initialize ---
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

  // --- Randomize toggle/count ---
  if (autoRandomizeToggle) {
    autoRandomizeToggle.addEventListener('change', function () {
      isRandomizeEnabled = this.checked;
      currentRepCount = 0;
      applyLoopMode();
    });
  }
  if (repsPerTempoInput) {
    repsPerTempoInput.addEventListener('input', function () {
      const val = parseInt(this.value, 10);
      repsBeforeChange = (!isNaN(val) && val > 0) ? val : 1;
    });
  }

  // --- Buttons ---
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

  // --- Ended behavior (guard re-entry) ---
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
            pickRandomTempo(); // set before play for smoother reset
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
        setTimeout(() => { inEndedCycle = false; }, 0);
      }
    });

    audio.addEventListener('loadedmetadata', updateTotalTime);
    audio.addEventListener('ratechange',     updateTotalTime);
    audio.addEventListener('ratechange',     updateCurrentTime);
    audio.addEventListener('pause',          stopProgressTicker);
    audio.addEventListener('play',           startProgressTicker);
    audio.addEventListener('seeking',        startProgressTicker);
  }

  // ===================== iOS slider bug workaround =====================

  // Clone+replace the slider to purge Safari's hidden capture/focus state.
  function recreateTempoSlider() {
    if (!NEEDS_IOS_HACK || !tempoSlider) return;

    const old = tempoSlider;
    const parent = old.parentNode;
    if (!parent) return;

    // Snapshot state
    const value    = old.value;
    const min      = old.min;
    const max      = old.max;
    const step     = old.step;
    const disabled = old.disabled;
    const id       = old.id;
    const className= old.className;

    // Create fresh node (no children/handlers)
    const fresh = old.cloneNode(false);
    fresh.id = id;
    fresh.className = className;
    if (min)  fresh.min  = min;
    if (max)  fresh.max  = max;
    if (step) fresh.step = step;
    fresh.value    = value;
    fresh.disabled = disabled;
    fresh.style.touchAction = 'none'; // reduce iOS gesture interference

    // Replace in DOM
    parent.replaceChild(fresh, old);

    // Point our variable to the new element and rewire handlers
    tempoSlider = fresh;
    wireTempoSliderHandlers();         // reattach events
    updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
  }

  function wireTempoSliderHandlers() {
    if (!tempoSlider) return;

    // Ensure slider is usable everywhere
    tempoSlider.style.touchAction = 'none';

    // Clean previous listeners by recreating element (we already do),
    // so we only attach the current set:

    // Track drag state
    tempoSlider.addEventListener('pointerdown', () => { userIsAdjustingTempo = true; }, { passive: true });
    tempoSlider.addEventListener('touchstart',  () => { userIsAdjustingTempo = true; }, { passive: true });
    tempoSlider.addEventListener('mousedown',   () => { userIsAdjustingTempo = true; });

    const endDrag = () => {
      userIsAdjustingTempo = false;
      // On iOS Safari, fully reset the slider to drop implicit capture
      if (NEEDS_IOS_HACK) setTimeout(recreateTempoSlider, 0);
    };

    ['pointerup','pointercancel','touchend','touchcancel','mouseup']
      .forEach(evt => window.addEventListener(evt, endDrag, { passive: true }));

    // If you tap anything else, reset slider first (capture = run before targets)
    if (NEEDS_IOS_HACK) {
      document.addEventListener('pointerdown', (e) => {
        if (e.target !== tempoSlider) recreateTempoSlider();
      }, { capture: true, passive: true });
      document.addEventListener('click', (e) => {
        if (e.target !== tempoSlider) recreateTempoSlider();
      }, { capture: true });
    }

    // Normal slider behavior
    tempoSlider.addEventListener('input', function () {
      if (suppressTempoInput) return;
      updatePlaybackRate();
      updateSliderBackground(this, '#96318d', '#ffffff');
    });
  }

  // Wire once on load
  wireTempoSliderHandlers();

  // ===================== Progress bar drag (iOS-friendly) =====================
  if (progressContainer) {
    progressContainer.addEventListener('mousedown', startDragging);
    progressContainer.addEventListener('touchstart', (e) => { e.preventDefault(); startDragging(e); }, { passive: false });
  }
  document.addEventListener('mousemove', dragProgress);
  document.addEventListener('touchmove', (e) => { if (isDragging) { e.preventDefault(); dragProgress(e); } }, { passive: false });
  document.addEventListener('mouseup',   stopDragging);
  document.addEventListener('touchend',  stopDragging, { passive: true });

  // --- Exercise nav buttons ---
  prevExerciseBtn?.addEventListener('click', () => { quietRandomize(); navigateExercise(-1); });
  nextExerciseBtn?.addEventListener('click', () => { quietRandomize(); navigateExercise(1);  });

  // --- Playlist buttons ---
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

  // --- Close dropdowns on outside click ---
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.exercise-container')       && exerciseList)        exerciseList.style.display = 'none';
    if (!e.target.closest('.category-container')       && categoryList)        categoryList.style.display = 'none';
    if (!e.target.closest('.playlist-container')       && playlistList)        playlistList.style.display = 'none';
    if (!e.target.closest('.playlist-queue-container') && playlistQueueList)   playlistQueueList.style.display = 'none';
  });

  // --- Open/populate dropdowns ---
  exerciseSearchInput?.addEventListener('focus', () => populateExerciseList(exerciseSearchInput.value));
  exerciseSearchInput?.addEventListener('input', () => populateExerciseList(exerciseSearchInput.value));
  categorySearchInput?.addEventListener('focus', () => populateCategoryList(categorySearchInput.value));
  categorySearchInput?.addEventListener('input', () => populateCategoryList(categorySearchInput.value));
  playlistSearchInput?.addEventListener('focus', () => populatePlaylistList(playlistSearchInput.value));
  playlistSearchInput?.addEventListener('input', () => populatePlaylistList(playlistSearchInput.value));
  playlistQueueSearchInput?.addEventListener('focus', () => populatePlaylistQueueList(playlistQueueSearchInput.value));
  playlistQueueSearchInput?.addEventListener('input', () => populatePlaylistQueueList(playlistQueueSearchInput.value));

  // ===================== Helpers =====================

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

  function setTempoSilently(bpm) {
    if (!tempoSlider) return;
    suppressTempoInput = true;
    tempoSlider.value = String(bpm);
    updatePlaybackRate();
    updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    requestAnimationFrame(() => { suppressTempoInput = false; });
  }

  // --- Progress ticker (iOS-smooth) ---
  let progressRafId = null;
  if (progress) {
    progress.style.transformOrigin = 'left center';
    progress.style.transform = 'scaleX(0)';
  }
  function resetProgressBarInstant() {
    if (!progress) return;
    progress.style.transform = 'scaleX(0)';
    void progress.offsetWidth; // force repaint on Safari
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

  function startDragging(e) { isDragging = true; updateProgress(e); }
  function dragProgress(e)  { if (isDragging) updateProgress(e); }
  function stopDragging()   { isDragging = false; }

  function updateProgress(e) {
    if (!audio || !progressContainer || !progress) return;
    const rect = progressContainer.getBoundingClientRect();
    let clientX = e.touches?.[0]?.clientX ?? e.clientX ?? 0;
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
    setTempoSilently(randomTempo);
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

  // Only show exercise list when the search input is focused
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

    if (exerciseList) exerciseList.style.display = 'none'; // ensure closed

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
    setTempoSilently(tempo);

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

    if (exerciseList) exerciseList.style.display = 'none'; // keep closed
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
