CREATE TABLE study_answers (
  question TEXT NOT NULL,
  choice INTEGER NOT NULL CHECK (choice BETWEEN 0 AND 3),
  time INTEGER NOT NULL,
  seconds INTEGER NOT NULL CHECK (seconds >= 0),
  PRIMARY KEY (question, choice, time, seconds)
) WITHOUT ROWID;

CREATE INDEX study_answers_time ON study_answers (time, question, choice, seconds);

CREATE TABLE study_preferences (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  edited_at INTEGER NOT NULL,
  change_id TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE study_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL
);
INSERT INTO study_revision VALUES (1, 0);
