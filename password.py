import secrets
import string

def generate_secure_password(length=16, include_lowercase=True, include_uppercase=True, include_digits=True, include_symbols=True):
    """
    Generates a secure, random password.

    Args:
        length (int): The desired length of the password.
        include_lowercase (bool): Whether to include lowercase letters.
        include_uppercase (bool): Whether to include uppercase letters.
        include_digits (bool): Whether to include digits.
        include_symbols (bool): Whether to include symbols.

    Returns:
        str: The generated secure password.
    """
    characters = ""
    if include_lowercase:
        characters += string.ascii_lowercase
    if include_uppercase:
        characters += string.ascii_uppercase
    if include_digits:
        characters += string.digits
    if include_symbols:
        characters += string.punctuation # Or define your own specific symbols

    if not characters:
        raise ValueError("At least one character type must be included.")

    # Ensure at least one character from each selected type is included
    password_list = []
    if include_lowercase:
        password_list.append(secrets.choice(string.ascii_lowercase))
    if include_uppercase:
        password_list.append(secrets.choice(string.ascii_uppercase))
    if include_digits:
        password_list.append(secrets.choice(string.digits))
    if include_symbols:
        password_list.append(secrets.choice(string.punctuation))

    # Fill the rest of the password length with random choices from all allowed characters
    for _ in range(length - len(password_list)):
        password_list.append(secrets.choice(characters))

    secrets.SystemRandom().shuffle(password_list) # Shuffle to randomize order

    return "".join(password_list)

# Example usage:
try:
    password = generate_secure_password(length=20, include_symbols=True)
    print(f"Generated Password: {password}")

    memorable_password = generate_secure_password(
        length=12,
        include_lowercase=True,
        include_uppercase=True,
        include_digits=True,
        include_symbols=False # For a slightly less complex but still strong password
    )
    print(f"Memorable Password: {memorable_password}")

except ValueError as e:
    print(f"Error: {e}")