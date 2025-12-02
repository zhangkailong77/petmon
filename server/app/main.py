from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import gemini, pets, auth

settings = get_settings()

app = FastAPI(title='PetPulse API', version='1.0.0')

app.add_middleware(
  CORSMiddleware,
  # 不要依赖 settings.cors_origins，直接强制写死 ["*"]
  # allow_origins=settings.cors_origins or ['*'], <--- 原本这行可能导致问题
  allow_origins=["*"], 
  allow_credentials=True,
  allow_methods=['*'],
  allow_headers=['*'],
)

api_prefix = settings.api_prefix.rstrip('/')

app.include_router(pets.router, prefix=api_prefix)
app.include_router(gemini.router, prefix=api_prefix)
app.include_router(auth.router, prefix=api_prefix)


@app.get(f'{api_prefix}/health')
def health():
  return {'status': 'ok'}
