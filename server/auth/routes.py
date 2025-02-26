from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import timedelta

from .auth_service import register_user, authenticate_user, create_access_token
from db.database import db  # Ensure database connection is imported correctly
from db.models import UserCreate  # Ensure this model exists
from pydantic import BaseModel

auth_router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")  # Corrected token URL

class Token(BaseModel):
    access_token: str
    token_type: str

@auth_router.post("/register")
async def register(user: UserCreate):
    if db is None:
        raise HTTPException(status_code=500, detail="❌ Database connection is not established.")
    
    return await register_user(user, db)

@auth_router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    access_token = create_access_token({"sub": user["username"]}, timedelta(minutes=30))
    return {"access_token": access_token, "token_type": "bearer"}
