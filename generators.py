import io
import base64
import os
import uuid
import requests
from flask import jsonify
from PIL import Image
from urllib.parse import quote
from config import API_CONFIG
import re
from requests.exceptions import Timeout, ConnectionError, RequestException


def get_model_pricing(model_name):
    """Fetch model pricing from the API (best-effort). Returns pricing dict or None."""
    try:
        models_url = f"{API_CONFIG['IMAGE_API']}models"
        h = {}
        if API_CONFIG['API_TOKEN']:
            h['Authorization'] = f"Bearer {API_CONFIG['API_TOKEN']}"
        r = requests.get(models_url, headers=h, timeout=10)
        # handle success
        if r.status_code == 200:
            items = r.json()
            for it in items:
                name = it.get('name', '')
                aliases = it.get('aliases', []) or []
                if model_name == name or model_name in aliases:
                    return it.get('pricing')
        # handle forbidden / insufficient balance explicitly
        if r.status_code == 403:
            try:
                body = r.json()
                # try to extract helpful message
                msg = None
                if isinstance(body, dict):
                    err = body.get('error') or body.get('message')
                    if isinstance(err, dict):
                        msg = err.get('message')
                    elif isinstance(err, str):
                        msg = err
                    else:
                        msg = str(body)
                else:
                    msg = str(body)
            except Exception:
                msg = r.text
            return {'__api_forbidden': True, 'message': msg}
    except Exception:
        pass
    return None


def _parse_api_error(resp):
    """Try to extract a helpful error message from an API response object."""
    try:
        body = resp.json()
        if isinstance(body, dict):
            # Common shape: {"success":false, "error": {"message":..., ...}, ...}
            err = body.get('error') or body.get('message')
            if isinstance(err, dict):
                return err.get('message') or str(err)
            if isinstance(err, str):
                return err
            return str(body)
        return str(body)
    except Exception:
        # fallback to raw text
        return resp.text or f"HTTP {resp.status_code}"

def enhance_prompt_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")
        if not prompt:
            return jsonify({"success": False, "error": "No prompt provided"})
        # Request multiple options in a consistent format
        enhancement_prompt = f"Generate 3 enhanced versions of this prompt for an AI image generator. Format your response EXACTLY as shown, with no other text:\n\nOption 1: [short title]\n[the enhanced prompt text here]\n\nOption 2: [short title]\n[the enhanced prompt text here]\n\nOption 3: [short title]\n[the enhanced prompt text here]\n\nOriginal prompt: {prompt}"
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
            # If forbidden, surface the API message clearly
            if response.status_code == 403:
                msg = _parse_api_error(response)
                return jsonify({"success": False, "error": f"API Error 403: {msg}"})
            return jsonify({"success": False, "error": f"Enhancement service returned error {response.status_code}. Please try again."})
        
        # Return the full enhanced text for modal display
        enhanced_prompt = response.text.strip()
        
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
        
        # Model-specific size requirements
        MODEL_MIN_SIZES = {
            'gptimage': {'min_width': 1024, 'min_height': 1024, 'allowed': ['1024x1024', '1024x1536', '1536x1024']},
            'seedream': {'min_pixels': 921600},  # minimum 1024x900
            'seedream-pro': {'min_pixels': 921600},
        }
        
        width, height = map(int, size.split('x'))
        
        # Apply model-specific constraints
        if model in MODEL_MIN_SIZES:
            constraints = MODEL_MIN_SIZES[model]
            # GPT Image has specific allowed sizes
            if 'allowed' in constraints and size not in constraints['allowed']:
                # Default to 1024x1024 for gptimage
                width, height = 1024, 1024
            # Seedream requires minimum pixel count
            elif 'min_pixels' in constraints and (width * height) < constraints['min_pixels']:
                # Default to 1024x1024 (meets minimum)
                width, height = 1024, 1024
        
        # Format the prompt with style for better API recognition
        complete_prompt = f"{prompt}, {style} style, high quality"
        encoded_prompt = quote(complete_prompt)
        # Build URL with model parameter (required for new endpoint)
        image_url = (f"{API_CONFIG['IMAGE_API']}{encoded_prompt}?"
                    f"width={width}&"
                    f"height={height}&"
                    f"model={model}")
        
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

        # Video-specific params (optional)
        duration = data.get("duration", None)
        aspectRatio = data.get("aspectRatio", "")
        audio = data.get("audio", False)

        # normalize duration value
        try:
            dur_val = int(duration) if duration is not None else None
        except Exception:
            dur_val = None

        # If duration provided or model is a known video model, include video params
        VIDEO_MODELS = {"veo", "seedance", "seedance-pro"}
        is_video_request = False
        try:
            if duration is not None and int(duration) > 0:
                is_video_request = True
        except Exception:
            is_video_request = is_video_request

        if model and model.lower() in VIDEO_MODELS:
            is_video_request = True

        if is_video_request:
            # duration in seconds (already normalized to dur_val)
            if dur_val is not None:
                image_url += f"&duration={dur_val}"
            if aspectRatio:
                image_url += f"&aspectRatio={quote(str(aspectRatio))}"
            if audio:
                image_url += "&audio=true"
        
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
            # handle forbidden specifically and try to surface API error
            if img_response.status_code == 403:
                msg = _parse_api_error(img_response)
                return jsonify({"success": False, "error": f"API Error 403: {msg}"})
            error_msg = f"Image generation failed with status {img_response.status_code}"
            if img_response.status_code == 400:
                error_msg = "Invalid request parameters. Please check your settings."
            elif img_response.status_code == 429:
                error_msg = "Too many requests. Please wait a moment and try again."
            elif img_response.status_code == 503:
                error_msg = "The image generation service is temporarily unavailable. Please try again later."
            return jsonify({"success": False, "error": error_msg})
        
        try:
            # Determine content type
            content_type = img_response.headers.get('content-type', '').lower()

            # Helper: fetch model pricing (best-effort)
            pricing = get_model_pricing(model)

            # If pricing not available from API, provide fallback estimates for video models
            if pricing is None:
                if is_video_request:
                    # Simple fallback rates (pollen per second)
                    fallback_rates = {
                        'veo': 0.5,
                        'seedance': 0.3,
                        'seedance-pro': 0.4
                    }
                    rate = fallback_rates.get((model or '').lower(), 0.25)
                    pricing = {
                        'pollen_per_second': rate,
                        'currency': 'pollen'
                    }
                    if dur_val is not None:
                        pricing['estimated_total'] = round(rate * dur_val, 4)
                else:
                    pricing = {'currency': 'pollen'}
            # attach a simple human-friendly estimate string if possible
            try:
                if isinstance(pricing, dict):
                    if pricing.get('estimated_total') is not None:
                        pricing['estimate_text'] = f"Estimated: {pricing['estimated_total']} {pricing.get('currency','pollen')}"
                    else:
                        # sum numeric fields as a best-effort
                        nums = [v for v in pricing.values() if isinstance(v, (int, float))]
                        if nums:
                            pricing['estimated_total'] = round(sum(nums), 4)
                            pricing['estimate_text'] = f"Estimated: {pricing['estimated_total']} {pricing.get('currency','pollen')}"
                        else:
                            pricing['estimate_text'] = None
            except Exception:
                pass

            # If it's a video response, save to static folder and return URL
            if content_type.startswith('video'):
                # Determine extension
                subtype = content_type.split('/')[-1].split(';')[0]
                ext = subtype if subtype.isalnum() else 'mp4'

                # Save file to static/generated_videos
                videos_dir = os.path.join(os.path.dirname(__file__), 'static', 'generated_videos')
                os.makedirs(videos_dir, exist_ok=True)
                filename = f"{uuid.uuid4().hex}.{ext}"
                filepath = os.path.join(videos_dir, filename)
                with open(filepath, 'wb') as f:
                    f.write(img_response.content)

                # Build external URL
                host_url = request.host_url.rstrip('/')
                video_url = f"{host_url}/static/generated_videos/{filename}"

                return jsonify({"success": True, "url": video_url, "type": "video", "pricing": pricing})

            # Otherwise assume it's an image
            img = Image.open(io.BytesIO(img_response.content))
            img_io = io.BytesIO()
            img.save(img_io, 'PNG')
            img_io.seek(0)
            img_str = base64.b64encode(img_io.getvalue()).decode()
            data_url = f"data:image/png;base64,{img_str}"
            return jsonify({"success": True, "url": data_url, "pricing": pricing})
        except Exception as e:
            print(f"Error processing media: {str(e)}")
            return jsonify({"success": False, "error": f"Error processing the generated media: {str(e)}"})
    except Exception as e:
        print(f"Unexpected error in generate_image_api: {str(e)}")
        return jsonify({"success": False, "error": f"Unexpected error: {str(e)}"}) 


def estimate_price_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        model = data.get('model', API_CONFIG.get('DEFAULT_MODEL'))
        duration = data.get('duration', None)
        size = data.get('size', None)

        # normalize duration
        try:
            dur_val = int(duration) if duration is not None else None
        except Exception:
            dur_val = None

        pricing = get_model_pricing(model)

        # If the pricing call returned a forbidden marker, surface that error
        if isinstance(pricing, dict) and pricing.get('__api_forbidden'):
            return jsonify({"success": False, "error": f"API Error 403: {pricing.get('message')}"})

        # fallback if no pricing
        if pricing is None:
            VIDEO_MODELS = {"veo", "seedance", "seedance-pro"}
            if model and model.lower() in VIDEO_MODELS:
                fallback_rates = {
                    'veo': 0.5,
                    'seedance': 0.3,
                    'seedance-pro': 0.4
                }
                rate = fallback_rates.get((model or '').lower(), 0.25)
                pricing = {'pollen_per_second': rate, 'currency': 'pollen'}
                if dur_val is not None:
                    pricing['estimated_total'] = round(rate * dur_val, 4)
                    pricing['estimate_text'] = f"Estimated: {pricing['estimated_total']} {pricing['currency']}"
        else:
            # If pricing exists but doesn't contain estimate, try to compute
            try:
                if isinstance(pricing, dict):
                    if pricing.get('estimated_total') is None:
                        nums = [v for v in pricing.values() if isinstance(v, (int, float))]
                        if nums:
                            pricing['estimated_total'] = round(sum(nums), 4)
                            pricing['estimate_text'] = f"Estimated: {pricing['estimated_total']} {pricing.get('currency','pollen')}"
            except Exception:
                pass

        return jsonify({"success": True, "pricing": pricing})
    except Exception as e:
        print(f"Error estimating price: {e}")
        return jsonify({"success": False, "error": f"Error estimating price: {str(e)}"})