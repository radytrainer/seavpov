// Enum values shared by the API (mirrored in prisma/schema.prisma) and the web app.

export const ROLES = ['STUDENT', 'TRAINER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] as const;
export type Gender = (typeof GENDERS)[number];

export const READING_STATUSES = ['PLANNED', 'READING', 'PAUSED', 'COMPLETED', 'ABANDONED'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const CATALOG_STATUSES = ['APPROVED', 'PENDING'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const SESSION_STATUSES = ['READING', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Sessions in these states occupy the student's single "active" slot. */
export const ACTIVE_SESSION_STATUSES = [
  'READING',
  'PAUSED',
] as const satisfies readonly SessionStatus[];

export const SESSION_SOURCES = ['TIMER', 'MANUAL'] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

export const TIMER_ACTIONS = ['start', 'pause', 'resume', 'finish', 'cancel'] as const;
export type TimerAction = (typeof TIMER_ACTIONS)[number];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  PLANNED: 'Planned',
  READING: 'Reading',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
};

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  TRAINER: 'Trainer',
  ADMIN: 'Administrator',
};
