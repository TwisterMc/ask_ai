from flask import Flask, render_template, request, jsonify
from urllib.parse import quote
from generators import enhance_prompt_api, generate_image_api
import os

# Load environment variables from .env file (for local development)
# On PythonAnywhere, env vars are set in WSGI file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed (OK on PythonAnywhere)

# Initialize Flask app
app = Flask(__name__)

# Import API configuration
from config import API_CONFIG

@app.route("/enhance_prompt", methods=["POST"])
def enhance_prompt():
    return enhance_prompt_api(request)

@app.route("/")
def home():
    return render_template("about.html")

@app.route("/generate", methods=["POST"])
def generate_image():
    return generate_image_api(request)

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/password")
def password():
    return render_template("password.html")

from password import generate_secure_password, generate_word_password

@app.route("/api/generate_password", methods=["POST"])
def api_generate_password():
    data = request.get_json(silent=True) or {}
    use_words = data.get("useWords", False)
    if use_words:
        num_words = int(data.get("numWords", 4))
        num_words = max(4, min(num_words, 10))
        categories = data.get("categories", None)
        password = generate_word_password(num_words=num_words, categories=categories)
    else:
        length = int(data.get("length", 16))
        password = generate_secure_password(length=length)
    return jsonify({"password": password})

@app.route("/image")
def image_generator():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
