from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from .config import get_settings

settings = get_settings()

engine = create_engine(
  settings.database_url,
  pool_pre_ping=True,
  pool_recycle=600,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

Base = declarative_base()


def get_db():
  db: Session = SessionLocal()
  try:
    yield db
  finally:
    db.close()


@contextmanager
def session_scope():
  session: Session = SessionLocal()
  try:
    yield session
    session.commit()
  except Exception:
    session.rollback()
    raise
  finally:
    session.close()
