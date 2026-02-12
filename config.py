import os

# API Configuration
API_CONFIG = {
    'IMAGE_API': os.getenv('POLLINATIONS_IMAGE_API', 'https://gen.pollinations.ai/image/'),
    'MODELS_API': os.getenv('POLLINATIONS_MODELS_API', 'https://gen.pollinations.ai/image/models'),
    'TEXT_API': os.getenv('POLLINATIONS_TEXT_API', 'https://gen.pollinations.ai/text/'),
    'TEXT_MODELS_API': os.getenv('POLLINATIONS_TEXT_MODELS_API', 'https://gen.pollinations.ai/text/models'),
    'CHAT_COMPLETIONS_API': os.getenv('POLLINATIONS_CHAT_API', 'https://gen.pollinations.ai/v1/chat/completions'),
    'CHAT_MODELS_API': os.getenv('POLLINATIONS_CHAT_MODELS_API', 'https://gen.pollinations.ai/v1/models'),
    'API_TOKEN': os.getenv('POLLINATIONS_API_TOKEN', ''),  # Optional: Bearer token for authentication
    'REFERRER': os.getenv('POLLINATIONS_REFERRER', 'localhost:5000'),  # Fallback for local development
    'DEFAULT_MODEL': 'gptimage',  # Cheapest model
    'TIMEOUT': 120,  # Increased from 30 to 120 seconds for image generation
}
