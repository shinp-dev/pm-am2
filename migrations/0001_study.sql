CREATE TABLE pm_a2_answers (
  question TEXT NOT NULL,
  choice INTEGER NOT NULL CHECK (choice BETWEEN 0 AND 3),
  time INTEGER NOT NULL,
  seconds INTEGER NOT NULL CHECK (seconds >= 0),
  PRIMARY KEY (question, choice, time, seconds)
) WITHOUT ROWID;

CREATE INDEX pm_a2_answers_time ON pm_a2_answers (time, question, choice, seconds);

CREATE TABLE pm_a2_preferences (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  edited_at INTEGER NOT NULL,
  change_id TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE pm_a2_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL
);
INSERT INTO pm_a2_revision VALUES (1, 0);
