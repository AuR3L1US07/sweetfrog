CREATE TABLE IF NOT EXISTS friend_links(user_low INTEGER NOT NULL REFERENCES users(id), user_high INTEGER NOT NULL REFERENCES users(id), requester_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined')), updated_at INTEGER NOT NULL, PRIMARY KEY(user_low,user_high));
CREATE INDEX IF NOT EXISTS idx_friend_links_high ON friend_links(user_high,status);
CREATE TABLE IF NOT EXISTS friend_messages(id INTEGER PRIMARY KEY, sender_id INTEGER NOT NULL REFERENCES users(id), recipient_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_friend_messages_inbox ON friend_messages(recipient_id,sender_id,id);
CREATE TABLE IF NOT EXISTS pk_invites(id INTEGER PRIMARY KEY, room_code TEXT NOT NULL REFERENCES pk_rooms(code), from_user INTEGER NOT NULL REFERENCES users(id), to_user INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','expired')), created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pk_invites_inbox ON pk_invites(to_user,status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pk_invites_pending ON pk_invites(room_code,to_user) WHERE status='pending';
