CREATE TABLE app_user (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pin_salt   TEXT NOT NULL,
    pin_hash   TEXT NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE session (
    token_hash TEXT PRIMARY KEY,           -- sha256 of the cookie value, never the value itself
    user_id    INTEGER NOT NULL REFERENCES app_user(id),
    expires_at TEXT NOT NULL
);

-- "Who entered what": every table recording an action gets a user_id, filled by a
-- trigger from the logged-in user of the current request (SQL function
-- current_user_id(), registered in config/db.js). No service has to pass it around.
ALTER TABLE lot             ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE stock_move      ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE inventory_count ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE prep_batch      ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE sale            ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE loss            ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE temp_reading    ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE cooling_record  ADD COLUMN user_id INTEGER REFERENCES app_user(id);
ALTER TABLE cleaning_check  ADD COLUMN user_id INTEGER REFERENCES app_user(id);

CREATE TRIGGER lot_user             AFTER INSERT ON lot             BEGIN UPDATE lot             SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER stock_move_user      AFTER INSERT ON stock_move      BEGIN UPDATE stock_move      SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER inventory_count_user AFTER INSERT ON inventory_count BEGIN UPDATE inventory_count SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER prep_batch_user      AFTER INSERT ON prep_batch      BEGIN UPDATE prep_batch      SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER sale_user            AFTER INSERT ON sale            BEGIN UPDATE sale            SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER loss_user            AFTER INSERT ON loss            BEGIN UPDATE loss            SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER temp_reading_user    AFTER INSERT ON temp_reading    BEGIN UPDATE temp_reading    SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER cooling_record_user  AFTER INSERT ON cooling_record  BEGIN UPDATE cooling_record  SET user_id = current_user_id() WHERE id = NEW.id; END;
CREATE TRIGGER cleaning_check_user  AFTER INSERT ON cleaning_check  BEGIN UPDATE cleaning_check  SET user_id = current_user_id() WHERE id = NEW.id; END;
