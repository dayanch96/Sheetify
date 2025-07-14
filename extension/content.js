(() => {
  'use strict';

  const cachedPS = {
    rememberVolume: true,
    rememberPlaybackSpeed: true,
    playPauseHotkeysEnabled: true,
    reduceRefreshRate: false,
    seekHotkeysEnabled: true,
    volumeHotkeysEnabled: true,
    forwardSeekTime: 5,
    backwardSeekTime: 5,
    playbackMode: 'pause',
  };

  async function initCachedPS() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        if (items) {
          if ('rememberVolume' in items) cachedPS.rememberVolume = items.rememberVolume;
          if ('rememberPlaybackSpeed' in items) cachedPS.rememberPlaybackSpeed = items.rememberPlaybackSpeed;
          if ('playPauseHotkeysEnabled' in items) cachedPS.playPauseHotkeysEnabled = items.playPauseHotkeysEnabled;
          if ('reduceRefreshRate' in items) cachedPS.reduceRefreshRate = items.reduceRefreshRate;
          if ('seekHotkeysEnabled' in items) cachedPS.seekHotkeysEnabled = items.seekHotkeysEnabled;
          if ('volumeHotkeysEnabled' in items) cachedPS.volumeHotkeysEnabled = items.volumeHotkeysEnabled;
          if ('forwardSeekTime' in items) cachedPS.forwardSeekTime = parseInt(items.forwardSeekTime, 10) || 5;
          if ('backwardSeekTime' in items) cachedPS.backwardSeekTime = parseInt(items.backwardSeekTime, 10) || 5;
          if ('playbackMode' in items) cachedPS.playbackMode = items.playbackMode;
        }
        resolve();
      });
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in cachedPS) {
        if (key.includes('Time')) {
          cachedPS[key] = parseInt(newValue, 10) || 5;
        } else {
          cachedPS[key] = newValue;
        }
      }
    }
  });

  const playerConfig = {
    minWidth: 300,
    minHeight: 40,
    defaultBottom: '20px',
    defaultRight: '100px',
    audioWidthOffset: 70,
    resizeHandleSize: 16,
    debounceMs: 200,
    playerBg: '#222',
    waveColor: '#ddd',
    progressColor: '#ff8c00',
    cursorColor: '#ff8c00',
    barWidth: 2,
    barHeight: 0.8,
    barGap: 2,
    barRadius: 2,
    cursorWidth: 1,
    responsive: true,
    volumeBarWidth: 6,
    volumeBarColor: '#ff8c00',
    volumeBarBg: '#555'
  };

  class PlayerStateManager {
    #storage = chrome.storage.local;

    async getSetting(key, defaultValue) {
      return new Promise((resolve) => {
        this.#storage.get(key, (items) => {
          resolve(key in items ? items[key] : defaultValue);
        });
      });
    }

    loadVolume(rememberVolume) {
      return new Promise((resolve) => {
        if (!rememberVolume) {
          resolve(0.8);
          return;
        }

        this.#storage.get('inlineAudioPlayerVolume', (items) => {
          resolve(items.inlineAudioPlayerVolume !== undefined ? 
            parseFloat(items.inlineAudioPlayerVolume) : 0.8);
        });
      });
    }

    loadSpeed(rememberPlaybackSpeed) {
      return new Promise((resolve) => {
        if (!rememberPlaybackSpeed) {
          resolve(1);
          return;
        }

        this.#storage.get('inlineAudioPlayerSpeed', (items) => {
          resolve(items.inlineAudioPlayerSpeed !== undefined ? 
            parseFloat(items.inlineAudioPlayerSpeed) : 1);
        });
      });
    }

    saveVolume(volume, rememberVolume) {
      if (rememberVolume) {
        this.#storage.set({ inlineAudioPlayerVolume: volume });
      }
    }

    saveSpeed(speed, rememberPlaybackSpeed) {
      if (rememberPlaybackSpeed) {
        this.#storage.set({ inlineAudioPlayerSpeed: speed });
      }
    }

    loadPlayerState() {
      return new Promise((resolve) => {
        this.#storage.get('inlineAudioPlayerState', (items) => {
          try {
            resolve(items.inlineAudioPlayerState ? JSON.parse(items.inlineAudioPlayerState) : null);
          } catch (e) {
            console.error('Error loading player state:', e);
            resolve(null);
          }
        });
      });
    }

    savePlayerState(state) {
      this.#storage.set({ inlineAudioPlayerState: JSON.stringify(state) });
    }
  }

  class PlayerUI {
    #elements = {};
    #config = playerConfig;

    constructor() {
      this.#createStylesheet();
      this.#initElements();
    }

    #createStylesheet() {
      const styleSheet = document.createElement('style');
      styleSheet.textContent = this.#getStyles();
      document.head.appendChild(styleSheet);
    }

    #getStyles() {
      return `
        .player-box {
          position: fixed;
          bottom: ${this.#config.defaultBottom};
          right: ${this.#config.defaultRight};
          background: ${this.#config.playerBg};
          color: white;
          padding: 0;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 9999;
          display: none;
          align-items: center;
          gap: 8px;
          user-select: none;
          flex-wrap: nowrap;
          width: 520px;
          height: 60px;
          min-width: ${this.#config.minWidth}px;
          min-height: ${this.#config.minHeight}px;
          box-sizing: border-box;
          flex-direction: row;
          flex-shrink: 0;
          flex-grow: 0;
        }
        .drag-handle {
          width: 20px;
          height: 100%;
          cursor: grab;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 4px;
          padding-left: 2px;
          user-select: none;
        }
        .drag-handle .drag-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background-color: white;
          opacity: 0.7;
          margin-left: 4px;
        }
        .drag-handle.dragging {
          cursor: grabbing;
        }
        .volume-container {
          width: ${this.#config.volumeBarWidth}px;
          height: 80%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          cursor: pointer;
          margin: 0 4px;
          position: relative;
        }
        .volume-bar {
          width: 100%;
          height: 100%;
          background: ${this.#config.volumeBarBg};
          border-radius: 3px;
          position: relative;
          flex-grow: 1;
          overflow: hidden;
        }
        .volume-level {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          background: ${this.#config.volumeBarColor};
          border-radius: 3px;
          transition: height 0.1s;
        }
        .resize-corner {
          position: absolute;
          right: 0;
          bottom: 0;
          width: ${this.#config.resizeHandleSize}px;
          height: ${this.#config.resizeHandleSize}px;
          cursor: se-resize;
        }
        .resize-corner .drag-dot {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background-color: white;
          opacity: 0.7;
        }
        .resize-corner .dot-corner {
          right: 2px;
          bottom: 2px;
        }
        .resize-corner .dot-above {
          right: 2px;
          bottom: 8px;
        }
        .resize-corner .dot-left {
          right: 8px;
          bottom: 2px;
        }
        .resize-corner.resizing {
          cursor: se-resize;
        }
        .waveform-container {
          width: calc(100% - ${this.#config.audioWidthOffset}px);
          height: 100%;
          user-select: text;
          position: relative;
          transition: opacity 0.3s ease;
        }
        .wavesurfer-time {
          position: absolute;
          bottom: 0px;
          font-size: 10px;
          color: white;
          background: ${this.#config.playerBg};
          border-radius: 3px;
          pointer-events: none;
          z-index: 10;
        }
        .wavesurfer-time.current {
          left: 0px;
          text-align: left;
        }
        .wavesurfer-time.duration {
          right: 0px;
          text-align: right;
        }
        .wavesurfer-loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 24px;
          height: 24px;
          border: 3px SOLID #ff8c00;
          border-top: 3px SOLID transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          z-index: 10;
        }
        @keyframes spin {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .wavesurfer-error {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          max-width: 90%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          background: #ff4d4d;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          padding: 10px;
          border-radius: 8px;
          z-index: 11;
          text-align: center;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .controls {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 0 4px;
          margin-right: 20px;
        }
        .play-pause-btn, .speed-btn {
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          clip-path: circle(50% at 50% 50%);
          padding: 3px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: bold;
          outline: none;
        }
        .play-pause-btn img {
          width: 16px;
          height: 16px;
          display: block;
        }
        .play-pause-btn:hover, .play-pause-btn:focus-visible, .speed-btn:hover, .speed-btn:focus-visible {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          transition: background-color 0.2s ease;
          outline: none;
        }
        .speed-menu {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: none;
          background: ${this.#config.playerBg};
          border-radius: 4px;
          padding: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          z-index: 10000;
          flex-direction: row;
          gap: 4px;
        }
        .speed-menu.above {
          bottom: 100%;
          margin-bottom: 4px;
        }
        .speed-menu.below {
          top: 100%;
          margin-top: 4px;
        }
        .speed-option {
          padding: 4px 8px;
          border-radius: 2px;
          cursor: pointer;
          font-size: 12px;
        }
        .speed-option:hover {
          background: #333;
        }
        .speed-option.selected {
          color: ${this.#config.progressColor};
        }
        .close-btn {
          position: absolute;
          top: 1px;
          right: 1px;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          z-index: 10;
          width: 14px;
          height: 14px;
        }
        .close-btn img {
          width: 14px;
          height: 14px;
          display: block;
        }
      `;
    }

    #createIcon(name, className = '', display = 'block') {
      const img = document.createElement('img');
      const svgPath = chrome.runtime.getURL(`img/player/${name}.svg`);
      img.src = svgPath;
      img.className = className;
      img.style.display = display;
      img.draggable = false;
      return img;
    }

    #initElements() {
      this.#elements = {
        playerBox: document.createElement('div'),
        dragHandle: document.createElement('div'),
        volumeContainer: document.createElement('div'),
        volumeBar: document.createElement('div'),
        volumeLevel: document.createElement('div'),
        waveformContainer: document.createElement('div'),
        controlsContainer: document.createElement('div'),
        playPauseBtn: document.createElement('button'),
        speedBtn: document.createElement('button'),
        speedMenu: document.createElement('div'),
        speedWrapper: document.createElement('div'),
        closeBtn: document.createElement('button'),
        resizeCorner: document.createElement('div')
      };

      Object.entries({
        playerBox: 'player-box',
        dragHandle: 'drag-handle',
        volumeContainer: 'volume-container',
        volumeBar: 'volume-bar',
        volumeLevel: 'volume-level',
        waveformContainer: 'waveform-container',
        controlsContainer: 'controls',
        playPauseBtn: 'play-pause-btn',
        speedBtn: 'speed-btn',
        speedMenu: 'speed-menu',
        speedWrapper: 'speed-wrapper',
        closeBtn: 'close-btn',
        resizeCorner: 'resize-corner'
      }).forEach(([key, className]) => {
        this.#elements[key].className = className;
      });

      this.#setupDragHandle();
      this.#setupResizeCorner();
      this.#setupPlayPauseButton();
      this.#setupSpeedControls();
      this.#setupVolumeControl();
      this.#assemblePlayer();
    }

    #setupDragHandle() {
      for (let i = 0; i < 4; i++) {
        const dot = document.createElement('div');
        dot.className = 'drag-dot';
        this.#elements.dragHandle.appendChild(dot);
      }
    }

    #setupResizeCorner() {
      ['dot-corner', 'dot-above', 'dot-left'].forEach(className => {
        const dot = document.createElement('div');
        dot.className = `drag-dot ${className}`;
        this.#elements.resizeCorner.appendChild(dot);
      });
    }

    #setupPlayPauseButton() {
      const playIcon = this.#createIcon('play', 'play-icon');
      const pauseIcon = this.#createIcon('pause', 'pause-icon', 'none');
      this.#elements.playPauseBtn.appendChild(playIcon);
      this.#elements.playPauseBtn.appendChild(pauseIcon);
    }

    #setupSpeedControls() {
      this.#elements.speedBtn.textContent = '1x';

      const speeds = [0.5, 1, 1.5, 2, 3];
      speeds.forEach(speed => {
        const option = document.createElement('div');
        option.className = 'speed-option';
        option.textContent = `${speed}x`;
        option.dataset.speed = speed;
        this.#elements.speedMenu.appendChild(option);
      });

      const wrapper = this.#elements.speedWrapper;
      wrapper.style.position = 'relative';
      wrapper.style.display = 'flex';
      wrapper.append(this.#elements.speedBtn, this.#elements.speedMenu);
      this.#elements.controlsContainer.appendChild(wrapper);
    }

    #setupVolumeControl() {
      this.#elements.volumeBar.appendChild(this.#elements.volumeLevel);
      this.#elements.volumeContainer.appendChild(this.#elements.volumeBar);
    }

    #assemblePlayer() {
      this.#elements.closeBtn.appendChild(this.#createIcon('close'));
      this.#elements.controlsContainer.appendChild(this.#elements.playPauseBtn);
      this.#elements.playerBox.append(
        this.#elements.dragHandle, this.#elements.volumeContainer,
        this.#elements.waveformContainer, this.#elements.controlsContainer,
        this.#elements.resizeCorner, this.#elements.closeBtn
      );

      document.body.appendChild(this.#elements.playerBox);
    }

    getElement(name) {
      return this.#elements[name];
    }

    getAllElements() {
      return this.#elements;
    }

    updateVolumeBar(volume) {
      this.#elements.volumeLevel.style.height = `${volume * 100}%`;
    }

    updateSpeedUI(speed, selectedSpeed) {
      this.#elements.speedBtn.textContent = `${speed}x`;
      this.#elements.speedMenu.querySelectorAll('.speed-option').forEach(option => {
        const optionSpeed = parseFloat(option.dataset.speed);
        option.classList.toggle('selected', optionSpeed === selectedSpeed);
      });
    }

    updateTimeDisplay(currentTime, duration) {
      const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
      };

      const currentTimeEl = this.#elements.waveformContainer.querySelector('.wavesurfer-time.current');
      const durationEl = this.#elements.waveformContainer.querySelector('.wavesurfer-time.duration');

      if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
      if (durationEl) durationEl.textContent = formatTime(duration);
    }

    showLoadingIndicator() {
      this.#elements.waveformContainer.style.opacity = '0';

      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'wavesurfer-loading';
      this.#elements.playerBox.appendChild(loadingIndicator);

      return loadingIndicator;
    }

    hideLoadingIndicator(indicator) {
      indicator?.remove();
      this.#elements.waveformContainer.style.opacity = '1';
    }

    showErrorMessage(message) {
      this.hideErrorMessage();

      const text = chrome.i18n.getMessage(message) || message;
      const errorElement = document.createElement('div');
      errorElement.className = 'wavesurfer-error';
      errorElement.textContent = text;
      this.#elements.waveformContainer.appendChild(errorElement);

      setTimeout(() => {
        errorElement.style.opacity = '1';
      }, 0);
    }

    hideErrorMessage() {
      const existingErrors = this.#elements.waveformContainer.querySelectorAll('.wavesurfer-error');
      existingErrors.forEach(el => el.remove());
    }

    showPlayer() {
      this.#elements.playerBox.style.display = 'flex';
    }

    hidePlayer() {
      this.#elements.playerBox.style.display = 'none';
    }

    showSpeedMenu(btnRect) {
      this.#elements.speedMenu.classList.remove('above', 'below');

      if (btnRect.top > 30) {
        this.#elements.speedMenu.classList.add('above');
      } else {
        this.#elements.speedMenu.classList.add('below');
      }

      this.#elements.speedMenu.style.display = 'flex';
    }

    hideSpeedMenu() {
      this.#elements.speedMenu.style.display = 'none';
    }

    updatePlayPauseIcons(isPlaying) {
      const playIcon = this.#elements.playPauseBtn.querySelector('.play-icon');
      const pauseIcon = this.#elements.playPauseBtn.querySelector('.pause-icon');

      if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
      if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';
    }

    updateWaveformSize(width, height) {
      this.#elements.playerBox.style.width = `${width}px`;
      this.#elements.playerBox.style.height = `${height}px`;
      this.#elements.waveformContainer.style.width = `${width - this.#config.audioWidthOffset}px`;
    }

    updatePlayerPosition(top, left) {
      this.#elements.playerBox.style.top = `${top}px`;
      this.#elements.playerBox.style.left = `${left}px`;
      this.#elements.playerBox.style.bottom = 'auto';
      this.#elements.playerBox.style.right = 'auto';
    }

    setDefaultPosition() {
      this.#elements.playerBox.style.bottom = this.#config.defaultBottom;
      this.#elements.playerBox.style.right = this.#config.defaultRight;
    }

    setDragHandleState(dragging) {
      this.#elements.dragHandle.classList.toggle('dragging', dragging);
    }

    setResizeCornerState(resizing) {
      this.#elements.resizeCorner.classList.toggle('resizing', resizing);
    }

    createTimeDisplay() {
      const oldCurrent = this.#elements.waveformContainer.querySelector('.wavesurfer-time.current');
      const oldDuration = this.#elements.waveformContainer.querySelector('.wavesurfer-time.duration');

      if (oldCurrent) oldCurrent.remove();
      if (oldDuration) oldDuration.remove();

      const currentTimeEl = document.createElement('div');
      currentTimeEl.className = 'wavesurfer-time current';
      currentTimeEl.textContent = '0:00';

      const durationEl = document.createElement('div');
      durationEl.className = 'wavesurfer-time duration';
      durationEl.textContent = '0:00';

      this.#elements.waveformContainer.appendChild(currentTimeEl);
      this.#elements.waveformContainer.appendChild(durationEl);
    }
  }

  class PlayerEventManager {
    #ui;
    #player;
    #stateManager;
    #dragX = 0;
    #dragY = 0;
    #resizeStartX = 0;
    #resizeStartY = 0;
    #startWidth = 0;
    #startHeight = 0;
    #isDragging = false;
    #isResizing = false;
    #isDraggingVolume = false;

    constructor(ui, player, stateManager) {
      this.#ui = ui;
      this.#player = player;
      this.#stateManager = stateManager;
      this.#setupEventListeners();
    }

    #setupEventListeners() {
      this.#setupDragAndResize();
      this.#setupVolumeControl();
      this.#setupSpeedControl();
      this.#setupCloseButton();
      this.#setupLinkInterception();
      this.#setupHotkeys();
    }

    #setupDragAndResize() {
      const debouncedSaveState = this.#debounce(() => {
        const rect = this.#ui.getElement('playerBox').getBoundingClientRect();
        this.#stateManager.savePlayerState({
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`
        });
      }, playerConfig.debounceMs);

      this.#ui.getElement('dragHandle').addEventListener('mousedown', (e) => {
        this.#isDragging = true;
        const rect = this.#ui.getElement('playerBox').getBoundingClientRect();
        this.#dragX = e.clientX - rect.left;
        this.#dragY = e.clientY - rect.top;
        this.#ui.setDragHandleState(true);
        e.preventDefault();
      });

      this.#ui.getElement('resizeCorner').addEventListener('mousedown', (e) => {
        this.#isResizing = true;
        this.#resizeStartX = e.clientX;
        this.#resizeStartY = e.clientY;
        const rect = this.#ui.getElement('playerBox').getBoundingClientRect();
        this.#startWidth = rect.width;
        this.#startHeight = rect.height;
        this.#ui.setResizeCornerState(true);
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (this.#isDragging) {
          const top = Math.max(0, Math.min(e.clientY - this.#dragY, window.innerHeight - this.#ui.getElement('playerBox').offsetHeight));
          const left = Math.max(0, Math.min(e.clientX - this.#dragX, window.innerWidth - this.#ui.getElement('playerBox').offsetWidth));
          this.#ui.updatePlayerPosition(top, left);
        } else if (this.#isResizing) {
          const maxWidth = window.innerWidth - parseFloat(this.#ui.getElement('playerBox').style.left || 0);
          const maxHeight = window.innerHeight - parseFloat(this.#ui.getElement('playerBox').style.top || 0);
          const newWidth = Math.max(playerConfig.minWidth, Math.min(this.#startWidth + (e.clientX - this.#resizeStartX), maxWidth));
          const newHeight = Math.max(playerConfig.minHeight, Math.min(this.#startHeight + (e.clientY - this.#resizeStartY), maxHeight));
          this.#ui.updateWaveformSize(newWidth, newHeight);

          if (cachedPS.reduceRefreshRate) {
            this.#ui.getElement('waveformContainer').style.opacity = '0';
          } else {
            this.#player.updateWaveformSize();
          }
        }
      });

      window.addEventListener('mouseup', () => {
        if (this.#isDragging) {
          this.#isDragging = false;
          this.#ui.setDragHandleState(false);
          debouncedSaveState();
        } else if (this.#isResizing) {
          this.#isResizing = false;
          this.#ui.setResizeCornerState(false);

          if (cachedPS.reduceRefreshRate) {
            this.#ui.getElement('waveformContainer').style.opacity = '1';
            this.#player.updateWaveformSize();
          }

          debouncedSaveState();
        }
      });
    }

    #setupVolumeControl() {
      const handleVolumeChange = (e) => {
        const rect = this.#ui.getElement('volumeBar').getBoundingClientRect();
        const y = e.clientY ?? e.touches?.[0]?.clientY;
        let volume = 1 - (y - rect.top) / rect.height;
        volume = Math.max(0, Math.min(1, volume));

        this.#player.setVolume(volume);
        this.#ui.updateVolumeBar(volume);
      };

      const startDrag = (e) => {
        this.#isDraggingVolume = true;
        handleVolumeChange(e);
        e.preventDefault();
        e.stopPropagation();
      };

      const onDrag = (e) => {
        if (!this.#isDraggingVolume) return;
        handleVolumeChange(e);
      };

      const stopDrag = () => {
        this.#isDraggingVolume = false;
      };

      this.#ui.getElement('volumeBar').addEventListener('mousedown', startDrag);
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', stopDrag);

      this.#ui.getElement('volumeContainer').addEventListener('click', (e) => {
        handleVolumeChange(e);
        e.preventDefault();
        e.stopPropagation();
      });

      this.#ui.getElement('volumeBar').addEventListener('mousedown', (e) => e.stopPropagation());
    }

    #setupSpeedControl() {
      const speedBtn = this.#ui.getElement('speedBtn');
      const speedMenu = this.#ui.getElement('speedMenu');

      speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (speedMenu.style.display === 'flex') {
          this.#ui.hideSpeedMenu();
        } else {
          const rect = speedBtn.getBoundingClientRect();
          this.#ui.showSpeedMenu(rect);
        }
      });

      speedMenu.querySelectorAll('.speed-option').forEach(option => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const speed = parseFloat(option.dataset.speed);
          this.#player.setPlaybackSpeed(speed);
          this.#ui.hideSpeedMenu();
        });
      });

      document.addEventListener('click', () => this.#ui.hideSpeedMenu());
    }

    #setupCloseButton() {
      this.#ui.getElement('closeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.#player.destroy();
        this.#ui.hidePlayer();
      });
    }

    #setupLinkInterception() {
      document.addEventListener('click', async (e) => {
        const a = e.target.closest('a');
        if (!a) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const href = a.href;
        const isAudio = await this.#player.isAudioUrl(href);

        if (isAudio) {
          await this.#player.loadAudio(href);
          this.#ui.showPlayer();

          if (!this.#ui.getElement('playerBox').style.top && !this.#ui.getElement('playerBox').style.left &&
              !this.#ui.getElement('playerBox').style.bottom && !this.#ui.getElement('playerBox').style.right) {
            this.#ui.setDefaultPosition();
          }
        } else {
          window.open(href, '_blank');
        }
      }, true);
    }

    #setupHotkeys() {
      document.addEventListener('keydown', (e) => {
        if (!this.#player.isInitialized() || !this.#ui.getElement('playerBox').style.display || this.#ui.getElement('playerBox').style.display === 'none') return;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isCtrlPressed = !isMac && (e.ctrlKey || e.key === 'Control');
        const isAltPressed = isMac && (e.altKey || e.key === 'Alt' || e.key === 'Option');

        if (cachedPS.playPauseHotkeysEnabled && (isCtrlPressed || isAltPressed) && e.code === 'Space') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          this.#player.togglePlayPause();
          return;
        }

        if (cachedPS.seekHotkeysEnabled && (isCtrlPressed || isAltPressed)) {
          if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            const offset = e.code === 'ArrowRight' ? cachedPS.forwardSeekTime : -cachedPS.backwardSeekTime;
            this.#player.seek(offset);
            return;
          }
        }

        if (cachedPS.volumeHotkeysEnabled && (isCtrlPressed || isAltPressed)) {
          if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            const currentVolume = this.#player.getVolume();
            const newVolume = e.code === 'ArrowUp' ? 
              Math.min(1, currentVolume + 0.1) : 
              Math.max(0, currentVolume - 0.1);

            this.#player.setVolume(newVolume);
            this.#ui.updateVolumeBar(newVolume);
            return;
          }
        }
      }, true);
    }

    #debounce(fn, ms) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
      };
    }
  }

  class AudioPlayer {
    #wavesurfer = null;
    #currentVolume = 0.8;
    #currentSpeed = 1;
    #ui;
    #stateManager;
    #eventManager;

    constructor() {
      this.#ui = new PlayerUI();
      this.#stateManager = new PlayerStateManager();
      this.#initialize();
    }

    async #initialize() {
      await this.#loadInitialSettings();
      this.#eventManager = new PlayerEventManager(this.#ui, this, this.#stateManager);
      this.#loadPlayerState();
    }

    async #loadInitialSettings() {
      this.#currentVolume = await this.#stateManager.loadVolume(cachedPS.rememberVolume);
      this.#currentSpeed = await this.#stateManager.loadSpeed(cachedPS.rememberPlaybackSpeed);
      this.#ui.updateVolumeBar(this.#currentVolume);
      this.#ui.updateSpeedUI(this.#currentSpeed, this.#currentSpeed);
    }

    async #loadPlayerState() {
      const state = await this.#stateManager.loadPlayerState();
      if (state) {
        const { top, left, width, height } = state;

        if (top) {
          this.#ui.getElement('playerBox').style.top = `${Math.max(0, Math.min(parseFloat(top), window.innerHeight - this.#ui.getElement('playerBox').offsetHeight))}px`;
        }
        if (left) {
          this.#ui.getElement('playerBox').style.left = `${Math.max(0, Math.min(parseFloat(left), window.innerWidth - this.#ui.getElement('playerBox').offsetWidth))}px`;
        }
        if (width) {
          this.#ui.getElement('playerBox').style.width = width;
          this.#ui.getElement('waveformContainer').style.width = `${parseInt(width) - playerConfig.audioWidthOffset}px`;
        }
        if (height) {
          this.#ui.getElement('playerBox').style.height = height;
        }

        if (!top && !left && !this.#ui.getElement('playerBox').style.bottom && !this.#ui.getElement('playerBox').style.right) {
          this.#ui.setDefaultPosition();
        }
      }
    }

    initWaveSurfer() {
      if (this.#wavesurfer) {
        this.#wavesurfer.destroy();
        this.#wavesurfer = null;
      }

      this.#wavesurfer = WaveSurfer.create({
        container: this.#ui.getElement('waveformContainer'),
        waveColor: playerConfig.waveColor,
        progressColor: playerConfig.progressColor,
        cursorColor: playerConfig.cursorColor,
        barWidth: playerConfig.barWidth,
        barHeight: playerConfig.barHeight,
        barGap: playerConfig.barGap,
        barRadius: playerConfig.barRadius,
        cursorWidth: playerConfig.cursorWidth,
        height: this.#ui.getElement('playerBox').offsetHeight,
        responsive: playerConfig.responsive,
        interact: true,
        hideScrollbar: true,
        autoCenter: true,
        dragToSeek: true,
        partialRender: true,
        normalize: false,
        splitChannels: false
      });

      this.#setupWaveSurferEvents();
    }

    #setupWaveSurferEvents() {
      this.#wavesurfer.setVolume(this.#currentVolume);
      this.#wavesurfer.setPlaybackRate(this.#currentSpeed);

      this.#wavesurfer.on('ready', () => {
        const loadingIndicator = this.#ui.showLoadingIndicator();
        this.#ui.hideLoadingIndicator(loadingIndicator);
        this.#ui.updateTimeDisplay(0, this.#wavesurfer.getDuration());
        this.#ui.updatePlayPauseIcons(this.#wavesurfer.isPlaying());
        this.#wavesurfer.play();
      });

      this.#wavesurfer.on('audioprocess', () => {
        this.#ui.updateTimeDisplay(this.#wavesurfer.getCurrentTime(), this.#wavesurfer.getDuration());
      });

      this.#wavesurfer.on('seek', () => {
        this.#ui.updateTimeDisplay(this.#wavesurfer.getCurrentTime(), this.#wavesurfer.getDuration());
      });

      this.#wavesurfer.on('click', () => {
        this.#ui.updateTimeDisplay(this.#wavesurfer.getCurrentTime(), this.#wavesurfer.getDuration());
      });

      this.#wavesurfer.on('finish', () => {
        this.#ui.updatePlayPauseIcons(false);
        this.#stateManager.getSetting('playbackMode', 'pause').then(mode => {
          if (mode === 'loop') {
            this.#wavesurfer.seekTo(0);
            this.#wavesurfer.play();
          }
        });
      });

      this.#wavesurfer.on('play', () => this.#ui.updatePlayPauseIcons(true));
      this.#wavesurfer.on('pause', () => this.#ui.updatePlayPauseIcons(false));

      this.#ui.getElement('playPauseBtn').onclick = () => this.togglePlayPause();
    }

    async loadAudio(url) {
      this.initWaveSurfer();

      if (this.#wavesurfer.getMediaElement()?.src !== url) {
        const loadingIndicator = this.#ui.showLoadingIndicator();
        this.#ui.createTimeDisplay();

        this.#wavesurfer.once('error', (error) => {
          this.#ui.hideLoadingIndicator(loadingIndicator);
          this.#ui.showErrorMessage('failedToLoadAudio');
        });

        this.#wavesurfer.once('ready', () => {
          this.#ui.hideErrorMessage();
          this.#ui.hideLoadingIndicator(loadingIndicator);
          this.#wavesurfer.setPlaybackRate(this.#currentSpeed);
          this.#wavesurfer.seekTo(0);
          this.#ui.updateTimeDisplay(0, this.#wavesurfer.getDuration());

          setTimeout(() => {
            this.updateWaveformSize();
          }, 0);
        });

        this.#wavesurfer.load(url);
      } else if (this.#wavesurfer.isPlaying()) {
        this.#wavesurfer.pause();
      } else {
        this.#wavesurfer.play();
      }

      this.#ui.showPlayer();
    }

    togglePlayPause() {
      if (this.#wavesurfer) {
        this.#wavesurfer.playPause();
      }
    }

    seek(offset) {
      if (this.#wavesurfer) {
        this.#wavesurfer.skip(offset);
      }
    }

    setVolume(volume) {
      this.#currentVolume = volume;
      this.#stateManager.saveVolume(volume, cachedPS.rememberVolume);

      if (this.#wavesurfer) {
        this.#wavesurfer.setVolume(volume);
      }
    }

    getVolume() {
      return this.#currentVolume;
    }

    setPlaybackSpeed(speed) {
      this.#currentSpeed = speed;
      this.#stateManager.saveSpeed(speed, cachedPS.rememberPlaybackSpeed);

      if (this.#wavesurfer) {
        this.#wavesurfer.setPlaybackRate(speed);
      }

      this.#ui.updateSpeedUI(speed, speed);
    }

    updateWaveformSize() {
      if (this.#wavesurfer) {
        const height = this.#ui.getElement('playerBox').offsetHeight;
        this.#wavesurfer.setOptions({ height });
      }
    }

    destroy() {
      if (this.#wavesurfer) {
        this.#wavesurfer.stop();
        this.#wavesurfer.destroy();
        this.#wavesurfer = null;
      }

      if (!cachedPS.rememberPlaybackSpeed) {
        this.#currentSpeed = 1;
        this.#stateManager.saveSpeed(1, false);
        this.#ui.updateSpeedUI(1, 1);
      }

      if (!cachedPS.rememberVolume) {
        this.#currentVolume = 0.8;
        this.#stateManager.saveVolume(0.8, false);
        this.#ui.updateVolumeBar(0.8);
      }
    }

    isInitialized() {
      return this.#wavesurfer !== null;
    }

    hasAudioExtension(url) {
      return /\.(wav|mp3|ogg|m4a|flac|aac|webm)(\?.*)?$/i.test(url);
    }

    async isAudioUrl(url) {
      if (this.hasAudioExtension(url)) return true;
      try {
        const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
        if (!resp.ok && resp.status !== 206) return false;
        const contentType = resp.headers.get('Content-Type') || '';
        return contentType.startsWith('audio/');
      } catch {
        return false;
      }
    }
  }

  initCachedPS().then(() => {
    new AudioPlayer();
  });
})();