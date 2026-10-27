import type { SeriesPoint } from './analytics';
import type { UserDto } from './types';

export interface StudentMetrics {
  rangeSeconds: number;
  rangeSessions: number;
  rangeReadingDays: number;
  consistencyPercent: number;
  currentStreak: number;
  lastReadingDate: string | null;
  inactive: boolean;
  reflectionsInRange: number;
  awaitingFeedback: number;
  booksReading: number;
  booksCompletedInRange: number;
  weeklyGoalMinutes: number;
  goalPercent: number | null;
  currentBook: { studentBookId: string; title: string; progressPercent: number | null } | null;
}

export interface StudentRow {
  student: UserDto;
  metrics: StudentMetrics;
  trainers?: { id: string; fullName: string }[];
}

export interface RangeMeta {
  from: string;
  to: string;
  inactiveAfterDays: number;
}

export interface Overview {
  range: RangeMeta;
  students: number;
  activeStudents: number;
  inactiveStudents: number;
  pendingFeedback: number;
  totalSeconds: number;
  granularity: 'day' | 'week';
  averageSecondsPerStudent: number;
  averageConsistencyPercent: number;
  series: SeriesPoint[];
}

export interface FilterOptions {
  classes: { id: string; name: string; generation: { id: string; name: string } }[];
  generations: { id: string; name: string }[];
}

export interface ReportData {
  type: string;
  from: string;
  to: string;
  headers: string[];
  rows: (string | number | null)[][];
}
