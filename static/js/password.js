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