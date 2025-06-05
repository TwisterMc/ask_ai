// Prompt history management
let promptHistory = JSON.parse(localStorage.getItem('promptHistory') || '[]');

// Track current image prompt for downloads
let currentImagePrompt = '';

// Track modal focus management
let previousActiveElement = null;
let modalFocusableElements = [];
let firstFocusableElement = null;
let lastFocusableElement = null;

// Form settings management

/**
 * Saves the current form settings to localStorage
 * Persists model, style, size, quality, and guidance settings
 */
function saveFormSettings() {
    const settings = {
        model: document.getElementById('model').value,
        style: document.getElementById('style').value,
        size: document.getElementById('size').value,
        quality: document.getElementById('quality').value,
        guidance: document.getElementById('guidance').value
    };
    localStorage.setItem('formSettings', JSON.stringify(settings));
}

/**
 * Loads saved form settings from localStorage
 * Applies saved settings or falls back to defaults
 */
function loadFormSettings() {
    const settings = JSON.parse(localStorage.getItem('formSettings'));
    if (settings) {
        document.getElementById('model').value = settings.model || 'SDXL';
        document.getElementById('style').value = settings.style || 'photographic';
        document.getElementById('size').value = settings.size || '1024x1024';
        document.getElementById('quality').value = settings.quality || 'balanced';
        document.getElementById('guidance').value = settings.guidance || '7.0';
        // Update guidance value display
        document.getElementById('guidance-value').textContent = settings.guidance || '7.0';
    }
}

// Set up button event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load saved settings and set up listeners
    loadFormSettings();
    updateHistoryDisplay();
});

/**
 * Toggles the visibility of the prompt history panel
 * Updates ARIA states and chevron rotation
 */
function toggleHistory() {
    const historyDiv = document.getElementById('prompt-history');
    const chevron = document.getElementById('history-chevron');
    const button = chevron.closest('button');
    const isExpanded = !historyDiv.classList.contains('hidden');

    historyDiv.classList.toggle('hidden');
    chevron.classList.toggle('rotate-180');

    // Update ARIA state
    button.setAttribute('aria-expanded', (!isExpanded).toString());
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
    localStorage.setItem('promptHistory', JSON.stringify(promptHistory));
    updateHistoryDisplay();
}

/**
 * Updates the prompt history display in the UI
 * Creates buttons for each historical prompt
 */
function updateHistoryDisplay() {
    const historyDiv = document.getElementById('prompt-history');
    historyDiv.innerHTML = promptHistory.map((prompt, index) => {
        // Properly escape the prompt for the onclick attribute
        const escapedPrompt = prompt
            .replace(/'/g, "\\'")            // Escape single quotes
            .replace(/"/g, '\\"')            // Escape double quotes
            .replace(/\n/g, '\\n')           // Escape newlines
            .replace(/\r/g, '\\r')           // Escape carriage returns
            .replace(/✨/g, '\\u2728');      // Escape sparkle emoji

        return `
            <button type="button" class="text-sm p-2 w-full text-left hover:bg-blue-100 focus:bg-gray-100 rounded mb-1 ${index % 2 === 1 ? 'bg-gray-100' : ''}" 
                onclick="useHistoryPrompt(event, '${escapedPrompt}')">
                ${prompt}
            </button>
        `;
    }).join('');
}

/**
 * Updates the prompt input with a historical prompt and shows notification
 * @param {Event} event - The click event
 * @param {string} prompt - The historical prompt to use
 */
function useHistoryPrompt(event, prompt) {
    event.preventDefault();
    document.getElementById('prompt').value = prompt;
    
    // Hide the notification first if it's visible
    const notification = document.getElementById('prompt-notification');
    if (!notification.classList.contains('hidden')) {
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
    const notification = document.getElementById('prompt-notification');
    notification.classList.remove('hidden');
    // Wait a tiny bit for the display:block to take effect
    setTimeout(() => {
        notification.classList.remove('translate-y-full');
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
    const notification = document.getElementById('prompt-notification');
    notification.classList.add('translate-y-full');
    // Wait for animation to finish before hiding
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 300);
}

/**
 * Scrolls smoothly to the prompt input field
 */
function scrollToPrompt() {
    const promptElement = document.getElementById('prompt');
    promptElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        'generateButton', 'enhanceButton', 'prompt', 'model',
        'style', 'size', 'quality', 'guidance'
    ].map(id => document.getElementById(id));

    // Update form controls disabled states
    controls.forEach(control => {
        if (disabled) {
            control.setAttribute('disabled', '');
        } else {
            control.removeAttribute('disabled');
        }
        control.setAttribute('aria-disabled', disabled.toString());
    });

}

/**
 * Generates an image based on the current form settings
 * Shows loading state and handles errors
 * @returns {Promise<void>}
 */
async function generateImage() {
    const prompt = document.getElementById('prompt').value;
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    const error = document.getElementById('error');
    const img = document.getElementById('generated-image');

    if (!prompt) {
        error.textContent = 'Please enter a prompt';
        error.classList.remove('hidden');
        return;
    }

    loading.classList.remove('hidden');
    result.classList.add('hidden');
    error.classList.add('hidden');
    document.body.classList.add('overflow-hidden');
    setFormControlsDisabled(true);

    try {
        // Add to history when generating an image
        addToHistory(prompt);

        const style = document.getElementById('style').value;
        const model = document.getElementById('model').value;
        const size = document.getElementById('size').value;
        const quality = document.getElementById('quality').value;
        const guidance = document.getElementById('guidance').value;

        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, style, model, size, quality, guidance }),
        });

        const data = await response.json();

        if (data.success) {
            img.src = data.url;
            img.alt = `AI generated image based on prompt: ${prompt}`;
            currentImagePrompt = prompt; // Store the prompt for download
            result.classList.remove('hidden');
            // Wait for the image to load before scrolling
            img.onload = () => {
                result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            };
        } else {
            throw new Error(data.error || 'Failed to generate image');
        }
    } catch (err) {
        error.textContent = `Error: ${err.message}`;
        error.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        setFormControlsDisabled(false);
    }
}

/**
 * Enhances the current prompt using AI
 * Shows loading state and handles errors
 * @returns {Promise<void>}
 */
async function enhancePrompt() {
    const promptElement = document.getElementById('prompt');
    const originalPrompt = promptElement.value;
    const error = document.getElementById('error');
    const loading = document.getElementById('loading');
    const loadingText = loading.querySelector('p');
    const originalLoadingText = loadingText.textContent;

    if (!originalPrompt) {
        error.textContent = 'Please enter a prompt first';
        error.classList.remove('hidden');
        return;
    }
    
    // Save the original prompt to history before enhancement
    addToHistory(originalPrompt);

    error.classList.add('hidden');
    loading.classList.remove('hidden');
    loadingText.textContent = 'Enhancing prompt...';
    document.body.classList.add('overflow-hidden');
    setFormControlsDisabled(true);

    try {
        const response = await fetch('/enhance_prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: originalPrompt }),
        });

        const data = await response.json();

        if (data.success) {
            // Update the prompt field with enhanced version
            promptElement.value = data.enhanced_prompt;
            // Add enhanced prompt to history with a prefix to distinguish it
            addToHistory(`✨ ${data.enhanced_prompt}`);
        } else {
            throw new Error(data.error || 'Failed to enhance prompt');
        }
    } catch (err) {
        error.textContent = err.message;
        error.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        loadingText.textContent = originalLoadingText;
        setFormControlsDisabled(false);
    }
}

/**
 * Opens the image modal with the full-size image
 * @param {string} imageUrl - URL of the image to display
 * @param {string} altText - Alt text for the image
 */
function openImageModal(imageUrl, altText) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    
    modalImage.src = imageUrl;
    modalImage.alt = altText;
    
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    // Handle clicking outside the modal to close it
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeImageModal();
        }
    });

    // Handle Escape key to close modal
    document.addEventListener('keydown', handleEscapeKey);

    // Set up focus trap
    focusTrapOnModal(modal);
}

/**
 * Closes the image modal
 */
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    
    // Remove event listeners
    document.removeEventListener('keydown', handleEscapeKey);
    modal.removeEventListener('keydown', trapFocus);
    
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
    if (event.key === 'Escape') {
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
        .replace(/^✨\s*/, '')           // Remove sparkle prefix
        .replace(/^Sure!\s*Here['s:]?\s*/i, '')  // Remove "Sure! Here" prefix
        .replace(/^Here['s:]?\s*/i, ''); // Remove "Here's" prefix

    // Then sanitize for filename
    return cleanText
        .replace(/[^a-z0-9-_\s]/gi, '') // Remove invalid chars
        .replace(/\s+/g, '-')           // Replace spaces with hyphens
        .substring(0, 50)               // Limit length
        .trim();                        // Remove trailing spaces
}

/**
 * Downloads the currently displayed modal image
 */
async function downloadImage() {
    const modalImage = document.getElementById('modalImage');
    const imageUrl = modalImage.src;
    // Use stored prompt instead of trying to extract from alt text
    const sanitizedPrompt = sanitizeFilename(currentImagePrompt);
    const timestamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
    const filename = sanitizedPrompt 
        ? `ai-image-${sanitizedPrompt}-${timestamp}.png` 
        : `ai-generated-image-${timestamp}.png`;
    
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error downloading image:', error);
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = 'Error downloading image';
        errorDiv.classList.remove('hidden');
    }
}

/**
 * Sets up focus trap within the modal
 * @param {HTMLElement} modal - The modal element
 */
function focusTrapOnModal(modal) {
    // Get all focusable elements within the modal
    modalFocusableElements = Array.from(modal.querySelectorAll(`
        a[href], area[href], input:not([disabled]), select:not([disabled]), 
        textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])
    `));

    if (modalFocusableElements.length === 0) return;

    firstFocusableElement = modalFocusableElements[0];
    lastFocusableElement = modalFocusableElements[modalFocusableElements.length - 1];

    // Remember the currently focused element
    previousActiveElement = document.activeElement;

    // Focus the first element in the modal
    firstFocusableElement.focus();

    // Add event listener to trap focus within the modal
    modal.addEventListener('keydown', trapFocus);
}

/**
 * Traps the focus within the modal
 * @param {KeyboardEvent} event - The keyboard event
 */
function trapFocus(event) {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) { // Shift + Tab
        if (document.activeElement === firstFocusableElement) {
            event.preventDefault();
            lastFocusableElement.focus();
        }
    } else { // Tab
        if (document.activeElement === lastFocusableElement) {
            event.preventDefault();
            firstFocusableElement.focus();
        }
    }
}
