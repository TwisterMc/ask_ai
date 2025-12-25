document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("openSettings");
  const modal = document.getElementById("settingsModal");
  const saveBtn = document.getElementById("saveSettings");
  const cancelBtn = document.getElementById("cancelSettings");
  const input = document.getElementById("userApiKeyInput");
  const validateBtn = document.getElementById("validateKey");
  const clearBtn = document.getElementById("clearKeyBtn");
  const STORAGE_KEY = "ask_ai_user_api_key";

  function show() {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    input.focus();
  }

  function hide() {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  // load existing
  try {
    const existing = localStorage.getItem(STORAGE_KEY) || "";
    input.value = existing;
  } catch (e) {
    console.debug("Could not read stored API key", e);
  }

  if (openBtn)
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      show();
    });
  if (cancelBtn)
    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      hide();
    });

  if (saveBtn)
    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        const val = input.value.trim();
        if (val) {
          localStorage.setItem(STORAGE_KEY, val);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
        hide();
        alert("API key saved to local storage (only in this browser).");
      } catch (err) {
        console.error("Failed to save API key", err);
        alert("Failed to save API key to local storage.");
      }
    });
  if (clearBtn)
    clearBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const msg =
        "Clear saved API key from this browser? This will remove the key from local storage.";
      try {
        const ok = window.confirmModal
          ? await window.confirmModal.show(msg)
          : confirm(msg);
        if (ok) {
          try {
            localStorage.removeItem(STORAGE_KEY);
            input.value = "";
            alert("API key removed from local storage.");
          } catch (err) {
            console.error("Failed to clear API key", err);
            alert("Failed to clear API key.");
          }
        }
      } catch (err) {
        console.error("Confirm modal error", err);
      }
    });

  if (validateBtn)
    validateBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const key = input.value.trim();
      if (!key) {
        alert("Enter an API key to validate");
        return;
      }
      try {
        const res = await fetch("/api/validate_key", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (res.status === 200 && data.success) {
          alert("API key validated successfully");
        } else if (res.status === 403) {
          alert(
            "API key appears valid but has insufficient balance or is forbidden: " +
              (data.error || "")
          );
        } else {
          alert("Validation failed: " + (data.error || `status ${res.status}`));
        }
      } catch (err) {
        console.error("Validation error", err);
        alert("Validation request failed (network error)");
      }
    });

  // close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hide();
  });

  // esc to close
  // focus trap and ESC handling
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return hide();
    if (!modal.classList.contains("flex")) return;
    if (e.key !== "Tab") return;
    const focusable = modal.querySelectorAll(
      "a[href], button:not([disabled]), textarea, input, select"
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
});
