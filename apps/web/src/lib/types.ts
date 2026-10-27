// Shapes of API responses as seen by the browser (dates are ISO strings).
import type { Gender, ReadingStatus, Role, UserStatus } from '@rt/shared';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface ClassRef {
  id: string;
  name: string;
  generation: { id: string; name: string };
}

export interface CurrentUser {
  id: string;
  role: Role;
  status: UserStatus;
  username: string;
  email: string | null;
  studentCode: string | null;
  fullName: string;
  gender: Gender | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  class: ClassRef | null;
}

export type UserDto = CurrentUser;

export interface Category {
  id: string;
  name: string;
  archivedAt: string | null;
  bookCount?: number;
}

export interface LibraryBook {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  libraryCode: string | null;
  totalPages: number | null;
  coverImageUrl: string | null;
  status: 'APPROVED' | 'PENDING';
  archivedAt: string | null;
  createdAt: string;
  category: { id: string; name: string } | null;
}

export interface StudentBook {
  id: string;
  studentId: string;
  status: ReadingStatus;
  currentPage: number;
  totalPages: number | null;
  progressPercent: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastReadAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  book: LibraryBook;
}

export interface StudentBookDetail extends StudentBook {
  stats: { sessionCount: number; totalSeconds: number };
  activeSessionId: string | null;
}

export interface ReadingSession {
  id: string;
  studentId: string;
  studentBookId: string;
  source: 'TIMER' | 'MANUAL';
  method: 'PHYSICAL_BOOK';
  status: 'READING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  startedAt: string;
  endedAt: string | null;
  lastResumedAt: string | null;
  durationSeconds: number;
  elapsedSeconds: number;
  durationCapped: boolean;
  readingDate: string;
  startPage: number | null;
  endPage: number | null;
  pagesRead: number | null;
  note: string | null;
  reflectionId: string | null;
  book: { title: string; author: string | null; totalPages: number | null };
  createdAt: string;
  updatedAt: string;
}

export interface SessionResponse {
  data: ReadingSession;
  meta: { serverNow: string };
}

export interface Feedback {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  trainer: { id: string; fullName: string };
}

export interface Reflection {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  whatRead: string | null;
  learned: string | null;
  keyIdeas: string | null;
  application: string | null;
  keyTakeaway: string | null;
  understandingRating: number | null;
  tags: string[];
  session: {
    readingDate: string;
    durationSeconds: number;
    startPage: number | null;
    endPage: number | null;
    source: 'TIMER' | 'MANUAL';
  };
  book: { studentBookId: string; title: string; author: string | null };
  feedback: Feedback[];
  createdAt: string;
  updatedAt: string;
}
