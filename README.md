# 🌾 Smart Vision

A mobile application for **wheat disease detection** powered by deep learning, designed for Moroccan farmers.

## Features

- **Disease Detection** — Scan wheat crops using your camera. The app uses a fine-tuned EfficientNet-B0 model to classify diseases in real time.
- **Agronomy Chatbot** — Ask any agronomy-related question. Powered by GPT-5.4-mini, strictly limited to agricultural topics.
- **Validated Chats** — Validate and archive important conversations. An AI-generated summary of each chat is saved for future reference.
- **Scan History** — View a timeline of your past scans with a pie chart breakdown of Healthy vs. Diseased results (last 30 days).
- **Weather Dashboard** — Real-time local weather and 3-day forecast, sourced from OpenWeatherMap.
- **Agricultural News** — Latest Moroccan wheat and agriculture news in French.
- **Secure Authentication** — JWT-based login and registration with password complexity validation.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React Native (Expo Router) |
| Backend | FastAPI (Python) |
| Database | MongoDB (Motor async driver) |
| AI Model | EfficientNet-B0 (timm / PyTorch) |
| Chatbot | OpenAI GPT-5.4-mini |
| Auth | JWT (HS256) |

## Disease Classes

The model currently detects the following wheat conditions:
- Blast
- Brown Rust
- Healthy
- Septoria
- Yellow Rust

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt  # or use uv
# Create a .env file with:
# MONGODB_URI=...
# JWT_SECRET=...
# OPENAI_API_KEY=...
# OPENWEATHER_API_KEY=...
# GNEWS_API_KEY=...
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
npm install
npx expo start
```

> Update the `HOST` / `host` IP addresses in the frontend files to match your local machine's Wi-Fi IP.

## Status

> **This is an MVP** — The core pipeline (scan → detect → chat → archive) is fully functional, but this is just the beginning. A lot of advanced features are coming.

> **Active Development** — A new, improved EfficientNet-B0 model is currently training to reduce false positives. More features are being built in parallel.

## Author

**Nisrine Regragui** — [@nisrineregragui](https://github.com/nisrineregragui)
