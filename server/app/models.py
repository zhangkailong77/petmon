from datetime import datetime

from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class SpeciesEnum(str, PyEnum):
  DOG = 'Dog'
  CAT = 'Cat'
  BIRD = 'Bird'
  OTHER = 'Other'


class LogTypeEnum(str, PyEnum):
  FEEDING = 'Feeding'
  DRINKING = 'Drinking'
  ACTIVITY = 'Activity'
  SLEEP = 'Sleep'
  BATHROOM = 'Bathroom'
  MEDICAL = 'Medical'
  NOTE = 'Note'


class Pet(Base):
  __tablename__ = 'pets'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  name: Mapped[str] = mapped_column(String(100), nullable=False)
  species: Mapped[str] = mapped_column(String(16), nullable=False)
  breed: Mapped[str | None] = mapped_column(String(100))
  age: Mapped[int] = mapped_column(Integer, nullable=False)
  age_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  weight: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
  photo_url: Mapped[str | None] = mapped_column(Text)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

  photos: Mapped[list['PetPhoto']] = relationship(
    'PetPhoto', back_populates='pet', cascade='all, delete-orphan', lazy='selectin'
  )
  logs: Mapped[list['PetLog']] = relationship(
    'PetLog', back_populates='pet', cascade='all, delete-orphan', lazy='selectin'
  )
  expenses: Mapped[list['PetExpense']] = relationship(
    'PetExpense', back_populates='pet', cascade='all, delete-orphan', lazy='selectin'
  )
  memos: Mapped[list['PetMemo']] = relationship(
    'PetMemo', back_populates='pet', cascade='all, delete-orphan', lazy='selectin'
  )


class PetPhoto(Base):
  __tablename__ = 'pet_photos'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  pet_id: Mapped[int] = mapped_column(Integer, ForeignKey('pets.id', ondelete='CASCADE'), nullable=False)
  url: Mapped[str] = mapped_column(Text, nullable=False)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

  pet: Mapped[Pet] = relationship('Pet', back_populates='photos')


class PetLog(Base):
  __tablename__ = 'pet_logs'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  pet_id: Mapped[int] = mapped_column(Integer, ForeignKey('pets.id', ondelete='CASCADE'), nullable=False)
  type: Mapped[str] = mapped_column(String(32), nullable=False)
  value: Mapped[str | None] = mapped_column(String(255))
  notes: Mapped[str | None] = mapped_column(Text)
  occurred_on: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

  pet: Mapped[Pet] = relationship('Pet', back_populates='logs')


class PetExpense(Base):
  __tablename__ = 'pet_expenses'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  pet_id: Mapped[int] = mapped_column(Integer, ForeignKey('pets.id', ondelete='CASCADE'), nullable=False)
  category: Mapped[str] = mapped_column(String(100), nullable=False)
  amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
  notes: Mapped[str | None] = mapped_column(Text)
  spent_on: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

  pet: Mapped[Pet] = relationship('Pet', back_populates='expenses')


class PetMemo(Base):
  __tablename__ = 'pet_memos'

  id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
  pet_id: Mapped[int] = mapped_column(Integer, ForeignKey('pets.id', ondelete='CASCADE'), nullable=False)
  title: Mapped[str] = mapped_column(String(255), nullable=False)
  notes: Mapped[str | None] = mapped_column(Text)
  due_on: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
  is_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
  source: Mapped[str] = mapped_column(String(24), default='manual', nullable=False)
  created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

  pet: Mapped[Pet] = relationship('Pet', back_populates='memos')
