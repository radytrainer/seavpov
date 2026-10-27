# Data protection, privacy and retention

This policy describes how the Physical Book Reading Tracker handles student data. The
institution remains the data controller and should adapt the retention periods below to its
own rules.

## What is stored

| Data                                                                             | Purpose                                   | Who can see it                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Account: name, username, student ID, optional email and gender, class/generation | Sign-in and organisation                  | The student, assigned trainers, administrators |
| Books, reading sessions (times, duration, pages), goals                          | Reading habit tracking                    | The student, assigned trainers, administrators |
| Reflections (free text) and trainer feedback                                     | Learning and feedback                     | The student, assigned trainers, administrators |
| Audit log (who did what, when, from which IP)                                    | Accountability for administrative actions | Administrators                                 |
| Session records (hashed token, IP, user agent)                                   | Keeping users signed in securely          | Nobody through the UI                          |

When an administrator opens self-registration, students enter the same account details
themselves; registration is closed by default and every self-registration is audited.

No reading content, e-books or files are stored. No data is shared with third parties; the
optional SMTP server only receives password-reset emails.

## Protection measures

- Passwords: Argon2id hashes only. Session and reset tokens: stored as SHA-256 hashes.
- Access control is enforced by the API for every request: students see only their own records;
  trainers only students assigned to them; records outside a user's scope return "not found".
- Reflection text is never written to logs, audit metadata or CSV exports; exports contain
  activity figures and counts only. Report exports are recorded in the audit log.
- Reflection PDFs (which do contain reflection text) can be downloaded only by the student,
  their assigned trainers and administrators; downloads by staff are audited.
- Logs redact cookies, authorization headers, passwords and tokens.
- HTTPS only in production (HSTS), `HttpOnly` + `Secure` + `SameSite=Lax` cookies, CSRF checks,
  rate limiting and account lockout.
- No public rankings or comparisons between students are shown to students.

## Retention

| Data                                | Default retention                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Active accounts and reading history | While the student is enrolled                                                                                                    |
| Deactivated accounts                | Kept (history preserved) until the institution decides to remove them; recommended review after the student leaves (e.g. 1 year) |
| Audit log                           | Recommended 2 years                                                                                                              |
| Backups                             | 14 days on the server (`BACKUP_RETENTION_DAYS`) plus the off-site copy policy                                                    |
| Auth sessions                       | Up to `SESSION_TTL_HOURS` (default 7 days, sliding); deleted on logout, password change or deactivation                          |

Removing a person's data entirely (right to erasure) is an administrative database task: delete
their reflections, sessions, student books, goals and finally the user row in one transaction,
then let backups age out. This is intentionally not a one-click action in the UI.
