# Ask AI Image Generator

A web application that generates images using the Pollinations.AI API, featuring an advanced prompt enhancement system and customizable generation parameters.

## Features

- **AI Image Generation**: Generate images from text descriptions using various AI models
- **Prompt Enhancement**: Automatically enhance your prompts using AI
- **Password Generator**: Generate secure, customizable passwords with adjustable length (minimum 16 characters)
- **Persistent Settings**: Automatically saves and restores your preferred settings
- **Multiple AI Models**:
  - SDXL (Best Quality)
  - Stable Diffusion 1.5
  - Anything V5 (Anime)
  - Dreamshaper V7
  - Openjourney V4 (Midjourney Style)
  - Portrait V1 (People)
  - Realistic V3

- **Customization Options**:
  - Multiple style presets (photographic, digital art, cinematic, etc.)
  - Various image sizes (512x512 to 1536x1024)
  - Quality settings (fast to maximum detail)
  - Adjustable creativity level
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

## Running the Application

1. Start the Flask server:
```bash
python3 app.py
```

2. Open your web browser and navigate to:
```
http://localhost:5000
```

## Usage

1. Enter a text prompt describing the image you want to generate
2. (Optional) Click "Enhance" to improve your prompt using AI
3. Choose your desired options:
   - Select an AI model
   - Choose an art style
   - Set image size
   - Adjust quality level
   - Set creativity level
4. Click "Generate Image" to create your image
5. Previous prompts are saved in the history for easy reuse
6. **To generate a password:**
   - Go to `/password` or click the "Password Generator" link in the app (if available)
   - Select your desired password length (16-100)
   - Click "Generate Password" to get a secure password

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
     <input class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none">
     ```
   - Buttons: Maintain consistent button styling
     ```html
     <button class="bg-blue-700 text-white py-2 px-4 rounded-lg hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
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
<input class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none">

<!-- Primary Button -->
<button class="bg-blue-700 text-white py-2 px-4 rounded-lg hover:bg-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">

<!-- Card Container -->
<div class="bg-white rounded-lg shadow-lg p-6">

<!-- Skip Link -->
<a class="absolute -top-10 left-0 bg-blue-600 text-white p-2 z-50 transition-all duration-300 focus:top-0">
```