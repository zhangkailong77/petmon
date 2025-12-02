import { ExpenseEntry, LogEntry, LogType, MemoEntry, Pet, Photo, Species } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const getPets = async (): Promise<Pet[]> => {
  const pets = await request<Pet[]>('/pets');
  return pets.map(normalizePet);
};

export const getPet = async (petId: string): Promise<Pet> => {
  const pet = await request<Pet>(`/pets/${petId}`);
  return normalizePet(pet);
};

type PetPayload = {
  id?: string;
  name: string;
  species: Species;
  age: number;
  ageMonths?: number;
  weight: number;
  breed?: string;
  photoUrl?: string;
};

export const savePet = async (pet: PetPayload): Promise<Pet> => {
  const payload = {
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? null,
    age: pet.age,
    ageMonths: pet.ageMonths ?? 0,
    weight: pet.weight,
    photoUrl: pet.photoUrl ?? null
  };

  const method = pet.id ? 'PUT' : 'POST';
  const path = pet.id ? `/pets/${pet.id}` : '/pets';
  const saved = await request<Pet>(path, {
    method,
    body: JSON.stringify(payload)
  });
  return normalizePet(saved);
};

export const getLogs = async (petId: string): Promise<LogEntry[]> => {
  const logs = await request<LogEntry[]>(`/pets/${petId}/logs`);
  return logs.map(normalizeLog);
};

export const addLog = async (
  petId: string,
  log: { type: LogType; value?: string; notes?: string; date?: string }
): Promise<LogEntry> => {
  const created = await request<LogEntry>(`/pets/${petId}/logs`, {
    method: 'POST',
    body: JSON.stringify(log)
  });
  return normalizeLog(created);
};

export const updateLog = async (
  petId: string,
  logId: string,
  log: { type: LogType; value?: string; notes?: string; date?: string }
): Promise<LogEntry> => {
  const updated = await request<LogEntry>(`/pets/${petId}/logs/${logId}`, {
    method: 'PUT',
    body: JSON.stringify(log)
  });
  return normalizeLog(updated);
};

export const deleteLog = async (petId: string, logId: string): Promise<void> => {
  await request<void>(`/pets/${petId}/logs/${logId}`, { method: 'DELETE' });
};

export const getExpenses = async (petId: string): Promise<ExpenseEntry[]> => {
  const expenses = await request<ExpenseEntry[]>(`/pets/${petId}/expenses`);
  return expenses.map(normalizeExpense);
};

export const addExpense = async (
  petId: string,
  expense: { category: string; amount: number; notes?: string; date?: string }
): Promise<ExpenseEntry> => {
  const created = await request<ExpenseEntry>(`/pets/${petId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(expense)
  });
  return normalizeExpense(created);
};

export const updateExpense = async (
  petId: string,
  expenseId: string,
  expense: { category: string; amount: number; notes?: string; date?: string }
): Promise<ExpenseEntry> => {
  const updated = await request<ExpenseEntry>(`/pets/${petId}/expenses/${expenseId}`, {
    method: 'PUT',
    body: JSON.stringify(expense)
  });
  return normalizeExpense(updated);
};

export const deleteExpense = async (petId: string, expenseId: string): Promise<void> => {
  await request<void>(`/pets/${petId}/expenses/${expenseId}`, { method: 'DELETE' });
};

export const getMemos = async (petId: string): Promise<MemoEntry[]> => {
  const memos = await request<MemoEntry[]>(`/pets/${petId}/memos`);
  return memos.map(normalizeMemo);
};

export const addMemo = async (
  petId: string,
  memo: { title: string; notes?: string; dueDate?: string | null; done?: boolean; source?: string }
): Promise<MemoEntry> => {
  const created = await request<MemoEntry>(`/pets/${petId}/memos`, {
    method: 'POST',
    body: JSON.stringify(memo)
  });
  return normalizeMemo(created);
};

export const updateMemo = async (
  petId: string,
  memoId: string,
  memo: { title: string; notes?: string; dueDate?: string | null; done?: boolean; source?: string }
): Promise<MemoEntry> => {
  const updated = await request<MemoEntry>(`/pets/${petId}/memos/${memoId}`, {
    method: 'PUT',
    body: JSON.stringify(memo)
  });
  return normalizeMemo(updated);
};

export const deleteMemo = async (petId: string, memoId: string): Promise<void> => {
  await request<void>(`/pets/${petId}/memos/${memoId}`, { method: 'DELETE' });
};

export const addPhotoToGallery = async (petId: string, photo: Omit<Photo, 'id'>): Promise<Photo> => {
  const created = await request<Photo>(`/pets/${petId}/photos`, {
    method: 'POST',
    body: JSON.stringify(photo)
  });
  return created;
};

export const removePhotoFromGallery = async (petId: string, photoId: string): Promise<void> => {
  await request<void>(`/pets/${petId}/photos/${photoId}`, { method: 'DELETE' });
};

const normalizePet = (pet: Pet): Pet => ({
  ...pet,
  ageMonths: pet.ageMonths ?? 0,
  id: String(pet.id),
  gallery: (pet.gallery || []).map((photo) => ({ ...photo, id: String(photo.id) }))
});

const normalizeLog = (log: LogEntry): LogEntry => ({
  ...log,
  id: String(log.id),
  petId: String(log.petId)
});

const normalizeExpense = (expense: ExpenseEntry): ExpenseEntry => ({
  ...expense,
  id: String(expense.id),
  petId: String(expense.petId)
});

const normalizeMemo = (memo: MemoEntry): MemoEntry => ({
  ...memo,
  id: String(memo.id),
  petId: String(memo.petId),
  done: Boolean(memo.done)
});
