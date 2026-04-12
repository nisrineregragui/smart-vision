# 🌾 Smart Vision: AI-Powered Wheat Disease Detection

![Status: Active Development](https://img.shields.io/badge/Status-Active_Development-orange)
![Platform: iOS & Android](https://img.shields.io/badge/Platform-iOS_%7C_Android-lightgrey)
![Backend: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)
![AI: GPT-5.4-mini](https://img.shields.io/badge/AI-GPT--5.4--mini-412991)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

Smart Vision is an agricultural Decision Support System (DSS) designed specifically for Moroccan field conditions. It combines edge-device computer vision with LLM-based reasoning to help farmers identify, track, and treat wheat leaf diseases in real-time.

> **Note to Evaluators:** This is a PFA (Final Year Engineering Project) currently in active development. The core pipeline is fully operational. See the [Engineering Roadmap](#-engineering-roadmap) for a detailed breakdown of what is done and what is planned.

---

## Visual Showcase

| Login | News Dashboard | AI Scan | Chat | History |
| :---: | :---: | :---: | :---: | :---: |
| <img src="screenshots/login.jpeg" width="180"/> | <img src="screenshots/news.jpeg" width="180"/> | <img src="screenshots/analyse.jpeg" width="180"/> | <img src="screenshots/chats.jpeg" width="180"/> | <img src="screenshots/history.jpeg" width="180"/> |

---

## Current Features (MVP)

> **This is an MVP.** The core pipeline (scan → detect → chat → archive) is fully functional, but this is just the beginning. A lot of advanced features are coming.

- **Disease Detection** — Scan wheat crops using your camera. A fine-tuned EfficientNet-B0 model classifies diseases in real time with confidence scoring.
- **Agronomy Chatbot** — Ask any agronomy-related question, powered by GPT-5.4-mini and strictly restricted to agricultural topics to prevent hallucinations.
- **Validated Chat Archive** — Validate and archive important conversations. An AI-generated summary (crop, disease, treatment) is auto-saved for future reference.
- **Scan History & Analytics** — View a timeline of past scans with a pie chart breakdown of Healthy vs. Diseased results over the last 30 days.
- **Weather Dashboard** — Real-time local weather and 3-day forecast from OpenWeatherMap.
- **Agricultural News** — Latest Moroccan wheat and agriculture news in French via GNews.
- **Secure Authentication** — JWT-based login and registration with full password complexity validation.

---

## Model Architecture

The detection pipeline uses a two-tier approach to balance speed and accuracy:

1. **Detection Model:** `EfficientNet-B0` (PyTorch / timm) fine-tuned on field-condition wheat imagery.
2. **Reasoning Engine:** `GPT-5.4-mini` used for generating contextual diagnostic summaries and agronomy guidance.

### Disease Classes

| Index | Class |
| :---: | :--- |
| 0 | Blast |
| 1 | Brown Rust |
| 2 | Healthy |
| 3 | Septoria |
| 4 | Yellow Rust |

> **Preprocessing:** `224×224` input, ImageNet normalization stats (`mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`).

---

##  Tech Stack

| Component | Technology |
| :--- | :--- |
| **Mobile Client** | React Native (Expo Router) |
| **API Server** | FastAPI (Python 3.11) |
| **Database** | MongoDB Atlas (Motor Async) |
| **Deep Learning** | PyTorch / timm (EfficientNet-B0) |
| **Generative AI** | OpenAI API (GPT-5.4-mini) |
| **Authentication** | JWT (HS256) |

---

##  Local Setup

### Prerequisites
- Node.js (v18+)
- Python (v3.11+)
- `uv` package manager *(recommended)* or `pip`

### 1. Environment Variables

Create a `.env` file inside `/backend`:

```env
MONGODB_URI=your_atlas_connection_string
JWT_SECRET=your_generated_secret_key
OPENAI_API_KEY=your_openai_key
OPENWEATHER_API_KEY=your_weather_key
GNEWS_API_KEY=your_gnews_key
```

### 2. Backend

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npx expo start
```

> **Important:** Update the `HOST` constant in `chats.tsx`, `analyse.tsx`, `history.tsx`, and `index.tsx` to match your local machine's Wi-Fi IP address so that Expo Go can reach the backend.

---

##  Engineering Roadmap

###  Done — MVP Core

| Feature | Status |
| :--- | :---: |
| JWT Authentication & Registration | ✅ Done |
| EfficientNet-B0 Disease Detection | ✅ Done |
| Confidence Score Persistence | ✅ Done |
| Agronomy Chatbot (GPT-5.4-mini) | ✅ Done |
| Validated Chat Archive (AI Summary) | ✅ Done |
| Read-Only Chat History Viewer | ✅ Done |
| Scan History & Pie Chart Analytics | ✅ Done |
| Weather Dashboard | ✅ Done |
| Agricultural News Feed | ✅ Done |

---

###  In Progress

| Feature | Status |
| :--- | :---: |
| Model v2 — EfficientNet-B0 (Reduced False Positives) |  Training |
| Confidence Thresholding & UX Warning |  Next |
| Backend Modularization (`model_service.py`) |  Next |

---

###  Advanced AI Pipeline (Planned)

| Feature | Description |
| :--- | :--- |
| **RAG Agronomy Agent** | Replace the basic chatbot with a full Retrieval-Augmented Generation (RAG) agent backed by a curated knowledge base of Moroccan crop calendars, ONCA treatment guidelines, and peer-reviewed agronomy literature. Answers will be grounded in verified sources, not just parametric LLM knowledge. |
| **Prediction Validation Agent** | A second AI agent that cross-validates the CV model's output using a multimodal LLM (GPT-5.4). If the model returns a low-confidence result, the agent independently analyzes the raw image and either confirms or overrides the diagnosis with a reasoning trace. |
| **Ensemble Model Pipeline** | Combine multiple fine-tuned models (EfficientNet-B0, ResNet50, ViT) and let a meta-agent vote on the final prediction to reduce false positives structurally. |
| **Treatment Recommendation Agent** | A specialized agent that takes the confirmed disease, the current weather forecast, and the crop stage (from user input) to generate a personalized, timed treatment plan. |

---

###  Intelligent Dashboards (Planned)

| Feature | Description |
| :--- | :--- |
| **Disease Outbreak Heatmap** | Geo-tag every scan and overlay results on a map of Morocco. If multiple farmers in the same region report the same disease in a short window, generate an automatic regional alert. |
| **Field Health Score** | A composite weekly score per user that aggregates scan results, disease severity, and treatment compliance into a single "field health" metric. |
| **Predictive Risk Forecasting** | Correlate historical scan data with weather patterns (humidity, temperature, rainfall) to predict when a disease outbreak is statistically likely *before* it happens. |
| **Seasonal Trend Analysis** | Year-over-year breakdown of disease prevalence by month and region, giving farmers and agronomists actionable planting/treatment timing insights. |
| **Treatment Efficacy Tracker** | Allow farmers to log follow-up scans after treatment. The dashboard then visualizes whether the disease regressed, stabilized, or worsened. |

---

### Ecosystem & Community Features (Planned)

| Feature | Description |
| :--- | :--- |
| **Offline Scan Queue** | Scans taken in deep fields without connectivity are queued locally and synced to the cloud automatically once a connection is restored. |
| **WhatsApp / Telegram Bot** | Expose the detection pipeline as a chatbot on WhatsApp and Telegram — platforms already widely used by Moroccan farmers — with no app installation required. |
| **Community Disease Reporting** | Crowdsourced outbreak reporting: farmers can flag a disease in their area, contributing to the regional heatmap and alerting their neighbors. |
| **PDF Report Export** | Generate a professional PDF report of a scan session (diagnosis, confidence, treatment recommendation) for insurance claims, agricultural loans, or government subsidy applications. |
| **Multi-Crop Support** | Expand detection beyond wheat to cover barley, maize, and sunflower — the three other major Moroccan cereal crops. |
| **Expert Agronomist Network** | In-app marketplace to connect farmers with certified local agronomists for video consultations triggered by low-confidence or severe detections. |
| **Crop Calendar Integration** | Integrated Moroccan crop calendar: optimal planting, irrigation, and harvest windows by region, automatically adjusted for current-season weather anomalies. |
| **Multi-language UI** | Full support for Arabic (Darija-aware), French, and English to ensure accessibility across all literacy levels. |

---

## Author

**Nisrine Regragui** — [@nisrineregragui](https://github.com/nisrineregragui)

---

*Smart Vision — Built for the field, powered by AI.* 🌱
