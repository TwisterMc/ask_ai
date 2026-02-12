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
import time
from requests.exceptions import Timeout, ConnectionError, RequestException
import logging

# module logger
logger = logging.getLogger(__name__)

# simple in-memory cache for model pricing: { model_key: (timestamp, value) }
_PRICING_CACHE = {}
_PRICING_CACHE_TTL = 60  # seconds
# simple in-memory cache for models list
_MODELS_CACHE = {}
_MODELS_CACHE_TTL = 300  # seconds


def chat_api(request):
    """Simple proxy for text/chat interactions. Accepts JSON { message, model, temperature, max_tokens }.
    Sends a GET request to the configured TEXT_API endpoint with the encoded message and optional query params.
    Returns JSON: { success: True, reply: "..." } or { success: False, error: "..." }.
    """
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        # Accept either a single `message`/`prompt` or a `messages` array (chat style).
        message = data.get('message') or data.get('prompt') or ''
        messages = data.get('messages')
        has_messages = isinstance(messages, list) and len(messages) > 0
        if not message and not has_messages:
            return jsonify({"success": False, "error": "No message provided"})

        model = data.get('model')
        temperature = data.get('temperature')
        max_tokens = data.get('max_tokens')

        # prefer POST/JSON to support structured conversations
        url = API_CONFIG['TEXT_API']
        headers = {'Content-Type': 'application/json'}
        # prefer an API key supplied by the browser (localStorage) forwarded in the Authorization header
        incoming_auth = None
        try:
            incoming_auth = request.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            headers['Authorization'] = incoming_auth

        # The upstream text API expects a GET request with the encoded prompt
        # appended to the base TEXT_API URL (same as enhance_prompt_api).
        # If the client provided a `messages` array, concatenate message contents.
        messages = data.get('messages')
        if isinstance(messages, list) and messages:
            # join message contents in order, preferring user/assistant content
            parts = []
            for m in messages:
                if isinstance(m, dict):
                    c = m.get('content') or m.get('text') or ''
                    if c:
                        parts.append(str(c))
            combined = '\n'.join(parts)
        else:
            combined = message

        encoded = quote(combined)
        request_url = f"{API_CONFIG['TEXT_API']}{encoded}"

        # Add referrer if not localhost (API doesn't accept IP addresses as referrer)
        host = request.host or API_CONFIG['REFERRER']
        if host and not host.startswith('127.0.0.1') and not host.startswith('localhost'):
            request_url += f"?referrer={host}"

        try:
            logger.debug("Chat request_url: %s", request_url)
            resp = requests.get(request_url, headers=headers, timeout=API_CONFIG.get('TIMEOUT', 30))
        except Timeout:
            return jsonify({"success": False, "error": "The chat service timed out. Please try again."})
        except ConnectionError as e:
            return jsonify({"success": False, "error": "Failed to connect to chat service."})
        except RequestException as e:
            return jsonify({"success": False, "error": f"Error communicating with chat service: {str(e)}"})

        if resp.status_code != 200:
            # surface 403 messages clearly and return 403 status
            if resp.status_code == 403:
                msg = _parse_api_error(resp)
                return jsonify({"success": False, "error": f"API Error 403: {msg}"}), 403
            # handle payment required (402) to display helpful message
            if resp.status_code == 402:
                msg = _parse_api_error(resp)
                return jsonify({"success": False, "error": f"API Error 402: {msg}"}), 402
            return jsonify({"success": False, "error": f"Chat service returned status {resp.status_code}"}), resp.status_code

        # attempt to parse JSON reply; otherwise use text
        reply_text = None
        try:
            j = resp.json()
            # common shapes: { reply: "..." } or { choices: [...] }
            if isinstance(j, dict):
                if 'reply' in j:
                    reply_text = j['reply']
                elif 'choices' in j and isinstance(j['choices'], list) and j['choices']:
                    # could be chat completion style
                    c = j['choices'][0]
                    if isinstance(c, dict) and 'message' in c and isinstance(c['message'], dict):
                        reply_text = c['message'].get('content') or c['message'].get('text')
                    else:
                        reply_text = str(c)
                else:
                    # fallback to full JSON string
                    reply_text = j.get('text') or str(j)
            else:
                reply_text = str(j)
        except Exception:
            reply_text = resp.text or ''

        # Include pricing info for the chosen model (best-effort)
        pricing = get_model_pricing(model, request)
        if isinstance(pricing, dict) and pricing.get('__api_forbidden'):
            return jsonify({"success": False, "error": f"API Error 403: {pricing.get('message')}"}), 403

        # If pricing is None, provide fallback per-token rates for chat models
        if pricing is None:
            fallback_chat_rates = {'gpt-3': 0.00005, 'gpt-4': 0.0002}
            rate = fallback_chat_rates.get((model or '').lower())
            if rate:
                pricing = {'pollen_per_token': rate, 'currency': 'pollen'}

        return jsonify({"success": True, "reply": reply_text, "pricing": pricing})
    except Exception as e:
        return jsonify({"success": False, "error": f"Unexpected error: {str(e)}"})


def validate_api_key(request):
    """Validate an API key by calling the models endpoint with provided Authorization header.
    Expects an Authorization header to be forwarded by the client. Returns 200/403 with parsed message.
    """
    try:
        models_url = API_CONFIG.get('MODELS_API', f"{API_CONFIG['IMAGE_API']}models")
        headers = {}
        try:
            incoming_auth = request.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            headers['Authorization'] = incoming_auth

        r = requests.get(models_url, headers=headers, timeout=10)
        if r.status_code == 200:
            return jsonify({"success": True, "message": "Key valid (models fetched)"})
        elif r.status_code == 403:
            msg = _parse_api_error(r)
            return jsonify({"success": False, "error": msg}), 403
        else:
            return jsonify({"success": False, "error": f"Validation failed: status {r.status_code}"}), r.status_code
    except Exception as e:
        return jsonify({"success": False, "error": f"Validation error: {str(e)}"})


def check_balance_api(request):
    """Check user's pollen balance using the /account/balance endpoint.
    Requires Authorization header with Bearer token.
    """
    try:
        balance_url = "https://gen.pollinations.ai/account/balance"
        headers = {}
        try:
            incoming_auth = request.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        
        # Debug logging
        logger.debug("[CHECK_BALANCE] Incoming auth header present: %s", bool(incoming_auth))
        if incoming_auth:
            # do not log full token; show masked prefix for debugging only
            try:
                prefix = (incoming_auth[:8] + '...') if len(incoming_auth) > 8 else incoming_auth
            except Exception:
                prefix = "(masked)"
            logger.debug("[CHECK_BALANCE] Auth header prefix: %s", prefix)
        
        if incoming_auth:
            headers['Authorization'] = incoming_auth
        else:
            return jsonify({"success": False, "error": "No API key provided"}), 401

        r = requests.get(balance_url, headers=headers, timeout=10)
        logger.debug("[CHECK_BALANCE] Pollinations API response: %s", r.status_code)
        if r.status_code != 200:
            logger.debug("[CHECK_BALANCE] Response text: %s", (r.text or '')[:200])
        
        if r.status_code == 200:
            data = r.json()
            return jsonify({"success": True, "balance": data})
        elif r.status_code == 401:
            msg = _parse_api_error(r)
            return jsonify({"success": False, "error": f"Unauthorized: {msg}"}), 401
        elif r.status_code == 403:
            msg = _parse_api_error(r)
            return jsonify({"success": False, "error": msg}), 403
        else:
            return jsonify({"success": False, "error": f"Balance check failed: status {r.status_code}"}), r.status_code
    except Exception as e:
        logger.exception("[CHECK_BALANCE] Exception checking balance")
        return jsonify({"success": False, "error": f"Balance check error: {str(e)}"})



def get_model_pricing(model_name, request_obj=None):
    """Fetch model pricing from the API (best-effort). Returns pricing dict or None.
    If `request_obj` is provided, prefer an Authorization header from it (so user's API key can be forwarded).
    """
    try:
        models_url = API_CONFIG.get('MODELS_API', f"{API_CONFIG['IMAGE_API']}models")
        h = {}
        # prefer an Authorization header supplied in the incoming request (client-side API key)
        incoming_auth = None
        try:
            if request_obj is not None:
                incoming_auth = request_obj.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            h['Authorization'] = incoming_auth
        # use a cached value when available
        cache_key = f"models::{model_name}"
        now = time.time()
        cached = _PRICING_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _PRICING_CACHE_TTL:
            return cached[1]

        r = requests.get(models_url, headers=h, timeout=10)
        # handle success
        if r.status_code == 200:
            items = r.json()
            for it in items:
                name = it.get('name', '')
                aliases = it.get('aliases', []) or []
                if model_name == name or model_name in aliases:
                    pricing = it.get('pricing')
                    _PRICING_CACHE[cache_key] = (now, pricing)
                    return pricing
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


def get_models_api(request_obj=None):
    """Fetch the models list from the upstream API and return a JSON response.
    If `request_obj` is provided, prefer its Authorization header so BYOP works.
    Caches the models list for a short TTL to avoid frequent upstream calls.
    """
    try:
        now = time.time()
        cached = _MODELS_CACHE.get('models')
        if cached and (now - cached[0]) < _MODELS_CACHE_TTL:
            return jsonify({"success": True, "models": cached[1]})

        models_url = f"{API_CONFIG['IMAGE_API']}models"
        headers = {"Content-Type": "application/json"}
        incoming_auth = None
        try:
            if request_obj is not None:
                incoming_auth = request_obj.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            headers['Authorization'] = incoming_auth

        r = requests.get(models_url, headers=headers, timeout=10)
        if r.status_code == 200:
            items = r.json()
            # cache the raw list
            _MODELS_CACHE['models'] = (now, items)
            return jsonify({"success": True, "models": items})
        elif r.status_code == 403:
            msg = _parse_api_error(r)
            return jsonify({"success": False, "error": msg}), 403
        else:
            return jsonify({"success": False, "error": f"Models fetch failed: status {r.status_code}"}), r.status_code
    except Exception as e:
        logger.exception("Error fetching models list")
        return jsonify({"success": False, "error": f"Error fetching models: {str(e)}"})


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
        
        # Request is being made to enhancement API (URL redacted in logs)
        
        # Prepare headers with Bearer token if available, prefer incoming Authorization header
        headers = {}
        incoming_auth = None
        try:
            incoming_auth = request.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            headers['Authorization'] = incoming_auth
        
        try:
            response = requests.get(enhancement_url, headers=headers, timeout=API_CONFIG['TIMEOUT'])
        except Timeout:
            logger.debug("Timeout connecting to enhancement API")
            return jsonify({"success": False, "error": "The AI enhancement service took too long to respond. Please try again."})
        except ConnectionError as e:
            logger.debug("Connection error: %s", str(e))
            return jsonify({"success": False, "error": "Failed to connect to the enhancement service. Please check your internet connection."})
        except RequestException as e:
            logger.debug("Request error: %s", str(e))
            return jsonify({"success": False, "error": f"Error communicating with enhancement service: {str(e)}"})
        
        if response.status_code != 200:
            logger.debug("API Error %s: %s", response.status_code, response.text)
            # If forbidden, surface the API message clearly
            if response.status_code == 403:
                msg = _parse_api_error(response)
                return jsonify({"success": False, "error": f"API Error 403: {msg}"})
            # handle payment required (402) to display helpful message
            if response.status_code == 402:
                msg = _parse_api_error(response)
                return jsonify({"success": False, "error": f"API Error 402: {msg}"})
            return jsonify({"success": False, "error": f"Enhancement service returned error {response.status_code}. Please try again."})
        
        # Return the full enhanced text for modal display
        enhanced_prompt = response.text.strip()
        
        return jsonify({
            "success": True,
            "enhanced_prompt": enhanced_prompt
        })
    except Exception as e:
        logger.exception("Error enhancing prompt")
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
        # new: read quality from client so we can forward it (gptimage only)
        quality = data.get("quality", None)
        negative_prompt = data.get("negative_prompt", "")
        seed = data.get("seed", None)
        # Normalize seed: accept integers only, ignore empty strings or invalid values
        try:
            if seed is None:
                seed = None
            elif isinstance(seed, str) and seed.strip() == "":
                seed = None
            else:
                # coerce to int when possible
                seed = int(seed)
        except Exception:
            seed = None
        if seed is not None:
            logger.debug("Using fixed seed: %s", seed)
        
        logger.debug("[GENERATE] Received request - prompt: %s, style: %s, model: %s", prompt[:50], style, model)
        
        # Model-specific size requirements
        MODEL_MIN_SIZES = {
            'gptimage': {'min_width': 1024, 'min_height': 1024, 'allowed': ['1024x1024', '1024x1536', '1536x1024']},
            'seedream': {'min_pixels': 921600},  # minimum 1024x900
            'seedream-pro': {'min_pixels': 921600},
        }
        
        try:
            width, height = map(int, size.split('x'))
        except Exception:
            # fallback to a safe default if size parsing fails
            logger.debug("Invalid size format '%s', defaulting to 1024x1024", size)
            width, height = 1024, 1024

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
        
        logger.debug("[GENERATE] Complete prompt: %s", complete_prompt)
        logger.debug("[GENERATE] URL (without auth): %s...", image_url[:150])
        
        # Add seed if provided
        if seed is not None:
            image_url += f"&seed={seed}"

        # Add negative prompt if provided (documented API param)
        if isinstance(negative_prompt, str) and negative_prompt.strip():
            image_url += f"&negative_prompt={quote(negative_prompt)}"

        # Include quality and guidance. Map UI quality labels to upstream enum when appropriate.
        if quality:
            q = str(quality).lower()
            # If caller already provided API enum (low/medium/high/hd), pass through
            if q in {'low', 'medium', 'high', 'hd'}:
                image_url += f"&quality={quote(q)}"
            else:
                # Map our UI labels to API enum values for gptimage compatibility
                ui_to_api = {'fast': 'low', 'balanced': 'medium', 'detailed': 'high', 'maximum': 'hd'}
                mapped = ui_to_api.get(q)
                if mapped:
                    image_url += f"&quality={quote(mapped)}"
                else:
                    # If a numeric step count was provided, pass it through (some models accept numeric quality)
                    try:
                        _ = int(quality)
                        image_url += f"&quality={quote(str(quality))}"
                    except Exception:
                        # unknown quality string — do not forward
                        logger.debug("Unknown quality value skipped: %s", quality)
        # Video-specific params (optional)
        duration = data.get("duration", None)
        aspectRatio = data.get("aspectRatio", "")
        audio = data.get("audio", False)

        # normalize duration and fps values
        try:
            dur_val = int(duration) if duration is not None else None
        except Exception:
            dur_val = None

        # If duration provided or model is a known video model, include video params
        VIDEO_MODELS = {"veo", "seedance", "seedance-pro"}
        is_video_request = False
        try:
            if dur_val is not None and dur_val > 0:
                is_video_request = True
        except Exception:
            is_video_request = is_video_request

        if model and model.lower() in VIDEO_MODELS:
            is_video_request = True

        # Include only supported query params. Forward aspectRatio for both image/video when provided.
        if aspectRatio:
            image_url += f"&aspectRatio={quote(str(aspectRatio))}"

        if is_video_request:
            # duration in seconds (already normalized to dur_val)
            if dur_val is not None:
                image_url += f"&duration={dur_val}"
            if audio:
                image_url += "&audio=true"
        
        # Generation request initiated (URL redacted to avoid leaking sensitive params)
        logger.debug("Generation request initiated. timeout: %s seconds", API_CONFIG.get('TIMEOUT'))
        
        # Prepare headers with Bearer token if available, prefer incoming Authorization header
        headers = {}
        incoming_auth = None
        try:
            incoming_auth = request.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        
        # Debug logging
        logger.debug("[GENERATE] Incoming auth header present: %s", bool(incoming_auth))
        if incoming_auth:
            try:
                prefix = (incoming_auth[:8] + '...') if len(incoming_auth) > 8 else incoming_auth
            except Exception:
                prefix = "(masked)"
            logger.debug("[GENERATE] Auth header prefix: %s", prefix)
        
        if incoming_auth:
            headers['Authorization'] = incoming_auth
        
        try:
            img_response = requests.get(image_url, headers=headers, timeout=API_CONFIG['TIMEOUT'])
            logger.debug("[GENERATE] Pollinations API response: %s", img_response.status_code)
        except Timeout:
            logger.debug("Timeout generating image")
            return jsonify({"success": False, "error": "Image generation took too long (timeout). The API may be experiencing high load. Please try again in a moment."})
        except ConnectionError as e:
            logger.debug("Connection error: %s", str(e))
            return jsonify({"success": False, "error": "Failed to connect to the image generation service. Please check your internet connection."})
        except RequestException as e:
            logger.debug("Request error: %s", str(e))
            return jsonify({"success": False, "error": f"Error communicating with image service: {str(e)}"})
        
        if img_response.status_code != 200:
            logger.debug("API Error %s: %s", img_response.status_code, (img_response.text or '')[:500])
            # handle forbidden specifically and try to surface API error
            if img_response.status_code == 403:
                msg = _parse_api_error(img_response)
                return jsonify({"success": False, "error": f"API Error 403: {msg}"})
            # handle payment required (402) to display helpful message
            if img_response.status_code == 402:
                msg = _parse_api_error(img_response)
                return jsonify({"success": False, "error": f"API Error 402: {msg}"})
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
            pricing = get_model_pricing(model, request)

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

                # cleanup old videos asynchronously (best-effort): remove files older than 7 days
                try:
                    cleanup_old_videos(videos_dir, max_age_days=7)
                except Exception:
                    pass

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
            logger.exception("Error processing media")
            return jsonify({"success": False, "error": f"Error processing the generated media: {str(e)}"})
    except Exception as e:
        logger.exception("Unexpected error in generate_image_api")
        return jsonify({"success": False, "error": f"Unexpected error: {str(e)}"}) 


def estimate_price_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        model = data.get('model', API_CONFIG.get('DEFAULT_MODEL'))
        duration = data.get('duration', None)
        size = data.get('size', None)
        quality = data.get('quality', None)
        guidance = data.get('guidance', None)

        # normalize duration
        try:
            dur_val = int(duration) if duration is not None else None
        except Exception:
            dur_val = None

        pricing = get_model_pricing(model, request)

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

        # Apply multipliers based on size, quality, and guidance to make estimates reflect settings
        try:
            multiplier = 1.0
            # size multiplier: scale by pixel area relative to 1024x1024
            if size and isinstance(size, str) and 'x' in size:
                try:
                    w, h = map(int, size.split('x'))
                    base_area = 1024 * 1024
                    multiplier *= (w * h) / float(base_area)
                except Exception:
                    pass

            # quality multiplier: map quality names to nominal step counts
            if quality and isinstance(quality, str):
                qmap = {'fast': 20, 'balanced': 30, 'detailed': 50, 'maximum': 75}
                steps = qmap.get(quality.lower())
                if steps:
                    multiplier *= (steps / 30.0)

            # guidance multiplier: scale linearly relative to 7.0 baseline
            try:
                g = float(guidance) if guidance is not None else None
                if g is not None:
                    baseline = 7.0
                    if baseline > 0:
                        multiplier *= (g / baseline)
            except Exception:
                pass

            if isinstance(pricing, dict) and pricing.get('estimated_total') is not None:
                est = float(pricing.get('estimated_total'))
                adjusted = round(est * multiplier, 6)
                pricing['estimated_total'] = adjusted
                pricing['estimate_text'] = f"Estimated: {adjusted} {pricing.get('currency','pollen')}"
            else:
                # attempt to adjust numeric fields if any
                nums = [k for k, v in (pricing.items() if isinstance(pricing, dict) else []) if isinstance(pricing.get(k), (int, float))]
        except Exception:
            pass

        return jsonify({"success": True, "pricing": pricing})
    except Exception as e:
        logger.exception("Error estimating price")
        return jsonify({"success": False, "error": f"Error estimating price: {str(e)}"})


def estimate_chat_price_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        model = data.get('model', API_CONFIG.get('DEFAULT_MODEL'))
        max_tokens = data.get('max_tokens', None)

        try:
            tokens = int(max_tokens) if max_tokens is not None else None
        except Exception:
            tokens = None

        pricing = get_model_pricing(model, request)
        if isinstance(pricing, dict) and pricing.get('__api_forbidden'):
            return jsonify({"success": False, "error": f"API Error 403: {pricing.get('message')}"}), 403

        # compute estimate if possible
        if pricing is None:
            fallback_chat_rates = {'gpt-3': 0.00005, 'gpt-4': 0.0002}
            rate = fallback_chat_rates.get((model or '').lower())
            if rate and tokens is not None:
                est = round(rate * tokens, 6)
                pricing = {'pollen_per_token': rate, 'estimated_total': est, 'currency': 'pollen'}
        else:
            # If pricing contains a per-token rate, use it
            if tokens is not None:
                if 'pollen_per_token' in pricing:
                    pricing['estimated_total'] = round(pricing['pollen_per_token'] * tokens, 6)
                elif 'pollen_per_1k_tokens' in pricing:
                    pricing['estimated_total'] = round(pricing['pollen_per_1k_tokens'] * (tokens / 1000.0), 6)
                else:
                    # sum numeric fields as a rough proxy scaled by tokens/1000
                    nums = [v for v in pricing.values() if isinstance(v, (int, float))]
                    if nums:
                        base = round(sum(nums), 6)
                        pricing['estimated_total'] = round(base * (tokens / 1000.0), 6)

        return jsonify({"success": True, "pricing": pricing})
    except Exception as e:
        logger.exception("Error estimating chat price")
        return jsonify({"success": False, "error": f"Error estimating chat price: {str(e)}"})


def cleanup_old_videos(dirpath, max_age_days=7):
    """Remove files in `dirpath` older than `max_age_days`. Best-effort, no exceptions leaked."""
    try:
        cutoff = time.time() - (max_age_days * 86400)
        for fname in os.listdir(dirpath):
            fpath = os.path.join(dirpath, fname)
            try:
                if os.path.isfile(fpath):
                    mtime = os.path.getmtime(fpath)
                    if mtime < cutoff:
                        os.remove(fpath)
            except Exception:
                continue
    except Exception:
        pass