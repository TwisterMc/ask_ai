// Shared modal functions for image viewing
let previousActiveElement = null;
let modalFocusableElements = [];
let firstFocusableElement = null;
let lastFocusableElement = null;

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

function closeImageModalOnBackdrop(event) {
  if (event.target.id === "imageModal") {
    closeImageModal();
  }
}

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

function handleEscapeKey(event) {
  if (event.key === "Escape") {
    closeImageModal();
  }
}

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

async function downloadImage() {
  const modalImage = document.getElementById("modalImage");
  const imageUrl = modalImage.src;
  // Use stored prompt from either main page or gallery
  const prompt =
    window.currentImagePrompt ||
    (window.currentGalleryItem && window.currentGalleryItem.prompt) ||
    "";
  const sanitizedPrompt = sanitizeFilename(prompt);
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
    alert("Error downloading image");
  }
}

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

function trapFocus(event) {
  if (event.key === "Tab") {
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
}
