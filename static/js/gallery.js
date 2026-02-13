// Gallery-specific global state for modal
let galleryItemsMap = {};
let currentGalleryItem = null;

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
      galleryItemsMap = {};

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
        // Store item for modal access
        galleryItemsMap[item.id] = item;

        const card = document.createElement("div");
        card.className =
          "bg-white rounded-lg shadow-lg overflow-hidden flex flex-col gap-3";

        // Media container with zoom button overlay
        const mediaContainer = document.createElement("div");
        mediaContainer.className = "relative";

        let mediaElement;
        if (item.type === "video") {
          mediaElement = document.createElement("video");
          mediaElement.src = item.url;
          mediaElement.className = "w-full";
          mediaElement.controls = true;
        } else {
          mediaElement = document.createElement("img");
          mediaElement.src = item.url;
          mediaElement.alt = "Saved image";
          mediaElement.className =
            "w-full cursor-pointer hover:opacity-90 transition-opacity";
          // Make image clickable
          mediaElement.addEventListener("click", (e) => {
            e.preventDefault();
            openGalleryItemModal(item.id);
          });
        }

        mediaContainer.appendChild(mediaElement);

        // Zoom button overlay (only for images)
        if (item.type === "image") {
          const zoomBtn = document.createElement("button");
          zoomBtn.type = "button";
          zoomBtn.className =
            "absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors";
          zoomBtn.setAttribute("aria-label", "View image in full size");
          zoomBtn.innerHTML = `
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" />
            </svg>
          `;
          zoomBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openGalleryItemModal(item.id);
          });
          mediaContainer.appendChild(zoomBtn);
        }

        card.appendChild(mediaContainer);

        // Card content
        const content = document.createElement("div");
        content.className = "p-3 flex flex-col gap-3";

        const promptText = escapeHtml(item.prompt || "");
        const metaBits = [
          item.model ? `Model: ${escapeHtml(item.model)}` : null,
          item.size ? `Size: ${escapeHtml(item.size)}` : null,
          item.quality ? `Quality: ${escapeHtml(item.quality)}` : null,
          item.created_at ? `Saved: ${formatDate(item.created_at)}` : null,
        ].filter(Boolean);

        content.innerHTML = `
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

        const removeBtn = content.querySelector("button[data-id]");
        removeBtn.addEventListener("click", async () => {
          const ok = await confirmDelete(
            "Remove this saved item? This cannot be undone."
          );
          if (!ok) return;
          await removeItem(item.id);
        });

        card.appendChild(content);
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

// Modal functions for gallery
function openGalleryItemModal(itemId) {
  const item = galleryItemsMap[itemId];
  if (!item || item.type !== "image") return;

  currentGalleryItem = item;
  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");

  modalImage.src = item.url;
  modalImage.alt = item.prompt || "Saved image";
  modal.classList.remove("hidden");

  // Update star button state for gallery item
  updateGalleryStarButton();
}

function updateGalleryStarButton() {
  const starBtn = document.getElementById("starButtonModal");
  const starIcon = document.getElementById("starIconModal");

  if (!currentGalleryItem) {
    if (starBtn) {
      starBtn.setAttribute("aria-pressed", "false");
      starIcon.classList.remove("fill-current", "text-yellow-300");
      starIcon.classList.add("fill-none", "text-white");
    }
    return;
  }

  // For gallery items, they're already starred, so show as filled
  if (starBtn) {
    starBtn.setAttribute("aria-pressed", "true");
    starIcon.classList.remove("fill-none", "text-white");
    starIcon.classList.add("fill-current", "text-yellow-300");
  }
}

function closeImageModalOnBackdrop(event) {
  if (event.target.id === "imageModal") {
    closeImageModal();
  }
}

function closeImageModal() {
  const modal = document.getElementById("imageModal");
  modal.classList.add("hidden");
  currentGalleryItem = null;
}

function downloadImage() {
  const modalImage = document.getElementById("modalImage");
  if (!modalImage.src) return;

  const link = document.createElement("a");
  link.href = modalImage.src;
  link.download = `image-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function starCurrentMedia() {
  if (!currentGalleryItem) return;
  // Gallery items are already starred, so just close the modal
  closeImageModal();
}
