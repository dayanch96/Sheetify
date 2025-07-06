function localizeHtmlPage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const message = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
    if (message) el.textContent = message;
  });
}

const DEFAULT_SETTINGS = {
  playbackMode: 'pause',
  rememberVolume: true,
  rememberPlaybackSpeed: true,
  reduceRefreshRate: false,
  playPauseHotkeysEnabled: true,
  seekHotkeysEnabled: true,
  volumeHotkeysEnabled: true,
  forwardSeekTime: 5,
  backwardSeekTime: 5
};

async function initializeSettings() {
  const settings = await new Promise(resolve => {
    chrome.storage.local.get(DEFAULT_SETTINGS, resolve);
  });

  document.querySelectorAll('[data-storage-key]').forEach(element => {
    const key = element.dataset.storageKey;
    const value = settings[key];
    
    if (element.type === 'checkbox') {
      element.checked = value;
    } else if (element.classList.contains('number-input')) {
      element.value = value;
    }
  });

  document.querySelectorAll('.segmented-control[data-storage-key]').forEach(group => {
    const key = group.dataset.storageKey;
    const value = settings[key];
    
    group.querySelectorAll('.segment').forEach(segment => {
      segment.classList.toggle('active', segment.dataset.value === value);
    });
  });

  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const hintsMap = {
    playPause: isMac ? '⌥ + Space' : 'Ctrl + Space',
    seek: isMac ? '⌥ + ←/→' : 'Ctrl + ←/→',
    volume: isMac ? '⌥ + ↑/↓' : 'Ctrl + ↑/↓'
  };

  document.querySelectorAll('[data-hint-key]').forEach(el => {
    const key = el.getAttribute('data-hint-key');
    if (key && hintsMap[key]) {
      el.textContent = `(${hintsMap[key]})`;
    }
  });
}

function saveSettings() {
  const settings = {};

  document.querySelectorAll('[data-storage-key]').forEach(element => {
    const key = element.dataset.storageKey;

    if (element.type === 'checkbox') {
      settings[key] = element.checked;
    } else if (element.classList.contains('number-input')) {
      settings[key] = parseInt(element.value) || DEFAULT_SETTINGS[key];
    }
  });

  document.querySelectorAll('.segmented-control[data-storage-key]').forEach(group => {
    const key = group.dataset.storageKey;
    const activeSegment = group.querySelector('.segment.active');
    if (activeSegment) {
      settings[key] = activeSegment.dataset.value;
    }
  });

  if (settings.forwardSeekTime) {
    settings.forwardSeekTime = Math.max(1, Math.min(60, settings.forwardSeekTime));
  }
  if (settings.backwardSeekTime) {
    settings.backwardSeekTime = Math.max(1, Math.min(60, settings.backwardSeekTime));
  }

  chrome.storage.local.set(settings);
}

document.addEventListener('DOMContentLoaded', async () => {
  localizeHtmlPage();

  const manifest = chrome.runtime.getManifest();
  const versionNumber = document.getElementById('version-number');
  if (versionNumber && manifest.version) {
    versionNumber.textContent = `v${manifest.version}`;
  }

  const buttons = document.querySelectorAll('.tabs button');
  const sections = document.querySelectorAll('.section');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      button.classList.add('active');
      const sectionId = button.id.replace('btn-', '');
      document.getElementById(sectionId).classList.add('active');
    });
  });

  await initializeSettings();

  document.querySelectorAll('.segmented-control').forEach(group => {
    group.addEventListener('click', e => {
      if (e.target.classList.contains('segment')) {
        group.querySelectorAll('.segment').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        saveSettings();
      }
    });
  });

  document.querySelectorAll('input[type="checkbox"][data-storage-key]').forEach(checkbox => {
    checkbox.addEventListener('change', saveSettings);
  });

  document.querySelectorAll('.number-input').forEach(input => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '');
    });

    input.addEventListener('blur', () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val)) val = DEFAULT_SETTINGS[input.dataset.storageKey];
      val = Math.max(1, Math.min(60, val));
      input.value = val;
      saveSettings();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });

  document.querySelectorAll('[data-url]').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.getAttribute('data-url');
      if (!url) return;

      if (url.startsWith('mailto:')) {
        location.href = url;
      } else {
        chrome.tabs.create({ url });
      }
    });
  });
});