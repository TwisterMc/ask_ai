# Ask AI Image Generator

A web application that generates images using the Pollinations.AI API, featuring an advanced prompt enhancement system and customizable generation parameters.

## Features

- **AI Image Generation**: Generate images from text descriptions using various AI models
- **Prompt Enhancement**: Automatically enhance your prompts using AI
- **Password Generator**: Create secure, customizable passwords using either random characters or memorable random words
- **API Key Management**: Store your Pollinations.AI API key securely in your browser's local storage
- **Balance Checking**: Check your pollen balance directly from the settings panel
- **Persistent Settings**: Automatically saves and restores your preferred settings
- **Multiple AI Models** (sorted by cost):
  - **$** GPT Image 1 Mini - OpenAI's image model (cheapest, default)
  - **$$** FLUX Schnell - Fast high-quality image generation
  - **$$** Z-Image Turbo - Fast 6B Flux with 2x upscaling
  - **$$$** FLUX.2 Klein 4B - Fast image generation & editing
  - **$$$** FLUX.2 Klein 9B - Higher quality image generation & editing
  - **$$$ PAID** NanoBanana - Gemini 2.5 Flash (requires paid balance)
  - **$$$ PAID** NanoBanana Pro - Gemini 3 Pro (4K, Thinking, requires paid balance)
  - **$$$$ PAID** GPT Image 1.5 - OpenAI's advanced image model (requires paid balance)
  - **$$$$ PAID** Seedream 4.0 - ByteDance ARK (requires paid balance)
  - **$$$$ PAID** Kontext - Context-aware, supports image-to-image (requires paid balance)
  - **$$$$ PAID** Seedream Pro 4.5 - ByteDance ARK (4K, Multi-Image, requires paid balance)

- **Customization Options**:
  - Multiple style presets (photographic, digital art, cinematic, steampunk, cyberpunk, neon, pixel art, and more)
  - Various image sizes (512x512 to 1536x1024, including portrait and landscape options)
  - Quality settings (fast to maximum detail)
  - Adjustable creativity level
  - Seed control (random or fixed for reproducible results)
  - Prompt history with easy reuse
  - Settings persistence across sessions
  - Password length selection (16-100 characters)

## Requirements

- Python 3.9+
- Flask 3.0.0+
- Pillow 10.2.0+
- Requests 2.31.0+

## Installation

1. Clone the repository:

```bash
git clone https://github.com/TwisterMc/ask_ai
cd ask_ai
```

2. Install dependencies:

```bash
python3 -m pip install -r requirements.txt
```

3. (Optional) Set up environment variables:

Create a `.env` file in the project root:

```bash
touch .env
```

You can add optional configuration like:

```
POLLINATIONS_REFERRER=yourdomain.com
```

**Note:** This app uses a strict BYOP (Bring Your Own Pollen) model. All users must provide their own API keys from [enter.pollinations.ai](https://enter.pollinations.ai) - there is no server-side fallback key for security reasons.

## Running the Application

### First Time Only (when you first clone the project):

```bash
cd ask_ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

After this runs once, you're done with setup forever. The `venv` folder is now created with all dependencies installed.

### Every Time You Want to Run the App (after first time setup):

Open your terminal and run:

```bash
cd ask_ai
source venv/bin/activate
flask --app app run
```

The server will start at `http://127.0.0.1:5000`

To stop the server, press `CTRL+C` in the terminal.

### To Deactivate the Virtual Environment (when done):

```bash
deactivate
```

**Summary:**

- **One-time:** Run the "First Time Only" commands above (just once, ever)
- **Every time:** Activate the venv with `source venv/bin/activate`, then run `flask --app app run`
- You can close and reopen your terminal as many times as you want - the `venv` folder is permanent and already has everything installed

## Deployment

### PythonAnywhere (or other hosting)

1. Clone your repository on the hosting platform
2. Create a virtual environment and install dependencies
3. (Optional) Set environment variables:
   - `POLLINATIONS_REFERRER`: (optional) Fallback referrer domain if auto-detection fails
4. Configure your web app to use Flask
5. Update the WSGI configuration to point to `app.py`

**How it works:**

- **Required:** Users must provide their own API keys from [enter.pollinations.ai](https://enter.pollinations.ai)
- API keys are stored in the browser's localStorage (never sent to the app server)
- Keys are sent directly from the browser to Pollinations.AI for each request
- The app automatically detects your domain from the request (e.g., `twistermc.pythonanywhere.com` or `localhost:5000`)
- The domain is sent to the Pollinations API as the referrer
- If auto-detection fails for some reason, it falls back to the `POLLINATIONS_REFERRER` environment variable (defaults to `localhost:5000`)

**API Key Management (BYOP - Bring Your Own Pollen):**

- Users are **required** to provide their own API keys for all AI features
- Get a free account at [enter.pollinations.ai](https://enter.pollinations.ai)
- Copy your API Bearer token (starts with `sk_`)
- Click "AI Settings" in the footer to add your key
- Keys are stored locally in your browser only (never on the server)
- No server-side API key fallback - this ensures security and fair usage

## Usage

### First: Set Up Your API Key

1. Click "AI Settings" in the footer of any page
2. Get your free API key from [enter.pollinations.ai](https://enter.pollinations.ai)
3. Paste your key into the settings dialog
4. Click "Validate" to test your key
5. Click "Check Balance" to see your pollen balance
6. Click "Save" to store the key in your browser

Your API key is stored only in your browser's localStorage and is never sent to this app's server.

### Generate Images

1. Enter a text prompt describing the image you want to generate
2. (Optional) Enter a negative prompt to specify what you don't want in the image
3. (Optional) Click "Enhance" to improve your prompt using AI
4. Choose your desired options:
   - Select an AI model
   - Choose an art style
   - Set image size
   - Adjust quality level
   - Set creativity level
   - Configure seed (random or fixed value for reproducible results)
5. Click "Generate Image" to create your image
6. Previous prompts are saved in the history for easy reuse

### Generate Passwords

1. Go to `/password` or click the "Password Generator" link in the app
2. By default, the generator uses random words for memorability
3. Select the number of words (4–10) and one or more categories
4. Optionally, switch to random characters
5. Click "Generate Password" to get your password, and use the copy button for convenience

## API Endpoints

- `POST /enhance_prompt`: Enhance a text prompt using AI (powered by Pollinations.AI)
- `POST /generate`: Generate an image from a prompt (powered by Pollinations.AI)
- `POST /api/generate_password`: Generate a secure password (JSON: `{ "length": 20 }`)
- `POST /api/validate_key`: Validate a Pollinations.AI API key (requires Authorization header)
- `POST /api/check_balance`: Check pollen balance for an API key (requires Authorization header)
- `GET /`: Main application interface
- `GET /password`: Password generator interface
- `GET /image`: Image generator interface

## Technical Features

- **Local Storage**: Persists user preferences and prompt history
- **Accessibility Enhancements**:
  - Scroll locking during loading states
  - Loading overlay with semi-transparent background
  - Proper ARIA states for all interactive elements
- **Progressive Enhancement**:
  - Graceful fallbacks for all features
  - Smooth loading states and transitions
  - Responsive design for all screen sizes

## Accessibility (WCAG 2.2)

The application follows WCAG 2.2 guidelines to ensure accessibility for all users:

### Perceivable

- High contrast text and interface elements (minimum 4.5:1 ratio)
- Images include descriptive alt text
- Form controls have visible labels
- Focus states are clearly visible
- Text can be resized up to 200% without loss of functionality

### Operable

- All functionality is available via keyboard
- Skip to main content link for keyboard users
- No keyboard traps
- Sufficient time provided for interactions
- No content flashing or flashing animations
- Clear page structure with proper headings
- Multiple ways to access content (navigation, search, etc.)

### Understandable

- Clear and consistent navigation
- Form labels are descriptive
- Error messages are clear and helpful
- Input assistance through enhanced prompts
- Predictable interface behavior

### Robust

- Valid HTML5 markup
- ARIA labels and roles where needed
- Compatible with assistive technologies
- Responsive design for different viewport sizes

### Interactive Elements

- Buttons have clear focus states
- Range inputs use native controls for better accessibility
- Form controls have proper labels and ARIA attributes
- Dynamic content updates are announced to screen readers
- History panel is keyboard accessible
- Loading states prevent interaction when appropriate
- Scroll locking during modal states
- Persistent form settings across sessions

## Styling Guidelines

### Tailwind CSS Usage

We use Tailwind CSS for all styling in this project. Here are the key principles:

1. **No Custom CSS**
   - Use Tailwind utility classes for all styling needs
   - Avoid inline styles and custom CSS classes
   - If a style can't be achieved with utilities, consider using Tailwind's @apply or adjusting the Tailwind config

2. **Common Patterns**
   - Forms: Use standard classes for inputs and controls
     ```html
     <input
       class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
     />
     ```
   - Buttons: Maintain consistent button styling
     ```html
     <button
       class="bg-blue-700 text-white py-2 px-4 rounded-lg hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
     ></button>
     ```
   - Focus States: Use Tailwind's focus utilities
     ```html
     focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none
     ```

3. **Accessibility**
   - Use Tailwind's built-in accessibility classes
   - Maintain proper color contrast using Tailwind's color palette
   - Ensure focus states are visible using focus: utilities
   - Use sr-only class for screen reader content

4. **Responsive Design**
   - Use Tailwind's responsive prefixes (sm:, md:, lg:, xl:)
   - Mobile-first approach with progressive enhancement

5. **Dark Mode** (if implemented)
   - Use dark: prefix for dark mode variants
   - Maintain consistent contrast ratios in both modes

### Example Components

```html
<!-- Form Input -->
<input
  class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
/>

<!-- Primary Button -->
<button
  class="bg-blue-700 text-white py-2 px-4 rounded-lg hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
>
  <!-- Card Container -->
  <div class="bg-white rounded-lg shadow-lg p-6">
    <!-- Skip Link -->
    <a
      class="absolute -top-10 left-0 bg-blue-600 text-white p-2 z-50 transition-all duration-300 focus:top-0"
    ></a>
  </div>
</button>
```

## Error: externally-managed-environment?

1. First, create a virtual environment in your project directory: `python3 -m venv venv`
2. Activate the virtual environment: `source venv/bin/activate`
3. Then install the requirements: `pip install -r requirements.txt`
