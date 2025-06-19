function showTab(tab) {
    const tabCharacters = document.getElementById('tab-characters');
    const tabWords = document.getElementById('tab-words');
    const panelCharacters = document.getElementById('panel-characters');
    const panelWords = document.getElementById('panel-words');
    const useWords = document.getElementById('useWords');

    // Always keep both tabs tabbable
    tabCharacters.setAttribute('tabindex', '0');
    tabWords.setAttribute('tabindex', '0');

    if (tab === 'characters') {
        tabCharacters.classList.add('text-blue-700', 'border-blue-700');
        tabCharacters.classList.remove('text-gray-600', 'border-transparent');
        tabCharacters.setAttribute('aria-selected', 'true');
        tabWords.setAttribute('aria-selected', 'false');
        tabWords.classList.remove('text-blue-700', 'border-blue-700');
        tabWords.classList.add('text-gray-600', 'border-transparent');
        panelCharacters.classList.remove('hidden');
        panelWords.classList.add('hidden');
        useWords.value = 'false';
        tabCharacters.focus();
    } else {
        tabWords.classList.add('text-blue-700', 'border-blue-700');
        tabWords.classList.remove('text-gray-600', 'border-transparent');
        tabWords.setAttribute('aria-selected', 'true');
        tabCharacters.setAttribute('aria-selected', 'false');
        tabCharacters.classList.remove('text-blue-700', 'border-blue-700');
        tabCharacters.classList.add('text-gray-600', 'border-transparent');
        panelWords.classList.remove('hidden');
        panelCharacters.classList.add('hidden');
        useWords.value = 'true';
        tabWords.focus();
    }
}

function setupTabAccessibility() {
    const tabs = [document.getElementById('tab-characters'), document.getElementById('tab-words')];
    tabs.forEach((tab, idx) => {
        tab.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
                tabs[nextIdx].focus();
                tabs[nextIdx].click();
            }
        });
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        showTab('characters');
        setupTabAccessibility();
    });
}

async function generatePassword() {
    const passwordBox = document.getElementById('passwordBox');
    const passwordLength = document.getElementById('passwordLength');
    const useWords = document.getElementById('useWords').value === 'true';
    let length = Number(passwordLength.value);
    let numWords = 4;
    if (useWords) {
        const numWordsInput = document.getElementById('numWords');
        if (numWordsInput) {
            numWords = Math.max(4, Math.min(10, Number(numWordsInput.value)));
            document.getElementById('numWords').value = numWords;
        }
    }
    if (!useWords && length < 16) {
        length = 16;
        passwordLength.value = 16;
    }
    const response = await fetch('/api/generate_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length, useWords, numWords })
    });
    const data = await response.json();
    passwordBox.value = data.password;
}

function showCopyNotification(message, isError = false) {
    const notification = document.getElementById('copy-notification');
    notification.textContent = message;
    notification.classList.remove('hidden');
    notification.classList.toggle('bg-green-100', !isError);
    notification.classList.toggle('text-green-700', !isError);
    notification.classList.toggle('border-green-200', !isError);
    notification.classList.toggle('bg-red-100', isError);
    notification.classList.toggle('text-red-700', isError);
    notification.classList.toggle('border-red-200', isError);
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 2000);
}

function copyPassword() {
    const passwordBox = document.getElementById('passwordBox');
    const password = passwordBox.value;
    if (password) {
        navigator.clipboard.writeText(password).then(() => {
            showCopyNotification('Password copied to clipboard!');
        }, () => {
            showCopyNotification('Failed to copy password.', true);
        });
    } else {
        showCopyNotification('No password to copy.', true);
    }
}