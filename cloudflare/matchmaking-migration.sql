CREATE TABLE IF NOT EXISTS online_presence(client_key TEXT PRIMARY KEY, user_id INTEGER, game TEXT, last_seen INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_online_presence_seen ON online_presence(last_seen);
CREATE TABLE IF NOT EXISTS match_queue(user_id INTEGER PRIMARY KEY REFERENCES users(id), game TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, room_code TEXT);
CREATE INDEX IF NOT EXISTS idx_match_queue_find ON match_queue(game,status,joined_at);
