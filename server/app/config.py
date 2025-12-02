from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
  port: int = Field(4000, alias='PORT')
  db_host: str = Field('192.168.150.27', alias='DB_HOST')
  db_port: int = Field(3308, alias='DB_PORT')
  db_user: str = Field('root', alias='DB_USER')
  db_password: str = Field('root', alias='DB_PASSWORD')
  db_name: str = Field('petpulse', alias='DB_NAME')

  gemini_api_key: str = Field('', alias='GEMINI_API_KEY')
  gemini_model: str = Field('gemini-2.5-flash', alias='GEMINI_MODEL')

  api_prefix: str = Field('/api', alias='API_PREFIX')
  cors_origins: List[str] = Field(default_factory=lambda: ['http://localhost:3000'])

  class Config:
    env_file = '.env'
    env_file_encoding = 'utf-8'

  @property
  def database_url(self) -> str:
    return (
      f"mysql+pymysql://{self.db_user}:{self.db_password}"
      f"@{self.db_host}:{self.db_port}/{self.db_name}"
    )


@lru_cache()
def get_settings() -> Settings:
  return Settings()
