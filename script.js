(() => {
  'use strict';

  const helpDialog = document.querySelector('#help-dialog');
  document.querySelector('#help-toggle').addEventListener('click', () => helpDialog.showModal());
  document.querySelector('#help-close').addEventListener('click', () => helpDialog.close());

  // Get the HTML elements used by the game.
  const roads = document.querySelectorAll('.road-section');
  const checkpoints = document.querySelectorAll('.checkpoint');
  const journey = document.querySelector('#life-road');
  const firstRoad = roads[0];
  const start = document.querySelector('#opening a[href="#life-road"]');
  const bagButton = document.querySelector('#bag-toggle');
  const dialog = document.querySelector('#bag-dialog');
  const bagList = document.querySelector('#bag-list');
  const ending = document.querySelector('#ending');
  const endingTitle = document.querySelector('#ending-title');
  const endingContent = document.querySelector('#ending-content');
  const status = document.querySelector('#game-status');
  const limits = [5, 3, 1];
  const bricks = [];
  for (let index = 0; index < roads.length; index++) {
    const buttons = roads[index].querySelectorAll('button.road-brick');
    for (const button of buttons) {
      bricks.push({
        wish: button.querySelector('.brick-panel').textContent.trim(),
        stage: index + 1,
        button: button
      });
    }
  }

  // Keep current bag contents separate from the pickup history.
  function initialState() {
    return {
      selectedBricks: [],
      pickedBricks: [],
      stage: 1,
      capacity: Infinity,
      started: false,
      ended: false,
      pendingBrick: null
    };
  }
  let state = initialState();
  let statusTimer;

  // Create decorative cover pebbles, independent of the wishes and game state.
  const cover = document.querySelector('#opening');
  const coverHero = cover.querySelector('.cover-hero');
  const coverLayer = cover.querySelector('.cover-pebbles');
  const coverPebbleImages = [
    'assets/images/pebbles/1.png',
    'assets/images/pebbles/2.png',
    'assets/images/pebbles/3.png',
    'assets/images/pebbles/4.png',
    'assets/images/pebbles/5.png',
    'assets/images/pebbles/6.png',
    'assets/images/pebbles/7.png',
    'assets/images/pebbles/8.png',
    'assets/images/pebbles/9.png',
    'assets/images/pebbles/10.png',
    'assets/images/pebbles/11.png',
    'assets/images/pebbles/12.png',
    'assets/images/pebbles/13.png',
    'assets/images/pebbles/14.png',
    'assets/images/pebbles/15.png',
    'assets/images/pebbles/16.png',
    'assets/images/pebbles/17.png',
    'assets/images/pebbles/18.png',
    'assets/images/pebbles/19.png',
    'assets/images/pebbles/20.png',
    'assets/images/pebbles/21.png',
    'assets/images/pebbles/22.png',
    'assets/images/pebbles/23.png',
    'assets/images/pebbles/24.png',
    'assets/images/pebbles/25.png',
    'assets/images/pebbles/26.png',
    'assets/images/pebbles/27.png',
    'assets/images/pebbles/28.png',
    'assets/images/pebbles/29.png',
    'assets/images/pebbles/30.png',
    'assets/images/pebbles/31.png',
    'assets/images/pebbles/32.png',
    'assets/images/pebbles/33.png',
    'assets/images/pebbles/34.png'
  ];
  const coverPebbles = [];

  for (const src of coverPebbleImages) {
    const node = document.createElement('div');
    node.className = 'cover-pebble';
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    image.draggable = false;
    node.style.setProperty('--cover-rotation', `${randomBetween(-12, 12)}deg`);
    node.style.setProperty('--float-x', `${randomBetween(15, 30) * (Math.random() < 0.5 ? -1 : 1)}px`);
    node.style.setProperty('--float-y', `${randomBetween(12, 25) * (Math.random() < 0.5 ? -1 : 1)}px`);
    node.style.setProperty('--float-duration', `${randomBetween(3.5, 6)}s`);
    node.style.setProperty('--float-delay', `${randomBetween(-6, 0)}s`);
    node.append(image);
    coverLayer.append(node);
    coverPebbles.push({ node: node, x: 0, y: 0, size: 0 });
  }

  function randomBetween(min, max) {
    return min + Math.random() * Math.max(0, max - min);
  }

  // Keep a number inside a permitted range, including during dragging.
  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  let coverSize = null;
  let activeDrag = null;

  function positionCoverPebble(pebble) {
    pebble.node.style.left = `${pebble.x}px`;
    pebble.node.style.top = `${pebble.y}px`;
    pebble.node.style.width = `${pebble.size}px`;
    pebble.node.style.height = `${pebble.size}px`;
  }

  function overlapsRectangle(pebble, rectangle) {
    return pebble.x < rectangle.right &&
      pebble.x + pebble.size > rectangle.left &&
      pebble.y < rectangle.bottom &&
      pebble.y + pebble.size > rectangle.top;
  }

  // Try random positions outside the title area and away from other pebbles.
  function layoutCover() {
    const rect = cover.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height) return;
    if (coverSize && width === coverSize.width && height === coverSize.height) return;
    if (activeDrag) endCoverDrag({ pointerId: activeDrag.pointerId });

    const hero = coverHero.getBoundingClientRect();
    const gap = Math.min(48, width * 0.07);
    const safeArea = {
      left: hero.left - rect.left - gap,
      right: hero.right - rect.left + gap,
      top: hero.top - rect.top - 32,
      bottom: hero.bottom - rect.top + 32
    };
    const placedPebbles = [];

    for (const pebble of coverPebbles) {
      pebble.size = Math.min(118, width / 8, height / 7) * randomBetween(0.86, 1);
      pebble.node.hidden = true;

      // Limit retries so a crowded or very small screen cannot freeze the page.
      for (let attempt = 0; attempt < 400; attempt++) {
        if (attempt > 0 && attempt % 25 === 0) pebble.size *= 0.8;
        if (width < pebble.size + 20 || height < pebble.size + 82) continue;
        pebble.x = randomBetween(10, width - pebble.size - 10);
        pebble.y = randomBetween(72, height - pebble.size - 10);
        if (overlapsRectangle(pebble, safeArea)) continue;

        let overlapsPebble = false;
        for (const other of placedPebbles) {
          if (overlapsRectangle(pebble, {
            left: other.x - 4,
            right: other.x + other.size + 4,
            top: other.y - 4,
            bottom: other.y + other.size + 4
          })) {
            overlapsPebble = true;
            break;
          }
        }
        if (overlapsPebble) continue;

        pebble.node.hidden = false;
        positionCoverPebble(pebble);
        placedPebbles.push(pebble);
        break;
      }
    }
    coverSize = { width: width, height: height };
  }

  // Pointer capture keeps dragging active when the pointer leaves a pebble.
  function moveCoverDrag(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const rect = cover.getBoundingClientRect();
    const { pebble, offsetX, offsetY } = activeDrag;
    pebble.x = clamp(event.clientX - rect.left - offsetX, 0, rect.width - pebble.size);
    pebble.y = clamp(event.clientY - rect.top - offsetY, 0, rect.height - pebble.size);
    positionCoverPebble(pebble);
  }

  function endCoverDrag(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const { node } = activeDrag.pebble;
    activeDrag = null;
    node.classList.remove('is-dragging');
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
  }

  coverPebbles.forEach(pebble => {
    pebble.node.addEventListener('pointerdown', event => {
      if (activeDrag || event.button !== 0) return;
      event.preventDefault();
      const rect = cover.getBoundingClientRect();
      activeDrag = { pebble, pointerId: event.pointerId,
        offsetX: event.clientX - rect.left - pebble.x,
        offsetY: event.clientY - rect.top - pebble.y };
      pebble.node.classList.add('is-dragging');
      pebble.node.setPointerCapture(event.pointerId);
    });
    pebble.node.addEventListener('pointermove', moveCoverDrag);
    pebble.node.addEventListener('pointerup', event => { moveCoverDrag(event); endCoverDrag(event); });
    pebble.node.addEventListener('pointercancel', endCoverDrag);
    pebble.node.addEventListener('lostpointercapture', endCoverDrag);
    pebble.node.addEventListener('dragstart', event => event.preventDefault());
  });
  layoutCover();
  new ResizeObserver(layoutCover).observe(cover);

  // A started journey must actually reach the viewport before the bag appears.
  function updateBagVisibility() {
    bagButton.hidden = !state.started || state.ended || journey.hidden ||
      firstRoad.getBoundingClientRect().top >= window.innerHeight;
  }
  window.addEventListener('scroll', updateBagVisibility, { passive: true });
  window.addEventListener('resize', updateBagVisibility);

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
    for (const sound of Object.values(sounds)) {
      if (sound) sound.muted = !soundOn;
    }
    soundToggle.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    soundToggle.setAttribute('aria-pressed', String(!soundOn));
    soundToggle.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Unmute sound');
    if (soundOn) resumeBgm();
    else {
      stopSound(sounds.bgm);
      // Do not resume an old short effect when sound is turned back on.
      for (const sound of Object.values(sounds)) {
        if (sound !== sounds.bgm) stopSound(sound, true);
      }
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
      behavior: prefersReducedMotion() ? 'instant' : 'smooth',
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
    ghost.offsetWidth; // Apply the starting position before the CSS transition.
    const moveX = bagRect.left - pebbleRect.left + (bagRect.width - pebbleRect.width) / 2;
    const moveY = bagRect.top - pebbleRect.top + (bagRect.height - pebbleRect.height) / 2;
    ghost.style.transform = `translate(${moveX}px, ${moveY}px) scale(0.2)`;
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

  // Pick up a pebble and remember it, even if it is released later.
  function pickUp(brick) {
    if (!canPickUp(brick) || state.selectedBricks.length >= state.capacity) return;
    animatePickup(brick);
    state.selectedBricks.push(brick);
    state.pickedBricks.push(brick);
    playSound(sounds.pickUp);
    brick.button.classList.add('picked');
    render();
    announce(`Picked up. ${state.selectedBricks.length} pebbles in your bag.`);
  }

  bricks.forEach(brick => {
    brick.button.addEventListener('click', () => {
      if (!canPickUp(brick)) return;
      if (state.selectedBricks.length >= state.capacity) openBag(brick);
      else pickUp(brick);
      // A picked button becomes hidden; retain a useful keyboard focus target.
      if (!dialog.open && state.pickedBricks.includes(brick)) {
        const next = bricks.find(candidate => candidate.stage === brick.stage && canPickUp(candidate));
        let focusTarget = checkpoints[state.stage - 1].querySelector('.continue-button');
        if (next) focusTarget = next.button;
        focusTarget.focus({ preventScroll: true });
      }
    });
  });

  // Build the bag and checkpoint lists without changing the road buttons.
  function fillCollection(list, releaseAction = null) {
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
        button.addEventListener('click', () => releaseAction(brick, row));
        row.append(button);
      }
      list.append(row);
    });
  }

  // Update the bag count, road visibility, and current checkpoint.
  function render() {
    document.querySelector('#help-toggle').hidden = !state.started || state.ended || journey.hidden;
    document.querySelector('#bag-count').textContent =
      `${state.selectedBricks.length} ${state.selectedBricks.length === 1 ? 'PEBBLE' : 'PEBBLES'}`;
    updateBagVisibility();
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
      const allowed = count <= limits[index];
      const continueButton = checkpoint.querySelector('.continue-button');
      continueButton.disabled = !allowed;
      const message = checkpoint.querySelector('.checkpoint-status');
      if (allowed) {
        message.textContent = `${count} carried. You can continue.`;
      } else {
        message.textContent = `Release ${count - limits[index]} to continue. You are carrying ${count}.`;
      }
      fillCollection(checkpoint.querySelector('.collection-list'), (brick, card) => {
        if (!activeCheckpoint(number)) return;
        const focusIndex = state.selectedBricks.indexOf(brick);
        if (!release(brick)) return;
        animateRelease(card);
        render();
        const buttons = checkpoint.querySelectorAll('.collection-list button:not(:disabled)');
        let focusTarget = continueButton;
        if (buttons.length > 0) {
          focusTarget = buttons[Math.min(focusIndex, buttons.length - 1)];
        }
        focusTarget.focus({ preventScroll: true });
        announce('Released. Your bag is a little lighter.');
      });
    });
  }

  // Release a pebble. The pickup history still prevents collecting it again.
  function release(brick) {
    if (!state.started || state.ended || !state.selectedBricks.includes(brick)) return false;
    state.selectedBricks = state.selectedBricks.filter(selected => selected !== brick);
    playSound(sounds.letGo);
    return true;
  }

  // Offer an exchange when the bag is full; closing it leaves the bag unchanged.
  function openBag(incoming = null) {
    if (!state.started || state.ended || dialog.open) return;
    state.pendingBrick = incoming;
    document.querySelector('#bag-title').textContent = incoming ? 'YOUR BAG IS FULL' : 'YOUR BAG';
    document.querySelector('#bag-description').textContent = incoming
      ? `New wish: ${incoming.wish} Release one current pebble to make room, or leave this one behind.`
      : 'These are the wishes you are carrying. You can release them at the current checkpoint.';
    document.querySelector('#bag-close').textContent = incoming ? 'LEAVE THIS PEBBLE BEHIND' : 'CLOSE BAG';
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
  dialog.addEventListener('close', () => {
    // A previous close event may be queued when another dialog is opened.
    if (!dialog.open) state.pendingBrick = null;
  });

  // Only the current checkpoint can change the journey.
  function activeCheckpoint(number) {
    return state.started && !state.ended && state.stage === number;
  }

  // Continue to the next road, or choose the ending from the final bag count.
  function continueJourney(number) {
    if (!activeCheckpoint(number)) return;
    const count = state.selectedBricks.length;
    if (number === 3) {
      if (count === 1) finish('one-pebble');
      else if (count === 0) finish('empty-handed');
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
      if (activeCheckpoint(index + 1)) finish('stopped-here');
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
    resumeBgm();
    render();
    // Keep the existing href="#life-road" anchor navigation.
  });

  // Show the appropriate ending, keeping its current wording.
  function finish(outcome) {
    if (!state.started || state.ended) return;
    const reachedDestination = outcome === 'one-pebble' || outcome === 'empty-handed';
    if (reachedDestination && (state.stage !== 3 || state.selectedBricks.length > limits[2])) return;
    if (outcome === 'one-pebble' && state.selectedBricks.length !== 1) return;
    if (outcome === 'empty-handed' && state.selectedBricks.length !== 0) return;
    state.ended = true;
    stopSound(sounds.bgm, true);
    playSound(reachedDestination ? sounds.success : sounds.failure);
    if (dialog.open) closeBag();
    clearTimeout(statusTimer);
    status.textContent = '';
    endingTitle.textContent = '';
    endingContent.replaceChildren();

    const addParagraph = (text, nextLine, emphasis) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      if (nextLine) paragraph.append(document.createElement('br'), document.createTextNode(nextLine));
      if (emphasis) {
        const element = document.createElement(emphasis);
        element.append(...paragraph.childNodes);
        paragraph.append(element);
      }
      endingContent.append(paragraph);
    };
    const addPebbles = featured => {
      const collection = document.createElement('ul');
      collection.className = featured ? 'collection-list ending-featured' : 'collection-list';
      fillCollection(collection);
      endingContent.append(collection);
    };

    if (outcome === 'one-pebble') {
      endingTitle.textContent = 'YOU REACHED THE END.';
      addParagraph("Congratulations! I'm so happy to see you at the finish line!", null, 'strong');
      addParagraph('You must have walked a long, long, long way to get here...');
      addParagraph("When we're young, we keep adding things to our lives.", 'But sooner or later, time makes us learn how to subtract.');
      addParagraph("Feels much lighter with only one pebble, doesn't it?");
      addPebbles(true);
      addParagraph("See! There really aren't that many things you can't let go of.", "Isn't being alive enough?");
      addParagraph("That's life. Once you let go of something, it will never come back.", null, 'strong');
      addParagraph('Now take what matters most to you,', 'and go live a happy life with it!!!');
    } else if (outcome === 'stopped-here') {
      endingTitle.textContent = 'YOU CHOSE TO STOP HERE.';
      addParagraph("I'm sorry you stopped here :(", null, 'strong');
      addParagraph('You ended your own life with your own hands.', null, 'strong');
      addParagraph('Were all those things really too heavy to let go of?');
      if (state.selectedBricks.length) addPebbles();
      addParagraph('Every weight you carry in life is a choice you made yourself.');
      addParagraph('You came all this way — tired, struggling, but still moving forward.');
      addParagraph("BUT are there really that many things you just can't let go of?", null, 'strong');
      addParagraph('If you keep fighting yourself your whole life,', "will you really end up with the PERFECT life you've been chasing???", 'strong');
    } else {
      endingTitle.textContent = 'YOU REACHED THE END EMPTY-HANDED.';
      addParagraph('OMG — you actually made it here empty-handed!', null, 'strong');
      addParagraph('Congratulations!!!');
      addParagraph('You unlocked the hidden ending!', null, 'strong');
      addParagraph("(TBH, even the creator didn't expect anyone to actually let go of EVERYTHING. TAT)", null, 'em');
      addParagraph('After all the ups and downs of your life,', 'you chose to come with nothing and leave with nothing.');
      addParagraph("You've let go of it all.", "There's nothing left that you can't put down anymore.");
      addParagraph('So go for it!');
      addParagraph('Live boldly. Live freely.', null, 'strong');
    }

    render();
    journey.hidden = true;
    ending.hidden = false;
    visit(ending);
  }

  // Reset the journey while keeping the user's sound preference.
  document.querySelector('#play-again').addEventListener('click', () => {
    Object.values(sounds).forEach(sound => stopSound(sound, true));
    if (dialog.open) closeBag();
    state = initialState();
    bricks.forEach(brick => brick.button.classList.remove('picked'));
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
