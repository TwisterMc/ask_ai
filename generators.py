import io
import base64
import requests
from flask import jsonify
from PIL import Image
from urllib.parse import quote
from config import API_CONFIG
import re

def enhance_prompt_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")
        if not prompt:
            return jsonify({"success": False, "error": "No prompt provided"})
        additional_prompt = '. Only respond with the updated text.'
        encoded_prompt = quote(f"enhance this prompt: {prompt} {additional_prompt}")
        enhancement_url = f"{API_CONFIG['TEXT_API']}{encoded_prompt}"
        response = requests.get(enhancement_url, timeout=API_CONFIG['TIMEOUT'])
        if response.status_code != 200:
            raise Exception(f"API request failed with status {response.status_code}")
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
        return jsonify({"success": False, "error": str(e)})

def generate_image_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")
        if not prompt:
            return jsonify({"success": False, "error": "No prompt provided"})
        style = data.get("style", "photographic")
        model = data.get("model", "SDXL")
        size = data.get("size", "1024x1024")
        quality = data.get("quality", "balanced")
        guidance = float(data.get("guidance", 7.0))
        steps_map = {
            "fast": 20,
            "balanced": 30,
            "detailed": 50,
            "maximum": 75
        }
        steps = steps_map.get(quality, 30)
        width, height = map(int, size.split('x'))
        complete_prompt = f"{style} style: {prompt}"
        encoded_prompt = quote(complete_prompt)
        image_url = (f"{API_CONFIG['IMAGE_API']}{encoded_prompt}?"
                    f"nologo=true&"
                    f"model={model}&"
                    f"width={width}&"
                    f"height={height}&"
                    f"steps={steps}&"
                    f"guidance_scale={guidance}")
        img_response = requests.get(image_url, timeout=API_CONFIG['TIMEOUT'])
        if img_response.status_code != 200:
            raise Exception(f"API request failed with status {img_response.status_code}")
        img = Image.open(io.BytesIO(img_response.content))
        img_io = io.BytesIO()
        img.save(img_io, 'PNG')
        img_io.seek(0)
        img_str = base64.b64encode(img_io.getvalue()).decode()
        data_url = f"data:image/png;base64,{img_str}"
        return jsonify({"success": True, "url": data_url})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}) 