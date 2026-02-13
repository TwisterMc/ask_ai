document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("galleryStatus");
  const gridEl = document.getElementById("galleryGrid");

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

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML.replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  async function confirmDelete(message) {
    try {
      if (window.confirmModal && window.confirmModal.show) {
        return await window.confirmModal.show(message);
      }
    } catch (e) {
      /* fallback */
    }
    return confirm(message);
  }

  async function loadGallery() {
    const key = getUserApiKey();
    if (!key) {
      statusEl.textContent =
        "Add your Pollinations API key in AI Settings to view your saved items.";
      statusEl.className =
        "text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4";
      return;
    }

    try {
      const res = await fetch("/api/starred", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to load saved items");
      }

      const items = Array.isArray(data.items) ? data.items : [];
      gridEl.innerHTML = "";

      if (!items.length) {
        statusEl.textContent =
          "No saved items yet. Star something from the image page.";
        statusEl.className =
          "text-sm text-gray-600 bg-white border rounded-lg p-4 mb-4";
        return;
      }

      statusEl.textContent = `Saved items: ${items.length}`;
      statusEl.className =
        "text-sm text-gray-700 bg-white border rounded-lg p-4 mb-4";

      items.forEach((item) => {
        const card = document.createElement("div");
        card.className =
          "bg-white rounded-lg shadow-lg p-3 flex flex-col gap-3";

        const mediaHtml =
          item.type === "video"
            ? `<video class="w-full rounded" src="${escapeHtml(
                item.url,
              )}" controls></video>`
            : `<img class="w-full rounded" src="${escapeHtml(
                item.url,
              )}" alt="Saved image" />`;

        const promptText = escapeHtml(item.prompt || "");
        const metaBits = [
          item.model ? `Model: ${escapeHtml(item.model)}` : null,
          item.size ? `Size: ${escapeHtml(item.size)}` : null,
          item.quality ? `Quality: ${escapeHtml(item.quality)}` : null,
          item.created_at ? `Saved: ${formatDate(item.created_at)}` : null,
        ].filter(Boolean);

        card.innerHTML = `
          ${mediaHtml}
          <div>
            <div class="text-sm text-gray-700 font-semibold mb-1">Prompt</div>
            <div class="text-sm text-gray-600 whitespace-pre-wrap">${promptText}</div>
          </div>
          <div class="text-xs text-gray-500">${metaBits.join(" • ")}</div>
          <div class="flex items-center gap-2">
            <a
              class="text-sm text-blue-600 underline"
              href="${escapeHtml(item.url)}"
              target="_blank"
              rel="noopener"
            >
              Open
            </a>
            <button
              class="text-sm text-red-600 underline"
              type="button"
              data-id="${escapeHtml(item.id)}"
            >
              Remove
            </button>
          </div>
        `;

        const removeBtn = card.querySelector("button[data-id]");
        removeBtn.addEventListener("click", async () => {
          const ok = await confirmDelete(
            "Remove this saved item? This cannot be undone.",
          );
          if (!ok) return;
          await removeItem(item.id);
        });

        gridEl.appendChild(card);
      });
    } catch (err) {
      statusEl.textContent = err.message || "Failed to load saved items";
      statusEl.className =
        "text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-4 mb-4";
    }
  }

  async function removeItem(id) {
    const key = getUserApiKey();
    if (!key) return;
    try {
      const res = await fetch("/api/unstar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to remove item");
      }
      await loadGallery();
    } catch (err) {
      statusEl.textContent = err.message || "Failed to remove item";
      statusEl.className =
        "text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-4 mb-4";
    }
  }

  loadGallery();
});
