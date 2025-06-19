import os
import io
import base64
import requests
from flask import Flask, render_template, request, jsonify
from PIL import Image
from urllib.parse import quote

# Initialize Flask app
app = Flask(__name__)

# Import API configuration
from config import API_CONFIG

@app.route("/enhance_prompt", methods=["POST"])
def enhance_prompt():
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")
        if not prompt:
            return jsonify({"success": False, "error": "No prompt provided"})

        # Create the URL for prompt enhancement
        additional_prompt = '. Only respond with the updated text.'
        encoded_prompt = quote(f"enhance this prompt: {prompt} {additional_prompt}")
        enhancement_url = f"{API_CONFIG['TEXT_API']}{encoded_prompt}"
        
        # Make request to Pollinations Text API
        response = requests.get(enhancement_url, timeout=API_CONFIG['TIMEOUT'])
        
        if response.status_code != 200:
            raise Exception(f"API request failed with status {response.status_code}")
            
        # Extract the content between quotes from the longer response
        text = response.text.strip()
        
        # Regex pattern to find a sentence that starts with "Sure!" or similar and extract the actual prompt
        import re
        pattern = r'(?:Sure!|Here\'s|I can help)[^"]*"([^"]+)"'
        match = re.search(pattern, text)
        
        if match:
            enhanced_prompt = match.group(1).strip()
        else:
            # Fallback to looking for any quoted text
            start_quote = text.find('"')
            end_quote = text.rfind('"')
            if start_quote != -1 and end_quote != -1 and end_quote > start_quote:
                enhanced_prompt = text[start_quote + 1:end_quote]
            else:
                enhanced_prompt = text
            
        return jsonify({
            "success": True,
            "enhanced_prompt": enhanced_prompt
        })
        
    except Exception as e:
        print(f"Error enhancing prompt: {str(e)}")
        return jsonify({"success": False, "error": str(e)})

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/generate", methods=["POST"])
def generate_image():
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")
        if not prompt:
            return jsonify({"success": False, "error": "No prompt provided"})
        
        # Get parameters from request
        style = data.get("style", "photographic")
        model = data.get("model", "SDXL")
        size = data.get("size", "1024x1024")
        quality = data.get("quality", "balanced")
        guidance = float(data.get("guidance", 7.0))
        
        # Convert quality setting to steps
        steps_map = {
            "fast": 20,
            "balanced": 30,
            "detailed": 50,
            "maximum": 75
        }
        steps = steps_map.get(quality, 30)
        
        # Parse width and height from size
        width, height = map(int, size.split('x'))
        
        # Build the complete prompt with style
        complete_prompt = f"{style} style: {prompt}"
        
        # Create the complete URL with all parameters
        encoded_prompt = quote(complete_prompt)
        image_url = (f"{API_CONFIG['IMAGE_API']}{encoded_prompt}?"
                    f"nologo=true&"
                    f"model={model}&"
                    f"width={width}&"
                    f"height={height}&"
                    f"steps={steps}&"
                    f"guidance_scale={guidance}")
        
        # Make request to Pollinations API
        img_response = requests.get(image_url, timeout=API_CONFIG['TIMEOUT'])
        
        if img_response.status_code != 200:
            raise Exception(f"API request failed with status {img_response.status_code}")
            
        # Convert the image data to a PIL Image
        img = Image.open(io.BytesIO(img_response.content))
        
        # Save to memory buffer
        img_io = io.BytesIO()
        img.save(img_io, 'PNG')
        img_io.seek(0)
                    
        # Create a data URL
        img_str = base64.b64encode(img_io.getvalue()).decode()
        data_url = f"data:image/png;base64,{img_str}"
        return jsonify({"success": True, "url": data_url})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
