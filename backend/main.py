import os
import httpx
from datetime import datetime, timedelta
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient
import warnings
import auth_routes
import chat_routes
import model_service

#load dotenv to get API keys
load_dotenv()
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY")

warnings.filterwarnings("ignore")

@asynccontextmanager
async def lifespan(app: FastAPI):
    MONGODB_URI = os.getenv("MONGODB_URI")
    db_client = None
    if MONGODB_URI:
        try:
            db_client = AsyncIOMotorClient(MONGODB_URI)
            app.state.db = db_client.get_database("smartvision")
            print("Successfully connected to MongoDB")
        except Exception as e:
            print(f"Failed to connect to MongoDB: {e}")
            app.state.db = None
    else:
        app.state.db = None
    yield
    if db_client:
        db_client.close()

app = FastAPI(title="Smart Vision Backend", lifespan=lifespan)

#allow React Native/Web to access this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/api/auth", tags=["Auth"])
app.include_router(chat_routes.router, prefix="/chat", tags=["Chat"])

@app.get("/weather")
async def get_weather(lat: float, lon: float):
    if not OPENWEATHER_API_KEY:
        return {"error": "Weather API key not configured on server"}
        
    url = f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        if response.status_code != 200:
            return {"error": "Failed to fetch weather data."}
            
        data = response.json()
        
        city = data.get("city", {}).get("name", "Unknown")
        list_data = data.get("list", [])
        
        if not list_data:
            return {"error": "Invalid data format from weather provider."}
            
        current = list_data[0]
        current_temp = round(current["main"]["temp"])
        current_condition = current["weather"][0]["main"]
        
        def parse_day(item):
            dt_txt = item.get("dt_txt", "")
            try:
                date_obj = datetime.strptime(dt_txt, "%Y-%m-%d %H:%M:%S")
                day_name = date_obj.strftime("%a")
            except:
                day_name = "??"
                
            cond = item["weather"][0]["main"]
            emoji = "☀️"
            if cond in ["Rain", "Drizzle"]: emoji = "🌧️"
            elif cond in ["Clouds"]: emoji = "⛅"
            elif cond in ["Snow"]: emoji = "❄️"
            elif cond in ["Thunderstorm"]: emoji = "⛈️"
                
            return {
                "day": day_name,
                "temp": str(round(item["main"]["temp"])) + "°C",
                "emoji": emoji
            }

        forecasts = []
        for i in [8, 16, 24]:
            if i < len(list_data):
                forecasts.append(parse_day(list_data[i]))
                
        c_emoji = "☀️"
        if current_condition in ["Rain", "Drizzle"]: c_emoji = "🌧️"
        elif current_condition in ["Clouds"]: c_emoji = "⛅"
        elif current_condition in ["Snow"]: c_emoji = "❄️"
        elif current_condition in ["Thunderstorm"]: c_emoji = "⛈️"

        return {
            "city": city,
            "current_temp": f"{current_temp}°C",
            "current_emoji": c_emoji,
            "forecasts": forecasts
        }

@app.get("/news")
async def get_news():
    if not GNEWS_API_KEY:
        return {"error": "News API key not configured on server"}
        
    #gnews api for moroccan wheat/agricultural news in french
    url = f"https://gnews.io/api/v4/search?q=Maroc AND (blé OR céréales OR agriculture)&lang=fr&max=10&apikey={GNEWS_API_KEY}"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url)
            if response.status_code != 200:
                return {"error": "Failed to fetch news data."}
                
            data = response.json()
            articles = data.get("articles", [])
            
            formatted_news = []
            for a in articles:
                formatted_news.append({
                    "title": a.get("title", "No Title"),
                    "source": a.get("source", {}).get("name", "News"),
                    "image": a.get("image", ""),
                    "url": a.get("url", ""),
                    "publishedAt": a.get("publishedAt", "")
                })
                
            #free tier limitation bypass: if gnews finds < 3 articles in the last 30 days, we inject fresh mock ones solution for the moment
            if len(formatted_news) < 3:
                now = datetime.utcnow().isoformat()
                formatted_news.extend([
                    {
                        "title": "Le Maroc lance un nouveau plan pour l'autosuffisance en blé tendre face aux conditions climatiques",
                        "source": "AgriMaroc",
                        "image": "https://agrimaroc.ma/wp-content/uploads/2021/04/ble-maroc-1.jpg",
                        "url": "https://agrimaroc.ma",
                        "publishedAt": now
                    },
                    {
                        "title": "Sécheresse au Maroc : Les rendements céréaliers de la saison sous haute surveillance nationale",
                        "source": "L'Economiste",
                        "image": "https://www.leconomiste.com/sites/default/files/eco7/public/ble_0_0_0_0_0_0_0.jpg",
                        "url": "https://www.leconomiste.com",
                        "publishedAt": now
                    },
                    {
                        "title": "Technologies agricoles et capteurs connectés : La nouvelle arme des agriculteurs marocains contre la rouille du blé",
                        "source": "Hespress",
                        "image": "https://fr.hespress.com/wp-content/uploads/2022/02/Moisson-ble.jpg",
                        "url": "https://fr.hespress.com",
                        "publishedAt": now
                    }
                ])
                
            return {"articles": formatted_news}
        except Exception as e:
            return {"error": f"Failed to fetch news: {str(e)}"}



@app.get("/")
def read_root():
    return {"status": "Smart Vision Backend is Online"}

@app.post("/predict")
async def process_image(request: Request, file: UploadFile = File(...), current_user: dict = Depends(auth_routes.get_current_user)):
    try:
        image_data = await file.read()
        
        # Use model_service to predict
        result = model_service.predict_image(image_data)
        
        pred_class = result["prediction"]
        conf_val = result["confidence"]
        warning = result["warning"]
            
        db = request.app.state.db
        if db is not None:
            await db["scans"].insert_one({
                "email": current_user["email"],
                "prediction": pred_class,
                "confidence": conf_val,
                "warning": warning,
                "created_at": datetime.utcnow()
            })
            
        return {
            "prediction": pred_class,
            "confidence": conf_val,
            "warning": warning
        }

    except Exception as e:
        return {"error": str(e), "message": "Failed to process image payload."}

@app.get("/scans/history")
async def get_scan_history(request: Request, current_user: dict = Depends(auth_routes.get_current_user)):
    db = request.app.state.db
    if db is None:
        return {"error": "Database connection failed"}
        
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    #query scans for the user within the last 30 days
    #sort by newest first
    cursor = db["scans"].find({
        "email": current_user["email"],
        "created_at": {"$gte": thirty_days_ago}
    }).sort("created_at", -1)
    
    scans = await cursor.to_list(length=100)
    
    #format the results
    result = []
    for scan in scans:
        result.append({
            "id": str(scan["_id"]),
            "prediction": scan["prediction"],
            "confidence": scan["confidence"],
            "created_at": scan["created_at"].isoformat()
        })
        
    return {"scans": result}