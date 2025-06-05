// Prompt history management
let promptHistory = JSON.parse(localStorage.getItem('promptHistory') || '[]');

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
 * Adds a prompt to the history if it doesn't already exist
 * @param {string} prompt - The prompt to add to history
 */
function addToHistory(prompt) {
    // Only add if the prompt doesn't already exist in history
    if (!promptHistory.includes(prompt)) {
        // Add to the beginning of array and keep only last 25 items
        promptHistory.unshift(prompt);
        promptHistory = promptHistory.slice(0, 50);
        localStorage.setItem('promptHistory', JSON.stringify(promptHistory));
        updateHistoryDisplay();
    }
}

/**
 * Updates the prompt history display in the UI
 * Creates buttons for each historical prompt
 */
function updateHistoryDisplay() {
    const historyDiv = document.getElementById('prompt-history');
    historyDiv.innerHTML = promptHistory.map((prompt, index) => `
        <button type="button" class="text-sm p-2 w-full text-left hover:bg-blue-100 focus:bg-gray-100 rounded mb-1 ${index % 2 === 1 ? 'bg-gray-100' : ''}" 
             onclick="useHistoryPrompt(event, '${prompt.replace(/'/g, "\\'")}')">
            ${prompt}
        </button>
    `).join('');
}

function useHistoryPrompt(event, prompt) {
    event.preventDefault();
    document.getElementById('prompt').value = prompt;
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
