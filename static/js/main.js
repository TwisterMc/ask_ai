// Prompt history management
let promptHistory = JSON.parse(localStorage.getItem("promptHistory") || "[]");

// Track current image prompt for downloads
let currentImagePrompt = "";
// Track current media for starring
let lastGeneratedMedia = null;

// Available models data
let availableModels = [];

// Form settings management

/**
 * Saves the current form settings to localStorage
 * Persists model, style, aspect ratio, base resolution, quality, guidance, and seed settings
 */
function saveFormSettings() {
  const settings = {
    model: document.getElementById("model").value,
    style: document.getElementById("style").value,
    baseResolution:
      (document.getElementById("baseResolution") || {}).value || "1024",
    quality: document.getElementById("quality").value,
    guidance: document.getElementById("guidance").value,
    seed: document.getElementById("seed").value,
    aspectRatio: (document.getElementById("aspectRatio") || {}).value || "1:1",
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
    const hasApiKey = !!getUserApiKey();

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

  // Check if we're on the main page (form elements exist)
  const modelEl = document.getElementById("model");
  if (!modelEl) return; // Not on main page

  // Always set values to ensure consistency, using saved settings or defaults
  modelEl.value = settings.model || "gptimage";
  document.getElementById("style").value = settings.style || "photographic";
  const baseResolutionEl = document.getElementById("baseResolution");
  const aspectRatioEl = document.getElementById("aspectRatio");

  let baseResolution = settings.baseResolution || null;
  let aspectRatio = settings.aspectRatio || null;
  if ((!baseResolution || !aspectRatio) && settings.size) {
    const legacy = parseLegacySize(settings.size);
    if (legacy) {
      baseResolution = baseResolution || legacy.baseResolution;
      aspectRatio = aspectRatio || legacy.aspectRatio;
    }
  }

  if (baseResolutionEl) baseResolutionEl.value = baseResolution || "1024";
  document.getElementById("quality").value = settings.quality || "balanced";
  document.getElementById("guidance").value = settings.guidance || "7.0";
  document.getElementById("seed").value = settings.seed || "";
  // restore aspect ratio when available (default 1:1)
  if (aspectRatioEl) aspectRatioEl.value = aspectRatio || "1:1";

  // Update guidance value display
  document.getElementById("guidance-value").textContent =
    settings.guidance || "7.0";
}

const IMAGE_ASPECT_RATIOS = {
  "1:1": { w: 1, h: 1 },
  "16:9": { w: 16, h: 9 },
  "9:16": { w: 9, h: 16 },
};

const IMAGE_BASE_OPTIONS = [512, 768, 1024, 1536];

function pickClosestBase(value) {
  const num = parseInt(value, 10);
  if (!num || Number.isNaN(num)) return 1024;
  return IMAGE_BASE_OPTIONS.reduce((closest, current) =>
    Math.abs(current - num) < Math.abs(closest - num) ? current : closest,
  );
}

function pickClosestAspectRatio(width, height) {
  if (!width || !height) return "1:1";
  const ratio = width / height;
  let bestKey = "1:1";
  let bestDiff = Infinity;
  Object.entries(IMAGE_ASPECT_RATIOS).forEach(([key, val]) => {
    const target = val.w / val.h;
    const diff = Math.abs(ratio - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestKey = key;
    }
  });
  return bestKey;
}

function getPricingValue(pricing) {
  if (!pricing) return null;
  const keys = [
    "completionVideoTokens",
    "completionVideoSeconds",
    "completionImageTokens",
    "promptImageTokens",
    "pollen_per_image",
    "amount",
    "pollen_per_1k_tokens",
    "pollen_per_token",
    "price",
  ];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(pricing, k)) {
      const v = pricing[k];
      const vnum =
        typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
      if (!Number.isNaN(vnum) && vnum > 0) return vnum;
    }
  }
  return null;
}

function parseLegacySize(size) {
  try {
    const [w, h] = String(size)
      .split("x")
      .map((v) => parseInt(v, 10));
    if (!w || !h) return null;
    return {
      baseResolution: String(pickClosestBase(Math.max(w, h))),
      aspectRatio: pickClosestAspectRatio(w, h),
    };
  } catch (e) {
    return null;
  }
}

function computeImageSizeFromControls() {
  const arEl = document.getElementById("aspectRatio");
  const baseEl = document.getElementById("baseResolution");
  if (!arEl || !baseEl) return null;

  const ratioKey = arEl.value in IMAGE_ASPECT_RATIOS ? arEl.value : "1:1";
  const ratio = IMAGE_ASPECT_RATIOS[ratioKey];
  const base = pickClosestBase(baseEl.value);

  let width = base;
  let height = base;
  if (ratioKey === "16:9") {
    width = base;
    height = Math.round((base * ratio.h) / ratio.w);
  } else if (ratioKey === "9:16") {
    width = Math.round((base * ratio.w) / ratio.h);
    height = base;
  }

  return {
    width,
    height,
    size: `${width}x${height}`,
  };
}

/**
 * Fetches and displays the user's account balance
 */
async function fetchBalance() {
  const balanceDisplayEl = document.getElementById("balanceDisplay");
  if (!balanceDisplayEl) return;

  try {
    const userKey = getUserApiKey();
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
 * Updates the spore estimate display based on selected model
 */
function updateEstimate() {
  const estimateEl = document.getElementById("imageEstimate");
  const modelSelect = document.getElementById("model");
  if (!estimateEl || !modelSelect || !availableModels.length) {
    console.debug &&
      console.debug("updateEstimate: missing elements or no models", {
        estimateEl: !!estimateEl,
        modelSelect: !!modelSelect,
        availableModelsLength: availableModels.length,
      });
    return;
  }

  const selectedModelValue = modelSelect.value;
  console.debug &&
    console.debug("updateEstimate: selected value", selectedModelValue);
  const model = availableModels.find(
    (m) => m.name === selectedModelValue || m.id === selectedModelValue,
  );
  console.debug && console.debug("updateEstimate: found model", model);

  if (!model || !model.pricing) {
    console.debug &&
      console.debug("updateEstimate: no model or no pricing", {
        model: !!model,
        pricing: model?.pricing,
      });
    estimateEl.textContent = "Spore Estimate: —";
    estimateEl.className = "text-sm text-gray-500";
    return;
  }

  console.debug &&
    console.debug("updateEstimate: model pricing object", model.pricing);

  const pricingValue = getPricingValue(model.pricing);
  console.debug &&
    console.debug("updateEstimate: raw pricing value", pricingValue);
  if (pricingValue !== null) {
    // Handle very small pricing values to avoid showing as free
    let displayValue;
    if (pricingValue === 0) {
      displayValue = "< 0.0001"; // Show that it's not free but very small
    } else if (pricingValue < 0.0001) {
      // For extremely small values, show with more decimal places
      displayValue = pricingValue.toFixed(8);
    } else {
      // Round to 4 decimal places for normal small values
      displayValue = (Math.round(pricingValue * 10000) / 10000).toFixed(4);
    }
    console.debug &&
      console.debug("updateEstimate: display value", displayValue);
    estimateEl.textContent = `Spore Estimate: ${displayValue} pollen`;
    estimateEl.className = "text-sm text-blue-700 font-semibold";
  } else {
    estimateEl.textContent = "Spore Estimate: —";
    estimateEl.className = "text-sm text-gray-500";
  }
}

/**
 * Toggles the seed input field based on seed mode
 */

// Set up button event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Prevent dropdown flicker: hide model select until models are resolved
  const modelSel = document.getElementById("model");
  if (modelSel) modelSel.classList.add("opacity-0");

  // Fetch models from backend, then load saved settings and set up listeners
  fetchModels().finally(() => {
    loadFormSettings();
    updateEstimate();
    if (modelSel) modelSel.classList.remove("opacity-0");
  });

  // Add event listener for model changes to update estimate
  if (modelSel) {
    modelSel.addEventListener("change", updateEstimate);
  }

  // Fetch balance on page load
  setTimeout(() => {
    fetchBalance();
  }, 100);

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
      availableModels = data.models; // Store models for estimate calculation
      console.debug &&
        console.debug("fetchModels: loaded models", availableModels.length);
      console.debug &&
        console.debug(
          "fetchModels: first model pricing",
          availableModels[0]?.pricing,
        );
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

      // Identify video-capable models for separate grouping.
      const CLIENT_VIDEO_MODELS = new Set(["veo", "seedance", "seedance-pro"]);
      data.models.forEach((m) => {
        try {
          const name = (m.name || m.id || String(m)).toString();

          // If the model explicitly advertises video capability, skip it for the image UI.
          const caps = m.capabilities || m.capability || m.type || null;
          const outputModalities = m.output_modalities || m.outputModalities;
          const hasVideoCap =
            (Array.isArray(outputModalities) &&
              outputModalities.includes("video")) ||
            (Array.isArray(caps) && caps.includes("video")) ||
            (typeof caps === "string" && /video/i.test(caps)) ||
            CLIENT_VIDEO_MODELS.has((name || "").toString().toLowerCase());
          const isVideo = !!hasVideoCap;

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

          const item = { name, label, pricing, raw: m, tier: tierRaw, isVideo };
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

      const regularItems = [];
      const regularVideoItems = [];
      const proItems = [];
      const proVideoItems = [];
      Object.keys(tierMap).forEach((t) => {
        (tierMap[t] || []).forEach((it) => {
          // Authoritative grouping: only use the model's `tier` (set from paid_only).
          const isPro = (it.tier || "").toString().toLowerCase() === "pro";
          if (isPro) {
            if (it.isVideo) proVideoItems.push(it);
            else proItems.push(it);
          } else {
            if (it.isVideo) regularVideoItems.push(it);
            else regularItems.push(it);
          }
        });
      });

      console.debug &&
        console.debug("fetchModels: grouped counts", {
          regular: regularItems.length,
          pro: proItems.length,
        });

      const priceValues = [];
      [
        ...regularItems,
        ...regularVideoItems,
        ...proItems,
        ...proVideoItems,
      ].forEach((it) => {
        const value = getPricingValue(it.pricing);
        if (typeof value === "number" && value > 0) priceValues.push(value);
      });
      priceValues.sort((a, b) => a - b);

      function percentile(values, p) {
        if (!values.length) return null;
        const idx = Math.floor((values.length - 1) * p);
        return values[Math.min(Math.max(idx, 0), values.length - 1)];
      }

      const tier25 = percentile(priceValues, 0.25);
      const tier50 = percentile(priceValues, 0.5);
      const tier75 = percentile(priceValues, 0.75);

      function priceGlyphFromValue(value) {
        if (value === null || tier25 === null) return null;
        if (value <= tier25) return "$";
        if (value <= tier50) return "$$";
        if (value <= tier75) return "$$$";
        return "$$$$";
      }

      function appendGroupLabelled(title, items) {
        if (!items || !items.length) return;
        const group = document.createElement("optgroup");
        group.label = title;
        items.forEach((it) => {
          const opt = document.createElement("option");
          opt.value = it.name;
          const value = getPricingValue(it.pricing);
          const glyph = priceGlyphFromValue(value);
          let text = it.label || it.name;
          if (glyph) text += ` (${glyph})`;
          opt.textContent = text;
          group.appendChild(opt);
        });
        sel.appendChild(group);
      }

      // Render Regular, Regular Video, Pro, Pro Video
      appendGroupLabelled("Regular", regularItems);
      appendGroupLabelled("Regular Video", regularVideoItems);
      appendGroupLabelled("Pro", proItems);
      appendGroupLabelled("Pro Video", proVideoItems);

      // No automatic cheapest-selection — default to the first option unless the user saved a preference.
      // Saved selection still takes precedence.

      // restore saved selection if present (saved takes precedence)
      if (saved) {
        try {
          sel.value = saved;
        } catch (e) {}
      }

      // final fallback: select the first option
      if (!sel.value && sel.options.length) sel.selectedIndex = 0;
      updateEstimate();
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
      // Default to the first server-rendered option when there's no saved setting.
      if (!saved && sel.options.length) {
        sel.selectedIndex = 0;
      }
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
  if (!historyDiv) return; // Not on main page

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
async function starCurrentMedia() {
  const starButtonModal = document.getElementById("starButtonModal");

  if (!lastGeneratedMedia) return;

  const userKey = getUserApiKey();
  if (!userKey) {
    showError(
      "API key required. Click 'AI Settings' in the footer to add your Pollinations API key.",
    );
    return;
  }

  if (starButtonModal) starButtonModal.disabled = true;
  const isStarred = !!lastGeneratedMedia.starredId;

  try {
    if (isStarred) {
      const res = await fetch("/api/unstar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userKey}`,
        },
        body: JSON.stringify({ id: lastGeneratedMedia.starredId }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to remove media");
      }
      lastGeneratedMedia.starredId = null;
    } else {
      const res = await fetch("/api/star_media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userKey}`,
        },
        body: JSON.stringify(lastGeneratedMedia),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save media");
      }
      if (data.item && data.item.id) {
        lastGeneratedMedia.starredId = data.item.id;
      }
    }
    updateStarButtons();
  } catch (err) {
    if (starButtonModal) starButtonModal.disabled = false;
    showError(err.message || "Failed to update saved media");
    updateStarButtons();
    return;
  } finally {
    if (starButtonModal) starButtonModal.disabled = false;
  }
}

function setFormControlsDisabled(disabled) {
  const controls = document.querySelectorAll(
    'input:not([type="hidden"]), select, textarea, button[type="submit"]',
  );
  controls.forEach((control) => {
    if (disabled) {
      control.setAttribute("disabled", "");
    } else {
      control.removeAttribute("disabled");
    }
    control.setAttribute("aria-disabled", disabled.toString());
  });
}

function getUserApiKey() {
  try {
    return (
      localStorage.getItem("ask_ai_user_api_key") ||
      sessionStorage.getItem("ask_ai_user_api_key")
    );
  } catch (e) {
    return null;
  }
}

function resetStarUI() {
  const starButtonModal = document.getElementById("starButtonModal");
  const starIconModal = document.getElementById("starIconModal");
  if (starButtonModal) {
    starButtonModal.disabled = false;
    starButtonModal.classList.remove("text-yellow-300");
    starButtonModal.setAttribute("aria-pressed", "false");
    starButtonModal.setAttribute("aria-label", "Save to My Gallery");
    starButtonModal.setAttribute("title", "Save to My Gallery");
  }
  if (starIconModal) {
    starIconModal.classList.remove("text-yellow-300");
    starIconModal.classList.add("text-white");
    starIconModal.classList.add("fill-none");
    starIconModal.classList.remove("fill-current");
  }
  // starStatus element removed; visual state is handled via star icon and aria attributes
}

function showStarUI() {
  updateStarButtons();
}

function updateStarButtons() {
  const starButtonModal = document.getElementById("starButtonModal");
  const starIconModal = document.getElementById("starIconModal");
  const isStarred = !!(lastGeneratedMedia && lastGeneratedMedia.starredId);
  if (starButtonModal) {
    if (isStarred) {
      starButtonModal.classList.add("text-yellow-300");
      starButtonModal.setAttribute("aria-pressed", "true");
      starButtonModal.setAttribute("aria-label", "Saved to My Gallery");
      starButtonModal.setAttribute("title", "Saved to My Gallery");
    } else {
      starButtonModal.classList.remove("text-yellow-300");
      starButtonModal.setAttribute("aria-pressed", "false");
      starButtonModal.setAttribute("aria-label", "Save to My Gallery");
      starButtonModal.setAttribute("title", "Save to My Gallery");
    }
  }
  if (starIconModal) {
    if (isStarred) {
      starIconModal.classList.add("text-yellow-300");
      starIconModal.classList.add("fill-current");
      starIconModal.classList.remove("fill-none");
      starIconModal.classList.remove("text-white");
    } else {
      starIconModal.classList.remove("text-yellow-300");
      starIconModal.classList.remove("fill-current");
      starIconModal.classList.add("fill-none");
      starIconModal.classList.add("text-white");
    }
  }
}

/**
 * Generates an image based on the current form settings
 * Shows loading state and handles errors
 * @returns {Promise<void>}
 */
async function generateImage() {
  const promptEl = document.getElementById("prompt");
  const loadingEl = document.getElementById("loading");
  const resultEl = document.getElementById("result");
  const errorEl = document.getElementById("error");
  const imgEl = document.getElementById("generated-image");
  const resultMessageEl = document.getElementById("resultMessage");
  const imageResultEl = document.getElementById("imageResult");

  // Check if we're on the right page (elements exist)
  if (!promptEl || !loadingEl || !resultEl) return;

  const prompt = promptEl.value;

  if (!prompt) {
    showError("Please enter a prompt");
    return;
  }

  // Get API key (UI should prevent calling this without a key, but check anyway)
  const userKey = getUserApiKey();
  if (!userKey) {
    showError(
      "API key required. Click 'AI Settings' in the footer to add your Pollinations API key.",
    );
    return;
  }

  loadingEl.classList.remove("hidden");
  resultEl.classList.add("hidden");
  if (resultMessageEl) resultMessageEl.classList.add("hidden");
  if (imageResult) imageResult.classList.add("hidden");
  resetStarUI();
  lastGeneratedMedia = null;
  hideError();
  document.body.classList.add("overflow-hidden");
  setFormControlsDisabled(true);

  const loadingText = loadingEl.querySelector("p");
  const originalLoadingText = loadingText.textContent;
  loadingText.textContent = "Generating image...";
  const loadingTimeout = setTimeout(() => {
    loadingText.textContent = "... still working, hold on";
  }, 30000);

  try {
    // Add to history when generating an image
    addToHistory(prompt);

    const style = document.getElementById("style").value;
    const model = document.getElementById("model").value;
    const aspectRatio = document.getElementById("aspectRatio").value;
    const sizeInfo = computeImageSizeFromControls();
    const size = sizeInfo ? sizeInfo.size : "1024x1024";
    const quality = document.getElementById("quality").value;
    const guidance = document.getElementById("guidance").value;
    const seedValue = document.getElementById("seed").value;

    const requestBody = {
      prompt,
      style,
      model,
      size,
      quality,
      guidance,
    };

    // Determine seed: use fixed seed when provided, otherwise generate a random seed
    let seedToSend = -1; // Default to random
    if (seedValue && seedValue.trim() !== "") {
      const parsedSeed = parseInt(seedValue);
      if (!Number.isNaN(parsedSeed)) {
        seedToSend = parsedSeed;
      }
    }
    requestBody.seed = seedToSend;

    console.debug && console.debug("Sending request with style:", style);
    console.debug && console.debug("Full request body:", requestBody);
    // Explicitly log the seed being sent so you can verify it in the console/network
    console.debug && console.debug("Seed sent:", requestBody.seed);

    const headers = { "Content-Type": "application/json" };
    if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
    const response = await fetch("/generate", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.debug &&
      console.debug("Generation response:", { status: response.status, data });

    if (!data.success) {
      throw new Error(data.error || "Failed to generate media");
    }

    const generationMeta = {
      prompt,
      model,
      style,
      size,
      quality,
      guidance,
      seed: requestBody.seed,
      aspect_ratio: aspectRatio,
    };

    // If the server returned a video (model produced video), handle gracefully.
    if (
      data.type === "video" ||
      (typeof data.url === "string" &&
        /\.mp4$|^https?:.*\/(?:static\/generated_videos)\/.+$/i.test(data.url))
    ) {
      if (resultMessage) {
        resultMessage.innerHTML = `
          <div class="font-semibold mb-1">The selected model produced a video.</div>
          <a class="inline-block text-blue-600 underline" href="${data.url}" target="_blank" rel="noopener">Open generated video</a>
        `;
        resultMessage.classList.remove("hidden");
      }
      if (imageResult) imageResult.classList.add("hidden");
      result.classList.remove("hidden");
      lastGeneratedMedia = { ...generationMeta, url: data.url, type: "video" };
      showStarUI();
      // Store URL so downloadImage() or other UI can still reference it if needed
      currentImagePrompt = prompt;
      // Refresh balance after successful generation
      fetchBalance();
      return;
    }

    // Otherwise assume it's an image (data.url is a data: or image URL)
    imgEl.src = data.url;
    imgEl.alt = `AI generated image based on prompt: ${prompt}`;
    currentImagePrompt = prompt; // Store the prompt for download
    if (imageResult) imageResult.classList.remove("hidden");
    if (resultMessage) resultMessage.classList.add("hidden");
    result.classList.remove("hidden");
    lastGeneratedMedia = { ...generationMeta, url: data.url, type: "image" };
    showStarUI();
    // Wait for the image to load before scrolling
    imgEl.onload = () => {
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    // Refresh balance after successful generation
    fetchBalance();
  } catch (err) {
    showError(err.message);
  } finally {
    clearTimeout(loadingTimeout);
    loadingText.textContent = originalLoadingText;
    loading.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    setFormControlsDisabled(false);
  }
}

/**
 * Saves the last generated media to the private gallery
 * @returns {Promise<void>}
 */
async function starCurrentMedia() {
  const starButtonModal = document.getElementById("starButtonModal");

  if (!lastGeneratedMedia) return;

  const userKey = getUserApiKey();
  if (!userKey) {
    showError(
      "API key required. Click 'AI Settings' in the footer to add your Pollinations API key.",
    );
    return;
  }

  if (starButtonModal) starButtonModal.disabled = true;
  const isStarred = !!lastGeneratedMedia.starredId;

  try {
    if (isStarred) {
      const res = await fetch("/api/unstar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userKey}`,
        },
        body: JSON.stringify({ id: lastGeneratedMedia.starredId }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to remove media");
      }
      lastGeneratedMedia.starredId = null;
    } else {
      const res = await fetch("/api/star_media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userKey}`,
        },
        body: JSON.stringify(lastGeneratedMedia),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save media");
      }
      if (data.item && data.item.id) {
        lastGeneratedMedia.starredId = data.item.id;
      }
    }
    updateStarButtons();
  } catch (err) {
    if (starButtonModal) starButtonModal.disabled = false;
    showError(err.message || "Failed to update saved media");
    updateStarButtons();
    return;
  } finally {
    if (starButtonModal) starButtonModal.disabled = false;
  }
}

/**
 * Shows the style selection modal for prompt enhancement
 * @returns {void}
 */
function showStyleModal() {
  const modal = document.getElementById("styleModal");
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  setFormControlsDisabled(true);
}

/**
 * Closes the style selection modal
 * @returns {void}
 */
function closeStyleModal() {
  const modal = document.getElementById("styleModal");
  modal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
  setFormControlsDisabled(false);
}

/**
 * Closes the style modal when clicking on backdrop
 * @param {Event} event - The click event
 * @returns {void}
 */
function closeStyleModalOnBackdrop(event) {
  if (event.target === event.currentTarget) {
    closeStyleModal();
  }
}

/**
 * Selects a style and proceeds with enhancement
 * @param {string} style - The selected style
 * @returns {Promise<void>}
 */
async function selectStyle(style) {
  // Set the style in the hidden dropdown
  document.getElementById("style").value = style;
  closeStyleModal();
  // Now proceed with enhancement
  await enhancePrompt();
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

  // Set a timeout to change the loading message after 45 seconds
  const loadingTimeout = setTimeout(() => {
    loadingText.textContent = "... still working, hold on";
  }, 20000);

  try {
    const headers = { "Content-Type": "application/json" };
    const userKey = getUserApiKey();
    if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
    const style = document.getElementById("style").value;
    const response = await fetch("/enhance_prompt", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: originalPrompt, style: style }),
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
    clearTimeout(loadingTimeout);
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
 * Shows an error message to the user
 * @param {string} message - The error message to display
 */
function showError(message) {
  const errorDiv = document.getElementById("error");
  const errorMsg = document.getElementById("error-message");
  if (errorDiv && errorMsg) {
    errorMsg.textContent = message;
    errorDiv.classList.remove("hidden");
    errorDiv.focus();
  }
}

/**
 * Hides the error message
 */
function hideError() {
  const errorDiv = document.getElementById("error");
  if (errorDiv) {
    errorDiv.classList.add("hidden");
  }
}

/**
 * Shows the prompt notification
 */
function showNotification() {
  const notification = document.getElementById("prompt-notification");
  if (notification) {
    notification.classList.remove("hidden", "translate-y-full");
  }
}

/**
 * Hides the prompt notification
 */
function hideNotification() {
  const notification = document.getElementById("prompt-notification");
  if (notification) {
    notification.classList.add("translate-y-full");
    // After transition, hide completely
    setTimeout(() => {
      notification.classList.add("hidden");
    }, 300);
  }
}

/**
 * Scrolls to the prompt input field
 */
function scrollToPrompt() {
  const promptEl = document.getElementById("prompt");
  if (promptEl) {
    promptEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
