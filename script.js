// --- Tempo slider (release implicit capture; don't disable) ---
if (tempoSlider) {
  let activePointerId = null;

  const beginTempoDrag = (e) => {
    userIsAdjustingTempo = true;
    activePointerId = (e && typeof e.pointerId === 'number') ? e.pointerId : null;
  };

  const endTempoDrag = () => {
    userIsAdjustingTempo = false;
    if (activePointerId !== null) {
      try { tempoSlider.releasePointerCapture(activePointerId); } catch {}
      activePointerId = null;
    }
    // Break Safari's focus on the range input so other controls get events
    tempoSlider.blur();
  };

  // Start tracking
  tempoSlider.addEventListener('pointerdown', beginTempoDrag, { passive: true });
  tempoSlider.addEventListener('touchstart',  beginTempoDrag, { passive: true });
  tempoSlider.addEventListener('mousedown',   beginTempoDrag);

  // End/cancel anywhere
  ['pointerup','pointercancel','touchend','touchcancel','mouseup']
    .forEach(evt => window.addEventListener(evt, endTempoDrag, { passive: true }));

  // If you tap any other control, also end the slider drag first (capture runs first)
  document.addEventListener('pointerdown', (e) => {
    if (e.target !== tempoSlider) endTempoDrag();
  }, { capture: true, passive: true });

  // Normal slider behavior
  tempoSlider.addEventListener('input', function () {
    if (suppressTempoInput) return;
    updatePlaybackRate();
    updateSliderBackground(this, '#96318d', '#ffffff');
  });
}
