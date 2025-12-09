# Ask AI Image Generator

A web application that generates images using the Pollinations.AI API, featuring an advanced prompt enhancement system and customizable generation parameters.

## Features

- **AI Image Generation**: Generate images from text descriptions using various AI models
- **Prompt Enhancement**: Automatically enhance your prompts using AI
- **Password Generator**: Create secure, customizable passwords using either random characters or memorable random words.
- **Persistent Settings**: Automatically saves and restores your preferred settings
- **Multiple AI Models**:

  - FLUX (Latest - Best Quality)
  - Turbo (Fast Generation)
  - GPT Image
  - Kontext (Image-to-Image transformations)

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

2. (Optional) Set up your API token:

Create a `.env` file in the project root:

```bash
echo 'POLLINATIONS_API_TOKEN=your-api-key-here' > .env
```

Replace `your-api-key-here` with your API key from [enter.pollinations.ai](https://enter.pollinations.ai). This enables watermark removal on generated images.

3. Install dependencies:

```bash
python3 -m pip install -r requirements.txt
```

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
3. Set environment variables for optional features:
   - `POLLINATIONS_API_TOKEN`: Your Bearer token from [enter.pollinations.ai](https://enter.pollinations.ai) (optional - enables watermark removal)
   - `POLLINATIONS_REFERRER`: (optional) Fallback referrer domain if auto-detection fails
4. Configure your web app to use Flask
5. Update the WSGI configuration to point to `app.py`

**How it works:**

- The app automatically detects your domain from the request (e.g., `twistermc.pythonanywhere.com` or `localhost:5000`)
- The domain is sent to the Pollinations API as the referrer
- If auto-detection fails for some reason, it falls back to the `POLLINATIONS_REFERRER` environment variable (defaults to `localhost:5000`)

**For watermark removal and higher rate limits:**

- Get a free account at [enter.pollinations.ai](https://enter.pollinations.ai) (formerly auth.pollinations.ai)
- Copy your API Bearer token
- Add `POLLINATIONS_API_TOKEN` as an environment variable on your hosting platform
- The API will automatically use your token for watermark removal and higher rate limits

## Usage

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
7. **To generate a password:**
   - Go to `/password` or click the "Password Generator" link in the app.
   - By default, the generator uses random words for memorability.
   - Select the number of words (4–10) and one or more categories.
   - Optionally, switch to random characters.
   - Click "Generate Password" to get your password, and use the copy button for convenience.

## API Endpoints

- `POST /enhance_prompt`: Enhance a text prompt using AI (powered by Pollinations.AI)
- `POST /generate`: Generate an image from a prompt (powered by Pollinations.AI)
- `POST /api/generate_password`: Generate a secure password (JSON: `{ "length": 20 }`)
- `GET /`: Main application interface
- `GET /password`: Password generator interface

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
