async function generatePassword() {
    const passwordBox = document.getElementById('passwordBox');
    const passwordLength = document.getElementById('passwordLength');
    let length = Number(passwordLength.value);
    if (length < 16) {
        length = 16
        passwordLength.value = 16
    }
    if (length > 100) {
        length = 100
        passwordLength.value = 100
    }
    const response = await fetch('/api/generate_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length })
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