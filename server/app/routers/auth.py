from datetime import datetime, timedelta
from typing import Optional
from random import randint
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError

from ..database import get_db
from ..models import User, VerificationCode

# 配置
SECRET_KEY = "YOUR_SUPER_SECRET_KEY_HERE" # 请在环境变量中设置
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7天过期

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter(tags=["auth"])

# --- Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserAuth(BaseModel):
    email: EmailStr
    password: str
    code: Optional[str] = None # 注册时需要

class SendCodeRequest(BaseModel):
    email: EmailStr

# --- Utils ---
def verify_password(plain_password, hashed_password):
    # Truncate password to 72 bytes for bcrypt as per the error message
    plain_password = plain_password[:72]
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    # Truncate password to 72 bytes for bcrypt as per the error message
    password = password[:72]
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Routes ---

@router.post("/auth/send-code")
def send_verification_code(req: SendCodeRequest, db: Session = Depends(get_db)):
    # 生成6位验证码
    code = "".join([str(randint(0, 9)) for _ in range(6)])
    expiration = datetime.utcnow() + timedelta(minutes=10)
    
    # 保存到数据库
    db_code = VerificationCode(email=req.email, code=code, expires_at=expiration)
    db.add(db_code)
    db.commit()
    
    # 模拟发送邮件 (实际项目中请替换为SMTP发送代码)
    print(f"==========================================")
    print(f" [Email Service] To: {req.email}")
    print(f" [Email Service] Code: {code}")
    print(f"==========================================")
    
    return {"message": "Verification code sent"}

@router.post("/auth/register")
def register(auth: UserAuth, db: Session = Depends(get_db)):
    # 1. 验证用户是否存在
    user = db.query(User).filter(User.email == auth.email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. 验证验证码
    verify_record = db.query(VerificationCode).filter(
        VerificationCode.email == auth.email,
        VerificationCode.code == auth.code,
        VerificationCode.is_used == False,
        VerificationCode.expires_at > datetime.utcnow()
    ).first()
    
    if not verify_record:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    
    # 3. 标记验证码已使用
    verify_record.is_used = True
    
    # 4. 创建用户
    new_user = User(
        email=auth.email,
        hashed_password=get_password_hash(auth.password),
        nickname=auth.email.split('@')[0]
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # 5. 自动登录
    access_token = create_access_token(data={"sub": new_user.email, "id": new_user.id})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"id": new_user.id, "email": new_user.email, "nickname": new_user.nickname}
    }

@router.post("/auth/login")
def login(auth: UserAuth, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == auth.email).first()
    if not user or not verify_password(auth.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    access_token = create_access_token(data={"sub": user.email, "id": user.id})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "nickname": user.nickname}
    }