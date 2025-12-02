from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class Species(str, Enum):
  DOG = 'Dog'
  CAT = 'Cat'
  BIRD = 'Bird'
  OTHER = 'Other'


class LogType(str, Enum):
  FEEDING = 'Feeding'
  DRINKING = 'Drinking'
  ACTIVITY = 'Activity'
  SLEEP = 'Sleep'
  BATHROOM = 'Bathroom'
  MEDICAL = 'Medical'
  NOTE = 'Note'


class PetBase(BaseModel):
  name: str
  species: Species
  breed: Optional[str] = None
  age: int
  ageMonths: Optional[int] = 0
  weight: float
  photoUrl: Optional[str] = Field(default=None)


class PetCreate(PetBase):
  pass


class PetUpdate(PetBase):
  pass


class PhotoCreate(BaseModel):
  url: str
  date: Optional[datetime] = None


class Photo(BaseModel):
  id: int
  url: str
  date: datetime


class Pet(PetBase):
  id: int
  gallery: List[Photo] = []


class LogCreate(BaseModel):
  type: LogType
  value: Optional[str] = None
  notes: Optional[str] = None
  date: Optional[datetime] = None


class LogEntry(BaseModel):
  id: int
  petId: int
  type: LogType
  value: Optional[str] = None
  notes: Optional[str] = None
  date: datetime


class ExpenseCreate(BaseModel):
  category: str
  amount: float
  notes: Optional[str] = None
  date: Optional[datetime] = None


class ExpenseEntry(BaseModel):
  id: int
  petId: int
  category: str
  amount: float
  notes: Optional[str] = None
  date: datetime


class MemoCreate(BaseModel):
  title: str
  notes: Optional[str] = None
  dueDate: Optional[datetime] = None
  done: bool = False
  source: str = 'manual'


class MemoEntry(BaseModel):
  id: int
  petId: int
  title: str
  notes: Optional[str] = None
  dueDate: Optional[datetime] = None
  done: bool = False
  source: str = 'manual'
  createdAt: datetime


class AnalysisPayload(BaseModel):
  pet: dict
  logs: list[dict]
  expenses: list[dict]
  language: str = 'en'


class ParsePayload(BaseModel):
  input: str


class ChatHistoryItem(BaseModel):
  role: str
  text: str


class ChatPayload(BaseModel):
  pet: dict
  logs: list[dict]
  analysisSummary: Optional[str] = None
  analysisRisks: Optional[list[str]] = None
  history: list[ChatHistoryItem]
  newMessage: str
  language: str = 'en'
