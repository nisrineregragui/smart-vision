from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, EmailStr
import bcrypt
import jwt
import os
import re
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer

#create an APIRouter for auth endpoints
router = APIRouter()

#JWT constants
load_dotenv()
SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise Exception("JWT_SECRET is not set!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7


#pydantic models
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


#functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        name: str = payload.get("name", "Unknown")
    except Exception:
        raise credentials_exception
    return {"email": email, "name": name}

#endpoints
@router.post("/register", response_model=Token)
async def register(user: UserRegister, request: Request):
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    #password validation
    if len(user.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters long")
    if not re.search(r"[A-Z]", user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one lowercase letter")
    if not re.search(r"\d", user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one number")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must contain at least one special character")

    #check if the user already exists
    existing_user = await db["users"].find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    #hash the password and insert user
    hashed_password = get_password_hash(user.password)
    new_user = {
        "name": user.name,
        "email": user.email,
        "password": hashed_password,
        "created_at": datetime.utcnow()
    }
    
    result = await db["users"].insert_one(new_user)
    
    if not result.inserted_id:
        raise HTTPException(status_code=500, detail="Failed to register user")

    #create token for immediate login
    access_token = create_access_token(data={"sub": user.email, "name": user.name})
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"name": user.name, "email": user.email}
    }


@router.post("/login", response_model=Token)
async def login(user: UserLogin, request: Request):
    print(f"Login attempt for user: {user.email}")
    db = request.app.state.db
    if db is None:
        print("Error: DB state is None!")
        raise HTTPException(status_code=500, detail="Database connection failed")

    #check if the user exists
    print("Querying database for user...")
    try:
        db_user = await db["users"].find_one({"email": user.email})
        print(f"Database query complete. User found: {bool(db_user)}")
    except Exception as e:
        print(f"Database error during query: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    if not db_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    #verify password
    if not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    #create access token
    access_token = create_access_token(data={"sub": user.email, "name": db_user["name"]})
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"name": db_user["name"], "email": db_user["email"]}
    }
