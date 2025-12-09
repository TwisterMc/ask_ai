import os

# API Configuration
API_CONFIG = {
    'IMAGE_API': os.getenv('POLLINATIONS_IMAGE_API', 'https://gen.pollinations.ai/image/'),
    'TEXT_API': os.getenv('POLLINATIONS_TEXT_API', 'https://gen.pollinations.ai/text/'),
    'API_TOKEN': os.getenv('POLLINATIONS_API_TOKEN', ''),  # Optional: Bearer token for authentication
    'REFERRER': os.getenv('POLLINATIONS_REFERRER', 'localhost:5000'),  # Fallback for local development
    'DEFAULT_MODEL': 'flux',
    'TIMEOUT': 120,  # Increased from 30 to 120 seconds for image generation
}
