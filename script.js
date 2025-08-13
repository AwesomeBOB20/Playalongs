document.addEventListener('DOMContentLoaded', function() {
    // Placeholder for your exercises data array
    const exercises = Array.isArray(window.EXERCISES) ? window.EXERCISES : [];
    const playlists = Array.isArray(window.PLAYLISTS) ? window.PLAYLISTS : [];

    const audio = document.getElementById('audio');
    const totalTimeDisplay = document.getElementById('totalTime');
    const currentTimeDisplay = document.getElementById('currentTime');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumePercentageDisplay = document.getElementById('volumePercentage');
    const tempoSlider = document.getElementById('tempoSlider');
    const tempoLabel = document.getElementById('tempoLabel');
    const sheetMusicImg = document.querySelector('.sheet-music img');
    const progressContainer = document.querySelector('.progress-bar');
    const progress = document.getElementById('progress');
    const randomExerciseBtn = document.getElementById('randomExerciseBtn');
    const randomTempoBtn = document.getElementById('randomTempoBtn');
    const minTempoInput = document.getElementById('minTempo');
    const maxTempoInput = document.getElementById('maxTempo');
    const stopPlaylistBtn = document.getElementById('stopPlaylistBtn');
    const prevPlaylistItemBtn = document.getElementById('prevPlaylistItemBtn');
    const nextPlaylistItemBtn = document.getElementById('nextPlaylistItemBtn');
    const playlistProgressContainer = document.querySelector('.playlist-progress-container');
    const playlistProgress = document.getElementById('playlistProgress');
    const playlistProgressPercentage = document.getElementById('playlistProgressPercentage');
    const prevExerciseBtn = document.getElementById('prevExerciseBtn');
    const nextExerciseBtn = document.getElementById('nextExerciseBtn');
    const autoRandomizeToggle = document.getElementById('autoRandomizeToggle');
    const repsPerTempoInput = document.getElementById('repsPerTempo');

    const categorySearchInput = document.getElementById('categorySearch');
    const categoryList = document.getElementById('categoryList');
    const exerciseSearchInput = document.getElementById('exerciseSearch');
    const exerciseList = document.getElementById('exerciseList');
    const playlistSearchInput = document.getElementById('playlistSearch');
    const playlistList = document.getElementById('playlistList');
    const playlistQueueSearchInput = document.getElementById('playlistQueueSearch');
    const playlistQueueList = document.getElementById('playlistQueueList');

    let isDragging = false;
    if (playlistQueueSearchInput) playlistQueueSearchInput.disabled = true;
    if (stopPlaylistBtn) stopPlaylistBtn.disabled = true;
    if (prevPlaylistItemBtn) prevPlaylistItemBtn.disabled = true;
    if (nextPlaylistItemBtn) nextPlaylistItemBtn.disabled = true;
if (volumeSlider && audio && volumePercentageDisplay) {
    // 1. hard-reset the values
    volumeSlider.value = 1;      // range is 0-1
    audio.volume       = 1;      // JS volume is 0-1
    volumePercentageDisplay.textContent = '100%';

    // 2. recolor the track so it’s purple right away
    updateSliderBackground(volumeSlider, '#96318d', '#ffffff');
}

    let currentPlaylist = null;
    let currentPlaylistItemIndex = 0;
    let currentTempoIndex = 0;
    let currentRepetition = 0;
    let isPlayingPlaylist = false;
    let playlistQueueMap = [];

    let isRandomizeEnabled = false;
    let repsBeforeChange = 1;
    let currentRepCount = 0;
    let displayedExercises = [];
    let currentExerciseIndex = 0;
    let currentSelectedExercise = null;
    let prevTempo = null;
	

    let displayedCategories = ["all", "one-handers", "accent-tap", "rhythms", "rudiments", "timing", "paradiddles", "singles", "rolls", "natural-decays", "flams", "hybrids", "78-grids", "exercises", "etudes", "requests"];

    const categoryDisplayMap = {
        "accent-tap": "Accent Tap",
        "rhythms": "Rhythms",
	"rudiments": "Rudiments",
        "requests": "Requests",
        "one-handers": "One Handers",
        "timing": "Timing",
        "paradiddles": "Paradiddles",
        "singles": "Singles",
        "rolls": "Rolls",
        "natural-decays": "Natural Decays",
        "flams": "Flams",
        "hybrids": "Hybrids",
        "78-grids": "7/8 Grids",
        "exercises": "Exercises",
        "etudes": "Etudes",
        "all": "All Categories"
    };

    let displayedPlaylists = playlists.map((p, i) => ({ index: i, name: p.name }));

    if (audio) audio.loop = false;

    // Initialize
    initializeCategoryList();
    initializePlaylistList();
    populateExerciseList();
    if (exerciseList) exerciseList.style.display = 'none';
    if (categoryList) categoryList.style.display = 'none';
    if (playlistList) playlistList.style.display = 'none';
    if (playlistQueueList) playlistQueueList.style.display = 'none';

    // Initial exercise load
    displayedExercises = filterExercisesForMode();
    if (displayedExercises.length > 0) {
        currentExerciseIndex = 0;
        currentSelectedExercise = displayedExercises[currentExerciseIndex];
        initializeExercise(currentSelectedExercise);
        if (exerciseSearchInput) exerciseSearchInput.placeholder = currentSelectedExercise.name;
    } else {
        if (exerciseSearchInput) exerciseSearchInput.placeholder = "Search Exercises...";
    }

    if (autoRandomizeToggle) {
        autoRandomizeToggle.addEventListener('change', function() {
            isRandomizeEnabled = this.checked;
            currentRepCount = 0;
        });
    }

    if (repsPerTempoInput) {
        repsPerTempoInput.addEventListener('input', function() {
            const val = parseInt(this.value);
            repsBeforeChange = (!isNaN(val) && val > 0) ? val : 1;
        });
    }

    if (randomExerciseBtn) {
        randomExerciseBtn.addEventListener('click', function() {
            if (isPlayingPlaylist) {
                stopPlaylist();
            }
            pickRandomExercise();
        });
    }

    if (randomTempoBtn) {
        randomTempoBtn.addEventListener('click', function() {
            if (isPlayingPlaylist) {
                stopPlaylist();
            }
            pickRandomTempo();
            if (audio) {
                audio.pause();
                resetProgressBar();
            }
            if (playPauseBtn) playPauseBtn.textContent = 'Play';
        });
    }

    if (playPauseBtn && audio) {
        playPauseBtn.addEventListener('click', function() {
            if (audio.paused) {
                if (audio.readyState < 3) {
                    audio.load();
                }
                audio.play().then(() => {
                    this.textContent = 'Pause';
                    updateProgressBarSmoothly();
                }).catch((error) => {
                    console.error('Error playing audio:', error);
                    alert('Audio is not ready yet. Please wait a moment.');
                });
            } else {
                audio.pause();
                this.textContent = 'Play';
            }
        });
    }

    if (audio) {
        audio.addEventListener('ended', function() {
            if (isPlayingPlaylist) {
                return; // handled by playlist logic
            }

            if (isRandomizeEnabled && currentSelectedExercise) {
                currentRepCount++;
                if (currentRepCount >= repsBeforeChange) {
                    pickRandomTempo();
                    currentRepCount = 0;
                }
            }
            audio.currentTime = 0;
            audio.play();
            if (playPauseBtn) playPauseBtn.textContent = 'Pause';
            updateProgressBarSmoothly();
        });
    }

    if (volumeSlider && audio && volumePercentageDisplay) {
        volumeSlider.addEventListener('input', function() {
            audio.volume = this.value;
            volumePercentageDisplay.textContent = Math.round(this.value * 100) + '%';
            updateSliderBackground(this, '#96318d', '#ffffff');
        });
    }

    if (tempoSlider) {
        tempoSlider.addEventListener('input', function() {
            updatePlaybackRate();
            updateSliderBackground(this, '#96318d', '#ffffff');
        });
    }

    if (progressContainer) {
        progressContainer.addEventListener('mousedown', startDragging);
        progressContainer.addEventListener('touchstart', startDragging);
    }
    document.addEventListener('mousemove', dragProgress);
    document.addEventListener('touchmove', dragProgress);
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('touchend', stopDragging);

    if (prevExerciseBtn) {
        prevExerciseBtn.addEventListener('click', () => navigateExercise(-1));
    }

    if (nextExerciseBtn) {
        nextExerciseBtn.addEventListener('click', () => navigateExercise(1));
    }

    if (stopPlaylistBtn) {
        stopPlaylistBtn.addEventListener('click', function() {
            if (isPlayingPlaylist) {
                stopPlaylist();
            }
        });
    }

    if (prevPlaylistItemBtn) {
        prevPlaylistItemBtn.addEventListener('click', function() {
            if (isPlayingPlaylist && playlistQueueMap.length > 0) {
                let currentOptionIndex = getCurrentPlaylistQueueIndex();
                if (currentOptionIndex > 0) {
                    currentOptionIndex--;
                    const position = playlistQueueMap[currentOptionIndex];
                    currentPlaylistItemIndex = position.playlistItemIndex;
                    currentTempoIndex = position.tempoIndex;
                    currentRepetition = position.repetition;
                    updatePlaylistQueueDisplay();
                    updatePlaylistProgressBar();
                    playCurrentPlaylistItem();
                }
            }
        });
    }

    if (nextPlaylistItemBtn) {
        nextPlaylistItemBtn.addEventListener('click', function() {
            if (isPlayingPlaylist && playlistQueueMap.length > 0) {
                let currentOptionIndex = getCurrentPlaylistQueueIndex();
                if (currentOptionIndex < playlistQueueMap.length - 1) {
                    currentOptionIndex++;
                    const position = playlistQueueMap[currentOptionIndex];
                    currentPlaylistItemIndex = position.playlistItemIndex;
                    currentTempoIndex = position.tempoIndex;
                    currentRepetition = position.repetition;
                    updatePlaylistQueueDisplay();
                    updatePlaylistProgressBar();
                    playCurrentPlaylistItem();
                }
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.exercise-container') && exerciseList) {
            exerciseList.style.display = 'none';
        }
        if (!e.target.closest('.category-container') && categoryList) {
            categoryList.style.display = 'none';
        }
        if (!e.target.closest('.playlist-container') && playlistList) {
            playlistList.style.display = 'none';
        }
        if (!e.target.closest('.playlist-queue-container') && playlistQueueList) {
            playlistQueueList.style.display = 'none';
        }
    });

    if (exerciseSearchInput) {
        exerciseSearchInput.addEventListener('focus', () => {
            populateExerciseList(exerciseSearchInput.value);
        });

        exerciseSearchInput.addEventListener('input', () => {
            populateExerciseList(exerciseSearchInput.value);
        });
    }

    if (categorySearchInput) {
        categorySearchInput.addEventListener('focus', () => {
            populateCategoryList(categorySearchInput.value);
        });

        categorySearchInput.addEventListener('input', () => {
            populateCategoryList(categorySearchInput.value);
        });
    }

    if (playlistSearchInput) {
        playlistSearchInput.addEventListener('focus', () => {
            populatePlaylistList(playlistSearchInput.value);
        });

        playlistSearchInput.addEventListener('input', () => {
            populatePlaylistList(playlistSearchInput.value);
        });
    }

    if (playlistQueueSearchInput) {
        playlistQueueSearchInput.addEventListener('focus', () => {
            populatePlaylistQueueList(playlistQueueSearchInput.value);
        });

        playlistQueueSearchInput.addEventListener('input', () => {
            populatePlaylistQueueList(playlistQueueSearchInput.value);
        });
    }

    if (audio) {
        audio.addEventListener('loadedmetadata', updateTotalTime);
        audio.addEventListener('ratechange', updateTotalTime);
        audio.addEventListener('ratechange', updateCurrentTime);
    }

    function filterExercisesForMode() {
        if (isPlayingPlaylist && currentPlaylist) {
            const playlistExerciseIds = currentPlaylist.items.map(i => i.exerciseId);
            return exercises.filter(ex => playlistExerciseIds.includes(ex.id));
        } else {
            let selectedCategory = getSelectedCategory();
            return exercises.filter(ex => selectedCategory === 'all' || ex.category.includes(selectedCategory));
        }
    }

    function getSelectedCategory() {
        if (!categorySearchInput) return 'all';

        let placeholder = categorySearchInput.placeholder;
        if (placeholder === '' || placeholder === 'All Categories') {
            return 'all';
        }
        let entry = Object.entries(categoryDisplayMap).find(([key, val]) => val.toLowerCase() === placeholder.toLowerCase());
        return entry ? entry[0] : 'all';
    }

    function initializeExercise(ex) {
    if (!audio || !tempoSlider || !tempoLabel || !sheetMusicImg) return;

    audio.src  = ex.audioSrc;
    audio.preload = 'auto';
    audio.load();

    sheetMusicImg.src = ex.sheetMusicSrc;

    tempoSlider.min = ex.originalTempo / 2;
    tempoSlider.max = ex.originalTempo * 2;
    tempoSlider.value = ex.originalTempo;
    tempoLabel.textContent = 'BPM: ' + ex.originalTempo;

    // 🔽 🔽  NEW  🔽 🔽
    if (exerciseSearchInput) {
        exerciseSearchInput.value = '';
        exerciseSearchInput.placeholder = ex.name;
    }

    updatePlaybackRate();
    updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
    // …rest of the function…
}


    function updatePlaybackRate() {
        if (!audio || !tempoSlider) return;
        const currentTempo = parseInt(tempoSlider.value);
        const originalTempo = parseInt(tempoSlider.max) / 2;
        const playbackRate = currentTempo / originalTempo;
        audio.playbackRate = playbackRate;
        if (tempoLabel) tempoLabel.textContent = 'BPM: ' + currentTempo;
        updateTotalTime();
        updateCurrentTime();
    }

    function resetProgressBar() {
        if (progress && currentTimeDisplay && audio) {
            progress.style.width = '0%';
            currentTimeDisplay.textContent = '0:00';
            audio.currentTime = 0;
        }
    }

    function updateSliderBackground(slider, color1, color2) {
        if (!slider) return;
        const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.background = `linear-gradient(to right, ${color1} 0%, ${color1} ${value}%, ${color2} ${value}%, ${color2} 100%)`;
    }

    function formatTime(timeInSeconds) {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function updateTotalTime() {
        if (audio && totalTimeDisplay && audio.duration) {
            const duration = audio.duration / audio.playbackRate;
            totalTimeDisplay.textContent = formatTime(duration);
        }
    }

    function updateCurrentTime() {
        if (!audio || !currentTimeDisplay) return;
        const currentTime = audio.currentTime / audio.playbackRate;
        currentTimeDisplay.textContent = formatTime(currentTime);
    }

    function updateProgressBarSmoothly() {
        if (!audio || !progress || !currentTimeDisplay) return;
        if (!audio.paused) {
            const progressPercent = (audio.currentTime / audio.duration) * 100;
            progress.style.width = progressPercent + '%';
            updateCurrentTime();
            requestAnimationFrame(updateProgressBarSmoothly);
        }
    }

    function startDragging(e) {
        isDragging = true;
        updateProgress(e);
    }

    function dragProgress(e) {
        if (isDragging) {
            updateProgress(e);
        }
    }

    function stopDragging() {
        isDragging = false;
    }

    function updateProgress(e) {
        if (!audio || !progressContainer || !progress) return;
        const rect = progressContainer.getBoundingClientRect();
        let x;
        if (e.type.startsWith('touch')) {
            x = e.touches[0].clientX - rect.left;
        } else {
            x = e.clientX - rect.left;
        }
        const width = progressContainer.clientWidth;
        let clickedValue = x / width;
        clickedValue = Math.min(1, Math.max(0, clickedValue));
        audio.currentTime = clickedValue * audio.duration;
        const progressPercent = (audio.currentTime / audio.duration) * 100;
        progress.style.width = progressPercent + '%';
        updateCurrentTime();
    }

    function pickRandomExercise() {
        const filteredExercises = filterExercisesForMode();
        if (filteredExercises.length === 0) return;
        const randomIndex = Math.floor(Math.random() * filteredExercises.length);
        currentExerciseIndex = randomIndex;
        currentSelectedExercise = filteredExercises[currentExerciseIndex];
        if (exerciseSearchInput) {
            exerciseSearchInput.value = '';
            exerciseSearchInput.placeholder = currentSelectedExercise.name;
        }
        initializeExercise(currentSelectedExercise);
        if (audio) {
            audio.pause();
            resetProgressBar();
        }
        if (playPauseBtn) playPauseBtn.textContent = 'Play';

        if (isPlayingPlaylist && currentPlaylist) {
            const idx = currentPlaylist.items.findIndex(i => i.exerciseId === currentSelectedExercise.id);
            if (idx !== -1) {
                currentPlaylistItemIndex = idx;
                currentTempoIndex = 0;
                currentRepetition = 0;
                updatePlaylistQueueDisplay();
                updatePlaylistProgressBar();
                playCurrentPlaylistItem();
            }
        }
    }

    function pickRandomTempo() {
  if (!currentSelectedExercise || !tempoSlider) return;

  let minTempo = parseInt(minTempoInput?.value);
  let maxTempo = parseInt(maxTempoInput?.value);

  const defaultMin = Math.floor(currentSelectedExercise.originalTempo / 2);
  const defaultMax = currentSelectedExercise.originalTempo * 2;

  if (isNaN(minTempo) || minTempo < 1 || minTempo > 999) minTempo = defaultMin;
  if (isNaN(maxTempo) || maxTempo < 1 || maxTempo > 999) maxTempo = defaultMax;
  if (minTempo > maxTempo) [minTempo, maxTempo] = [maxTempo, minTempo];

  minTempo = Math.max(minTempo, parseInt(tempoSlider.min));
  maxTempo = Math.min(maxTempo, parseInt(tempoSlider.max));

  let randomTempo;
  do {
    randomTempo = Math.floor(Math.random() * (maxTempo - minTempo + 1)) + minTempo;
  } while (
    prevTempo !== null &&
    (Math.abs(randomTempo - prevTempo) < 8 || Math.abs(randomTempo - prevTempo) > 90)
  );

  prevTempo = randomTempo;               // remember for next spin
  tempoSlider.value = randomTempo;
  updatePlaybackRate();
  updateSliderBackground(tempoSlider, '#96318d', '#ffffff');
}


    // ---------- NEW navigateExercise ----------
// ---------- NEW navigateExercise ----------
function navigateExercise(step) {
  // refresh the list for whatever mode we’re in (playlist vs category)
  displayedExercises = filterExercisesForMode();
  if (displayedExercises.length === 0) return;

  const len = displayedExercises.length;
  currentExerciseIndex = (currentExerciseIndex + step + len) % len; // wrap-around

  currentSelectedExercise = displayedExercises[currentExerciseIndex];

  // update search box placeholder
  if (exerciseSearchInput) {
    exerciseSearchInput.value = '';
    exerciseSearchInput.placeholder = currentSelectedExercise.name;
  }

  // load the exercise + reset audio/UI
  initializeExercise(currentSelectedExercise);
  if (audio) {
    audio.pause();
    resetProgressBar();
    if (playPauseBtn) playPauseBtn.textContent = 'Play';
  }

  /*–––  playlist sync –––*/
  if (isPlayingPlaylist && currentPlaylist) {
    const idx = currentPlaylist.items.findIndex(
      i => i.exerciseId === currentSelectedExercise.id
    );
    if (idx !== -1) {
      currentPlaylistItemIndex = idx;
      currentTempoIndex = 0;
      currentRepetition = 0;
      updatePlaylistQueueDisplay?.();
      updatePlaylistProgressBar?.();
      playCurrentPlaylistItem?.();
    }
  }
}


    /* 1️⃣  Replace your current populateExerciseList(...) with this */
function populateExerciseList(filter = '') {
  if (!exerciseList) return;

  // -- keep the master list intact, only filter for the dropdown --
  const searchResults = filterExercisesForMode().filter(ex =>
    ex.name.toLowerCase().includes(filter.toLowerCase())
  );

  exerciseList.innerHTML = '';

  searchResults.forEach((exercise) => {
    const li = document.createElement('li');
    li.textContent  = exercise.name;
    li.dataset.id   = exercise.id;

    if (exercise === currentSelectedExercise) {
      li.classList.add('active-option');
    }

    li.addEventListener('click', () => {
      currentSelectedExercise = exercise;

      // 🔄  re-sync the full nav list + index so Next/Prev work
      displayedExercises   = filterExercisesForMode();
      currentExerciseIndex = displayedExercises.findIndex(ex => ex.id === exercise.id);

      initializeExercise(exercise);      // your existing helper
      exerciseSearchInput.value = '';    // clear search box
      exerciseList.style.display = 'none';
    });

    exerciseList.appendChild(li);
  });

  exerciseList.style.display = searchResults.length ? 'block' : 'none';
}




    function selectExercise(exercise) {
        if (exerciseSearchInput) {
            exerciseSearchInput.value = '';
            exerciseSearchInput.placeholder = exercise.name;
        }
        if (exerciseList) exerciseList.style.display = 'none';
        initializeExercise(exercise);
        if (audio) {
            audio.pause();
            resetProgressBar();
        }
        if (playPauseBtn) playPauseBtn.textContent = 'Play';

        if (isPlayingPlaylist && currentPlaylist) {
            const idx = currentPlaylist.items.findIndex(i => i.exerciseId === exercise.id);
            if (idx !== -1) {
                currentPlaylistItemIndex = idx;
                currentTempoIndex = 0;
                currentRepetition = 0;
                updatePlaylistQueueDisplay();
                updatePlaylistProgressBar();
                playCurrentPlaylistItem();
            }
        }
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
            if (categorySearchInput && li.textContent === categorySearchInput.placeholder) {
                li.classList.add('active-option');
            }
            li.addEventListener('click', () => {
                if (categorySearchInput) {
                    categorySearchInput.value = '';
                    categorySearchInput.placeholder = displayName;
                }
                categoryList.style.display = 'none';
                if (isPlayingPlaylist) {
                    stopPlaylist();
                }
                currentExerciseIndex = 0;
                const filtered = filterExercisesForMode();
                if (filtered.length > 0) {
                    currentSelectedExercise = filtered[currentExerciseIndex];
                    initializeExercise(currentSelectedExercise);
                    if (exerciseSearchInput) {
                        exerciseSearchInput.value = '';
                        exerciseSearchInput.placeholder = currentSelectedExercise.name;
                    }
                    if (audio) {
                        audio.pause();
                        resetProgressBar();
                    }
                    if (playPauseBtn) playPauseBtn.textContent = 'Play';
                } else {
                    currentSelectedExercise = null;
                    if (exerciseSearchInput) {
                        exerciseSearchInput.value = '';
                        exerciseSearchInput.placeholder = "Search Exercises...";
                    }
                }
                populateExerciseList();
            });
            categoryList.appendChild(li);
        });

        if (filteredCats.length > 0 && document.activeElement === categorySearchInput) {
            categoryList.style.display = 'block';
        } else {
            categoryList.style.display = 'none';
        }
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
            li.textContent = pl.name;
            li.dataset.index = pl.index;
            if (currentPlaylist && currentPlaylist.name === pl.name) {
                li.classList.add('active-option');
            }
            li.addEventListener('click', () => {
                if (playlistSearchInput) {
                    playlistSearchInput.value = '';
                    playlistSearchInput.placeholder = li.textContent;
                }
                playlistList.style.display = 'none';
                if (isPlayingPlaylist) {
                    stopPlaylist();
                }
                startPlaylist(pl.index);
            });
            playlistList.appendChild(li);
        });

        if (filteredPlaylists.length > 0 && document.activeElement === playlistSearchInput) {
            playlistList.style.display = 'block';
        } else {
            playlistList.style.display = 'none';
        }
    }

    function populatePlaylistQueueList(filter = '') {
        if (!playlistQueueList) return;
        playlistQueueList.innerHTML = '';
        if (!isPlayingPlaylist || !currentPlaylist || playlistQueueMap.length === 0) {
            playlistQueueList.style.display = 'none';
            return;
        }

        const filteredQueue = playlistQueueMap
            .map((pos, idx) => {
                const pItem = currentPlaylist.items[pos.playlistItemIndex];
                const ex = exercises.find(exx => exx.id === pItem.exerciseId);
                if (!ex) return null;
                const tempoVal = pItem.tempos[pos.tempoIndex];
                return { idx, text: `${ex.name} at ${tempoVal} BPM`, pos };
            })
            .filter(x => x && x.text.toLowerCase().includes(filter.toLowerCase()));

        filteredQueue.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.text;
            if (item.pos.playlistItemIndex === currentPlaylistItemIndex &&
                item.pos.tempoIndex === currentTempoIndex &&
                item.pos.repetition === currentRepetition) {
                li.classList.add('active-option');
            }
            li.addEventListener('click', () => {
                currentPlaylistItemIndex = item.pos.playlistItemIndex;
                currentTempoIndex = item.pos.tempoIndex;
                currentRepetition = item.pos.repetition;
                if (playlistQueueSearchInput) {
                    playlistQueueSearchInput.value = '';
                    playlistQueueSearchInput.placeholder = 'Playlist Queue';
                }
                playlistQueueList.style.display = 'none';
                updatePlaylistQueueDisplay();
                updatePlaylistProgressBar();
                playCurrentPlaylistItem();
            });
            playlistQueueList.appendChild(li);
        });

        if (filteredQueue.length > 0 && document.activeElement === playlistQueueSearchInput) {
            playlistQueueList.style.display = 'block';
        } else {
            playlistQueueList.style.display = 'none';
        }
    }

    function startPlaylist(playlistId) {
        currentPlaylist = playlists[playlistId];
        currentPlaylistItemIndex = 0;
        currentTempoIndex = 0;
        currentRepetition = 0;
        isPlayingPlaylist = true;

        document.body.classList.add('playlist-mode');
        if (categorySearchInput) categorySearchInput.placeholder = "All Categories";

        if (categorySearchInput) categorySearchInput.disabled = true;
        if (minTempoInput) minTempoInput.disabled = true;
        if (maxTempoInput) maxTempoInput.disabled = true;
        if (randomExerciseBtn) randomExerciseBtn.disabled = true;
        if (randomTempoBtn) randomTempoBtn.disabled = true;
        if (autoRandomizeToggle) autoRandomizeToggle.disabled = true;
        if (repsPerTempoInput) repsPerTempoInput.disabled = true;
        if (tempoSlider) tempoSlider.disabled = true;

        const autoLabel = document.querySelector('.auto-label');
        if (autoLabel) {
            autoLabel.classList.add('disabled');
        }

        const randomContainer = document.querySelector('.random-container');
        if (randomContainer) {
            randomContainer.classList.add('disabled');
        }

        if (prevPlaylistItemBtn) prevPlaylistItemBtn.disabled = false;
        if (nextPlaylistItemBtn) nextPlaylistItemBtn.disabled = false;
        if (stopPlaylistBtn) stopPlaylistBtn.disabled = false;
        if (playlistQueueSearchInput) playlistQueueSearchInput.disabled = false;
        if (playlistProgressContainer) playlistProgressContainer.style.display = 'flex';

        displayedExercises = filterExercisesForMode();
        if (displayedExercises.length > 0) {
            currentExerciseIndex = 0;
            currentSelectedExercise = displayedExercises[0];
        }

        playCurrentPlaylistItem();
    }

    function playCurrentPlaylistItem() {
        if (!currentPlaylist) return;
        const item = currentPlaylist.items[currentPlaylistItemIndex];
        const exerciseId = item.exerciseId;
        const exercise = exercises.find(ex => ex.id === exerciseId);

        if (!exercise) {
            console.error('Exercise not found: ' + exerciseId);
            return;
        }

        currentSelectedExercise = exercise;
        displayedExercises = filterExercisesForMode();
        currentExerciseIndex = displayedExercises.indexOf(exercise);

        if (exerciseSearchInput) {
            exerciseSearchInput.value = '';
            exerciseSearchInput.placeholder = exercise.name;
        }

        initializeExercise(exercise);

        const tempo = item.tempos[currentTempoIndex];
        if (tempoSlider) tempoSlider.value = tempo;
        updatePlaybackRate();
        if (tempoSlider) updateSliderBackground(tempoSlider, '#96318d', '#ffffff');

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
                updateProgressBarSmoothly();

                audio.onended = function() {
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
                        // Playlist done
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
        currentPlaylist = null;
        if (playPauseBtn) playPauseBtn.textContent = 'Play';
        resetPlaylistControls();
        resetProgressBar();
        displayedExercises = filterExercisesForMode();
        populateExerciseList();

        if (playPauseBtn) playPauseBtn.classList.remove('playlist-mode');

        if (categorySearchInput) categorySearchInput.disabled = false;
        if (minTempoInput) minTempoInput.disabled = false;
        if (maxTempoInput) maxTempoInput.disabled = false;
        if (randomExerciseBtn) randomExerciseBtn.disabled = false;
        if (randomTempoBtn) randomTempoBtn.disabled = false;
        if (autoRandomizeToggle) autoRandomizeToggle.disabled = false;
        if (repsPerTempoInput) repsPerTempoInput.disabled = false;
        if (tempoSlider) tempoSlider.disabled = false;

        const autoLabel = document.querySelector('.auto-label');
        if (autoLabel) {
            autoLabel.classList.remove('disabled');
        }

        const randomContainer = document.querySelector('.random-container');
        if (randomContainer) {
            randomContainer.classList.remove('disabled');
        }

        if (exerciseSearchInput) {
            exerciseSearchInput.value = '';
            exerciseSearchInput.placeholder = currentSelectedExercise ? currentSelectedExercise.name : "Search Exercises...";
        }

        document.body.classList.remove('playlist-mode');
        if (playlistQueueSearchInput) playlistQueueSearchInput.placeholder = 'Playlist Queue';
    }

    function resetPlaylistControls() {
        if (stopPlaylistBtn) stopPlaylistBtn.disabled = true;
        if (playlistQueueSearchInput) playlistQueueSearchInput.disabled = true;
        if (prevPlaylistItemBtn) prevPlaylistItemBtn.disabled = true;
        if (nextPlaylistItemBtn) nextPlaylistItemBtn.disabled = true;
        if (playPauseBtn) playPauseBtn.textContent = 'Play';
        if (playlistSearchInput) playlistSearchInput.placeholder = 'Select a Playlist';
        if (playlistQueueSearchInput) playlistQueueSearchInput.placeholder = 'Playlist Queue';
        if (playlistProgressContainer) playlistProgressContainer.style.display = 'none';
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
                    playlistQueueMap.push({
                        playlistItemIndex: i,
                        tempoIndex: ti,
                        repetition: r
                    });
                }
            });
        });
        populatePlaylistQueueList();
    }

    function getCurrentPlaylistQueueIndex() {
        return playlistQueueMap.findIndex(pos =>
            pos.playlistItemIndex === currentPlaylistItemIndex &&
            pos.tempoIndex === currentTempoIndex &&
            pos.repetition === currentRepetition
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
});

