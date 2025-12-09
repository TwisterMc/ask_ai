import io
import base64
import requests
from flask import jsonify
from PIL import Image
from urllib.parse import quote
from config import API_CONFIG
import re
from requests.exceptions import Timeout, ConnectionError, RequestException

def enhance_prompt_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")
        if not prompt:
            return jsonify({"success": False, "error": "No prompt provided"})
        # Simplify the prompt to avoid parsing issues with the API
        enhancement_prompt = f"Enhance this prompt for an AI image generator: {prompt}"
        encoded_prompt = quote(enhancement_prompt)
        # Build enhancement URL without referrer initially
        enhancement_url = f"{API_CONFIG['TEXT_API']}{encoded_prompt}"
        
        # Add referrer if not localhost (API doesn't accept IP addresses as referrer)
        host = request.host or API_CONFIG['REFERRER']
        if host and not host.startswith('127.0.0.1') and not host.startswith('localhost'):
            enhancement_url += f"?referrer={host}"
        
        print(f"Enhancement URL: {enhancement_url}")
        
        # Prepare headers with Bearer token if available
        headers = {}
        if API_CONFIG['API_TOKEN']:
            headers['Authorization'] = f"Bearer {API_CONFIG['API_TOKEN']}"
        
        try:
            response = requests.get(enhancement_url, headers=headers, timeout=API_CONFIG['TIMEOUT'])
        except Timeout:
            print(f"Timeout connecting to enhancement API")
            return jsonify({"success": False, "error": "The AI enhancement service took too long to respond. Please try again."})
        except ConnectionError as e:
            print(f"Connection error: {str(e)}")
            return jsonify({"success": False, "error": "Failed to connect to the enhancement service. Please check your internet connection."})
        except RequestException as e:
            print(f"Request error: {str(e)}")
            return jsonify({"success": False, "error": f"Error communicating with enhancement service: {str(e)}"})
        
        if response.status_code != 200:
            print(f"API Error {response.status_code}: {response.text}")
            return jsonify({"success": False, "error": f"Enhancement service returned error {response.status_code}. Please try again."})
        
        text = response.text.strip()
        pattern = r'(?:Sure!|Here\'s|I can help)[^"]*"([^"]+)"'
        match = re.search(pattern, text)
        if match:
            enhanced_prompt = match.group(1).strip()
        else:
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
        return jsonify({"success": False, "error": f"Unexpected error: {str(e)}"})

def generate_image_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")
        if not prompt:
            return jsonify({"success": False, "error": "No prompt provided"})
        style = data.get("style", "photographic")
        model = data.get("model", "flux")
        size = data.get("size", "1024x1024")
        negative_prompt = data.get("negative_prompt", "")
        seed = data.get("seed", None)
        
        width, height = map(int, size.split('x'))
        # Format the prompt with style for better API recognition
        complete_prompt = f"{prompt}, {style} style, high quality"
        encoded_prompt = quote(complete_prompt)
        # Build URL - let API use default model (flux) to avoid 502 errors
        image_url = (f"{API_CONFIG['IMAGE_API']}{encoded_prompt}?"
                    f"width={width}&"
                    f"height={height}")
        
        # Only add model parameter for non-flux models
        if model and model.lower() != 'flux':
            image_url += f"&model={model}"
        
        # Add referrer if not localhost (API doesn't accept IP addresses as referrer)
        host = request.host or API_CONFIG['REFERRER']
        if host and not host.startswith('127.0.0.1') and not host.startswith('localhost'):
            image_url += f"&referrer={host}"
        
        # Add nologo parameter if authenticated
        if API_CONFIG['API_TOKEN']:
            image_url += "&nologo=true"
        
        # Add seed if provided
        if seed is not None:
            image_url += f"&seed={seed}"
        
        print(f"Generated URL: {image_url}")
        print(f"Request timeout: {API_CONFIG['TIMEOUT']} seconds")
        
        # Prepare headers with Bearer token if available
        headers = {}
        if API_CONFIG['API_TOKEN']:
            headers['Authorization'] = f"Bearer {API_CONFIG['API_TOKEN']}"
            print("Using Bearer token authentication")
        
        try:
            img_response = requests.get(image_url, headers=headers, timeout=API_CONFIG['TIMEOUT'])
        except Timeout:
            print(f"Timeout generating image")
            return jsonify({"success": False, "error": "Image generation took too long (timeout). The API may be experiencing high load. Please try again in a moment."})
        except ConnectionError as e:
            print(f"Connection error: {str(e)}")
            return jsonify({"success": False, "error": "Failed to connect to the image generation service. Please check your internet connection."})
        except RequestException as e:
            print(f"Request error: {str(e)}")
            return jsonify({"success": False, "error": f"Error communicating with image service: {str(e)}"})
        
        if img_response.status_code != 200:
            print(f"API Error {img_response.status_code}: {img_response.text[:500]}")
            error_msg = f"Image generation failed with status {img_response.status_code}"
            if img_response.status_code == 400:
                error_msg = "Invalid request parameters. Please check your settings."
            elif img_response.status_code == 429:
                error_msg = "Too many requests. Please wait a moment and try again."
            elif img_response.status_code == 503:
                error_msg = "The image generation service is temporarily unavailable. Please try again later."
            return jsonify({"success": False, "error": error_msg})
        
        try:
            img = Image.open(io.BytesIO(img_response.content))
            img_io = io.BytesIO()
            img.save(img_io, 'PNG')
            img_io.seek(0)
            img_str = base64.b64encode(img_io.getvalue()).decode()
            data_url = f"data:image/png;base64,{img_str}"
            return jsonify({"success": True, "url": data_url})
        except Exception as e:
            print(f"Error processing image: {str(e)}")
            return jsonify({"success": False, "error": f"Error processing the generated image: {str(e)}"})
    except Exception as e:
        print(f"Unexpected error in generate_image_api: {str(e)}")
        return jsonify({"success": False, "error": f"Unexpected error: {str(e)}"}) 