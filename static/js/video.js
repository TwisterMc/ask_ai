document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("videoForm");
  const status = document.getElementById("videoStatus");
  const result = document.getElementById("videoResult");
  const btn = document.getElementById("generateBtn");
  const modelInput = document.getElementById("model");
  const durationInput = document.getElementById("duration");
  const sizeInput = document.getElementById("size");
  const fpsInput = document.getElementById("fps");
  const previewCheckbox = document.getElementById("preview");
  let _estTimeout = null;

  // Model -> allowed durations (seconds)
  const MODEL_DURATIONS = {
    veo: [4, 6, 8],
    seedance: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    "seedance-pro": [2, 3, 4, 5, 6, 7, 8, 9, 10],
  };

  function populateDurations(model, preferred) {
    const sel = durationInput;
    const allowed = MODEL_DURATIONS[model] || MODEL_DURATIONS.seedance;
    // remember previous value if provided
    const prev = parseInt(preferred, 10);
    sel.innerHTML = "";
    allowed.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    });
    if (prev && allowed.includes(prev)) {
      sel.value = String(prev);
    } else {
      const defaultVal = allowed.includes(6)
        ? 6
        : allowed[Math.floor(allowed.length / 2)];
      sel.value = String(defaultVal);
    }
  }

  function applyPreviewMode(enabled) {
    if (!sizeInput || !fpsInput || !durationInput) return;
    if (enabled) {
      // store current values
      sizeInput.dataset.prev = sizeInput.value;
      fpsInput.dataset.prev = fpsInput.value;
      durationInput.dataset.prev = durationInput.value;
      // set preview presets
      sizeInput.value = "512x512";
      fpsInput.value = "12";
      durationInput.value = "2";
      sizeInput.disabled = true;
      fpsInput.disabled = true;
      durationInput.disabled = true;
    } else {
      // restore
      if (sizeInput.dataset.prev) sizeInput.value = sizeInput.dataset.prev;
      if (fpsInput.dataset.prev) fpsInput.value = fpsInput.dataset.prev;
      if (durationInput.dataset.prev)
        durationInput.value = durationInput.dataset.prev;
      sizeInput.disabled = false;
      fpsInput.disabled = false;
      durationInput.disabled = false;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    result.innerHTML = "";

    const prompt = document.getElementById("prompt").value.trim();
    if (!prompt) {
      status.textContent = "Please enter a prompt.";
      return;
    }

    const payload = {
      prompt: prompt,
      model: document.getElementById("model").value,
      duration: parseInt(document.getElementById("duration").value, 10),
      aspectRatio: document.getElementById("aspectRatio").value,
      audio: document.getElementById("audio").checked,
      size: document.getElementById("size").value,
      fps: parseInt(document.getElementById("fps").value, 10),
    };

    btn.disabled = true;
    btn.textContent = "Generating...";
    status.textContent = "Requesting generation — this may take a while.";

    try {
      const headers = { "Content-Type": "application/json" };
      try {
        const userKey = localStorage.getItem('ask_ai_user_api_key');
        if (userKey) headers['Authorization'] = `Bearer ${userKey}`;
      } catch (e) {
        console.debug('No user API key in localStorage', e);
      }
      const res = await fetch("/generate", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        status.textContent = data.error || "Generation failed";
      } else {
        status.textContent = "Generation complete.";
        if (
          data.type === "video" ||
          (typeof data.url === "string" && data.url.endsWith(".mp4"))
        ) {
          const video = document.createElement("video");
          video.src = data.url;
          video.controls = true;
          video.autoplay = false;
          video.className = "w-full rounded-lg shadow-lg";
          result.appendChild(video);
        } else {
          // fallback: show image
          const img = document.createElement("img");
          img.src = data.url;
          img.alt = prompt;
          img.className = "w-full rounded-lg shadow-lg";
          result.appendChild(img);
        }

        if (data.pricing) {
          const p = document.createElement("div");
          p.className = "mt-2 text-sm text-gray-700";
          // Format pricing object into readable text
          try {
            const pricing = data.pricing;
            let text = "";
            if (typeof pricing === "object" && !Array.isArray(pricing)) {
              // pricing might be { "property": value, "currency": "pollen" }
              const parts = [];
              const currency = pricing.currency || "pollen";
              for (const k of Object.keys(pricing)) {
                if (k === "currency") continue;
                parts.push(`${k}: ${pricing[k]} ${currency}`);
              }
              // attempt a simple numeric summary
              const numericVals = Object.values(pricing).filter(
                (v) => typeof v === "number"
              );
              if (numericVals.length) {
                const sum = numericVals.reduce((a, b) => a + b, 0);
                parts.push(
                  `estimated total: ${sum} ${pricing.currency || "pollen"}`
                );
              }
              text = parts.join(" · ");
              // If parts empty, show a helpful fallback message
              if (!text) {
                if (pricing.estimated_total) {
                  text = `Estimated total: ${pricing.estimated_total} ${
                    pricing.currency || "pollen"
                  }`;
                } else {
                  text =
                    "Pricing unavailable — check POLLINATIONS_API_TOKEN or connectivity";
                }
              }
            } else {
              text = JSON.stringify(pricing);
            }
            p.textContent = "Pricing: " + text;
          } catch (e) {
            p.textContent = "Pricing: " + JSON.stringify(data.pricing);
          }
          result.appendChild(p);
        }
      }
    } catch (err) {
      console.error(err);
      status.textContent = "Error contacting generation service.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate Video";
    }
  });

  // Fetch estimate when model or duration changes
  async function fetchEstimate() {
    const model = modelInput.value;
    const duration = parseInt(durationInput.value, 10) || 0;
    const size = sizeInput ? sizeInput.value : "1024x1024";
    const fps = fpsInput ? parseInt(fpsInput.value, 10) : undefined;
    try {
      const body = { model: model, duration: duration, size: size };
      if (typeof fps === "number") body.fps = fps;
      const headers = { "Content-Type": "application/json" };
      try {
        const userKey = localStorage.getItem('ask_ai_user_api_key');
        if (userKey) headers['Authorization'] = `Bearer ${userKey}`;
      } catch (e) {
        console.debug('No user API key in localStorage', e);
      }
      const res = await fetch("/api/estimate_price", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.pricing) {
        const p = data.pricing;
        if (p.estimate_text) {
          status.textContent = p.estimate_text;
        } else if (p.estimated_total) {
          status.textContent = `Estimated: ${p.estimated_total} ${
            p.currency || "pollen"
          }`;
        } else {
          status.textContent =
            "Pricing unavailable — check POLLINATIONS_API_TOKEN or connectivity";
        }
      } else {
        // show more details for debugging
        console.debug("Estimate response:", data);
        status.textContent =
          data && data.error
            ? `Estimate error: ${data.error}`
            : "Pricing unavailable — could not fetch estimate";
      }
    } catch (err) {
      console.debug("Estimate error", err);
      status.textContent =
        "Pricing unavailable — could not fetch estimate (network error)";
    }
  }

  // when model changes, repopulate durations and refetch estimate
  modelInput.addEventListener("change", () => {
    populateDurations(modelInput.value, durationInput.value);
    // small delay to allow select to update
    setTimeout(fetchEstimate, 10);
  });

  if (previewCheckbox) {
    previewCheckbox.addEventListener("change", (e) => {
      applyPreviewMode(e.target.checked);
      // refetch estimate after changing
      setTimeout(fetchEstimate, 10);
    });
  }

  if (durationInput) {
    durationInput.addEventListener("change", () => {
      if (_estTimeout) clearTimeout(_estTimeout);
      _estTimeout = setTimeout(fetchEstimate, 300);
    });
  }

  if (sizeInput) {
    sizeInput.addEventListener("change", () => setTimeout(fetchEstimate, 50));
  }

  if (fpsInput) {
    fpsInput.addEventListener("change", () => setTimeout(fetchEstimate, 50));
  }

  // initial populate + estimate
  populateDurations(modelInput.value, 6);
  applyPreviewMode(previewCheckbox && previewCheckbox.checked);
  fetchEstimate();
});
