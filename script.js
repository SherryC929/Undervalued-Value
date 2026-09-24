(() => {
  'use strict';

  // 1. State and existing HTML references. Never rebuild roads or pebble buttons.
  const roads = [...document.querySelectorAll('.road-section')];
  const checkpoints = [...document.querySelectorAll('.checkpoint')];
  const journey = document.querySelector('#life-road');
  const start = document.querySelector('#opening a[href="#life-road"]');
  const bagButton = document.querySelector('#bag-toggle');
  const dialog = document.querySelector('#bag-dialog');
  const bagList = document.querySelector('#bag-list');
  const ending = document.querySelector('#ending');
  const status = document.querySelector('#game-status');
  const limits = [5, 3, 1];
  const bricks = roads.flatMap((road, index) =>
    [...road.querySelectorAll('button.road-brick')].map(button => ({
      id: button.querySelector('.brick-panel').id,
      wish: button.querySelector('.brick-panel').textContent.trim(),
      stage: index + 1,
      button
    }))
  );

  const initialState = () => ({
    selectedBricks: [],
    pickedBricks: [],
    releasedBricks: [],
    stage: 1,
    capacity: Infinity,
    started: false,
    ended: false,
    pendingBrick: null
  });
  let state = initialState();
  let statusTimer;

  // Audio feedback is independent of game state; blocked/missing audio is harmless.
  const soundToggle = document.querySelector('#sound-toggle');
  let soundOn = true; // Keep this preference when PLAY AGAIN resets the journey.
  function createSound(file, volume, loop = false) {
    try {
      const sound = new Audio(`assets/audio/${file}.mp3`);
      sound.preload = 'none';
      sound.volume = volume;
      sound.loop = loop;
      return sound;
    } catch {
      return null;
    }
  }

  const sounds = {
    bgm: createSound('bgm', 0.3, true),
    pickUp: createSound('pick_up', 0.22),
    letGo: createSound('let_go', 0.32),
    failure: createSound('failure', 0.22),
    success: createSound('success', 0.32)
  };

  function playSound(sound) {
    if (!sound || !soundOn || document.hidden) return;
    try {
      // Resume the BGM at its existing position; retrigger short effects from 0.
      if (sound !== sounds.bgm) sound.currentTime = 0;
      const playback = sound.play();
      if (playback) playback.catch(() => {});
    } catch {
      // A media error must never interrupt pickup, release, or an ending.
    }
  }

  function stopSound(sound, reset = false) {
    if (!sound) return;
    try {
      sound.pause();
      if (reset) sound.currentTime = 0;
    } catch {
      // Resetting an unavailable media resource is optional.
    }
  }

  function resumeBgm() {
    if (state.started && !state.ended && sounds.bgm?.paused) playSound(sounds.bgm);
  }

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    Object.values(sounds).forEach(sound => { if (sound) sound.muted = !soundOn; });
    soundToggle.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    soundToggle.setAttribute('aria-pressed', String(!soundOn));
    soundToggle.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Unmute sound');
    if (soundOn) resumeBgm();
    else {
      stopSound(sounds.bgm);
      // Do not resume an old short effect when sound is turned back on.
      Object.values(sounds).filter(sound => sound !== sounds.bgm)
        .forEach(sound => stopSound(sound, true));
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSound(sounds.bgm);
    else resumeBgm();
  });

  function announce(message) {
    clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = setTimeout(() => { status.textContent = ''; }, 3000);
  }

  function visit(target) {
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start'
    });
  }

  function canPickUp(brick) {
    return state.started && !state.ended && brick.stage <= state.stage &&
      !state.pickedBricks.includes(brick);
  }

  function prefersReducedMotion() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animatePickup(brick) {
    if (prefersReducedMotion()) return;
    const pebble = brick.button.querySelector('.pebble');
    const bagRect = bagButton.getBoundingClientRect();
    const pebbleRect = pebble.getBoundingClientRect();
    const ghost = pebble.cloneNode(true);
    const currentTransform = getComputedStyle(pebble).transform;

    ghost.classList.add('pickup-ghost');
    ghost.style.left = `${pebbleRect.left}px`;
    ghost.style.top = `${pebbleRect.top}px`;
    ghost.style.width = `${pebbleRect.width}px`;
    ghost.style.height = `${pebbleRect.height}px`;
    ghost.style.transform = currentTransform === 'none' ? 'translate(0, 0)' : currentTransform;
    document.body.append(ghost);
    ghost.offsetWidth;
    ghost.style.transform = `translate(${bagRect.left - pebbleRect.left + (bagRect.width - pebbleRect.width) / 2}px, ${bagRect.top - pebbleRect.top + (bagRect.height - pebbleRect.height) / 2}px) scale(0.2)`;
    ghost.style.opacity = '0';
    setTimeout(() => ghost.remove(), 650);
  }

  function animateRelease(card) {
    if (!card || prefersReducedMotion()) return;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    const layer = dialog.open ? dialog : document.body;

    ghost.classList.add('release-ghost');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    layer.append(ghost);
    setTimeout(() => ghost.remove(), 500);
  }

  // 2. Pickup: update current bag and the separate all-time pickup history.
  function pickUp(brick) {
    if (!canPickUp(brick) || state.selectedBricks.length >= state.capacity) return;
    animatePickup(brick);
    state.selectedBricks.push(brick);
    state.pickedBricks.push(brick);
    playSound(sounds.pickUp);
    brick.button.classList.add('picked');
    render();
    announce(`Picked up. ${state.selectedBricks.length} bricks in your bag.`);
  }

  bricks.forEach(brick => {
    brick.button.addEventListener('click', () => {
      if (!canPickUp(brick)) return;
      if (state.selectedBricks.length >= state.capacity) openBag(brick);
      else pickUp(brick);
      // A picked button becomes hidden; retain a useful keyboard focus target.
      if (!dialog.open && state.pickedBricks.includes(brick)) {
        const next = bricks.find(candidate => candidate.stage === brick.stage && canPickUp(candidate));
        (next ? next.button : checkpoints[state.stage - 1].querySelector('.continue-button'))
          .focus({ preventScroll: true });
      }
    });
  });

  // 3. Bag / collection rendering. Only the added list UI is generated here.
  function fillCollection(list, releaseAction = null, protectLast = false) {
    list.replaceChildren();
    if (!state.selectedBricks.length) {
      const empty = document.createElement('li');
      empty.textContent = 'Your bag is empty.';
      list.append(empty);
      return;
    }
    state.selectedBricks.forEach(brick => {
      const row = document.createElement('li');
      row.className = 'collection-item';
      const pebble = brick.button.querySelector('.pebble').cloneNode(true);
      pebble.alt = '';
      const wish = document.createElement('span');
      wish.className = 'collection-wish';
      wish.textContent = brick.wish;
      row.append(pebble, wish);
      if (releaseAction) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quiet-button';
        button.textContent = 'RELEASE ↓';
        button.setAttribute('aria-label', `Release: ${brick.wish}`);
        button.disabled = protectLast && state.selectedBricks.length === 1;
        button.addEventListener('click', () => releaseAction(brick, row));
        row.append(button);
      }
      list.append(row);
    });
  }

  function render() {
    document.querySelector('#bag-count').textContent =
      `${state.selectedBricks.length} ${state.selectedBricks.length === 1 ? 'BRICK' : 'BRICKS'}`;
    document.querySelector('#bag-capacity').textContent = state.capacity === Infinity
      ? 'COLLECT FREELY' : `CAPACITY ${state.selectedBricks.length} / ${state.capacity}`;
    bagButton.hidden = !state.started || state.ended;
    bricks.forEach(brick => { brick.button.disabled = !canPickUp(brick); });

    // Unlock existing sections sequentially; their images/positions stay untouched.
    roads.forEach((road, index) => { road.hidden = index + 1 > state.stage; });
    checkpoints.forEach((checkpoint, index) => {
      const number = index + 1;
      const active = state.started && !state.ended && number === state.stage;
      checkpoint.hidden = number > state.stage;
      checkpoint.querySelector('.checkpoint-controls').hidden = !active || !checkpoint.classList.contains('open');
      if (!active) return;

      const count = state.selectedBricks.length;
      const allowed = number === 3 ? count === 1 : count <= limits[index];
      const continueButton = checkpoint.querySelector('.continue-button');
      continueButton.disabled = !allowed;
      const message = checkpoint.querySelector('.checkpoint-status');
      message.textContent = number === 3 && count === 0
        ? 'Choose one brick from the road before reaching the end, or end your journey here.'
        : allowed ? `${count} carried. You can continue.`
          : `Release ${count - limits[index]} to continue. You are carrying ${count}.`;
      fillCollection(checkpoint.querySelector('.collection-list'), (brick, card) => {
        if (!activeCheckpoint(number) || (number === 3 && state.selectedBricks.length === 1)) return;
        const focusIndex = state.selectedBricks.indexOf(brick);
        if (!release(brick)) return;
        animateRelease(card);
        render();
        const buttons = checkpoint.querySelectorAll('.collection-list button:not(:disabled)');
        (buttons[Math.min(focusIndex, buttons.length - 1)] || continueButton).focus({ preventScroll: true });
        announce('Released. Your bag is a little lighter.');
      }, number === 3);
      const backLink = checkpoint.querySelector('.find-brick-link');
      if (backLink) backLink.hidden = count !== 0;
    });
  }

  // 4. Release records the change and sound. Callers decide what to render next.
  function release(brick) {
    if (!state.started || state.ended || !state.selectedBricks.includes(brick)) return false;
    state.selectedBricks = state.selectedBricks.filter(selected => selected !== brick);
    state.releasedBricks.push(brick);
    playSound(sounds.letGo);
    return true;
  }

  // 5. Capacity / exchange. Cancel and Escape leave both bag and histories intact.
  function openBag(incoming = null) {
    if (!state.started || state.ended || dialog.open) return;
    state.pendingBrick = incoming;
    document.querySelector('#bag-title').textContent = incoming ? 'YOUR BAG IS FULL' : 'YOUR BAG';
    document.querySelector('#bag-description').textContent = incoming
      ? `New wish: ${incoming.wish} Release one current brick to make room, or leave this one behind.`
      : 'These are the wishes you are carrying. You can release them at the current checkpoint.';
    document.querySelector('#bag-close').textContent = incoming ? 'LEAVE THIS BRICK BEHIND' : 'CLOSE BAG';
    fillCollection(bagList, incoming ? exchange : null);
    dialog.showModal();
  }

  function closeBag() {
    state.pendingBrick = null;
    dialog.close();
  }

  function exchange(oldBrick, card) {
    const incoming = state.pendingBrick;
    if (!incoming || !canPickUp(incoming) || !release(oldBrick)) return;
    animateRelease(card);
    // Release first, then pickup synchronously: capacity can never be exceeded.
    pickUp(incoming);
    setTimeout(() => {
      closeBag();
      bagButton.focus({ preventScroll: true });
    }, prefersReducedMotion() ? 0 : 500);
  }

  bagButton.addEventListener('click', () => openBag());
  document.querySelector('#bag-close').addEventListener('click', closeBag);
  dialog.addEventListener('cancel', () => { state.pendingBrick = null; });
  dialog.addEventListener('close', () => {
    // A previous close event may be queued when another dialog is opened.
    if (!dialog.open) state.pendingBrick = null;
  });

  // 6. Checkpoints validate state even when actions are invoked repeatedly.
  function activeCheckpoint(number) {
    return state.started && !state.ended && state.stage === number;
  }

  function continueJourney(number) {
    if (!activeCheckpoint(number)) return;
    const count = state.selectedBricks.length;
    if (number === 3) {
      if (count === 1) finish(true);
      return;
    }
    if (count > limits[number - 1]) return;
    state.capacity = limits[number - 1];
    state.stage = number + 1;
    render();
    const nextRoad = roads[state.stage - 1];
    const roadTop = nextRoad.getBoundingClientRect().top + window.scrollY;
    // Increase this number to stop earlier/higher before the next road.
    // Decrease it to stop later/lower.
    const nextRoadScrollOffset = 0.30;
    window.scrollTo({
      top: roadTop - window.innerHeight * nextRoadScrollOffset,
      behavior: prefersReducedMotion() ? 'instant' : 'smooth'
    });
  }

  checkpoints.forEach((checkpoint, index) => {
    const trigger = checkpoint.querySelector('.checkpoint-trigger');
    trigger.addEventListener('click', () => {
      checkpoint.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      render();
    });
    checkpoint.querySelector('.continue-button').addEventListener('click', () => continueJourney(index + 1));
    checkpoint.querySelector('.end-button').addEventListener('click', () => {
      if (activeCheckpoint(index + 1)) finish(false);
    });
  });

  start.addEventListener('click', event => {
    if (state.ended) {
      event.preventDefault();
      visit(ending);
      return;
    }
    state.started = true;
    journey.hidden = false;
    soundToggle.hidden = false;
    resumeBgm();
    render();
    // Keep the existing href="#life-road" anchor navigation.
  });

  // 7. Minimal endings. No more pickup, exchange, or checkpoint actions afterward.
  function finish(success) {
    if (!state.started || state.ended) return;
    if (success && (state.stage !== 3 || state.selectedBricks.length !== 1)) return;
    state.ended = true;
    stopSound(sounds.bgm, true);
    playSound(success ? sounds.success : sounds.failure);
    if (dialog.open) closeBag();
    clearTimeout(statusTimer);
    status.textContent = '';
    document.querySelector('#ending-title').textContent = success ? 'YOU MADE IT' : 'YOUR JOURNEY ENDS HERE';
    document.querySelector('#ending-wish').textContent = success ? state.selectedBricks[0].wish : '';
    render();
    journey.hidden = true;
    ending.hidden = false;
    visit(ending);
  }

  document.querySelector('#play-again').addEventListener('click', () => {
    Object.values(sounds).forEach(sound => stopSound(sound, true));
    soundToggle.hidden = true;
    if (dialog.open) closeBag();
    state = initialState();
    bricks.forEach(brick => brick.button.classList.remove('picked'));
    bagList.replaceChildren();
    checkpoints.forEach(checkpoint => checkpoint.querySelector('.collection-list').replaceChildren());
    document.querySelector('#ending-wish').textContent = '';
    document.querySelector('#ending-title').textContent = '';
    clearTimeout(statusTimer);
    status.textContent = '';
    ending.hidden = true;
    journey.hidden = true;
    checkpoints.forEach(checkpoint => {
      checkpoint.classList.remove('open');
      checkpoint.querySelector('.checkpoint-trigger').setAttribute('aria-expanded', 'false');
    });
    render();
    visit(document.querySelector('#opening'));
  });

  document.body.classList.add('game-ready');
  render();
})();
