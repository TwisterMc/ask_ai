document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('openSettings');
  const modal = document.getElementById('settingsModal');
  const saveBtn = document.getElementById('saveSettings');
  const cancelBtn = document.getElementById('cancelSettings');
  const input = document.getElementById('userApiKeyInput');
  const STORAGE_KEY = 'ask_ai_user_api_key';

  function show() {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
  }

  function hide() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  // load existing
  try {
    const existing = localStorage.getItem(STORAGE_KEY) || '';
    input.value = existing;
  } catch (e) {
    console.debug('Could not read stored API key', e);
  }

  if (openBtn) openBtn.addEventListener('click', (e) => { e.preventDefault(); show(); });
  if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); hide(); });

  if (saveBtn) saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      const val = input.value.trim();
      if (val) {
        localStorage.setItem(STORAGE_KEY, val);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      hide();
      alert('API key saved to local storage (only in this browser).');
    } catch (err) {
      console.error('Failed to save API key', err);
      alert('Failed to save API key to local storage.');
    }
  });

  // close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });

  // esc to close
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
});
