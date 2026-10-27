# Metric definitions

All metrics are computed on demand from `reading_sessions` (no stored totals). Implementation:
`apps/api/src/modules/analytics/service.ts` (SQL aggregation) and
`packages/shared/src/metrics.ts` (pure rules, unit-tested).

## Inputs and counting rules

| Rule             | Definition                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counted sessions | Only `status = COMPLETED`. Running (`READING`/`PAUSED`) and `CANCELLED` sessions never count. Each session counts once.                                                                                                                                        |
| Duration         | `duration_seconds`, computed by the server from its own timestamps; paused time excluded; capped at _max session minutes_ (default 240) and flagged `duration_capped`.                                                                                         |
| Reading date     | `reading_date` = local calendar date (institution time zone, default `Asia/Phnom_Penh`) on which the session **started**. A session from 23:40 to 00:20 counts fully toward the first day. Stored at creation, so later time-zone changes do not move history. |
| Pages read       | `end_page − start_page`, only when both are recorded.                                                                                                                                                                                                          |
| Week             | Monday–Sunday (ISO).                                                                                                                                                                                                                                           |
| Month            | Calendar month in the institution time zone.                                                                                                                                                                                                                   |

## Habit metrics

| Metric                     | Definition                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading day                | A local date whose summed completed duration ≥ **minimum daily minutes** (admin setting, default 10).                                                   |
| Current streak             | Consecutive reading days ending **today**; if today has no qualifying reading yet, ending **yesterday** (a streak is not broken until the day is over). |
| Longest streak             | Longest run of consecutive reading days ever.                                                                                                           |
| Consistency %              | Reading days ÷ days in the range × 100, rounded. For the current month only elapsed days (1st → today) are counted.                                     |
| Reading frequency          | Completed sessions per week over the selected range (sessions ÷ (days/7)).                                                                              |
| Average session            | Total completed seconds ÷ completed sessions (0 when there are none).                                                                                   |
| Week/month comparison      | `(current − previous) ÷ previous × 100`; `0` when both are 0; `null` (shown as "new") when previous is 0.                                               |
| Reflection completion rate | Reflections ÷ completed sessions × 100.                                                                                                                 |
| Completed vs started books | `completed` = student books with status COMPLETED (not archived); `started` = student books with a start date (including archived).                     |

## Goals

A student's goal history is kept in `reading_goals`; the goal in effect on a date is the row
with the latest `effective_from ≤ date`. Without a personal goal the institution defaults
(admin settings) apply and are labelled as defaults.

| Goal                     | Progress                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| Daily minutes            | Today's completed seconds ÷ (daily minutes × 60)                              |
| Weekly minutes           | This week's completed seconds ÷ (weekly minutes × 60)                         |
| Reading days per week    | Reading days this week ÷ target days                                          |
| Monthly books (optional) | Books completed this month (by `completed_at` in local month bounds) ÷ target |

Progress percentages are capped at 100 so the UI never rewards reading beyond the goal, and
daily goals are limited to 240 minutes. No rankings or comparisons between students are shown
to students.
