document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("openSettings");
  const modal = document.getElementById("settingsModal");
  const saveBtn = document.getElementById("saveSettings");
  const cancelBtn = document.getElementById("cancelSettings");
  const input = document.getElementById("userApiKeyInput");
  const validateBtn = document.getElementById("validateKey");
  const clearBtn = document.getElementById("clearKeyBtn");
  const checkBalanceBtn = document.getElementById("checkBalanceBtn");
  const balanceDisplay = document.getElementById("balanceDisplay");
  const STORAGE_KEY = "ask_ai_user_api_key";

  const statusEl = document.getElementById("settingsStatus");
  const keyValidationEl = document.getElementById("keyValidation");

  function showStatus(message, type = "info") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "text-sm mt-2";
    if (type === "success") statusEl.classList.add("text-green-700");
    else if (type === "error") statusEl.classList.add("text-red-600");
    else statusEl.classList.add("text-gray-700");
    statusEl.classList.remove("sr-only");
  }

  function showInlineValidation(message, type = "info") {
    if (!keyValidationEl) return;
    keyValidationEl.textContent = message;
    keyValidationEl.className = "text-sm";
    if (type === "success") keyValidationEl.classList.add("text-green-700");
    else if (type === "error") keyValidationEl.classList.add("text-red-600");
    else keyValidationEl.classList.add("text-gray-700");
    keyValidationEl.classList.remove("sr-only");
  }

  function show() {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    input.focus();
  }

  // basic hide implementation used internally
  const hideOriginal = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  // When hiding the modal, clear/hide any status or inline validation
  // messages so they don't persist after close. Messages should remain
  // visible while the modal is open until the user corrects them.
  const clearMessages = () => {
    try {
      if (keyValidationEl) {
        keyValidationEl.classList.add("sr-only");
      }
      if (statusEl) {
        statusEl.classList.add("sr-only");
      }
      if (balanceDisplay) {
        balanceDisplay.textContent = "";
        balanceDisplay.className = "mt-2 text-sm";
      }
    } catch (e) {
      console.debug("Could not clear settings messages", e);
    }
  };

  // update hide to clear messages on close
  function hide() {
    hideOriginal();
    clearMessages();
  }

  // load existing
  try {
    let existing = "";
    try {
      existing = localStorage.getItem(STORAGE_KEY) || "";
    } catch (e) {
      // localStorage may be unavailable (private mode / blocked). Try sessionStorage.
      try {
        existing = sessionStorage.getItem(STORAGE_KEY) || "";
      } catch (e2) {
        console.debug("Could not read stored API key from storage", e, e2);
      }
    }
    input.value = existing;
  } catch (e) {
    console.debug("Could not read stored API key", e);
  }

  // clear inline validation as user types (assumes user is attempting to
  // correct the issue). Do not auto-clear the global status (which may
  // contain higher-level information) unless explicitly validated.
  if (input) {
    input.addEventListener("input", () => {
      try {
        if (keyValidationEl && input.value.trim() !== "") {
          keyValidationEl.classList.add("sr-only");
        }
        // Enable/disable balance button based on whether there's an API key
        if (checkBalanceBtn) {
          checkBalanceBtn.disabled = !input.value.trim();
        }
      } catch (e) {}
    });
    // Initial check to enable/disable balance button
    if (checkBalanceBtn) {
      checkBalanceBtn.disabled = !input.value.trim();
    }
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
          try {
            localStorage.setItem(STORAGE_KEY, val);
            showStatus(
              "API key saved to local storage (this browser only).",
              "success",
            );
          } catch (errStorage) {
            // fallback to sessionStorage if localStorage is unavailable
            try {
              sessionStorage.setItem(STORAGE_KEY, val);
              showStatus(
                "API key saved to session storage (cleared when browser closed).",
                "success",
              );
            } catch (errSession) {
              console.error(
                "Failed to save API key to storage",
                errStorage,
                errSession,
              );
              showStatus(
                "Failed to save API key to storage — check browser privacy/settings.",
                "error",
              );
              return;
            }
          }
        } else {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch (e) {}
          try {
            sessionStorage.removeItem(STORAGE_KEY);
          } catch (e) {}
          showStatus("API key removed from storage.", "success");
        }
        hide();
        // Update API key status in main form (if available)
        if (typeof checkAndUpdateApiKeyStatus === "function") {
          checkAndUpdateApiKeyStatus();
        }
      } catch (err) {
        console.error("Failed to save API key", err);
        showStatus("Failed to save API key — unexpected error.", "error");
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
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch (e) {}
            try {
              sessionStorage.removeItem(STORAGE_KEY);
            } catch (e) {}
            input.value = "";
            showStatus("API key removed from storage.", "success");
            showInlineValidation("Cleared", "success");
            // Update API key status in main form (if available)
            if (typeof checkAndUpdateApiKeyStatus === "function") {
              checkAndUpdateApiKeyStatus();
            }
          } catch (err) {
            console.error("Failed to clear API key", err);
            showStatus("Failed to clear API key.", "error");
            showInlineValidation("Error", "error");
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
        showStatus("Enter an API key to validate", "error");
        showInlineValidation("Required", "error");
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
          showStatus("API key validated successfully", "success");
          showInlineValidation("Valid API key", "success");
        } else if (res.status === 403) {
          showStatus(
            "API key appears valid but is forbidden or out of balance",
            "error",
          );
          showInlineValidation("Insufficient balance / forbidden", "error");
        } else {
          showStatus(
            "Validation failed: " + (data.error || `status ${res.status}`),
            "error",
          );
          showInlineValidation("Invalid", "error");
        }
      } catch (err) {
        console.error("Validation error", err);
        showStatus("Validation request failed (network error)", "error");
        showInlineValidation("Network error", "error");
      }
    });

  if (checkBalanceBtn)
    checkBalanceBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const key = input.value.trim();
      if (!key) {
        if (balanceDisplay) {
          balanceDisplay.textContent = "Please enter an API key first";
          balanceDisplay.className = "mt-2 text-sm text-red-600";
        }
        return;
      }

      // Show loading state
      if (balanceDisplay) {
        balanceDisplay.textContent = "Checking balance...";
        balanceDisplay.className = "mt-2 text-sm text-gray-600";
      }
      checkBalanceBtn.disabled = true;

      try {
        const res = await fetch("/api/check_balance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({}),
        });
        const data = await res.json();

        if (res.status === 200 && data.success) {
          const balance = data.balance;
          let displayText = "";

          if (typeof balance === "object" && balance !== null) {
            // Format the balance data nicely
            if (balance.pollen !== undefined) {
              displayText = `Balance: ${balance.pollen.toFixed(4)} pollen`;
            }
            if (balance.tier) {
              displayText += ` (${balance.tier} tier)`;
            }
            if (balance.tier_pollen !== undefined) {
              displayText += ` | Tier balance: ${balance.tier_pollen.toFixed(2)}`;
            }
          } else {
            displayText = `Balance: ${JSON.stringify(balance)}`;
          }

          if (balanceDisplay) {
            balanceDisplay.textContent = displayText;
            balanceDisplay.className =
              "mt-2 text-sm text-green-700 font-semibold";
          }
        } else if (res.status === 401) {
          if (balanceDisplay) {
            balanceDisplay.textContent = "Unauthorized - Invalid API key";
            balanceDisplay.className = "mt-2 text-sm text-red-600";
          }
        } else if (res.status === 403) {
          if (balanceDisplay) {
            balanceDisplay.textContent =
              "Access forbidden: " + (data.error || "Permission denied");
            balanceDisplay.className = "mt-2 text-sm text-red-600";
          }
        } else {
          if (balanceDisplay) {
            balanceDisplay.textContent =
              "Error: " + (data.error || `Status ${res.status}`);
            balanceDisplay.className = "mt-2 text-sm text-red-600";
          }
        }
      } catch (err) {
        console.error("Balance check error", err);
        if (balanceDisplay) {
          balanceDisplay.textContent =
            "Network error - Could not check balance";
          balanceDisplay.className = "mt-2 text-sm text-red-600";
        }
      } finally {
        checkBalanceBtn.disabled = !input.value.trim();
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
      "a[href], button:not([disabled]), textarea, input, select",
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
