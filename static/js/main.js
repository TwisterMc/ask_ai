// Prompt history management
let promptHistory = JSON.parse(localStorage.getItem("promptHistory") || "[]");

// Track current image prompt for downloads
let currentImagePrompt = "";

// Track modal focus management
let previousActiveElement = null;
let modalFocusableElements = [];
let firstFocusableElement = null;
let lastFocusableElement = null;

// Form settings management

/**
 * Saves the current form settings to localStorage
 * Persists model, style, size, quality, guidance, and seed settings
 */
function saveFormSettings() {
  const settings = {
    model: document.getElementById("model").value,
    style: document.getElementById("style").value,
    size: document.getElementById("size").value,
    quality: document.getElementById("quality").value,
    guidance: document.getElementById("guidance").value,
    seedMode: document.getElementById("seed-mode").value,
  };
  console.debug && console.debug("Saving settings:", settings);
  localStorage.setItem("formSettings", JSON.stringify(settings));
}

/**
 * Checks if user has an API key and updates button/warning state accordingly
 */
function checkAndUpdateApiKeyStatus() {
  const generateBtn = document.getElementById("generateButton");
  const warningEl = document.getElementById("apiKeyWarning");

  if (!generateBtn) return;

  try {
    const hasApiKey = !!localStorage.getItem("ask_ai_user_api_key");

    if (hasApiKey) {
      // API key present - enable button and hide warning
      generateBtn.disabled = false;
      generateBtn.setAttribute("aria-disabled", "false");
      if (warningEl) warningEl.classList.add("hidden");
    } else {
      // No API key - disable button and show warning
      generateBtn.disabled = true;
      generateBtn.setAttribute("aria-disabled", "true");
      if (warningEl) warningEl.classList.remove("hidden");
    }
  } catch (e) {
    // If localStorage is unavailable, assume no key
    generateBtn.disabled = true;
    generateBtn.setAttribute("aria-disabled", "true");
    if (warningEl) warningEl.classList.remove("hidden");
  }
}

/**
 * Loads saved form settings from localStorage
 * Applies saved settings or falls back to defaults
 */
function loadFormSettings() {
  const settings = JSON.parse(localStorage.getItem("formSettings")) || {};

  // Always set values to ensure consistency, using saved settings or defaults
  document.getElementById("model").value = settings.model || "gptimage";
  document.getElementById("style").value = settings.style || "photographic";
  document.getElementById("size").value = settings.size || "1024x1024";
  document.getElementById("quality").value = settings.quality || "balanced";
  document.getElementById("guidance").value = settings.guidance || "7.0";
  document.getElementById("seed-mode").value = settings.seedMode || "random";

  // Update guidance value display
  document.getElementById("guidance-value").textContent =
    settings.guidance || "7.0";

  // Update seed input state
  toggleSeedInput();
}

/**
 * Fetches and displays the user's account balance
 */
async function fetchBalance() {
  const balanceDisplayEl = document.getElementById("balanceDisplay");
  if (!balanceDisplayEl) return;

  try {
    const userKey = localStorage.getItem("ask_ai_user_api_key");
    if (!userKey) {
      balanceDisplayEl.textContent = "Balance: — (no API key)";
      balanceDisplayEl.className = "text-sm text-gray-500";
      return;
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userKey}`,
    };

    const res = await fetch("/api/check_balance", {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (res.status === 200 && data.success) {
      const balance = data.balance;
      console.debug && console.debug("fetchBalance: raw balance", balance);
      let displayText = "";
      // normalize common keys
      let numeric = null;
      try {
        if (balance && typeof balance === "object") {
          if (typeof balance.pollen === "number") numeric = balance.pollen;
          else if (typeof balance.balance === "number")
            numeric = balance.balance;
          else if (typeof balance.amount === "number") numeric = balance.amount;
        } else if (typeof balance === "number") numeric = balance;
      } catch (e) {}

      if (numeric !== null) {
        displayText = `Balance: ${numeric.toFixed(4)} pollen`;
        if (balance && typeof balance.tier_pollen === "number")
          displayText += ` (tier: ${balance.tier_pollen.toFixed(2)})`;
      } else if (typeof balance === "object") {
        displayText = `Balance: ${JSON.stringify(balance)}`;
      } else {
        displayText = `Balance: ${String(balance)}`;
      }

      balanceDisplayEl.textContent = displayText;
      balanceDisplayEl.className = "text-sm text-green-700 font-semibold";
    } else if (res.status === 401) {
      balanceDisplayEl.textContent = "Balance: Invalid API key";
      balanceDisplayEl.className = "text-sm text-red-600";
    } else if (res.status === 403) {
      balanceDisplayEl.textContent = `Balance: ${data.error || "Permission denied"}`;
      balanceDisplayEl.className = "text-sm text-red-600";
    } else {
      balanceDisplayEl.textContent = `Balance: ${data.error || "unavailable"}`;
      balanceDisplayEl.className = "text-sm text-gray-500";
    }
  } catch (err) {
    balanceDisplayEl.textContent = "Balance: unavailable";
    balanceDisplayEl.className = "text-sm text-gray-500";
  }
}

/**
 * Toggles the seed input field based on seed mode
 */
function toggleSeedInput() {
  const seedMode = document.getElementById("seed-mode").value;
  const seedInput = document.getElementById("seed");
  seedInput.disabled = seedMode === "random";
  if (seedMode === "random") {
    seedInput.value = "";
  }
  saveFormSettings();
}

// Set up button event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Prevent dropdown flicker: hide model select until models are resolved
  const modelSel = document.getElementById("model");
  if (modelSel) modelSel.classList.add("opacity-0");

  // Fetch models from backend, then load saved settings and set up listeners
  fetchModels().finally(() => {
    loadFormSettings();
    if (modelSel) modelSel.classList.remove("opacity-0");
  });
  updateHistoryDisplay();
  checkAndUpdateApiKeyStatus();

  // Set up warning button to open settings
  const openSettingsBtn = document.getElementById("openSettingsFromWarning");
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const settingsBtn = document.getElementById("openSettings");
      if (settingsBtn) {
        settingsBtn.click();
      }
    });
  }

  // set up dynamic image estimate fetching (if imageEstimate element exists)
  const imageEstimateEl = document.getElementById("imageEstimate");

  if (imageEstimateEl) {
    async function fetchImageEstimate() {
      try {
        const model = document.getElementById("model").value;
        const size = document.getElementById("size").value;
        const quality = document.getElementById("quality").value;
        const guidance = document.getElementById("guidance").value;

        const body = { model, size, quality, guidance };
        const headers = { "Content-Type": "application/json" };
        try {
          const userKey = localStorage.getItem("ask_ai_user_api_key");
          if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
        } catch (e) {}
        const res = await fetch("/api/estimate_price", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data && data.success && data.pricing) {
          const p = data.pricing;
          let friendly = null;
          if (p.estimate_text) {
            friendly = p.estimate_text.replace(/^\s*Estimated:\s*/i, "");
          } else if (
            typeof p.estimated_total !== "undefined" &&
            p.estimated_total !== null
          ) {
            friendly = `${p.estimated_total} ${p.currency || ""}`.trim();
          } else {
            const keys = [
              "completionImageTokens",
              "promptImageTokens",
              "promptTextTokens",
              "promptTokens",
              "completionTokens",
            ];
            const parts = [];
            keys.forEach((k) => {
              if (p[k] !== undefined)
                parts.push(`${k.replace(/([A-Z])/g, " $1")}: ${p[k]}`);
            });
            friendly = parts.length ? parts.join(", ") : JSON.stringify(p);
          }
          imageEstimateEl.textContent = `Spore Estimate: ${friendly}`;
        } else if (data && data.error) {
          imageEstimateEl.textContent = `Spore Estimate: unavailable (${data.error})`;
        } else {
          imageEstimateEl.textContent = "Spore Estimate: unknown";
        }
      } catch (err) {
        imageEstimateEl.textContent = "Spore Estimate: unknown (network)";
      }
    }

    ["model", "size", "quality", "guidance"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", fetchImageEstimate);
    });

    // Fetch initial estimate and balance after a brief delay to ensure form values are fully loaded
    setTimeout(() => {
      fetchImageEstimate();
      fetchBalance();
    }, 0);
  }
});

/**
 * Toggles the visibility of the prompt history panel
 * Updates ARIA states and chevron rotation
 */
function toggleHistory() {
  const historyDiv = document.getElementById("prompt-history");
  const chevron = document.getElementById("history-chevron");
  const button = chevron.closest("button");
  const isExpanded = !historyDiv.classList.contains("hidden");

  historyDiv.classList.toggle("hidden");
  chevron.classList.toggle("rotate-180");

  // Update ARIA state
  button.setAttribute("aria-expanded", (!isExpanded).toString());
}

/**
 * Fetch available models from the server and populate the #model select.
 */
async function fetchModels() {
  console.debug && console.debug("fetchModels: start");
  try {
    const res = await fetch("/api/models", { method: "GET" });
    const data = await res.json();
    console.debug &&
      console.debug("fetchModels: API /api/models response", data);
    if (res.status === 200 && data.success && Array.isArray(data.models)) {
      const sel = document.getElementById("model");
      if (!sel) return;

      // remember currently selected value or saved value
      let saved = null;
      try {
        const settings = JSON.parse(
          localStorage.getItem("formSettings") || "{}",
        );
        saved = settings.model;
      } catch (e) {
        saved = null;
      }

      // clear existing options
      sel.innerHTML = "";

      // Group models by tier — authoritative: use `paid_only` from the API. No inference from names/pricing.
      const tierMap = {};

      data.models.forEach((m) => {
        try {
          const name = (m.name || m.id || String(m)).toString();
          const label = (
            m.displayName ||
            m.name ||
            (m.aliases && m.aliases[0]) ||
            name
          ).toString();
          const pricing = m.pricing || null;

          // Tier classification is authoritative from `paid_only` per API docs.
          // Use only paid_only to determine grouping (pro vs regular); do NOT infer from name/pricing.
          let tierRaw = m.paid_only === true ? "pro" : "regular";

          const item = { name, label, pricing, raw: m, tier: tierRaw };
          if (!tierMap[tierRaw]) tierMap[tierRaw] = [];
          tierMap[tierRaw].push(item);
        } catch (err) {
          // skip bad model entries
          console.debug && console.debug("Skipping invalid model entry", err);
        }
      });

      function titleCase(s) {
        return s
          .replace(/(^|_|-)([a-z])/g, (m, p1, p2) => p2.toUpperCase())
          .replace(/_/g, " ");
      }

      // Build two buckets: non-pro => Regular, pro => Pro
      function priceGlyph(pricing) {
        if (!pricing) return null; // unknown => show 'Paid' fallback
        const keys = [
          "pollen_per_image",
          "amount",
          "pollen_per_1k_tokens",
          "pollen_per_token",
          "price",
        ];
        let num = null;
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(pricing, k)) {
            const v = pricing[k];
            const vnum =
              typeof v === "number"
                ? v
                : typeof v === "string"
                  ? parseFloat(v)
                  : NaN;
            if (!Number.isNaN(vnum)) {
              num = vnum;
              break;
            }
          }
        }
        if (
          num === null &&
          typeof pricing.estimated_total !== "undefined" &&
          pricing.estimated_total !== null
        ) {
          const e = pricing.estimated_total;
          num =
            typeof e === "number"
              ? e
              : typeof e === "string"
                ? parseFloat(e)
                : NaN;
          if (Number.isNaN(num)) num = null;
        }
        // If no numeric pricing is available but a pricing object exists, assume paid (default to '$$')
        if (num === null) return "$$";
        if (num <= 0) return "Free";
        if (num < 0.01) return "$";
        if (num < 0.1) return "$$";
        if (num < 1) return "$$$";
        return "$$$$";
      }

      const regularItems = [];
      const proItems = [];
      Object.keys(tierMap).forEach((t) => {
        (tierMap[t] || []).forEach((it) => {
          // Authoritative grouping: only use the model's `tier` (set from paid_only).
          const isPro = (it.tier || "").toString().toLowerCase() === "pro";
          if (isPro) proItems.push(it);
          else regularItems.push(it);
        });
      });

      console.debug &&
        console.debug("fetchModels: grouped counts", {
          regular: regularItems.length,
          pro: proItems.length,
        });

      function appendGroupLabelled(title, items) {
        if (!items || !items.length) return;
        const group = document.createElement("optgroup");
        group.label = `${title} (group)`;
        items.forEach((it) => {
          const opt = document.createElement("option");
          opt.value = it.name;
          const glyph = priceGlyph(it.pricing);
          let text = it.label || it.name;
          if (glyph === "Free") text += " (Free)";
          else if (glyph) text += ` (${glyph})`;
          else text += ` (Paid)`;
          opt.textContent = text;
          group.appendChild(opt);
        });
        sel.appendChild(group);
      }

      // Render Regular first, then Pro
      appendGroupLabelled("Regular", regularItems);
      appendGroupLabelled("Pro", proItems);

      // restore saved selection if present
      if (saved) {
        try {
          sel.value = saved;
        } catch (e) {}
      }
      if (!sel.value && sel.options.length) sel.selectedIndex = 0;
      return; // done with API path
    }

    // --- fallback: if DOM already contains optgroups (server-rendered), leave them alone ---
    const sel = document.getElementById("model");
    if (
      sel &&
      sel.querySelectorAll &&
      sel.querySelectorAll("optgroup").length
    ) {
      console.debug &&
        console.debug(
          "fetchModels: DOM already has optgroups — keeping server-rendered options",
        );
      return;
    }

    // If API returned no models and the DOM does not already contain optgroups,
    // do NOT attempt to infer `paid_only` from names/labels/pricing. Leave the
    // existing flat <option> list unchanged so we do not perform string parsing.
    console.debug &&
      console.debug(
        "fetchModels: API returned no models — leaving existing options unchanged (no inference)",
      );
    return;
  } catch (err) {
    console.debug && console.debug("Failed to fetch models:", err);
  }
}

/**
 * Adds a prompt to the history. If it already exists, moves it to the top.
 * @param {string} prompt - The prompt to add to history
 */
function addToHistory(prompt) {
  // Check if prompt already exists and remove it
  const index = promptHistory.indexOf(prompt);
  if (index !== -1) {
    promptHistory.splice(index, 1);
  }

  // Add to the beginning of array
  promptHistory.unshift(prompt);

  // Keep only last 50 items
  promptHistory = promptHistory.slice(0, 50);

  // Save to localStorage and update display
  localStorage.setItem("promptHistory", JSON.stringify(promptHistory));
  updateHistoryDisplay();
}

/**
 * Updates the prompt history display in the UI
 * Creates buttons for each historical prompt
 */
function updateHistoryDisplay() {
  const historyDiv = document.getElementById("prompt-history");
  historyDiv.innerHTML = promptHistory
    .map((prompt, index) => {
      // Properly escape the prompt for the onclick attribute
      const escapedPrompt = prompt
        .replace(/'/g, "\\'") // Escape single quotes
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/\n/g, "\\n") // Escape newlines
        .replace(/\r/g, "\\r") // Escape carriage returns
        .replace(/✨/g, "\\u2728"); // Escape sparkle emoji

      return `
            <button type="button" class="text-sm p-2 w-full text-left hover:bg-blue-100 focus:bg-gray-100 rounded mb-1 ${
              index % 2 === 1 ? "bg-gray-100" : ""
            }" 
                onclick="useHistoryPrompt(event, '${escapedPrompt}')">
                ${prompt}
            </button>
        `;
    })
    .join("");
}

/**
 * Updates the prompt input with a historical prompt and shows notification
 * @param {Event} event - The click event
 * @param {string} prompt - The historical prompt to use
 */
function useHistoryPrompt(event, prompt) {
  event.preventDefault();
  document.getElementById("prompt").value = prompt;

  // Hide the notification first if it's visible
  const notification = document.getElementById("prompt-notification");
  if (!notification.classList.contains("hidden")) {
    hideNotification();
    // Small delay to ensure the hide animation completes
    setTimeout(() => {
      showNotification();
      // Auto-hide after 5 seconds
      setTimeout(() => hideNotification(), 10000);
    }, 300);
  } else {
    showNotification();
    // Auto-hide after 5 seconds
    setTimeout(() => hideNotification(), 10000);
  }
}

/**
 * Shows the notification with animation
 */
function showNotification() {
  const notification = document.getElementById("prompt-notification");
  notification.classList.remove("hidden");
  // Wait a tiny bit for the display:block to take effect
  setTimeout(() => {
    notification.classList.remove("translate-y-full");
  }, 10);

  // Auto-hide after 5 seconds
  setTimeout(() => {
    hideNotification();
  }, 10000);
}

/**
 * Hides the notification with animation
 */
function hideNotification() {
  const notification = document.getElementById("prompt-notification");
  notification.classList.add("translate-y-full");
  // Wait for animation to finish before hiding
  setTimeout(() => {
    notification.classList.add("hidden");
  }, 300);
}

/**
 * Scrolls smoothly to the prompt input field
 */
function scrollToPrompt() {
  const promptElement = document.getElementById("prompt");
  promptElement.scrollIntoView({ behavior: "smooth", block: "center" });
  promptElement.focus();

  // Hide the notification
  hideNotification();
}

// Image generation and prompt enhancement

/**
 * Sets form controls enabled/disabled state
 * Updates ARIA attributes accordingly
 * @param {boolean} disabled - Whether to disable the controls
 */
function setFormControlsDisabled(disabled) {
  // Get all form controls except history-related elements
  const controls = [
    "generateButton",
    "enhanceButton",
    "prompt",
    "model",
    "style",
    "size",
    "quality",
    "guidance",
  ].map((id) => document.getElementById(id));

  // Update form controls disabled states
  controls.forEach((control) => {
    if (disabled) {
      control.setAttribute("disabled", "");
    } else {
      control.removeAttribute("disabled");
    }
    control.setAttribute("aria-disabled", disabled.toString());
  });
}

/**
 * Generates an image based on the current form settings
 * Shows loading state and handles errors
 * @returns {Promise<void>}
 */
async function generateImage() {
  const prompt = document.getElementById("prompt").value;
  const loading = document.getElementById("loading");
  const result = document.getElementById("result");
  const error = document.getElementById("error");
  const img = document.getElementById("generated-image");

  if (!prompt) {
    showError("Please enter a prompt");
    return;
  }

  // Check if user has an API key
  let userKey = null;
  try {
    userKey = localStorage.getItem("ask_ai_user_api_key");
  } catch (e) {
    // localStorage might be unavailable
  }

  if (!userKey) {
    showError(
      "API key required. Click 'AI Settings' in the footer to add your Pollinations API key.",
    );
    return;
  }

  loading.classList.remove("hidden");
  result.classList.add("hidden");
  hideError();
  document.body.classList.add("overflow-hidden");
  setFormControlsDisabled(true);

  try {
    // Add to history when generating an image
    addToHistory(prompt);

    const style = document.getElementById("style").value;
    const model = document.getElementById("model").value;
    const size = document.getElementById("size").value;
    const quality = document.getElementById("quality").value;
    const guidance = document.getElementById("guidance").value;
    const seedMode = document.getElementById("seed-mode").value;
    const seedValue = document.getElementById("seed").value;

    const requestBody = {
      prompt,
      style,
      model,
      size,
      quality,
      guidance,
    };

    // Add seed if in fixed mode and has a value
    // Determine seed: use fixed seed when provided, otherwise generate a random seed
    let seedToSend = null;
    if (seedMode === "fixed" && seedValue) {
      seedToSend = parseInt(seedValue);
    } else {
      // generate a 32-bit positive integer seed for reproducibility
      seedToSend = Math.floor(Math.random() * 2147483647);
    }
    if (seedToSend !== null && !Number.isNaN(seedToSend)) {
      requestBody.seed = seedToSend;
    }

    console.debug && console.debug("Sending request with style:", style);
    console.debug && console.debug("Full request body:", requestBody);
    // Explicitly log the seed being sent so you can verify it in the console/network
    console.debug && console.debug("Seed sent:", requestBody.seed);

    const headers = { "Content-Type": "application/json" };
    try {
      const userKey = localStorage.getItem("ask_ai_user_api_key");
      if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
    } catch (e) {
      console.debug("No user API key in localStorage", e);
    }
    const response = await fetch("/generate", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.debug &&
      console.debug("Generation response:", { status: response.status, data });

    if (data.success) {
      img.src = data.url;
      img.alt = `AI generated image based on prompt: ${prompt}`;
      currentImagePrompt = prompt; // Store the prompt for download
      result.classList.remove("hidden");
      // Wait for the image to load before scrolling
      img.onload = () => {
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      // Refresh balance after successful generation
      fetchBalance();
    } else {
      throw new Error(data.error || "Failed to generate image");
    }
  } catch (err) {
    showError(err.message);
  } finally {
    loading.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    setFormControlsDisabled(false);
  }
}

/**
 * Enhances the current prompt using AI
 * Shows loading state and handles errors
 * @returns {Promise<void>}
 */
async function enhancePrompt() {
  const promptElement = document.getElementById("prompt");
  const originalPrompt = promptElement.value;
  const error = document.getElementById("error");
  const loading = document.getElementById("loading");
  const loadingText = loading.querySelector("p");
  const originalLoadingText = loadingText.textContent;

  if (!originalPrompt) {
    showError("Please enter a prompt");
    return;
  }

  hideError();
  loading.classList.remove("hidden");
  loadingText.textContent = "Enhancing prompt...";
  document.body.classList.add("overflow-hidden");
  setFormControlsDisabled(true);

  try {
    const headers = { "Content-Type": "application/json" };
    try {
      const userKey = localStorage.getItem("ask_ai_user_api_key");
      if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
    } catch (e) {
      console.debug("No user API key in localStorage", e);
    }
    const response = await fetch("/enhance_prompt", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: originalPrompt }),
    });

    const data = await response.json();

    if (data.success) {
      // Show enhancement modal with the response
      showEnhancementModal(data.enhanced_prompt, originalPrompt);
    } else {
      throw new Error(data.error || "Failed to enhance prompt");
    }
  } catch (err) {
    showError(err.message);
  } finally {
    loading.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    loadingText.textContent = originalLoadingText;
    setFormControlsDisabled(false);
  }
}

/**
 * Shows the enhancement modal with parsed prompts
 * @param {string} enhancedText - The AI-generated enhanced text
 * @param {string} originalPrompt - The original user prompt
 */
function showEnhancementModal(enhancedText, originalPrompt) {
  const modal = document.getElementById("enhancementModal");
  const content = document.getElementById("enhancementContent");

  // Parse the response to extract individual prompts
  const prompts = parseEnhancedPrompts(enhancedText);

  console.debug && console.debug("Parsed prompts:", prompts); // Debug

  // Build the modal content
  let html = "";

  if (prompts.length > 0) {
    prompts.forEach((prompt, index) => {
      const escapedText = escapeHtml(prompt.text);
      html += `
        <div class="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
          <h4 class="font-semibold text-gray-700 mb-2">${escapeHtml(
            prompt.title || `Option ${index + 1}`,
          )}</h4>
          <p class="text-gray-600 text-sm whitespace-pre-wrap mb-3">${escapedText}</p>
          <button
            class="use-prompt-btn w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm font-medium"
            data-prompt="${escapedText}"
          >
            Use This Prompt
          </button>
        </div>
      `;
    });
  } else {
    // If no prompts parsed, show the full text
    const escapedText = escapeHtml(enhancedText);
    html = `
      <div class="border rounded-lg p-4 bg-gray-50">
        <h4 class="font-semibold text-gray-700 mb-2">Enhanced Response</h4>
        <p class="text-gray-600 text-sm whitespace-pre-wrap mb-3">${escapedText}</p>
        <button
          class="use-prompt-btn mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm font-medium"
          data-prompt="${escapedText}"
        >
          Use This Text
        </button>
      </div>
    `;
  }

  content.innerHTML = html;

  // Attach event listeners to all use buttons
  content.querySelectorAll(".use-prompt-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const text = this.getAttribute("data-prompt");
      usePrompt(text);
    });
  });

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  // Set focus to modal for keyboard navigation
  setTimeout(() => {
    const firstButton = modal.querySelector("button");
    if (firstButton) firstButton.focus();
  }, 100);

  // Add escape key listener
  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      closeEnhancementModal();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);
}

/**
 * Parses enhanced text to extract individual prompt options
 * @param {string} text - The enhanced text to parse
 * @returns {Array} Array of {title, text} objects
 */
function parseEnhancedPrompts(text) {
  const prompts = [];
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Pattern 1: Title on one line, prompt on next line starting with "-"
    // Example: "Macro close-up\n- Extreme close-up of..."
    if (
      line &&
      !line.startsWith("-") &&
      !line.match(/^(?:Option|If you|Tips|Would you|Note)/i)
    ) {
      const title = line;

      // Check if next line starts with "-" (the prompt)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.startsWith("-")) {
          // Extract the prompt (everything after the dash)
          let promptText = nextLine.substring(1).trim();

          // Continue reading lines until we hit an empty line or another title
          let j = i + 2;
          while (j < lines.length) {
            const continueLine = lines[j].trim();

            // Stop at empty line (indicates new section)
            if (!continueLine) {
              break;
            }

            // Stop if we hit another title pattern or section
            if (
              !continueLine.startsWith("-") &&
              !continueLine.match(/^(?:If you|Tips|Would you|Note|Optional)/i)
            ) {
              // Check if this looks like a new title (short line followed by dash)
              if (j + 1 < lines.length && lines[j + 1].trim().startsWith("-")) {
                break;
              }
            }

            // Stop at instruction sections
            if (
              continueLine.match(/^(?:If you|Tips|Would you|Note|Optional)/i)
            ) {
              break;
            }

            // Add to prompt text if it doesn't start with dash (continuation)
            if (!continueLine.startsWith("-")) {
              promptText += " " + continueLine;
            } else {
              // Hit another prompt, stop here
              break;
            }

            j++;
          }

          prompts.push({
            title: title,
            text: promptText.trim(),
          });

          i = j;
          continue;
        }
      }
    }

    // Pattern 2: "Option X: title" format (new format from AI)
    // Matches: "Option 1: Hyperreal Icy Apple Halo"
    const optionMatch = line.match(/^Option\s+(\d+):\s*(.+)$/i);

    if (optionMatch) {
      const optionLabel = optionMatch[1];
      const title = optionMatch[2];

      // Prompt text starts on the next line and continues until next "Option X:" or empty line
      let promptText = "";
      let j = i + 1;

      while (j < lines.length) {
        const promptLine = lines[j].trim();

        // Stop at next option
        if (promptLine.match(/^Option\s+\d+:/i)) {
          break;
        }

        // Stop at empty line
        if (!promptLine) {
          // Check if next non-empty line is a new option
          let k = j + 1;
          while (k < lines.length && !lines[k].trim()) {
            k++;
          }
          if (k < lines.length && lines[k].trim().match(/^Option\s+\d+:/i)) {
            break;
          }
          j++;
          continue;
        }

        // Add line to prompt text
        if (promptText) {
          promptText += " " + promptLine;
        } else {
          promptText = promptLine;
        }
        j++;
      }

      if (promptText) {
        prompts.push({
          title: title,
          text: promptText.trim(),
        });
        i = j;
        continue;
      }
    }

    i++;
  }

  return prompts;
}

/**
 * Closes the enhancement modal
 */
function closeEnhancementModal() {
  const modal = document.getElementById("enhancementModal");
  modal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

/**
 * Closes the enhancement modal when clicking on backdrop
 * @param {Event} event - Click event
 */
function closeEnhancementModalOnBackdrop(event) {
  // Only close if clicking directly on the backdrop (not the modal content)
  if (event.target.id === "enhancementModal") {
    closeEnhancementModal();
  }
}

/**
 * Uses the selected prompt by setting it in the prompt field
 * @param {string} promptText - The prompt text to use
 */
function usePrompt(promptText) {
  const promptElement = document.getElementById("prompt");
  // Decode HTML entities
  const textarea = document.createElement("textarea");
  textarea.innerHTML = promptText;
  const decodedText = textarea.value;

  promptElement.value = decodedText;
  addToHistory(decodedText);
  closeEnhancementModal();
}

/**
 * Copies prompt to clipboard
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - The button element that was clicked
 */
async function copyPromptToClipboard(text, button) {
  try {
    // Decode HTML entities
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    const decodedText = textarea.value;

    await navigator.clipboard.writeText(decodedText);

    // Show brief success feedback
    const originalText = button.textContent;
    button.textContent = "Copied!";
    button.classList.add("bg-green-50");
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("bg-green-50");
    }, 2000);
  } catch (err) {
    console.error("Copy failed:", err);
    showError("Failed to copy to clipboard");
  }
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/'/g, "&#39;");
}

/**
 * Opens the image modal with the full-size image
 * @param {string} imageUrl - URL of the image to display
 * @param {string} altText - Alt text for the image
 */
function openImageModal(imageUrl, altText) {
  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");

  modalImage.src = imageUrl;
  modalImage.alt = altText;

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  // Handle clicking outside the modal to close it
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeImageModal();
    }
  });

  // Handle Escape key to close modal
  document.addEventListener("keydown", handleEscapeKey);

  // Set up focus trap
  focusTrapOnModal(modal);
}

/**
 * Closes the image modal when clicking on backdrop
 * @param {Event} event - Click event
 */
function closeImageModalOnBackdrop(event) {
  if (event.target.id === "imageModal") {
    closeImageModal();
  }
}

/**
 * Closes the image modal
 */
function closeImageModal() {
  const modal = document.getElementById("imageModal");
  modal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");

  // Remove event listeners
  document.removeEventListener("keydown", handleEscapeKey);
  modal.removeEventListener("keydown", trapFocus);

  // Restore focus to the previous element
  if (previousActiveElement) {
    previousActiveElement.focus();
  }
}

/**
 * Handles Escape key press to close modal
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleEscapeKey(event) {
  if (event.key === "Escape") {
    closeImageModal();
  }
}

/**
 * Sanitizes a string for use in a filename
 * @param {string} text - The text to sanitize
 * @returns {string} The sanitized text
 */
function sanitizeFilename(text) {
  // Clean up special prefixes first
  const cleanText = text
    .replace(/^✨\s*/, "") // Remove sparkle prefix
    .replace(/^Sure!\s*Here['s:]?\s*/i, "") // Remove "Sure! Here" prefix
    .replace(/^Here['s:]?\s*/i, ""); // Remove "Here's" prefix

  // Then sanitize for filename
  return cleanText
    .replace(/[^a-z0-9-_\s]/gi, "") // Remove invalid chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .substring(0, 50) // Limit length
    .trim(); // Remove trailing spaces
}

/**
 * Downloads the currently displayed modal image
 */
async function downloadImage() {
  const modalImage = document.getElementById("modalImage");
  const imageUrl = modalImage.src;
  // Use stored prompt instead of trying to extract from alt text
  const sanitizedPrompt = sanitizeFilename(currentImagePrompt);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = sanitizedPrompt
    ? `ai-image-${sanitizedPrompt}-${timestamp}.png`
    : `ai-generated-image-${timestamp}.png`;

  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error("Error downloading image:", error);
    showError("Error downloading image");
  }
}

/**
 * Sets up focus trap within the modal
 * @param {HTMLElement} modal - The modal element
 */
function focusTrapOnModal(modal) {
  // Get all focusable elements within the modal
  modalFocusableElements = Array.from(
    modal.querySelectorAll(`
        a[href], area[href], input:not([disabled]), select:not([disabled]), 
        textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])
    `),
  );

  if (modalFocusableElements.length === 0) return;

  firstFocusableElement = modalFocusableElements[0];
  lastFocusableElement =
    modalFocusableElements[modalFocusableElements.length - 1];

  // Remember the currently focused element
  previousActiveElement = document.activeElement;

  // Focus the first element in the modal
  firstFocusableElement.focus();

  // Add event listener to trap focus within the modal
  modal.addEventListener("keydown", trapFocus);
}

/**
 * Traps the focus within the modal
 * @param {KeyboardEvent} event - The keyboard event
 */
function trapFocus(event) {
  if (event.key !== "Tab") return;

  if (event.shiftKey) {
    // Shift + Tab
    if (document.activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus();
    }
  } else {
    // Tab
    if (document.activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
  }
}

// Utility to show error message
function showError(message) {
  const errorDiv = document.getElementById("error");
  const errorMsg = document.getElementById("error-message");
  const closeBtn = document.getElementById("error-close");
  errorMsg.textContent = message;
  errorDiv.classList.remove("hidden");
  errorDiv.focus();
}

function hideError() {
  const errorDiv = document.getElementById("error");
  errorDiv.classList.add("hidden");
}
