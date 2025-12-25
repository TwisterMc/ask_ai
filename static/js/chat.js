document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const windowEl = document.getElementById("chatWindow");
  const modelEl = document.getElementById("chatModel");
  const tempEl = document.getElementById("chatTemp");
  const tempVal = document.getElementById("chatTempValue");
  const maxEl = document.getElementById("chatMax");

  // UI elements: Clear button and estimate area
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "ml-2 text-sm text-red-600 underline";
  clearBtn.textContent = "Clear";
  form.appendChild(clearBtn);

  const estimateEl = document.createElement("div");
  estimateEl.className = "text-sm text-gray-700 mb-2";
  windowEl.parentNode.insertBefore(estimateEl, windowEl);

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
    bubble.textContent = text;
    div.appendChild(bubble);
    windowEl.appendChild(div);
    windowEl.scrollTop = windowEl.scrollHeight;
    if (persist && (role === "user" || role === "assistant"))
      saveMessage(role, text);
  }

  tempEl.addEventListener("input", () => {
    tempVal.textContent = tempEl.value;
  });

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
        placeholder.querySelector("div").textContent = data.reply || "";
        if (data.pricing) {
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
          estimateEl.textContent = `Spore Estimate: ${friendly}`;
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
          friendly = `${p.estimated_total} ${p.currency || ""}`.trim();
        } else {
          const keys = [
            "pollen_per_token",
            "pollen_per_1k_tokens",
            "completionTokens",
            "promptTokens",
          ];
          const parts = [];
          keys.forEach((k) => {
            if (p[k] !== undefined)
              parts.push(`${k.replace(/([A-Z_])/g, " $1")}: ${p[k]}`);
          });
          friendly = parts.length ? parts.join(", ") : JSON.stringify(p);
        }
        estimateEl.textContent = `Spore Estimate: ${friendly}`;
      } else {
        estimateEl.textContent = data.error
          ? `Estimate error: ${data.error}`
          : "Estimate unavailable";
      }
    } catch (e) {
      estimateEl.textContent = "Estimate unavailable (network error)";
    }
    // keep estimate and balance independent; balance auto-refresh runs separately
  }

  modelEl.addEventListener("change", fetchChatEstimate);
  maxEl.addEventListener("change", fetchChatEstimate);

  loadHistory();
  fetchChatEstimate();
});
