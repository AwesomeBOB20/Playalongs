document.addEventListener('DOMContentLoaded', function () {
  // ===== Data =====
  const exercises  = Array.isArray(window.EXERCISES)  ? window.EXERCISES  : [];
  const playlists  = Array.isArray(window.PLAYLISTS)  ? window.PLAYLISTS  : [];

// DOM
  const audio               = document.getElementById('audio');
  const totalTimeDisplay    = document.getElementById('totalTime');
  const currentTimeDisplay  = document.getElementById('currentTime');
  const playPauseBtn        = document.getElementById('playPauseBtn');
  const tempoSlider         = document.getElementById('tempoSlider');
  const tempoLabel          = document.getElementById('tempoLabel');
  const sheetMusicImg       = document.querySelector('.sheet-music img');

  // Progress bar (track)
  const progressContainer   = document.querySelector('.progress-container .bar');
  let   progress            = document.getElementById('progress') || document.querySelector('.bar__fill');

  // Transport / randomize / limits
  const randomExerciseBtn   = document.getElementById('randomExerciseBtn');
  const randomTempoBtn      = document.getElementById('randomTempoBtn');
  const minTempoInput       = document.getElementById('minTempo');
  const maxTempoInput       = document.getElementById('maxTempo');
  const autoRandomizeToggle = document.getElementById('autoRandomizeToggle');
  const repsPerTempoInput   = document.getElementById('repsPerTempo');

  // Tempo Step (Dial)
  const bumpTempoBtn        = document.getElementById('bumpTempoBtn');
  const autoTempoStepToggle = document.getElementById('autoTempoStepToggle');
  const dialRepsInput       = document.getElementById('dialReps');
  const dialStepInput       = document.getElementById('dialStep');
  const tempoStepContainer  = document.getElementById('tempoStepContainer');

  // Playlist buttons and progress
  const stopPlaylistBtn            = document.getElementById('stopPlaylistBtn');
  const prevPlaylistItemBtn        = document.getElementById('prevPlaylistItemBtn');
  const nextPlaylistItemBtn        = document.getElementById('nextPlaylistItemBtn');
  const playlistProgressContainer  = document.querySelector('.playlist-progress-container');
  const playlistProgress           = document.getElementById('playlistProgress');
  const playlistProgressPercentage = document.getElementById('playlistProgressPercentage');

  // Overlay root (text container centered over playlist bar)
  const playlistTimeOverlay = document.querySelector('.playlist-time-overlay');

  // Top selectors
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

  const isFxAndroid = /Android/i.test(navigator.userAgent) && /Firefox/i.test(navigator.userAgent);

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
  let isDragging               = false; // progress bar drag
  let isPlayingPlaylist        = false;
  let currentPlaylist          = null;
  let currentPlaylistItemIndex = 0;
  let currentTempoIndex        = 0;
  let currentRepetition        = 0;
  let playlistQueueMap         = [];    // flattened queue

  let isRandomizeEnabled = false;
  let repsBeforeChange   = 1;
  let currentRepCount    = 0;

  // Tempo Step (Dial) state
  let tempoStepEnabled    = false; // mirrors autoTempoStepToggle
  let tempoStepReps       = 1;     // >= 1
  let tempoStepStep       = 0;     // can be negative
  let tempoStepRepCounter = 0;     // counts track finishes since last reset

  let displayedExercises      = [];
  let currentExerciseIndex    = 0;
  let currentSelectedExercise = null;

  let currentOriginalTempo    = null;
  let userIsAdjustingTempo    = false;
  let suppressTempoInput      = false;
  let lastTempoChangeAt       = 0;
  let prevTempo               = null;

  // NEW: overlay display mode (default to time)
  let playlistOverlayMode = 'time'; // 'time' | 'percent'

  // NEW: exercise lookups and duration cache (seconds @ 1x per exercise)
  const exById = new Map(exercises.map(e => [e.id, e]));
  const durationCache = new Map();

  // Category set & display names
  let displayedCategories = [
    "all","one-handers","accent-tap","rhythms","rudiments","timing",
    "paradiddles","singles","rolls","natural-decays","flams","hybrids",
    "78-grids","juxtapositions","exercises","etudes","requests"
  ];
  const categoryDisplayMap = {
    "accent-tap":"Accent Tap","rhythms":"Rhythms","rudiments":"Rudiments","requests":"Requests",
    "one-handers":"One Handers","timing":"Timing","paradiddles":"Paradiddles","singles":"Singles",
    "rolls":"Rolls","natural-decays":"Natural Decays","flams":"Flams","hybrids":"Hybrids",
    "78-grids":"7/8 Grids","juxtapositions":"Juxtapositions","exercises":"Exercises","etudes":"Etudes","all":"All Categories"
  };

  const displayedPlaylists = playlists.map((p, i) => ({ index: i, name: p.name }));

  // ===== Audio defaults =====
  if (audio) {
    audio.loop = false;
    if ('preservesPitch' in audio)       audio.preservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
    if ('mozPreservesPitch' in audio)    audio.mozPreservesPitch = true;
  }

  // ===== FAST PRESS helper (fires on pointerdown, suppress following click) =====
  function addFastPress(el, handler) {
    if (!el) return;
    let suppressClickUntil = 0;

    el.addEventListener('pointerdown', (e) => {
      // only primary pointer
      if (e.button != null && e.button !== 0) return;
      suppressClickUntil = performance.now() + 350;
      handler(e);
    }, { passive: true });

    el.addEventListener('click', (e) => {
      if (performance.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      handler(e);
    });
  }

  // ===== Utility: groups & resets =====
  function getOriginalRandomContainer() {
    const all = Array.from(document.querySelectorAll('.random-container'));
    if (!all.length) return null;
    if (!tempoStepContainer) return all[0];
    const found = all.find(el => el !== tempoStepContainer);
    return found || all[0];
  }

  function lockRandomGroup(locked) {
    const rc = getOriginalRandomContainer();
    const al = rc?.querySelector('.auto-label');
    if (locked) {
      if (randomTempoBtn)        randomTempoBtn.disabled = true;
      if (autoRandomizeToggle)   autoRandomizeToggle.disabled = true;
      if (repsPerTempoInput)     repsPerTempoInput.disabled = true;
      if (minTempoInput)         minTempoInput.disabled = true;
      if (maxTempoInput)         maxTempoInput.disabled = true;
      rc?.classList.add('disabled'); al?.classList.add('disabled');
    } else if (!isPlayingPlaylist) {
      if (randomTempoBtn)        randomTempoBtn.disabled = false;
      if (autoRandomizeToggle)   autoRandomizeToggle.disabled = false;
      if (repsPerTempoInput)     repsPerTempoInput.disabled = false;
      if (minTempoInput)         minTempoInput.disabled = false;
      if (maxTempoInput)         maxTempoInput.disabled = false;
      rc?.classList.remove('disabled'); al?.classList.remove('disabled');
    }
  }

  function lockTempoStepGroup(locked) {
    if (!tempoStepContainer) return;
    const al = tempoStepContainer.querySelector('.auto-label');
    if (locked) {
      if (bumpTempoBtn)          bumpTempoBtn.disabled = true;
      if (autoTempoStepToggle)   autoTempoStepToggle.disabled = true;
      if (dialRepsInput)         dialRepsInput.disabled = true;
      if (dialStepInput)         dialStepInput.disabled = true;
      tempoStepContainer.classList.add('disabled'); al?.classList.add('disabled');
    } else if (!isPlayingPlaylist) {
      if (bumpTempoBtn)          bumpTempoBtn.disabled = false;
      if (autoTempoStepToggle)   autoTempoStepToggle.disabled = false;
      if (dialRepsInput)         dialRepsInput.disabled = false; // editable outside playlist
      if (dialStepInput)         dialStepInput.disabled = false; // editable outside playlist
      tempoStepContainer.classList.remove('disabled'); al?.classList.remove('disabled');
    }
  }

  function resetTempoStepCounter() { tempoStepRepCounter = 0; }

  function resetRandomizeInternals() {
    isRandomizeEnabled = false;
    repsBeforeChange   = 1;
    currentRepCount    = 0;
  }

  function resetTempoStepInternals() {
    tempoStepEnabled    = false;
    tempoStepReps       = 1;
    tempoStepStep       = 0;
    tempoStepRepCounter = 0;
  }

  function applyLoopMode() {
    if (!audio) return;
    audio.loop = !isPlayingPlaylist && !isRandomizeEnabled && !tempoStepEnabled;
  }

  // ===== Total time accuracy: update on metadata & rate changes =====
  function refreshTimeDisplays() {
    updateTotalTime();
    updateCurrentTime();
  }
  if (audio) {
    audio.addEventListener('loadedmetadata', refreshTimeDisplays);
    audio.addEventListener('durationchange', refreshTimeDisplays);
    audio.addEventListener('ratechange',     refreshTimeDisplays);
    audio.addEventListener('loadeddata',     refreshTimeDisplays);
    audio.addEventListener('canplay',        refreshTimeDisplays);
  }

  // ===== First-load reset =====
  function resetPracticeControls() {
    if (autoRandomizeToggle) autoRandomizeToggle.checked = false;
    if (repsPerTempoInput)   repsPerTempoInput.value = '';
    if (minTempoInput)       minTempoInput.value = '';
    if (maxTempoInput)       maxTempoInput.value = '';
    resetRandomizeInternals();

    if (autoTempoStepToggle) autoTempoStepToggle.checked = false;
    if (dialRepsInput) { dialRepsInput.value = ''; dialRepsInput.disabled = false; } // keep enabled on load
    if (dialStepInput) { dialStepInput.value = ''; dialStepInput.disabled = false; } // keep enabled on load
    if (bumpTempoBtn)  { bumpTempoBtn.disabled = false; }
    resetTempoStepInternals();

    applyLoopMode();
  }
  resetPracticeControls();
  window.addEventListener('pageshow', (e) => { if (e.persisted) resetPracticeControls(); });

  // Make buttons "real buttons" and stop event leaks
  [
    'playPauseBtn','randomExerciseBtn','randomTempoBtn',
    'prevExerciseBtn','nextExerciseBtn',
    'prevPlaylistItemBtn','nextPlaylistItemBtn','stopPlaylistBtn',
    'bumpTempoBtn'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.type = 'button'; } catch {}
    el.style.touchAction = 'manipulation';
    const stop = (e) => e.stopPropagation();
    el.addEventListener('pointerdown', stop, { passive: true });
    el.addEventListener('click', stop);
  });

  // never let readOnly selector inputs keep a caret/focus
  [categorySearchInput, exerciseSearchInput, playlistSearchInput, playlistQueueSearchInput].forEach(inp=>{
    if(!inp) return;
    try { inp.readOnly = true; } catch {}
    inp.setAttribute('inputmode','none');
    inp.addEventListener('focus', () => { if (inp.readOnly) inp.blur(); }, true);
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

      // Mutual exclusivity: turning Randomize Auto ON turns off Tempo Step Auto
      if (isRandomizeEnabled) {
        if (autoTempoStepToggle) autoTempoStepToggle.checked = false;
        tempoStepEnabled = false;
        // DO NOT disable/darken the tempo step controls here.
      }

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

  // ===== Tempo Step (Dial) wiring =====
  if (autoTempoStepToggle) {
    autoTempoStepToggle.addEventListener('change', function () {
      tempoStepEnabled = this.checked;
      resetTempoStepCounter();

      // Do not disable or darken randomize controls outside playlist.
      if (tempoStepEnabled) {
        // Just turn off Randomize Auto internally.
        if (autoRandomizeToggle) autoRandomizeToggle.checked = false;
        isRandomizeEnabled = false;
      }

      applyLoopMode();
    });
  }

  if (dialRepsInput) {
    dialRepsInput.addEventListener('input', () => {
      const v = parseInt(dialRepsInput.value, 10);
      tempoStepReps = (!isNaN(v) && v > 0) ? v : 1;
    });
  }
  if (dialStepInput) {
    // allow one leading "-" and digits; clamp to [-999, 999]
    dialStepInput.addEventListener('input', () => {
      let s = dialStepInput.value || '';
      s = s.replace(/[^\d-]/g, '');        // strip non-digits/non-minus
      s = s.replace(/(?!^)-/g, '');        // only one minus, and only at start
      if (s === '-' || s === '') {         // user mid-typing
        tempoStepStep = 0;
        dialStepInput.setCustomValidity('');
        return;
      }
      let v = parseInt(s, 10);
      if (isNaN(v)) v = 0;
      if (v > 999) v = 999;
      if (v < -999) v = -999;
      dialStepInput.value = String(v);
      tempoStepStep = v;
      dialStepInput.setCustomValidity('');
    });

    // keep "-" only at position 0 during typing
    dialStepInput.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertText' && e.data === '-') {
        const pos = dialStepInput.selectionStart ?? 0;
        if (pos !== 0) e.preventDefault();
      }
    });
  }

  // ===== Buttons =====
  randomExerciseBtn?.addEventListener('click', function () {
    quietRandomize();
    if (isPlayingPlaylist) stopPlaylist();
    pickRandomExercise();
  });

  // >>> FAST, IMMEDIATE: Randomize Tempo (user press)
  addFastPress(randomTempoBtn, function () {
    if (isPlayingPlaylist) return;
    const wasPlaying = audio && !audio.paused;
    quietRandomize();
    pickRandomTempo(true);        // immediate, skip throttle on manual press
    resetTempoStepCounter();
    if (wasPlaying) startProgressTicker();
  });

  // >>> FAST, IMMEDIATE: Bump Tempo (user press)
  addFastPress(bumpTempoBtn, function () {
    if (isPlayingPlaylist) return;
    if (!tempoSlider) return;
    const cur  = parseInt(tempoSlider.value, 10);
    const min  = parseInt(tempoSlider.min, 10);
    const max  = parseInt(tempoSlider.max, 10);
    const step = (typeof tempoStepStep === 'number') ? tempoStepStep : 0;
    const next = Math.max(min, Math.min(max, cur + step));
    setTempoSilently(next, { blur:true });  // immediate
    resetTempoStepCounter();
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
          console.error('Error playing audio:', error, {
            src: audio.currentSrc || audio.src,
            readyState: audio.readyState
          });
          alert('Audio is not ready yet. Please wait a moment.');
        });
      } else {
        quietRandomize();
        audio.pause();
        this.textContent = 'Play';
      }
    });
  }

  // ===== Audio ended (single exercise / auto modes) =====
  let autoStepLock = false;
  let playbackCycleId = 0;
  const onEnded = async () => {
    stopProgressTicker();
    if (isPlayingPlaylist) return;
    if (autoStepLock) return;
    autoStepLock = true;
    const cycleId = ++playbackCycleId;

    try {
      // Randomize Auto path
      if (isRandomizeEnabled && currentSelectedExercise) {
        currentRepCount++;
        if (currentRepCount >= repsBeforeChange) {
          currentRepCount = 0;
          pickRandomTempo();  // auto path stays throttled
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

      // Tempo Step Auto path (mutually exclusive)
      if (tempoStepEnabled && currentSelectedExercise) {
        tempoStepRepCounter++;
        if (tempoStepReps <= 0) tempoStepReps = 1;
        if (tempoStepRepCounter % tempoStepReps === 0) {
          const cur = parseInt(tempoSlider.value, 10);
          const min = parseInt(tempoSlider.min, 10);
          const max = parseInt(tempoSlider.max, 10);
          const step = (typeof tempoStepStep === 'number') ? tempoStepStep : 0;
          const next = Math.max(min, Math.min(max, cur + step));
          setTempoThrottled(next, { blur:true });
          tempoStepRepCounter = 0;
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

      // No auto modes
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
      resetTempoStepCounter();
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
      resetTempoStepCounter();
      updatePlaybackRate();
      updateSliderBackground(this, '#96318d', '#ffffff');
    });

    tempoSlider.addEventListener('change', defocusSlider);
  }

  // ===== Progress bar (track) =====
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

  // ======= Playlist cumulative time helpers =======
  function computePlaylistTimes() {
    // Returns { elapsed, total } in seconds, tempo-adjusted across the entire queue.
    if (!isPlayingPlaylist || !currentPlaylist || playlistQueueMap.length === 0) {
      const rate = audio?.playbackRate || 1;
      const elapsed = (audio?.currentTime || 0) / rate;
      const total   = (isFinite(audio?.duration) && audio.duration > 0) ? (audio.duration / rate) : 0;
      return { elapsed, total };
    }

    const curIdx = Math.max(0, getCurrentPlaylistQueueIndex());
    let total = 0;
    let elapsed = 0;

    for (let i = 0; i < playlistQueueMap.length; i++) {
      const pos = playlistQueueMap[i];
      const pItem = currentPlaylist.items[pos.playlistItemIndex];
      const ex = exById.get(pItem.exerciseId);
      if (!ex) continue;

      const dur1x = durationCache.get(ex.id);
      const tempo = pItem.tempos[pos.tempoIndex];
      if (!dur1x || !tempo || !ex.originalTempo) continue;

      const rate = tempo / ex.originalTempo;
      const playSeconds = dur1x / (rate || 1);

      total += playSeconds;
      if (i < curIdx) elapsed += playSeconds;
    }

    // Add partial progress of current item (at its current playbackRate)
    const rateNow = audio?.playbackRate || 1;
    const curElapsed = (audio?.currentTime || 0) / rateNow;
    if (isFinite(curElapsed)) elapsed += curElapsed;

    return { elapsed, total };
  }

  function fmtMMSS(s) {
    const m = Math.floor((s || 0) / 60);
    const sec = Math.max(0, Math.floor((s || 0) % 60)).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  // Render playlist overlay text (time or percent)
  function renderPlaylistOverlay() {
    if (!playlistProgressPercentage) return;

    if (playlistOverlayMode === 'percent') {
      if (!isPlayingPlaylist || !currentPlaylist || playlistQueueMap.length === 0) {
        playlistProgressPercentage.textContent = '0%';
        return;
      }
      const idx = getCurrentPlaylistQueueIndex();
      const total = playlistQueueMap.length;
      const pct = (idx >= 0 && total > 0) ? ((idx + 1) / total) * 100 : 0;
      playlistProgressPercentage.textContent = Math.floor(pct) + '%';
      return;
    }

    // TIME mode (cumulative across playlist, tempo-adjusted)
    const { elapsed, total } = computePlaylistTimes();
    playlistProgressPercentage.textContent = `${fmtMMSS(elapsed)} / ${fmtMMSS(total)}`;
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

      // Keep playlist overlay fresh (esp. for cumulative time)
      renderPlaylistOverlay();

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

    // Force "Preserve Pitch" to avoid the deep/low demon sound
    if ('preservesPitch' in audio)       audio.preservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
    if ('mozPreservesPitch' in audio)    audio.mozPreservesPitch = true;

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

  // Resolve media/image URLs robustly across local, GitHub Pages, and Webflow.
  function resolveAssetUrl(p) {
    if (!p) return p;

    // Upgrade to https if page is https (avoid mixed content)
    if (location.protocol === 'https:' && /^http:\/\//i.test(p)) {
      p = p.replace(/^http:\/\//i, 'https://');
    }

    // Already absolute (https or data URL)? Use as-is.
    if (/^(https?:)?\/\//i.test(p) || /^data:/i.test(p)) return p;

    // Root-absolute like "/audio/foo.mp3" -> this breaks on GitHub project sites.
    if (p.startsWith('/')) {
      const parts = location.pathname.split('/').filter(Boolean);
      // On username.github.io/repo/... prefix the repo name: "/repo"
      if (/github\.io$/i.test(location.hostname) && parts.length >= 1) {
        return '/' + parts[0] + p; // "/repo" + "/audio/foo.mp3"
      }
      // Otherwise leave it root-absolute (works for custom domains/Webflow roots)
      return p;
    }

    // Relative -> resolve against current page
    try {
      return new URL(p, document.baseURI).href;
    } catch {
      return p;
    }
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
    const id = getSelectorId(categorySearchInput);
    if (id) return id;
    const ph = categorySearchInput?.placeholder ?? 'All Categories';
    if (ph === '' || ph === 'All Categories') return 'all';
    const entry = Object.entries(categoryDisplayMap).find(([key, val]) => val.toLowerCase() === ph.toLowerCase());
    return entry ? entry[0] : 'all';
  }

  function initializeExercise(ex) {
    if (!audio || !tempoSlider || !tempoLabel || !sheetMusicImg) return;

    // --- FIX 2: Prevent redundant audio reloading ---
    const newSrc = resolveAssetUrl(ex.audioSrc);
    // Create a temporary anchor to resolve the absolute URL for comparison
    const tempAnchor = document.createElement('a');
    tempAnchor.href = newSrc;
    
    // Only reload if the source is actually different
    if (audio.src !== tempAnchor.href) {
      audio.src = newSrc;
      audio.preload = 'auto';
      audio.load();

      const onceUpdate = () => refreshTimeDisplays();
      audio.addEventListener('loadedmetadata', onceUpdate, { once: true });
      audio.addEventListener('canplay',        onceUpdate, { once: true });
      
      const cacheDurationOnce = () => {
        if (isFinite(audio.duration) && audio.duration > 0) {
          durationCache.set(ex.id, audio.duration);
          renderPlaylistOverlay();
        }
      };
      audio.addEventListener('loadedmetadata', cacheDurationOnce, { once: true });
    }

    sheetMusicImg.src = resolveAssetUrl(ex.sheetMusicSrc);

    currentOriginalTempo = ex.originalTempo;

    // --- REVERTED LOGIC: /2 and x2 ---
    tempoSlider.min = Math.floor(ex.originalTempo / 2);
    tempoSlider.max = Math.floor(ex.originalTempo * 2);
    
    // Set visual value
    tempoSlider.value = ex.originalTempo;
    tempoLabel.textContent = 'BPM: ' + ex.originalTempo;

    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = ex.name;
      exerciseSearchInput.dataset.id = String(ex.id);
    }

    updatePlaybackRate();
    updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    resetTempoStepCounter();
    applyLoopMode();
  }


  // ===== Robust Random Tempo (now supports immediate flag) =====
  function pickRandomTempo(immediate = false) {
    if (!currentSelectedExercise || !tempoSlider) return;
    if (userIsAdjustingTempo) return;

    const setNow = (val) => immediate ? setTempoSilently(val, { blur: true }) : setTempoThrottled(val, { blur: true });

    const sliderMin = Number(tempoSlider.min);
    const sliderMax = Number(tempoSlider.max);

    const minRaw = parseInt(minTempoInput?.value, 10);
    const maxRaw = parseInt(maxTempoInput?.value, 10);

    const hasMin = !isNaN(minRaw);
    const hasMax = !isNaN(maxRaw);

    // If both provided and reversed -> do nothing
    if (hasMin && hasMax && minRaw > maxRaw) {
      return; // leave tempo unchanged
    }

    // Below-range or above-range hard clamps (no random pick)
    if (hasMin && hasMax && maxRaw < sliderMin) {
      setNow(sliderMin);
      prevTempo = sliderMin;
      return;
    }
    if (hasMin && hasMax && minRaw > sliderMax) {
      setNow(sliderMax);
      prevTempo = sliderMax;
      return;
    }

    // Defaults based on exercise if empty/invalid
    const defMin = Math.floor(currentSelectedExercise.originalTempo / 2);
    const defMax = currentSelectedExercise.originalTempo * 2;

    let minTempo = hasMin ? minRaw : defMin;
    let maxTempo = hasMax ? maxRaw : defMax;

    // Clamp to slider range
    minTempo = Math.max(sliderMin, Math.min(sliderMax, minTempo));
    maxTempo = Math.max(sliderMin, Math.min(sliderMax, maxTempo));

    // After clamp, if invalid ordering (e.g., only one was far out), treat as no-op
    if (minTempo > maxTempo) {
      return;
    }

    // If min==max -> direct set (and avoid "distance-from-prev" loop)
    if (minTempo === maxTempo) {
      setNow(minTempo);
      prevTempo = minTempo;
      return;
    }

    // Random within [minTempo, maxTempo]
    const span = maxTempo - minTempo;
    let randomTempo;

    // Avoid infinite loops when span is small: relax distance constraints
    const needDistance = prevTempo != null && span >= 8;
    if (!needDistance) {
      randomTempo = Math.floor(Math.random() * (span + 1)) + minTempo;
    } else {
      const MAX_TRIES = 25;
      let found = false;
      for (let i = 0; i < MAX_TRIES; i++) {
        const cand = Math.floor(Math.random() * (span + 1)) + minTempo;
        const delta = Math.abs(cand - prevTempo);
        if (delta >= 8 && delta <= 90) { randomTempo = cand; found = true; break; }
      }
      if (!found) {
        randomTempo = Math.floor(Math.random() * (span + 1)) + minTempo;
      }
    }

    prevTempo = randomTempo;
    setNow(randomTempo);
  }

  function pickRandomExercise() {
    const filtered = filterExercisesForMode();
    if (filtered.length === 0) return;
    const idx = Math.floor(Math.random() * filtered.length);
    currentExerciseIndex    = idx;
    currentSelectedExercise = filtered[idx];
    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = currentSelectedExercise.name;
      exerciseSearchInput.dataset.id = String(currentSelectedExercise.id);
    }
    initializeExercise(currentSelectedExercise);
    if (audio) { audio.pause(); resetProgressBarInstant(); }
    if (playPauseBtn) playPauseBtn.textContent = 'Play';

    if (isPlayingPlaylist && currentPlaylist) {
      syncPlaylistIndexToExercise(currentSelectedExercise.id);
      playCurrentPlaylistItem();
    }
  }

  function navigateExercise(step) {
    displayedExercises = filterExercisesForMode();
    if (displayedExercises.length === 0) return;

    const len = displayedExercises.length;
    currentExerciseIndex = (currentExerciseIndex + step + len) % len;
    currentSelectedExercise = displayedExercises[currentExerciseIndex];

    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = currentSelectedExercise.name;
      exerciseSearchInput.dataset.id = String(currentSelectedExercise.id);
    }

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

    // Uncheck and lock both Autos, clear related fields + RESET INTERNALS
    if (autoRandomizeToggle) { autoRandomizeToggle.checked = false; }
    if (repsPerTempoInput)   { repsPerTempoInput.value = ''; repsPerTempoInput.disabled = true; }
    if (minTempoInput)       { minTempoInput.value = ''; minTempoInput.disabled = true; }
    if (maxTempoInput)       { maxTempoInput.value = ''; maxTempoInput.disabled = true; }
    resetRandomizeInternals();

    if (autoTempoStepToggle) { autoTempoStepToggle.checked = false; }
    if (dialRepsInput)       { dialRepsInput.value = ''; dialRepsInput.disabled = true; }
    if (dialStepInput)       { dialStepInput.value = ''; dialStepInput.disabled = true; }
    if (bumpTempoBtn)        { bumpTempoBtn.disabled = true; }
    resetTempoStepInternals();
    prevTempo = null;

    // Force Category to "All Categories" and lock it during playlist
    if (categorySearchInput) {
      categorySearchInput.value = '';
      categorySearchInput.placeholder = 'All Categories';
      categorySearchInput.dataset.id = 'all';
      categorySearchInput.disabled = true;
    }

    // Lock other controls
    if (randomExerciseBtn)     randomExerciseBtn.disabled     = true;
    if (randomTempoBtn)        randomTempoBtn.disabled        = true;
    if (autoRandomizeToggle)   autoRandomizeToggle.disabled   = true;

    // Keep slider LOOK the same but make it non-interactive
    if (tempoSlider) {
      tempoSlider.setAttribute('aria-disabled','true');
      tempoSlider.classList.add('is-disabled');
    }

    const autoLabelFirst = document.querySelector('.auto-label');
    if (autoLabelFirst) autoLabelFirst.classList.add('disabled');
    const randomContainerFirst = getOriginalRandomContainer();
    if (randomContainerFirst) randomContainerFirst.classList.add('disabled');
    lockTempoStepGroup(true);

    if (prevPlaylistItemBtn) prevPlaylistItemBtn.disabled = false;
    if (nextPlaylistItemBtn) nextPlaylistItemBtn.disabled = false;
    if (stopPlaylistBtn)     stopPlaylistBtn.disabled     = false;

    if (playlistQueueSearchInput) {
      playlistQueueSearchInput.disabled = false;
      playlistQueueSearchInput.removeAttribute('disabled');
      playlistQueueSearchInput.style.opacity = '1';
    }
    if (playlistProgressContainer) playlistProgressContainer.style.display = 'block';

    // Recompute lists under "All" and start playback
    displayedExercises = filterExercisesForMode();
    if (displayedExercises.length > 0) {
      currentExerciseIndex    = 0;
      currentSelectedExercise = displayedExercises[0];
    }

    updatePlaylistQueueDisplay();

    // NEW: prefetch 1x durations for this playlist's exercises
    prefetchExerciseDurationsForPlaylist();

    playCurrentPlaylistItem();
    applyLoopMode();
  }

  function prefetchExerciseDurationsForPlaylist() {
    if (!currentPlaylist) return;
    const uniqueIds = [...new Set(currentPlaylist.items.map(i => i.exerciseId))];
    uniqueIds.forEach((id) => {
      if (durationCache.has(id)) return;
      const ex = exById.get(id);
      if (!ex) return;
      const url = resolveAssetUrl(ex.audioSrc);
      const aud = new Audio();
      aud.preload = 'metadata';
      aud.src = url;
      aud.addEventListener('loadedmetadata', () => {
        if (isFinite(aud.duration) && aud.duration > 0) {
          durationCache.set(id, aud.duration);
          renderPlaylistOverlay(); // totals improve as metadata lands
        }
        // cleanup
        aud.src = '';
      }, { once: true });
      aud.addEventListener('error', () => { /* ignore */ }, { once: true });
    });
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

    if (exerciseSearchInput) {
      exerciseSearchInput.value = '';
      exerciseSearchInput.placeholder = exercise.name;
      exerciseSearchInput.dataset.id = String(exercise.id);
    }
    initializeExercise(exercise);

    const tempo = item.tempos[currentTempoIndex];
    setTempoSilently(tempo); // slider visually same; input is non-interactive via aria-disabled

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

    // Restore slider interactivity without changing look
    if (tempoSlider) {
      tempoSlider.removeAttribute('aria-disabled');
      tempoSlider.classList.remove('is-disabled');
    }

    // Keep inputs visually cleared and ALSO reset internals again
    if (autoRandomizeToggle) autoRandomizeToggle.checked = false;
    if (repsPerTempoInput)   repsPerTempoInput.value = '';
    if (minTempoInput)       minTempoInput.value = '';
    if (maxTempoInput)       maxTempoInput.value = '';
    resetRandomizeInternals();

    if (autoTempoStepToggle) autoTempoStepToggle.checked = false;
    if (dialRepsInput)       { dialRepsInput.value = ''; dialRepsInput.disabled = false; }
    if (dialStepInput)       { dialStepInput.value = ''; dialStepInput.disabled = false; }
    if (bumpTempoBtn)        { bumpTempoBtn.disabled = false; }
    resetTempoStepInternals();
    prevTempo = null;

    // Random group visuals back
    const autoLabelFirst = document.querySelector('.auto-label');
    if (autoLabelFirst) autoLabelFirst.classList.remove('disabled');
    const randomContainerFirst = getOriginalRandomContainer();
    if (randomContainerFirst) randomContainerFirst.classList.remove('disabled');

    // Tempo Step group back
    lockTempoStepGroup(false);

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

    // Reset Category to "All Categories"
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
      renderPlaylistOverlay();
      return;
    }
    const currentIndex = getCurrentPlaylistQueueIndex();
    const totalItems = playlistQueueMap.length;
    const progressPercent = (currentIndex >= 0 && totalItems > 0)
      ? ((currentIndex + 1) / totalItems) * 100
      : 0;

    playlistProgress.style.width = progressPercent + '%';

    // Text shows time or percent based on toggle
    renderPlaylistOverlay();
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
    // Only clear the per-rep handler when NOT in playlist mode
    if (audio && !isPlayingPlaylist) audio.onended = null;
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
      pickerOverlay.classList.remove('picker--orange', 'picker--purple');
      pickerOverlay.classList.add(theme === 'purple' ? 'picker--purple' : 'picker--orange');

      pickerTitle.textContent = title;
      pickerOverlay.hidden = false;
      pickerOverlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');

      pickerSearch.value = '';
      pickerSearch.placeholder = 'Search...';

      // Focus immediately so iOS shows the keyboard; desktop ready to type.
      try {
        pickerSearch.readOnly = false;
        pickerSearch.focus({ preventScroll: true });
        const L = pickerSearch.value.length;
        pickerSearch.setSelectionRange(L, L);
      } catch {}

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
        pickerOverlay.classList.toggle('picker--no-results', items.length === 0);
        if (!items.length) return;

        activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));

        items.forEach((it, i) => {
          const li = document.createElement('li');
          li.className = 'picker__item' + (i === activeIndex ? ' is-active' : '');
          li.setAttribute('role', 'option');
          li.dataset.idx = i;
          li.textContent = it.label;
          li.style.touchAction = 'manipulation';

          let startX=0, startY=0, moved=false;
          const THRESH = 8;

          li.addEventListener('touchstart', (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            startX = t.clientX; startY = t.clientY; moved = false;
          }, { passive: true });

          li.addEventListener('touchmove', (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            if (Math.abs(t.clientX - startX) > THRESH || Math.abs(t.clientY - startY) > THRESH) moved = true;
          }, { passive: true });

          li.addEventListener('touchend', (e) => {
            if (!moved) {
              e.preventDefault();
              choose(i);
            }
          }, { passive: false });

          li.addEventListener('click', () => choose(i));
          li.addEventListener('contextmenu', (e) => e.preventDefault());

          pickerList.appendChild(li);
        });

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
        pickerOverlay.classList.remove('picker--no-results');
        pickerSearch.value = '';
        pickerList.innerHTML = '';
        document.body.classList.remove('modal-open');
        pickerSearch.removeEventListener('input', refresh);
        document.removeEventListener('keydown', onKey);
        pickerOverlay.removeEventListener('click', onOverlayClick);
        pickerClose.removeEventListener('click', close);
        document.removeEventListener('selectionchange', clearSelection);
      }

      pickerSearch.addEventListener('input', refresh);
      document.addEventListener('keydown', onKey);
      pickerOverlay.addEventListener('click', onOverlayClick);
      pickerClose.addEventListener('click', close);

      const clearSelection = () => {
        if (pickerOverlay.hidden) return;

        // If caret/selection is in the search box, do nothing
        const ae = document.activeElement;
        if (ae && (ae === pickerSearch || ae.closest?.('.picker__search'))) return;

        const sel2 = window.getSelection?.();
        if (!sel2) return;

        const anchor = sel2.anchorNode;
        if (anchor) {
          const node = anchor.nodeType === 3 ? anchor.parentNode : anchor;
          if (node && (node === pickerSearch || node.closest?.('.picker__search'))) return;
        }
        if (sel2.rangeCount) sel2.removeAllRanges();
      };
      document.addEventListener('selectionchange', clearSelection, { passive: true });

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
      getItems: (q) => {
        // 1. Prepare Number Mapping (1 <-> One)
        const numMap = {
          '0':['zero'], '1':['one'], '2':['two'], '3':['three'], '4':['four'],
          '5':['five'], '6':['six'], '7':['seven'], '8':['eight'], '9':['nine'],
          '10':['ten'], '11':['eleven'], '12':['twelve']
        };
        // Add reverse mapping (One -> 1)
        Object.entries(numMap).forEach(([digit, words]) => {
          words.forEach(w => { if(!numMap[w]) numMap[w] = []; numMap[w].push(digit); });
        });

        // 2. Create Search "Groups"
        // e.g. "5 stroke" -> [ ["5", "five"], ["stroke"] ]
        const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const searchGroups = terms.map(term => {
          const synonyms = numMap[term] || [];
          return [term, ...synonyms];
        });

        return filterExercisesForMode()
          .filter(ex => {
            const name = ex.name.toLowerCase();
            // Match if Name contains AT LEAST ONE version of EVERY typed term
            return searchGroups.every(group => group.some(t => name.includes(t)));
          })
          .map(ex => ({ id: ex.id, label: ex.name, ex }));
      },
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

  // ===== Open pickers from inputs =====
  function wireOpener(input, fn) {
    if (!input) return;
    try { input.readOnly = true; } catch {}
    input.setAttribute('inputmode','none');

    input.addEventListener('click', (e) => {
      e.preventDefault();
      fn();
    });

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

  // Picker-list only: extra guards
  if (pickerList){
    pickerList.addEventListener('selectstart', (e) => e.preventDefault(), { passive:false });
    pickerList.addEventListener('contextmenu', (e) => e.preventDefault());
    pickerList.addEventListener('pointerdown', () => {
      const sel3 = window.getSelection?.();
      if (sel3 && sel3.removeAllRanges) sel3.removeAllRanges();
    }, { passive:true });
  }

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

  /* ===== Mobile polish: keyboard-safe picker (header frozen) ===== */
  (function(){
    if (!pickerOverlay || !pickerList) return;
    const header = pickerOverlay.querySelector('.picker__header');

    function isOpen(){
      return !pickerOverlay.hidden && pickerOverlay.getAttribute('aria-hidden') !== 'true';
    }
    function vvh(){ return (window.visualViewport && window.visualViewport.height) || window.innerHeight; }
    function px(n){ return `${Math.max(120, Math.round(n))}px`; }

    function updatePickerLayout(){
      if (!isOpen()) return;
      const cs = getComputedStyle(pickerOverlay);
      const padTop    = parseFloat(cs.paddingTop)    || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const headerH   = header ? header.getBoundingClientRect().height : 0;
      const gapBelowHeader = 10;
      const usable = vvh() - padTop - padBottom - headerH - gapBelowHeader;
      pickerList.style.maxHeight = px(usable);
    }

    let bound = false;
    const vv = window.visualViewport;

    function bind(){
      if (bound) return;
      bound = true;
      updatePickerLayout();
      window.addEventListener('orientationchange', updatePickerLayout);
      if (vv){
        vv.addEventListener('resize', updatePickerLayout);
        vv.addEventListener('scroll', updatePickerLayout);
      }
      requestAnimationFrame(() => setTimeout(updatePickerLayout, 50));
    }
    function unbind(){
      if (!bound) return;
      bound = false;
      window.removeEventListener('orientationchange', updatePickerLayout);
      if (vv){
        vv.removeEventListener('resize', updatePickerLayout);
        vv.removeEventListener('scroll', updatePickerLayout);
      }
    }

    const mo = new MutationObserver(() => (isOpen() ? bind() : unbind()));
    mo.observe(pickerOverlay, { attributes:true, attributeFilter:['hidden','aria-hidden','class','style'] });

    if (isOpen()) bind();
  })();

  // ===== Keyboard shortcuts: Space = Play/Pause; Arrows = tempo (±1, Shift=±5) =====
  (function () {
    const isTextInput = (el) => {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const overlayOpen = () =>
      !!(pickerOverlay && !pickerOverlay.hidden && pickerOverlay.getAttribute('aria-hidden') !== 'true');

    function adjustTempo(delta) {
      if (!tempoSlider) return;
      // Respect disabled / aria-disabled (e.g., during playlist mode)
      if (tempoSlider.disabled || tempoSlider.getAttribute('aria-disabled') === 'true') return;

      const min = Number(tempoSlider.min || 0);
      const max = Number(tempoSlider.max || 999);
      const cur = Number(tempoSlider.value || 0);
      const next = Math.max(min, Math.min(max, cur + delta));

      if (next === cur) return;
      setTempoSilently(next, { blur: true });
      resetTempoStepCounter();
    }

    document.addEventListener(
      'keydown',
      (e) => {
        // Ignore when typing or when picker modal is open
        if (isTextInput(document.activeElement) || overlayOpen()) return;

        // Space toggles play/pause
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          if (playPauseBtn) playPauseBtn.click();
          return;
        }

        // Arrow keys adjust tempo (Shift = ±5)
        const step = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          adjustTempo(step);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          adjustTempo(-step);
        }
      },
      { passive: false }
    );
  })();

  // ===== Click-to-toggle on playlist overlay / bar =====
  function togglePlaylistOverlayMode() {
    playlistOverlayMode = (playlistOverlayMode === 'time') ? 'percent' : 'time';
    renderPlaylistOverlay();
  }

  // Make sure overlay can receive clicks (hardening if CSS was restrictive)
  if (playlistTimeOverlay) {
    try {
      playlistTimeOverlay.style.pointerEvents = 'auto';
      playlistTimeOverlay.style.cursor = 'pointer';
      playlistTimeOverlay.style.userSelect = 'none';
    } catch {}
  }

  // Click targets: whole playlist progress area + overlay text itself
  [playlistProgressContainer, playlistTimeOverlay, playlistProgressPercentage].forEach((el) => {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePlaylistOverlayMode();
    });
    // prevent accidental text selection on pointerdown
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) { e.preventDefault(); e.stopPropagation(); }
    }, { passive: false });
  });

  // Initial paint of overlay (default = cumulative time)
  renderPlaylistOverlay();


// ===== Quality of Life: "Enter" key blurs inputs to confirm values =====
  const numericInputs = [
    repsPerTempoInput, minTempoInput, maxTempoInput,
    dialRepsInput, dialStepInput
  ];
  
  numericInputs.forEach(input => {
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur(); // Triggers the 'change'/'input' logic and restores keyboard shortcuts
      }
    });
  });





});
