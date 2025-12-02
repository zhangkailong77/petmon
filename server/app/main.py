from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import gemini, pets

settings = get_settings()

app = FastAPI(title='PetPulse API', version='1.0.0')

app.add_middleware(
  CORSMiddleware,
  allow_origins=settings.cors_origins or ['*'],
  allow_credentials=True,
  allow_methods=['*'],
  allow_headers=['*'],
)

api_prefix = settings.api_prefix.rstrip('/')

app.include_router(pets.router, prefix=api_prefix)
app.include_router(gemini.router, prefix=api_prefix)


@app.get(f'{api_prefix}/health')
def health():
  return {'status': 'ok'}
