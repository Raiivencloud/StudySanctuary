export type View = 'dashboard' | 'courses' | 'calendar' | 'ai' | 'settings' | 'course-detail' | 'study-groups' | 'exams' | 'feedback' | 'exercises' | 'diagrams' | 'help-center' | 'multimedia' | 'subscription' | 'design' | 'podcast' | 'virtual-tutor' | 'math' | 'books' | 'files' | 'success' | 'admin-dashboard' | 'astra-core-admin' | 'arena';

export type StudyLevel = 'Inicial' | 'Secundario' | 'Universidad' | 'Master';

export interface ArenaQuestion {
  id: string;
  category: string;
  level: StudyLevel;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  createdAt: any;
}

export interface ArenaUserStats {
  userId: string;
  lives: number;
  maxLives: number;
  streak: number;
  maxStreak: number;
  lastLifeLostAt?: any;
  cooldownUntil?: any;
  credits: number;
  totalPoints: number;
  levelPoints: Record<StudyLevel, number>;
  collectibles: string[]; // IDs of collectibles
}

export interface ArenaCollectible {
  id: string;
  userId?: string;
  name: string;
  rarity: 'Bronce' | 'Plata' | 'Oro' | 'Fuego';
  imageUrl: string;
  description: string;
  subject?: string;
  unlockedAt?: any;
}

export interface ArenaRankingEntry {
  userId: string;
  displayName: string;
  photoURL: string;
  points: number;
  level: StudyLevel;
  rank: number;
}

export interface CourseFile {
  id: string;
  name: string;
  type: string;
  url: string;
  size?: number;
  userId?: string;
  createdAt?: any;
}

export interface Course {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  progress: number;
  type: string;
  icon: string;
  color: string;
  studyLevel?: StudyLevel;
  files: CourseFile[];
  summary?: string;
  theory?: string;
  examples?: string;
  exercises?: string;
  diagram?: string;
  podcastScript?: string;
  exams?: ExamQuestion[];
  createdAt: any;
  status: 'en progreso' | 'completado';
  estimatedHours?: number;
  completedSections?: {
    theory?: boolean;
    podcast?: boolean;
    exam?: boolean;
  };
}

export interface Task {
  id: string;
  title: string;
  description: string;
  duration: string;
  completed: boolean;
}

export interface AIActivity {
  id: string;
  title: string;
  description: string;
  time: string;
  timestamp: number;
  type: 'flashcards' | 'map' | 'summary' | 'plan' | 'exam' | 'exercises' | 'diagram';
}

export interface Exam {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  type: 'Primary' | 'Secondary' | 'Finals' | 'Midterm' | 'Quiz';
  tags: string[];
  reminder?: 'none' | '1h' | '2h' | '1d' | '2d';
  color?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface ExamQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // index of options
  explanation: string;
}

export interface ExamResult {
  score: number;
  total: number;
  answers: {
    questionId: string;
    selectedAnswer: number;
    isCorrect: boolean;
  }[];
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  bannerURL?: string | null;
  studyLevel?: StudyLevel;
  role?: 'admin' | 'user' | 'client';
  lastLogin?: any;
  createdAt?: any;
  preferences?: {
    theme: 'light' | 'dark';
    language: 'es' | 'en';
    notifications: boolean;
    wallpaperUrl?: string;
    wallpaperType?: 'image';
  };
  subscription?: {
    status: 'trial' | 'active' | 'expired' | 'cancelled';
    type: 'free' | 'monthly' | 'quarterly' | 'annual';
    planName?: string; // Add this
    trialStartDate: any;
    subscriptionEndDate: any;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  bannerUrl?: string;
}

export interface PersonalizationSettings {
  wallpaperUrl?: string;
  wallpaperType?: 'image';
}
