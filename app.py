from flask import Flask, render_template, request, jsonify
from urllib.parse import quote
from generators import enhance_prompt_api, generate_image_api

# Initialize Flask app
app = Flask(__name__)

# Import API configuration
from config import API_CONFIG

@app.route("/enhance_prompt", methods=["POST"])
def enhance_prompt():
    return enhance_prompt_api(request)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/generate", methods=["POST"])
def generate_image():
    return generate_image_api(request)

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/password")
def password():
    return render_template("password.html")

from password import generate_secure_password

@app.route("/api/generate_password", methods=["POST"])
def api_generate_password():
    data = request.get_json(silent=True) or {}
    length = int(data.get("length", 16))
    password = generate_secure_password(length=length)
    return jsonify({"password": password})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
