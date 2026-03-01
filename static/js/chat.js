document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const windowEl = document.getElementById("chatWindow");
  const modelEl = document.getElementById("chatModel");
  const tempEl = document.getElementById("chatTemp");
  const tempVal = document.getElementById("chatTempValue");
  const maxEl = document.getElementById("chatMax");
  let chatModels = [];

  // UI elements: Clear button and estimate area
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "ml-2 text-sm text-red-600 underline";
  clearBtn.textContent = "Clear";
  form.appendChild(clearBtn);

  const estimateEl = document.createElement("div");
  estimateEl.className = "text-sm text-gray-700 mb-2";
  windowEl.parentNode.insertBefore(estimateEl, windowEl);

  const modelMetaEl = document.createElement("div");
  modelMetaEl.className = "text-sm text-gray-600 mb-2";
  modelEl.parentNode.parentNode.insertBefore(modelMetaEl, windowEl);

  const STORAGE_KEY = "ask_ai_chat_history_v1";

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      arr.forEach((m) => appendMessage(m.role, m.text, false));
    } catch (e) {
      console.debug("Failed to load history", e);
    }
  }

  function saveMessage(role, text) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || "[]";
      const arr = JSON.parse(raw);
      arr.push({ role, text });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.debug("Failed to save history", e);
    }
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    windowEl.innerHTML = "";
  }

  function appendMessage(role, text, persist = true) {
    const div = document.createElement("div");
    div.className = role === "user" ? "text-right mb-2" : "text-left mb-2";
    const bubble = document.createElement("div");
    bubble.className =
      role === "user"
        ? "inline-block bg-blue-600 text-white px-3 py-2 rounded"
        : "inline-block bg-gray-200 text-gray-900 px-3 py-2 rounded";
    if (role === "assistant") {
      bubble.innerHTML = renderAssistantText(text);
    } else {
      bubble.textContent = text;
    }
    div.appendChild(bubble);
    windowEl.appendChild(div);
    windowEl.scrollTop = windowEl.scrollHeight;
    if (persist && (role === "user" || role === "assistant"))
      saveMessage(role, text);
  }

  tempEl.addEventListener("input", () => {
    tempVal.textContent = tempEl.value;
  });

  function formatSporeValue(value) {
    const num = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(num)) return String(value);
    return String(parseFloat(num.toFixed(8)));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderAssistantText(text) {
    const escaped = escapeHtml(text || "");
    const withHeadings = escaped
      .replace(/([a-z])([A-Z][a-z]+\s*:\s*)/g, "$1\n$2")
      .replace(/(\S)\s*(\d+\.)\s*(\S)/g, "$1\n$2 $3");
    const withBold = withHeadings.replace(
      /\*\*(.+?)\*\*/g,
      "<strong>$1</strong>",
    );
    const withBullets = withBold
      .replace(/^\s*-\s+/gm, "• ")
      .replace(/^\s*\d+\.\s+/gm, (match) => match.trim() + " ");
    return withBullets.replace(/\n/g, "<br>");
  }

  function parsePricingNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : null;
    }
    if (value && typeof value === "object") {
      if (Object.prototype.hasOwnProperty.call(value, "parsedValue")) {
        const n = parseFloat(value.parsedValue);
        if (Number.isFinite(n)) return n;
      }
      if (Object.prototype.hasOwnProperty.call(value, "source")) {
        const n = parseFloat(value.source);
        if (Number.isFinite(n)) return n;
      }
      if (Object.prototype.hasOwnProperty.call(value, "value")) {
        const n = parseFloat(value.value);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  }

  function getModelPricingValue(pricing) {
    if (!pricing || typeof pricing !== "object") return null;

    const pollenPer1k = parsePricingNumber(pricing.pollen_per_1k_tokens);
    if (pollenPer1k !== null) return pollenPer1k;

    const pollenPerToken = parsePricingNumber(pricing.pollen_per_token);
    if (pollenPerToken !== null) return pollenPerToken * 1000;

    const inputPer1k = parsePricingNumber(pricing.input_pollen_per_1k_tokens);
    const outputPer1k = parsePricingNumber(pricing.output_pollen_per_1k_tokens);
    if (inputPer1k !== null || outputPer1k !== null) {
      return (inputPer1k || 0) + (outputPer1k || 0);
    }

    const promptText = parsePricingNumber(pricing.promptTextTokens);
    const completionText = parsePricingNumber(pricing.completionTextTokens);
    if (promptText !== null || completionText !== null) {
      return ((promptText || 0) + (completionText || 0)) * 1000;
    }

    const amount = parsePricingNumber(pricing.amount);
    if (amount !== null) return amount;

    const price = parsePricingNumber(pricing.price);
    if (price !== null) return price;

    return null;
  }

  function percentile(values, p) {
    if (!values.length) return null;
    const idx = Math.floor((values.length - 1) * p);
    return values[Math.min(Math.max(idx, 0), values.length - 1)];
  }

  function priceGlyphFromValue(value, thresholds) {
    if (value === null || !thresholds || thresholds.t25 === null) return null;
    if (value <= thresholds.t25) return "$";
    if (value <= thresholds.t50) return "$$";
    if (value <= thresholds.t75) return "$$$";
    return "$$$$";
  }

  function formatPricingForDisplay(pricing) {
    if (!pricing || typeof pricing !== "object") return null;

    const per1k = parsePricingNumber(pricing.pollen_per_1k_tokens);
    if (per1k !== null) {
      return `${formatSporeValue(per1k)} pollen / 1K tokens`;
    }

    const perToken = parsePricingNumber(pricing.pollen_per_token);
    if (perToken !== null) {
      return `${formatSporeValue(perToken * 1000)} pollen / 1K tokens`;
    }

    const inputPer1k = parsePricingNumber(pricing.input_pollen_per_1k_tokens);
    const outputPer1k = parsePricingNumber(pricing.output_pollen_per_1k_tokens);
    if (inputPer1k !== null || outputPer1k !== null) {
      const inputText =
        inputPer1k !== null ? `${formatSporeValue(inputPer1k)} in` : null;
      const outputText =
        outputPer1k !== null ? `${formatSporeValue(outputPer1k)} out` : null;
      return (
        [inputText, outputText].filter(Boolean).join(" · ") +
        " pollen / 1K tokens"
      );
    }

    const promptText = parsePricingNumber(pricing.promptTextTokens);
    const completionText = parsePricingNumber(pricing.completionTextTokens);
    if (promptText !== null || completionText !== null) {
      const promptPer1k = promptText !== null ? promptText * 1000 : null;
      const completionPer1k =
        completionText !== null ? completionText * 1000 : null;
      const combinedPer1k = (promptPer1k || 0) + (completionPer1k || 0);
      const promptTextOut =
        promptPer1k !== null ? `${formatSporeValue(promptPer1k)} in` : null;
      const completionTextOut =
        completionPer1k !== null
          ? `${formatSporeValue(completionPer1k)} out`
          : null;
      return (
        `${formatSporeValue(combinedPer1k)} pollen / 1K tokens` +
        (promptTextOut || completionTextOut
          ? ` (${[promptTextOut, completionTextOut].filter(Boolean).join(" + ")})`
          : "")
      );
    }

    const amount = parsePricingNumber(pricing.amount);
    if (amount !== null) {
      return `${formatSporeValue(amount)} pollen`;
    }

    const price = parsePricingNumber(pricing.price);
    if (price !== null) {
      return `${formatSporeValue(price)} pollen`;
    }

    return null;
  }

  function updateSelectedModelMeta() {
    const selectedId = modelEl.value;
    const selectedModel = chatModels.find((m) => {
      if (typeof m === "string") return m === selectedId;
      return (m.id || m.name) === selectedId;
    });
    if (!selectedModel || typeof selectedModel === "string") {
      modelMetaEl.textContent = "Cost: unavailable";
      modelMetaEl.className = "text-sm text-gray-600 mb-2";
      return;
    }

    const combinedPer1k = getModelPricingValue(selectedModel.pricing);
    modelMetaEl.textContent =
      combinedPer1k !== null
        ? `Cost: ${formatSporeValue(combinedPer1k)} pollen (estimated)`
        : "Cost: unavailable";
    modelMetaEl.className = "text-sm text-gray-600 mb-2";
  }

  async function loadChatModels() {
    try {
      const headers = { "Content-Type": "application/json" };
      try {
        const userKey = localStorage.getItem("ask_ai_user_api_key");
        if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
      } catch (e) {
        console.debug("No user API key in localStorage", e);
      }
      const res = await fetch("/api/chat_models", { method: "GET", headers });
      const data = await res.json();
      const models =
        data && data.success && Array.isArray(data.models) ? data.models : [];
      chatModels = models;
      modelEl.innerHTML = "";
      if (models.length === 0) {
        const opt = document.createElement("option");
        opt.value = "openai";
        opt.textContent = "openai";
        modelEl.appendChild(opt);
        modelMetaEl.textContent = "Model details unavailable.";
        return;
      }

      const priceValues = [];
      models.forEach((model) => {
        if (typeof model !== "object" || !model) return;
        const value = getModelPricingValue(model.pricing);
        if (typeof value === "number" && value > 0) priceValues.push(value);
      });
      priceValues.sort((a, b) => a - b);
      const thresholds = {
        t25: percentile(priceValues, 0.25),
        t50: percentile(priceValues, 0.5),
        t75: percentile(priceValues, 0.75),
      };

      const includedModels = [];
      const paidModels = [];
      models.forEach((model) => {
        const modelId =
          typeof model === "string" ? model : model.id || model.name || "";
        if (!modelId) return;
        if (typeof model === "object" && model && model.paid_only) {
          paidModels.push(model);
        } else {
          includedModels.push(model);
        }
      });

      function appendGroup(title, items) {
        if (!items.length) return;
        const group = document.createElement("optgroup");
        group.label = title;
        items.forEach((model) => {
          const modelId =
            typeof model === "string" ? model : model.id || model.name || "";
          if (!modelId) return;
          const opt = document.createElement("option");
          opt.value = modelId;
          let text = modelId;
          if (typeof model === "object" && model) {
            const value = getModelPricingValue(model.pricing);
            const glyph = priceGlyphFromValue(value, thresholds);
            if (glyph) text += ` (${glyph})`;
          }
          opt.textContent = text;
          group.appendChild(opt);
        });
        modelEl.appendChild(group);
      }

      appendGroup("Included", includedModels);
      appendGroup("Paid", paidModels);
      updateSelectedModelMeta();
    } catch (e) {
      console.debug("Failed to load chat models", e);
      chatModels = [];
      modelEl.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "openai";
      opt.textContent = "openai";
      modelEl.appendChild(opt);
      modelMetaEl.textContent = "Model details unavailable.";
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    appendMessage("user", text);
    input.value = "";

    const payload = {
      messages: [{ role: "user", content: text }],
      model: modelEl.value,
      temperature: parseFloat(tempEl.value),
      max_tokens: parseInt(maxEl.value, 10),
    };

    appendMessage("assistant", "…");
    const placeholder = windowEl.lastChild;

    try {
      const headers = { "Content-Type": "application/json" };
      try {
        const userKey = localStorage.getItem("ask_ai_user_api_key");
        if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
      } catch (e) {
        console.debug("No user API key in localStorage", e);
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      // If upstream returned non-200 and Flask forwarded it, handle accordingly
      const data = await res.json();
      if (!data.success) {
        placeholder.querySelector("div").textContent = `Error: ${
          data.error || "Unknown error"
        }`;
      } else {
        placeholder.querySelector("div").innerHTML = renderAssistantText(
          data.reply || "No response returned.",
        );
        if (data.pricing) {
          const p = data.pricing;
          let friendly = null;
          if (p.estimate_text) {
            friendly = p.estimate_text.replace(/^\s*Estimated:\s*/i, "");
          } else if (
            typeof p.estimated_total !== "undefined" &&
            p.estimated_total !== null
          ) {
            friendly = `${formatSporeValue(p.estimated_total)} ${
              p.currency || "pollen"
            }`.trim();
          }
          if (friendly) {
            estimateEl.textContent = `Cost estimate: ${friendly}`;
          }
        }
      }
    } catch (err) {
      console.error(err);
      placeholder.querySelector("div").textContent =
        "Network error contacting chat service.";
    }
  });

  clearBtn.addEventListener("click", async () => {
    const warning = `This will permanently remove your local conversation history stored in your browser (key: ${STORAGE_KEY}).\n\nThis cannot be undone.`;
    try {
      const ok = window.confirmModal
        ? await window.confirmModal.show(warning)
        : confirm(warning);
      if (ok) {
        clearHistory();
        // also clear estimate display
        estimateEl.textContent = "";
      }
    } catch (err) {
      console.error("Confirm modal error", err);
    }
  });

  async function fetchChatEstimate() {
    if (!modelEl.value) {
      estimateEl.textContent = "";
      return;
    }
    const body = {
      model: modelEl.value,
      max_tokens: parseInt(maxEl.value, 10),
    };
    try {
      const headers = { "Content-Type": "application/json" };
      try {
        const userKey = localStorage.getItem("ask_ai_user_api_key");
        if (userKey) headers["Authorization"] = `Bearer ${userKey}`;
      } catch (e) {
        console.debug("No user API key in localStorage", e);
      }
      const res = await fetch("/api/estimate_chat_price", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.pricing) {
        const p = data.pricing;
        let friendly = null;
        if (p.estimate_text) {
          friendly = p.estimate_text.replace(/^\s*Estimated:\s*/i, "");
        } else if (
          typeof p.estimated_total !== "undefined" &&
          p.estimated_total !== null
        ) {
          friendly = `${formatSporeValue(p.estimated_total)} ${
            p.currency || "pollen"
          }`.trim();
        }
        estimateEl.textContent = friendly ? `Cost estimate: ${friendly}` : "";
      } else {
        estimateEl.textContent = "";
      }
    } catch (e) {
      estimateEl.textContent = "";
    }
    // keep estimate and balance independent; balance auto-refresh runs separately
  }

  modelEl.addEventListener("change", fetchChatEstimate);
  modelEl.addEventListener("change", updateSelectedModelMeta);
  maxEl.addEventListener("change", fetchChatEstimate);

  loadHistory();
  loadChatModels().then(fetchChatEstimate);
});
