import os

# API Configuration
API_CONFIG = {
    'IMAGE_API': os.getenv('POLLINATIONS_IMAGE_API', 'https://image.pollinations.ai/prompt/'),
    'TEXT_API': os.getenv('POLLINATIONS_TEXT_API', 'https://text.pollinations.ai/prompt/'),
    'DEFAULT_MODEL': 'SDXL',
    'DEFAULT_STEPS': 30,
    'TIMEOUT': 120,  # Increased from 30 to 120 seconds for image generation
}
