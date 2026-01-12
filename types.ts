export interface Question {
  id: string;
  text: string;
  options: string[]; // Should always be length 4
  correctAnswerIndex?: number;
}

export interface VocabularyDefinition {
  text: string;
  translation: string;
}

export interface VocabularyWord {
  id: string;
  word: string; 
  pos?: string; // Part of Speech
  definitions?: VocabularyDefinition[]; // Array of definitions (usually 1-3)
}

export interface TestData {
  title: string;
  classLevel: string;
  date: string;
  vocabWords: VocabularyWord[];
  readingPassage: string;
  questions: Question[];
  writingPrompt: string;
  logicGuide?: string; // Markdown content for the Teacher's Guide
}

export enum GeneratorStatus {
  IDLE,
  GENERATING,
  SUCCESS,
  ERROR
}

export type AIProvider = 'google' | 'openai';

export interface AISettings {
  provider: AIProvider;
  googleKey: string;
  openaiKey: string;
}

// Data Registry Types
export interface BookData {
  name: string;
  weeks: Record<string, VocabularyWord[]>;
}

export type ViewMode = 'student' | 'teacher';