import { AnalysisResult, ChatMessage, ExpenseEntry, LogEntry, ParsedCommandResult, Pet } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

async function request<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Gemini request failed');
  }

  return response.json() as Promise<T>;
}

export const analyzePetHealth = async (
  pet: Pet,
  logs: LogEntry[],
  expenses: ExpenseEntry[],
  language: 'en' | 'zh' = 'en'
): Promise<AnalysisResult> => {
  return request<AnalysisResult>('/gemini/analyze', {
    pet: {
      name: pet.name,
      species: pet.species,
      age: pet.age,
      weight: pet.weight
    },
    logs,
    expenses,
    language
  });
};

export const parsePetCommand = async (input: string): Promise<ParsedCommandResult> => {
  return request<ParsedCommandResult>('/gemini/parse', { input });
};

export const getHealthChatResponse = async (
  pet: Pet,
  logs: LogEntry[],
  analysis: AnalysisResult | null,
  history: ChatMessage[],
  newMessage: string,
  language: 'en' | 'zh'
): Promise<string> => {
  const result = await request<{ text: string }>('/gemini/chat', {
    pet: {
      name: pet.name,
      species: pet.species,
      age: pet.age,
      weight: pet.weight
    },
    logs,
    analysisSummary: analysis?.summary,
    analysisRisks: analysis?.risks,
    history,
    newMessage,
    language
  });
  return result.text;
};
