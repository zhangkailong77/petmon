from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import schemas
from ..database import get_db
from ..models import Pet, PetExpense, PetLog, PetMemo, PetPhoto

router = APIRouter(prefix='/pets', tags=['pets'])


def _serialize_photo(photo: PetPhoto) -> schemas.Photo:
  return schemas.Photo(
    id=photo.id,
    url=photo.url,
    date=photo.created_at,
  )


def _serialize_pet(pet: Pet) -> schemas.Pet:
  gallery = sorted(pet.photos, key=lambda p: p.created_at, reverse=True)
  return schemas.Pet(
    id=pet.id,
    name=pet.name,
    species=pet.species,  # type: ignore[arg-type]
    breed=pet.breed,
    age=pet.age,
    ageMonths=pet.age_months,
    weight=float(pet.weight),
    photoUrl=pet.photo_url,
    gallery=[_serialize_photo(photo) for photo in gallery],
  )


def _serialize_log(entry: PetLog) -> schemas.LogEntry:
  return schemas.LogEntry(
    id=entry.id,
    petId=entry.pet_id,
    type=entry.type,  # type: ignore[arg-type]
    value=entry.value,
    notes=entry.notes,
    date=entry.occurred_on,
  )


def _serialize_expense(entry: PetExpense) -> schemas.ExpenseEntry:
  return schemas.ExpenseEntry(
    id=entry.id,
    petId=entry.pet_id,
    category=entry.category,
    amount=float(entry.amount),
    notes=entry.notes,
    date=entry.spent_on,
  )


def _serialize_memo(entry: PetMemo) -> schemas.MemoEntry:
  return schemas.MemoEntry(
    id=entry.id,
    petId=entry.pet_id,
    title=entry.title,
    notes=entry.notes,
    dueDate=entry.due_on,
    done=entry.is_done,
    source=entry.source,
    createdAt=entry.created_at,
  )


def _get_pet(db: Session, pet_id: int) -> Pet:
  stmt = (
    select(Pet)
    .options(selectinload(Pet.photos))
    .where(Pet.id == pet_id)
  )
  pet = db.scalars(stmt).first()
  if not pet:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Pet not found')
  return pet


def _get_log(db: Session, pet_id: int, log_id: int) -> PetLog:
  stmt = select(PetLog).where(PetLog.id == log_id, PetLog.pet_id == pet_id)
  entry = db.scalars(stmt).first()
  if not entry:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Log not found')
  return entry


def _get_expense(db: Session, pet_id: int, expense_id: int) -> PetExpense:
  stmt = select(PetExpense).where(PetExpense.id == expense_id, PetExpense.pet_id == pet_id)
  entry = db.scalars(stmt).first()
  if not entry:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Expense not found')
  return entry


def _get_memo(db: Session, pet_id: int, memo_id: int) -> PetMemo:
  stmt = select(PetMemo).where(PetMemo.id == memo_id, PetMemo.pet_id == pet_id)
  entry = db.scalars(stmt).first()
  if not entry:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Memo not found')
  return entry


@router.get('', response_model=List[schemas.Pet])
def list_pets(db: Session = Depends(get_db)):
  stmt = select(Pet).options(selectinload(Pet.photos)).order_by(Pet.id.desc())
  pets = db.scalars(stmt).all()
  return [_serialize_pet(pet) for pet in pets]


@router.get('/{pet_id}', response_model=schemas.Pet)
def get_pet(pet_id: int, db: Session = Depends(get_db)):
  pet = _get_pet(db, pet_id)
  return _serialize_pet(pet)


@router.post('', response_model=schemas.Pet, status_code=status.HTTP_201_CREATED)
def create_pet(payload: schemas.PetCreate, db: Session = Depends(get_db)):
  pet = Pet(
    name=payload.name,
    species=payload.species.value,
    breed=payload.breed,
    age=payload.age,
    age_months=payload.ageMonths or 0,
    weight=payload.weight,
    photo_url=payload.photoUrl,
  )
  db.add(pet)
  db.commit()
  db.refresh(pet)
  return _serialize_pet(pet)


@router.put('/{pet_id}', response_model=schemas.Pet)
def update_pet(pet_id: int, payload: schemas.PetUpdate, db: Session = Depends(get_db)):
  pet = _get_pet(db, pet_id)
  pet.name = payload.name
  pet.species = payload.species.value
  pet.breed = payload.breed
  pet.age = payload.age
  pet.age_months = payload.ageMonths or 0
  pet.weight = payload.weight
  pet.photo_url = payload.photoUrl
  db.commit()
  db.refresh(pet)
  return _serialize_pet(pet)


@router.get('/{pet_id}/logs', response_model=List[schemas.LogEntry])
def list_logs(pet_id: int, db: Session = Depends(get_db)):
  stmt = (
    select(PetLog)
    .where(PetLog.pet_id == pet_id)
    .order_by(PetLog.occurred_on.desc())
  )
  entries = db.scalars(stmt).all()
  return [_serialize_log(entry) for entry in entries]


@router.post('/{pet_id}/logs', response_model=schemas.LogEntry, status_code=status.HTTP_201_CREATED)
def add_log(pet_id: int, payload: schemas.LogCreate, db: Session = Depends(get_db)):
  occurred_on = payload.date or datetime.utcnow()
  entry = PetLog(
    pet_id=pet_id,
    type=payload.type.value,
    value=payload.value,
    notes=payload.notes,
    occurred_on=occurred_on,
  )
  db.add(entry)
  db.commit()
  db.refresh(entry)
  return _serialize_log(entry)


@router.put('/{pet_id}/logs/{log_id}', response_model=schemas.LogEntry)
def update_log(pet_id: int, log_id: int, payload: schemas.LogCreate, db: Session = Depends(get_db)):
  entry = _get_log(db, pet_id, log_id)
  entry.type = payload.type.value
  entry.value = payload.value
  entry.notes = payload.notes
  entry.occurred_on = payload.date or entry.occurred_on
  db.commit()
  db.refresh(entry)
  return _serialize_log(entry)


@router.delete('/{pet_id}/logs/{log_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_log(pet_id: int, log_id: int, db: Session = Depends(get_db)):
  entry = _get_log(db, pet_id, log_id)
  db.delete(entry)
  db.commit()
  return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get('/{pet_id}/expenses', response_model=List[schemas.ExpenseEntry])
def list_expenses(pet_id: int, db: Session = Depends(get_db)):
  stmt = (
    select(PetExpense)
    .where(PetExpense.pet_id == pet_id)
    .order_by(PetExpense.spent_on.desc())
  )
  entries = db.scalars(stmt).all()
  return [_serialize_expense(entry) for entry in entries]


@router.post('/{pet_id}/expenses', response_model=schemas.ExpenseEntry, status_code=status.HTTP_201_CREATED)
def add_expense(pet_id: int, payload: schemas.ExpenseCreate, db: Session = Depends(get_db)):
  spent_on = payload.date or datetime.utcnow()
  entry = PetExpense(
    pet_id=pet_id,
    category=payload.category,
    amount=payload.amount,
    notes=payload.notes,
    spent_on=spent_on,
  )
  db.add(entry)
  db.commit()
  db.refresh(entry)
  return _serialize_expense(entry)


@router.put('/{pet_id}/expenses/{expense_id}', response_model=schemas.ExpenseEntry)
def update_expense(pet_id: int, expense_id: int, payload: schemas.ExpenseCreate, db: Session = Depends(get_db)):
  entry = _get_expense(db, pet_id, expense_id)
  entry.category = payload.category
  entry.amount = payload.amount
  entry.notes = payload.notes
  entry.spent_on = payload.date or entry.spent_on
  db.commit()
  db.refresh(entry)
  return _serialize_expense(entry)


@router.delete('/{pet_id}/expenses/{expense_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(pet_id: int, expense_id: int, db: Session = Depends(get_db)):
  entry = _get_expense(db, pet_id, expense_id)
  db.delete(entry)
  db.commit()
  return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get('/{pet_id}/memos', response_model=List[schemas.MemoEntry])
def list_memos(pet_id: int, db: Session = Depends(get_db)):
  stmt = (
    select(PetMemo)
    .where(PetMemo.pet_id == pet_id)
    .order_by(PetMemo.due_on.is_(None), PetMemo.due_on.asc(), PetMemo.created_at.desc())
  )
  entries = db.scalars(stmt).all()
  return [_serialize_memo(entry) for entry in entries]


@router.post('/{pet_id}/memos', response_model=schemas.MemoEntry, status_code=status.HTTP_201_CREATED)
def add_memo(pet_id: int, payload: schemas.MemoCreate, db: Session = Depends(get_db)):
  memo = PetMemo(
    pet_id=pet_id,
    title=payload.title,
    notes=payload.notes,
    due_on=payload.dueDate,
    is_done=payload.done,
    source=payload.source or 'manual',
  )
  db.add(memo)
  db.commit()
  db.refresh(memo)
  return _serialize_memo(memo)


@router.put('/{pet_id}/memos/{memo_id}', response_model=schemas.MemoEntry)
def update_memo(pet_id: int, memo_id: int, payload: schemas.MemoCreate, db: Session = Depends(get_db)):
  memo = _get_memo(db, pet_id, memo_id)
  memo.title = payload.title
  memo.notes = payload.notes
  memo.due_on = payload.dueDate
  memo.is_done = payload.done
  memo.source = payload.source or memo.source
  db.commit()
  db.refresh(memo)
  return _serialize_memo(memo)


@router.delete('/{pet_id}/memos/{memo_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_memo(pet_id: int, memo_id: int, db: Session = Depends(get_db)):
  memo = _get_memo(db, pet_id, memo_id)
  db.delete(memo)
  db.commit()
  return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post('/{pet_id}/photos', response_model=schemas.Photo, status_code=status.HTTP_201_CREATED)
def add_photo(pet_id: int, payload: schemas.PhotoCreate, db: Session = Depends(get_db)):
  created_at = payload.date or datetime.utcnow()
  photo = PetPhoto(
    pet_id=pet_id,
    url=payload.url,
    created_at=created_at,
  )
  db.add(photo)
  db.commit()
  db.refresh(photo)
  return _serialize_photo(photo)


@router.delete('/{pet_id}/photos/{photo_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(pet_id: int, photo_id: int, db: Session = Depends(get_db)):
  stmt = select(PetPhoto).where(PetPhoto.id == photo_id, PetPhoto.pet_id == pet_id)
  photo = db.scalars(stmt).first()
  if not photo:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Photo not found')
  db.delete(photo)
  db.commit()
