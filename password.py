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

# New function: generate a password from random words
WORD_CATEGORIES = {
    'animals': [
        'cat', 'dog', 'elephant', 'zebra', 'tiger', 'whale', 'kangaroo', 'lion', 'giraffe', 'bear', 'wolf', 'fox', 'rabbit', 'mouse', 'horse', 'monkey', 'shark', 'dolphin', 'penguin', 'deer', 'duck', 'eagle', 'sheep', 'cow', 'crane', 'dragon', 'fish', 'goat', 'pig', 'snake', 'bird', 'chicken', 'pet', 'animal'
    ],
    'foods': [
        'apple', 'banana', 'lemon', 'orange', 'honey', 'yogurt', 'peach', 'grape', 'melon', 'carrot', 'berry', 'cherry', 'plum', 'olive', 'onion', 'garlic', 'cheese', 'bread', 'butter', 'cake', 'candy', 'chocolate', 'cookie', 'cream', 'egg', 'meat', 'milk', 'noodle', 'nut', 'oil', 'pepper', 'pie', 'pizza', 'potato', 'rice', 'salad', 'salt', 'sauce', 'sausage', 'soup', 'sugar', 'tomato', 'vegetable', 'water', 'wine', 'fruit', 'lunch', 'dinner', 'breakfast', 'snack', 'drink', 'tea', 'coffee', 'juice', 'jam', 'ice', 'soda'
    ],
    'objects': [
        'guitar', 'piano', 'violin', 'window', 'notebook', 'mirror', 'lantern', 'kite', 'umbrella', 'jewel', 'quartz', 'star', 'globe', 'idea', 'camera', 'car', 'card', 'chair', 'clock', 'coin', 'cup', 'desk', 'door', 'flag', 'glass', 'hat', 'key', 'knife', 'lamp', 'lock', 'map', 'pen', 'pencil', 'phone', 'photo', 'ring', 'rope', 'ruler', 'scissors', 'shoe', 'spoon', 'stick', 'table', 'watch', 'bag', 'ball', 'basket', 'bed', 'bell', 'bottle', 'box', 'brush', 'bucket', 'button', 'candle', 'cap', 'chain', 'comb', 'couch', 'cushion', 'fan', 'fork', 'hammer', 'jar', 'lid', 'mat', 'mug', 'nail', 'needle', 'pan', 'pot', 'radio', 'sack', 'screw', 'shovel', 'soap', 'sock', 'stool', 'towel', 'tray', 'vase', 'wallet', 'whistle', 'wheel', 'book', 'brain', 'bubble', 'build', 'bush', 'cabin', 'cable', 'cactus', 'calendar', 'calm', 'camp', 'cap', 'chain', 'comb', 'couch', 'cushion', 'fan', 'fork', 'hammer', 'jar', 'lid', 'mat', 'mug', 'nail', 'needle', 'pan', 'pot', 'radio', 'sack', 'screw', 'shovel', 'soap', 'sock', 'stool', 'towel', 'tray', 'vase', 'wallet', 'whistle', 'wheel'
    ],
    'nature': [
        'flower', 'river', 'mountain', 'island', 'forest', 'valley', 'tree', 'sun', 'night', 'ocean', 'zephyr', 'echo', 'dream', 'unity', 'cloud', 'rose', 'star', 'autumn', 'earth', 'lake', 'wind', 'sky', 'moon', 'leaf', 'grass', 'rain', 'snow', 'ice', 'rock', 'sand', 'beach', 'wave', 'spring', 'summer', 'winter', 'seed', 'root', 'branch', 'bush', 'desert', 'cave', 'storm', 'mist', 'fog', 'fire', 'light', 'dark', 'dawn', 'dusk', 'frost', 'petal', 'bloom', 'stream', 'sea', 'hill', 'cliff', 'canyon', 'plain', 'thunder', 'lightning', 'glacier', 'tundra', 'flower', 'river', 'mountain', 'island', 'forest', 'valley', 'tree', 'sun', 'night', 'ocean', 'zephyr', 'echo', 'dream', 'unity', 'cloud', 'rose', 'star', 'autumn', 'earth', 'lake', 'wind', 'sky', 'moon', 'leaf', 'grass', 'rain', 'snow', 'ice', 'rock', 'sand', 'beach', 'wave', 'spring', 'summer', 'winter', 'seed', 'root', 'branch', 'bush', 'desert', 'cave', 'storm', 'mist', 'fog', 'fire', 'light', 'dark', 'dawn', 'dusk', 'frost', 'petal', 'bloom', 'stream', 'sea', 'hill', 'cliff', 'canyon', 'plain', 'thunder', 'lightning', 'glacier', 'tundra'      ],
    'places': [
        'house', 'notebook', 'island', 'valley', 'mountain', 'ocean', 'city', 'village', 'desert', 'beach', 'cave', 'garden', 'castle', 'palace', 'tower', 'bridge', 'road', 'park', 'harbor', 'station', 'avenue'
    ],
    'colors': [
        'black', 'blue', 'green', 'red', 'yellow', 'purple', 'orange', 'pink', 'brown', 'gray', 'white', 'gold', 'silver', 'bronze', 'copper', 'magenta', 'cyan', 'lime', 'teal', 'indigo', 'violet', 'maroon', 'navy', 'olive', 'plum', 'coral', 'turquoise', 'lavender', 'beige', 'chocolate', 'crimson', 'fuchsia', 'ivory', 'khaki', 'salmon', 'sienna', 'tan', 'wheat', 'zinc', 'cream', 'charcoal', 'rust', 'ruby', 'emerald', 'pearl', 'aqua', 'azure', 'scarlet', 'burgundy', 'mauve', 'taupe', 'peach', 'rose', 'mint'
    ],
    'actions': [
        'jump', 'run', 'walk', 'swim', 'fly', 'dance', 'sing', 'play', 'fight', 'hunt', 'fish', 'climb', 'eat', 'drink', 'sleep', 'read', 'write', 'talk', 'listen', 'look', 'see', 'hear', 'smell', 'taste', 'touch', 'think', 'learn', 'work', 'create', 'build', 'destroy', 'open', 'close', 'push', 'pull', 'throw', 'catch', 'kick', 'hit', 'miss', 'score', 'win', 'lose', 'start', 'stop', 'go', 'come', 'sit', 'stand', 'lie', 'give', 'take', 'send', 'receive', 'make', 'do', 'have', 'get', 'put', 'set', 'cut', 'break', 'mend', 'fix', 'cook', 'bake', 'fry', 'boil', 'chop', 'stir', 'pour', 'wash', 'clean', 'dry', 'wear', 'remove', 'drive', 'ride', 'travel', 'explore', 'discover', 'hide', 'seek', 'find', 'lose', 'call', 'answer', 'ask', 'tell', 'show', 'explain', 'predict', 'guess', 'hope', 'wish', 'love', 'hate', 'like', 'dislike', 'fear', 'trust', 'doubt', 'help', 'share', 'borrow', 'lend', 'buy', 'sell', 'pay', 'earn', 'spend', 'save', 'count', 'measure', 'weigh', 'carry', 'lift', 'drop', 'push', 'pull', 'slide', 'roll', 'spin', 'turn', 'twist', 'bend', 'stretch', 'squeeze', 'release', 'grow', 'shrink', 'expand', 'contract', 'glow', 'shine', 'darken', 'brighten', 'fade', 'appear', 'vanish', 'arrive', 'depart', 'enter', 'exit', 'follow', 'lead', 'guide', 'chase', 'flee', 'crawl', 'creep', 'dash', 'rush', 'stroll', 'amble', 'march', 'skip', 'hop', 'skip', 'yell', 'shout', 'whisper', 'mumble', 'giggle', 'laugh', 'cry', 'weep', 'scream', 'moan', 'groan', 'sigh', 'breathe', 'cough', 'sneeze', 'snore', 'yawn', 'blink', 'wink', 'nod', 'shake', 'point', 'beckon', 'wave', 'clap', 'pat', 'stroke', 'hug', 'kiss', 'greet', 'thank', 'apologize', 'forgive', 'remember', 'forget', 'imagine', 'dream', 'plan', 'decide', 'choose', 'create', 'invent', 'destroy', 'repair', 'build', 'demolish', 'plant', 'harvest', 'water', 'feed', 'train', 'teach', 'learn', 'study', 'examine', 'observe', 'analyze', 'compare', 'contrast', 'rank', 'sort', 'filter', 'collect', 'distribute', 'gather', 'spread', 'focus', 'concentrate', 'distract', 'relax', 'rest', 'sleep', 'wake', 'awaken', 'dream'    ],
    'sports': [
        'basketball', 'football', 'baseball', 'soccer', 'tennis', 'golf', 'hockey', 'cricket', 'rugby', 'boxing', 'wrestling', 'mma', 'karate', 'judo', 'taekwondo', 'kickboxing', 'sumo', 'volleyball', 'badminton', 'table tennis', 'swimming', 'gymnastics', 'cycling', 'skiing', 'snowboarding', 'diving', 'fencing', 'archery', 'weightlifting', 'equestrian', 'rowing', 'sailing', 'triathlon', 'handball', 'lacrosse', 'polo', 'squash', 'racquetball', 'bowling', 'darts', 'billiards', 'snooker', 'curling', 'biathlon', 'bobsleigh', 'luge', 'skeleton', 'motocross', 'netball', 'softball', 'trampoline', 'powerlifting',
    ]
}


def generate_word_password(num_words=4, separator='-', categories=None):
    """
    Generates a password by joining random words from selected categories.
    Args:
        num_words (int): Number of words to use.
        separator (str): Separator between words.
        categories (list): List of category names to use. If None, use all.
    Returns:
        str: The generated password.
    """
    if categories is None or not categories:
        pool = sum(WORD_CATEGORIES.values(), [])
    else:
        pool = sum([WORD_CATEGORIES[cat] for cat in categories if cat in WORD_CATEGORIES], [])
    if not pool:
        pool = sum(WORD_CATEGORIES.values(), [])
    words = [secrets.choice(pool) for _ in range(num_words)]
    return separator.join(words)