export enum LogType {
  FEEDING = 'Feeding',
  DRINKING = 'Drinking',
  ACTIVITY = 'Activity',
  SLEEP = 'Sleep',
  BATHROOM = 'Bathroom',
  MEDICAL = 'Medical',
  NOTE = 'Note'
}

export enum Species {
  DOG = 'Dog',
  CAT = 'Cat',
  BIRD = 'Bird',
  OTHER = 'Other'
}

export interface Photo {
  id: string;
  url: string;
  date: string;
}

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed?: string;
  age: number;
  ageMonths?: number;
  weight: number; // in kg
  photoUrl?: string;
  gallery: Photo[];
}

export interface LogEntry {
  id: string;
  petId: string;
  type: LogType;
  value?: string; // e.g., "200g", "30 mins"
  date: string; // ISO string
  notes?: string;
}

export interface ExpenseEntry {
  id: string;
  petId: string;
  category: string;
  amount: number;
  date: string; // ISO string
  notes?: string;
}

export interface MemoEntry {
  id: string;
  petId: string;
  title: string;
  notes?: string;
  dueDate?: string;
  done: boolean;
  source?: string;
  createdAt: string;
}

export interface AnalysisResult {
  summary: string;
  risks: string[];
  suggestions: string[];
  lastUpdated: string;
}

export interface ParsedCommandResult {
  intent: 'LOG' | 'EXPENSE' | 'MEMO' | 'UNKNOWN';
  logDetails?: {
    type: LogType;
    value?: string;
    notes?: string;
  };
  expenseDetails?: {
    category: string;
    amount: number;
    notes?: string;
  };
  memoDetails?: {
    title: string;
    notes?: string;
    dueDate?: string | null;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
