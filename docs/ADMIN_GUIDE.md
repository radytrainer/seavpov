# Administrator guide

## Start of term checklist

1. **Settings** — check time zone, minimum minutes for a reading day, default goals, maximum
   session length, manual-entry window and the “may need encouragement” threshold.
2. **Classes** — create the generation (e.g. “Generation 2027”), then its classes.
3. **Categories** — add or archive book categories.
4. **Users → Import CSV** — import students (below).
5. **Users** — create trainer accounts and use **⋯ → Assigned students** to assign a whole class
   or individual students. Trainers see only assigned students.
6. **Book catalog** — add the library’s books, or review entries students submit.

## Student self-registration

Instead of (or in addition to) creating accounts yourself, you can let students register:

1. **Overview** or **Settings → Student self-registration**: switch it **on** and confirm.
2. Share the site address. The sign-in page now shows **New student? Create an account**;
   students enter their name, student ID, class, optional email and a password and are signed
   in. Their username is created from the student ID, which they use to sign in.
3. Each new student is linked automatically to the trainers who already teach students of
   the chosen class. Use **Users → No trainer** to find students who still need a trainer.
4. When every student has an account, switch registration **off**. The link disappears and the
   API rejects new registrations immediately. Existing accounts are not affected.

Registration is off by default. Every change of the switch and every self-registration is
recorded in the audit log. Students can only create student accounts, never trainer or
administrator accounts.

## Finding a student and checking progress

**Users** opens on the **Students** tab:

- The summary cards at the top (active students, trainers, without a trainer, may need
  encouragement, deactivated) are shortcuts to those lists.
- Search by name, student ID, username or email; filter by class, generation and account status;
  tick **Without a trainer** or **May need encouragement**.
- Each row shows the last 7 days of reading against the student's goal, the current book and
  its progress, the last reading date, how many reflections they wrote and how many are waiting
  for feedback, and their trainers.
- **Open** shows the student's page (Overview, Reflections, Sessions, Books). The **⋯** menu has
  shortcuts to _View progress_, _View reflections_ and _Download reflections (PDF)_, followed by
  the account actions.

The **Trainers** tab shows how many students each trainer has; **Administrators** lists admins.

## Reflection PDFs

Reflections can be downloaded as a formatted PDF with the logo, the student's details, every
answer (Khmer and English), the understanding rating, tags and trainer feedback:

- one reflection: the **PDF** button on a reflection;
- all reflections of a student: **Download all (PDF)** on the student's Reflections tab or
  **⋯ → Download reflections (PDF)** in Users. It starts with a summary page and contents.

Downloads by trainers and administrators are recorded in the audit log
(`reflection.exported`). Students can download their own reflections.

## Accounts

- **New user** creates a student, trainer or administrator with a temporary password that is
  shown once. Give it to the person privately; they must change it at first sign-in.
- **⋯ → Reset password** issues a new temporary password and signs the user out everywhere.
- **⋯ → Deactivate** blocks sign-in immediately and keeps all history. Activate again at any time.
  Deactivate instead of deleting — reading history and reports stay intact.
- Changing a user’s role signs them out and removes their trainer assignments.
- You cannot deactivate yourself or remove your own administrator role.

## Importing students from CSV

Save the spreadsheet as **CSV UTF-8** (keeps Khmer names). Columns (first row):

| Column       | Required | Notes                                                    |
| ------------ | -------- | -------------------------------------------------------- |
| `student_id` | yes      | Unique; letters, numbers, `- _ /`                        |
| `full_name`  | yes      |                                                          |
| `username`   | yes      | Unique; letters, numbers, `. _ -`; stored in lower case  |
| `email`      | no       | Unique if given                                          |
| `gender`     | no       | `MALE`, `FEMALE`, `OTHER`, `UNDISCLOSED`                 |
| `generation` | no       | Needed when the class name exists in several generations |
| `class`      | no       | Must already exist (Classes page)                        |

1. **Select CSV file** → **Check file**. Every problem is listed with its row and column; nothing
   is created while any row has a problem. Fix the spreadsheet and check again.
2. **Create N students**, then **Download credentials** — the temporary passwords are shown only
   once. Distribute them privately and delete the file afterwards.

## Book catalog

- **Awaiting review** lists entries students added. **Approve** them, fix details with **Edit**,
  or **Merge duplicate…** when the same physical book exists twice (students’ records move to the
  book you keep). **Archive** removes a book from search without touching history.

## Correcting reading data (void a session)

Trainers can never change students' reading records. When a session should not count — a timer
left running during class, or a manual entry that is not genuine — an administrator can void it:

1. **Users** → open the student → **Sessions** tab.
2. **Void** on the session, enter a reason (required) and confirm.

The session stays in the history marked "Voided / discarded" and is excluded from time, streaks,
goals and reports. The reason, the student and the original duration are recorded in the audit
log (action `session.voided`). Voiding cannot be undone from the interface.

## Reports and audit log

- **Reports** previews and exports CSV for all students (filters: dates, class, generation,
  include deactivated accounts). The **Weekly / monthly reading summary** groups minutes,
  sessions, reading days and pages per student by week or month.
  Reflection text is never exported. Every export is recorded in the audit log.
- **Audit log** shows administrative actions (accounts, imports, settings with before/after
  values, catalog changes, assignments, report exports, manual-session edits) with time, actor
  and IP. Filter by action prefix (e.g. `user.`) or record type.

## Good practice

- Keep at least two administrator accounts.
- Review deactivated accounts and pending catalog entries regularly.
- Changing the time zone affects new sessions only; existing sessions keep their recorded date.
  Keep `TIME_ZONE` in the server configuration the same (see docs/DEPLOYMENT.md).
- Backups, updates and restores are described in docs/DEPLOYMENT.md.
