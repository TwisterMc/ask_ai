import io
import base64
import os
import uuid
import json
import hashlib
import shutil
import requests
from flask import jsonify
from PIL import Image
from urllib.parse import quote, urlparse
from config import API_CONFIG
import re
import time
from requests.exceptions import Timeout, ConnectionError, RequestException
import logging
from datetime import datetime

# module logger
logger = logging.getLogger(__name__)

# simple in-memory cache for model pricing: { model_key: (timestamp, value) }
_PRICING_CACHE = {}
_PRICING_CACHE_TTL = 60  # seconds
# simple in-memory cache for models list
_MODELS_CACHE = {}
_MODELS_CACHE_TTL = 300  # seconds

_STARRED_MEDIA_DIR = os.path.join(os.path.dirname(__file__), 'static', 'starred_media')
_STARRED_META_DIR = os.path.join(os.path.dirname(__file__), 'data', 'starred')


def _get_request_token(request_obj):
    try:
        auth = request_obj.headers.get('Authorization')
    except Exception:
        auth = None
    if not auth:
        return None
    token = auth.strip()
    if token.lower().startswith('bearer '):
        token = token[7:].strip()
    return token or None


def _owner_id_from_token(token):
    digest = hashlib.sha256(token.encode('utf-8')).hexdigest()
    return digest[:16]


def _owner_meta_path(owner_id):
    return os.path.join(_STARRED_META_DIR, f"{owner_id}.json")


def _load_starred_items(owner_id):
    try:
        path = _owner_meta_path(owner_id)
        if not os.path.exists(path):
            return []
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_starred_items(owner_id, items):
    os.makedirs(_STARRED_META_DIR, exist_ok=True)
    path = _owner_meta_path(owner_id)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=True, indent=2)
    os.replace(tmp_path, path)


def _strip_internal_fields(item):
    if not isinstance(item, dict):
        return item
    cleaned = dict(item)
    cleaned.pop('_file_path', None)
    return cleaned


def chat_api(request):
    """Simple proxy for text/chat interactions. Accepts JSON { message, model, temperature, max_tokens }.
    Sends a POST request to the configured chat completions endpoint with messages.
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

        model = data.get('model') or 'openai'
        temperature = data.get('temperature')
        max_tokens = data.get('max_tokens')

        url = API_CONFIG['CHAT_COMPLETIONS_API']
        headers = {'Content-Type': 'application/json'}
        # prefer an API key supplied by the browser (localStorage) forwarded in the Authorization header
        incoming_auth = None
        try:
            incoming_auth = request.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            headers['Authorization'] = incoming_auth

        messages = data.get('messages')
        if not isinstance(messages, list) or not messages:
            messages = [{'role': 'user', 'content': message}]

        payload = {
            'messages': messages,
        }
        if model:
            payload['model'] = model
        if temperature is not None:
            payload['temperature'] = temperature
        if max_tokens is not None:
            payload['max_tokens'] = max_tokens

        try:
            logger.debug("Chat request_url: %s", url)
            resp = requests.post(url, headers=headers, json=payload, timeout=API_CONFIG.get('TIMEOUT', 30))
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

        def _extract_text_from_content(content):
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                blocks = []
                for block in content:
                    if isinstance(block, dict):
                        if block.get('type') == 'text' and block.get('text'):
                            blocks.append(block['text'])
                        elif isinstance(block.get('text'), str):
                            blocks.append(block['text'])
                    elif isinstance(block, str):
                        blocks.append(block)
                return '\n'.join(blocks) if blocks else None
            return None

        def _extract_text_from_choice(choice):
            if not isinstance(choice, dict):
                return None
            msg = choice.get('message')
            if isinstance(msg, dict):
                text = _extract_text_from_content(msg.get('content'))
                if text:
                    return text
                if isinstance(msg.get('content_blocks'), list):
                    text = _extract_text_from_content(msg.get('content_blocks'))
                    if text:
                        return text
            delta = choice.get('delta')
            if isinstance(delta, dict):
                text = _extract_text_from_content(delta.get('content'))
                if text:
                    return text
                if isinstance(delta.get('content_blocks'), list):
                    text = _extract_text_from_content(delta.get('content_blocks'))
                    if text:
                        return text
            if isinstance(choice.get('text'), str):
                return choice.get('text')
            return None

        # attempt to parse JSON reply; otherwise use text
        reply_text = None
        finish_reason = None
        try:
            j = resp.json()
            # common shapes: { reply: "..." } or { choices: [...] }
            if isinstance(j, dict):
                if 'reply' in j:
                    reply_text = j['reply']
                elif 'choices' in j and isinstance(j['choices'], list) and j['choices']:
                    # could be chat completion style
                    c = j['choices'][0]
                    if isinstance(c, dict):
                        finish_reason = c.get('finish_reason')
                    extracted = _extract_text_from_choice(c)
                    reply_text = extracted if extracted is not None else str(c)
                else:
                    # fallback to full JSON string
                    reply_text = j.get('text') or str(j)
            else:
                reply_text = str(j)
        except Exception:
            reply_text = resp.text or ''

        if not reply_text and finish_reason == 'length':
            reply_text = (
                "Response was cut off due to length. "
                "Increase Response length and try again."
            )

        # Include pricing info for the chosen model (best-effort)
        pricing = get_text_model_pricing(model, request)
        if isinstance(pricing, dict) and pricing.get('__api_forbidden'):
            return jsonify({"success": False, "error": f"API Error 403: {pricing.get('message')}"}), 403

        return jsonify({
            "success": True,
            "reply": reply_text,
            "pricing": pricing,
            "finish_reason": finish_reason,
        })
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


def get_text_model_pricing(model_name, request_obj=None):
    """Fetch text model pricing from /text/models (best-effort). Returns pricing dict or None."""
    try:
        if not model_name:
            return None

        models_url = API_CONFIG.get('TEXT_MODELS_API', f"{API_CONFIG['TEXT_API']}models")
        headers = {}
        incoming_auth = None
        try:
            if request_obj is not None:
                incoming_auth = request_obj.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            headers['Authorization'] = incoming_auth

        cache_key = f"text_models::{model_name}"
        now = time.time()
        cached = _PRICING_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _PRICING_CACHE_TTL:
            return cached[1]

        r = requests.get(models_url, headers=headers, timeout=10)
        if r.status_code == 200:
            items = r.json()
            for it in items:
                name = it.get('name') or it.get('id') or ''
                aliases = it.get('aliases', []) or []
                if model_name == name or model_name in aliases:
                    pricing = it.get('pricing') or it.get('price')
                    _PRICING_CACHE[cache_key] = (now, pricing)
                    return pricing
        if r.status_code == 403:
            msg = _parse_api_error(r)
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


def get_chat_models_api(request_obj=None):
    """Fetch the chat models list from the upstream /v1/models endpoint."""
    try:
        now = time.time()
        cached = _MODELS_CACHE.get('chat_models')
        if cached and (now - cached[0]) < _MODELS_CACHE_TTL:
            cached_models = cached[1]
            if isinstance(cached_models, list) and cached_models:
                first = cached_models[0]
                if isinstance(first, dict) and 'id' in first:
                    return jsonify({"success": True, "models": cached_models})

        models_url = API_CONFIG.get('CHAT_MODELS_API', 'https://gen.pollinations.ai/v1/models')
        text_models_url = API_CONFIG.get('TEXT_MODELS_API', f"{API_CONFIG['TEXT_API']}models")
        headers = {"Content-Type": "application/json"}
        incoming_auth = None
        try:
            if request_obj is not None:
                incoming_auth = request_obj.headers.get('Authorization')
        except Exception:
            incoming_auth = None
        if incoming_auth:
            headers['Authorization'] = incoming_auth

        def _cost_indicator_from_pricing(pricing):
            if not isinstance(pricing, dict):
                return None
            cost_per_1k = None
            try:
                if pricing.get('pollen_per_1k_tokens') is not None:
                    cost_per_1k = float(pricing.get('pollen_per_1k_tokens'))
                elif pricing.get('pollen_per_token') is not None:
                    cost_per_1k = float(pricing.get('pollen_per_token')) * 1000.0
            except Exception:
                cost_per_1k = None
            if cost_per_1k is None:
                return None
            if cost_per_1k <= 0.0005:
                return '$'
            if cost_per_1k <= 0.002:
                return '$$'
            if cost_per_1k <= 0.01:
                return '$$$'
            return '$$$$'

        pricing_map = {}
        text_model_ids = []
        try:
            pricing_resp = requests.get(text_models_url, headers=headers, timeout=10)
            if pricing_resp.status_code == 200:
                pricing_items = pricing_resp.json()
                if isinstance(pricing_items, list):
                    for item in pricing_items:
                        if not isinstance(item, dict):
                            continue
                        name = item.get('name') or item.get('id') or ''
                        pricing = item.get('pricing') or item.get('price')
                        if name:
                            pricing_map[name] = pricing
                            text_model_ids.append(name)
                        aliases = item.get('aliases', []) or []
                        for alias in aliases:
                            if alias and alias not in pricing_map:
                                pricing_map[alias] = pricing
        except Exception:
            pricing_map = {}
            text_model_ids = []

        r = requests.get(models_url, headers=headers, timeout=10)
        if r.status_code == 200:
            payload = r.json()
            models = []
            if isinstance(payload, dict) and isinstance(payload.get('data'), list):
                for item in payload['data']:
                    if isinstance(item, dict) and item.get('id'):
                        models.append(item['id'])
            elif isinstance(payload, list):
                # fallback: some APIs return a raw list
                models = payload
            models_out = []
            if pricing_map:
                for model_id in models:
                    pricing = pricing_map.get(model_id)
                    cost_indicator = _cost_indicator_from_pricing(pricing)
                    models_out.append({"id": model_id, "cost": cost_indicator})
            if not models_out and text_model_ids:
                for name in sorted(set(text_model_ids)):
                    cost_indicator = _cost_indicator_from_pricing(pricing_map.get(name))
                    models_out.append({"id": name, "cost": cost_indicator})
            if not models_out:
                for model_id in models:
                    models_out.append({"id": model_id, "cost": None})
            _MODELS_CACHE['chat_models'] = (now, models_out)
            return jsonify({"success": True, "models": models_out})
        elif r.status_code == 403:
            msg = _parse_api_error(r)
            return jsonify({"success": False, "error": msg}), 403
        else:
            return jsonify({"success": False, "error": f"Models fetch failed: status {r.status_code}"}), r.status_code
    except Exception as e:
        logger.exception("Error fetching chat models list")
        return jsonify({"success": False, "error": f"Error fetching chat models: {str(e)}"})


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
        # Encode all special characters, including '/', to keep the prompt in a single path segment.
        encoded_prompt = quote(enhancement_prompt, safe="")
        # Build enhancement URL without referrer initially
        enhancement_url = f"{API_CONFIG['TEXT_API']}{encoded_prompt}"

        # Add referrer if not localhost or an IP address (API doesn't accept IPs as referrer)
        host = request.host or API_CONFIG['REFERRER']
        host_base = host.split(':')[0] if host else None
        is_ip = bool(host_base and re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", host_base))
        params = {}
        if host_base and not is_ip and host_base not in {'localhost', '127.0.0.1', '0.0.0.0'}:
            params['referrer'] = host_base
        
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
            response = requests.get(
                enhancement_url,
                headers=headers,
                params=params if params else None,
                timeout=API_CONFIG['TIMEOUT'],
            )
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

            # attach a simple human-friendly estimate string if possible
            try:
                if isinstance(pricing, dict):
                    token_cost = None
                    if isinstance(pricing.get('completionImageTokens'), (int, float)):
                        token_cost = pricing.get('completionImageTokens')
                    elif isinstance(pricing.get('promptImageTokens'), (int, float)):
                        token_cost = pricing.get('promptImageTokens')
                    elif isinstance(pricing.get('estimated_total'), (int, float)):
                        token_cost = pricing.get('estimated_total')

                    if token_cost is not None:
                        pricing['estimated_total'] = token_cost
                        pricing['estimate_text'] = (
                            f"Estimated: {token_cost} "
                            f"{pricing.get('currency','pollen')}"
                        )
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


def star_media_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})

        token = _get_request_token(request)
        if not token:
            return jsonify({"success": False, "error": "Authorization required"}), 401

        data = request.get_json(silent=True) or {}
        media_url = data.get('url')
        prompt = data.get('prompt')
        media_type = data.get('type') or 'image'

        if not media_url or not prompt:
            return jsonify({"success": False, "error": "Missing media url or prompt"}), 400

        owner_id = _owner_id_from_token(token)
        owner_dir = os.path.join(_STARRED_MEDIA_DIR, owner_id)
        os.makedirs(owner_dir, exist_ok=True)

        saved_filename = None
        saved_path = None

        if isinstance(media_url, str) and media_url.startswith('data:'):
            match = re.match(r'^data:([^;]+);base64,(.+)$', media_url)
            if not match:
                return jsonify({"success": False, "error": "Invalid data URL"}), 400
            mime = match.group(1).lower()
            b64_data = match.group(2)
            try:
                raw = base64.b64decode(b64_data)
            except Exception:
                return jsonify({"success": False, "error": "Invalid base64 payload"}), 400

            ext_map = {
                'image/png': 'png',
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/webp': 'webp',
                'image/gif': 'gif',
            }
            ext = ext_map.get(mime, 'png')
            saved_filename = f"{uuid.uuid4().hex}.{ext}"
            saved_path = os.path.join(owner_dir, saved_filename)
            with open(saved_path, 'wb') as f:
                f.write(raw)
        else:
            if not isinstance(media_url, str):
                return jsonify({"success": False, "error": "Invalid media URL"}), 400

            parsed = urlparse(media_url)
            if parsed.scheme in {'http', 'https'}:
                if parsed.netloc != request.host:
                    return jsonify({"success": False, "error": "Unsupported media host"}), 400
                media_path = parsed.path
            else:
                media_path = media_url

            if not media_path.startswith('/static/generated_videos/'):
                return jsonify({"success": False, "error": "Only generated videos can be saved from URL"}), 400

            source_path = os.path.join(os.path.dirname(__file__), media_path.lstrip('/'))
            if not os.path.isfile(source_path):
                return jsonify({"success": False, "error": "Source media not found"}), 404

            ext = os.path.splitext(source_path)[1] or '.mp4'
            saved_filename = f"{uuid.uuid4().hex}{ext}"
            saved_path = os.path.join(owner_dir, saved_filename)
            shutil.copy2(source_path, saved_path)
            media_type = 'video'

        host_url = request.host_url.rstrip('/')
        public_path = f"/static/starred_media/{owner_id}/{saved_filename}"
        public_url = f"{host_url}{public_path}"

        item = {
            'id': uuid.uuid4().hex,
            'prompt': str(prompt),
            'type': media_type,
            'url': public_url,
            'created_at': datetime.utcnow().isoformat() + 'Z',
            'model': data.get('model'),
            'style': data.get('style'),
            'size': data.get('size'),
            'quality': data.get('quality'),
            'guidance': data.get('guidance'),
            'seed': data.get('seed'),
            'aspect_ratio': data.get('aspect_ratio'),
        }
        item['_file_path'] = saved_path

        items = _load_starred_items(owner_id)
        items.append(item)
        _save_starred_items(owner_id, items)

        return jsonify({"success": True, "item": _strip_internal_fields(item)})
    except Exception as e:
        logger.exception("Error starring media")
        return jsonify({"success": False, "error": f"Error saving media: {str(e)}"})


def list_starred_api(request):
    try:
        token = _get_request_token(request)
        if not token:
            return jsonify({"success": False, "error": "Authorization required"}), 401

        owner_id = _owner_id_from_token(token)
        items = _load_starred_items(owner_id)
        cleaned = [_strip_internal_fields(item) for item in items]
        return jsonify({"success": True, "items": cleaned})
    except Exception as e:
        logger.exception("Error listing starred media")
        return jsonify({"success": False, "error": f"Error loading saved media: {str(e)}"})


def unstar_media_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"}), 400

        token = _get_request_token(request)
        if not token:
            return jsonify({"success": False, "error": "Authorization required"}), 401

        data = request.get_json(silent=True) or {}
        item_id = data.get('id')
        if not item_id:
            return jsonify({"success": False, "error": "Missing item id"}), 400

        owner_id = _owner_id_from_token(token)
        items = _load_starred_items(owner_id)
        remaining = []
        removed = None
        for item in items:
            if isinstance(item, dict) and item.get('id') == item_id:
                removed = item
            else:
                remaining.append(item)

        if removed is None:
            return jsonify({"success": False, "error": "Item not found"}), 404

        _save_starred_items(owner_id, remaining)

        # best-effort file cleanup
        try:
            file_path = removed.get('_file_path') if isinstance(removed, dict) else None
            if file_path:
                abs_path = os.path.abspath(file_path)
                base_dir = os.path.abspath(os.path.join(_STARRED_MEDIA_DIR, owner_id))
                if abs_path.startswith(base_dir) and os.path.isfile(abs_path):
                    os.remove(abs_path)
        except Exception:
            pass

        return jsonify({"success": True})
    except Exception as e:
        logger.exception("Error removing starred media")
        return jsonify({"success": False, "error": f"Error removing saved media: {str(e)}"})


def estimate_price_api(request):
    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "Request must be JSON"})
        data = request.get_json(silent=True) or {}
        model = data.get('model') or 'openai'
        duration = data.get('duration', None)
        size = data.get('size', None)
        quality = data.get('quality', None)
        guidance = data.get('guidance', None)

        # normalize duration
        try:
            dur_val = int(duration) if duration is not None else None
        except Exception:
            dur_val = None

        pricing = get_text_model_pricing(model, request)

        # If the pricing call returned a forbidden marker, surface that error
        if isinstance(pricing, dict) and pricing.get('__api_forbidden'):
            return jsonify({"success": False, "error": f"API Error 403: {pricing.get('message')}"})

        if pricing is not None:
            # If pricing exists but doesn't contain estimate, only use image token costs
            try:
                if isinstance(pricing, dict):
                    token_cost = None
                    if isinstance(pricing.get('completionImageTokens'), (int, float)):
                        token_cost = pricing.get('completionImageTokens')
                    elif isinstance(pricing.get('promptImageTokens'), (int, float)):
                        token_cost = pricing.get('promptImageTokens')

                    if token_cost is not None:
                        pricing['estimated_total'] = token_cost
                        pricing['estimate_text'] = (
                            f"Estimated: {pricing['estimated_total']} "
                            f"{pricing.get('currency','pollen')}"
                        )
                    else:
                        pricing['estimate_text'] = None
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
        model = data.get('model') or 'openai'
        max_tokens = data.get('max_tokens', None)

        try:
            tokens = int(max_tokens) if max_tokens is not None else None
        except Exception:
            tokens = None

        pricing = get_text_model_pricing(model, request)
        if isinstance(pricing, dict) and pricing.get('__api_forbidden'):
            return jsonify({"success": False, "error": f"API Error 403: {pricing.get('message')}"}), 403

        # compute estimate only when API pricing provides per-token fields
        if pricing is not None and tokens is not None:
            if 'pollen_per_token' in pricing:
                pricing['estimated_total'] = pricing['pollen_per_token'] * tokens
            elif 'pollen_per_1k_tokens' in pricing:
                pricing['estimated_total'] = pricing['pollen_per_1k_tokens'] * (tokens / 1000.0)

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