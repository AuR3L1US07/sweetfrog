CREATE TABLE IF NOT EXISTS friend_notes(owner_id INTEGER NOT NULL REFERENCES users(id), friend_id INTEGER NOT NULL REFERENCES users(id), note TEXT NOT NULL, PRIMARY KEY(owner_id,friend_id));
CREATE TABLE IF NOT EXISTS earned_titles(user_id INTEGER NOT NULL REFERENCES users(id), title_key TEXT NOT NULL, earned_at INTEGER NOT NULL, PRIMARY KEY(user_id,title_key));
