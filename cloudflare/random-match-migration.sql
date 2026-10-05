ALTER TABLE match_queue ADD COLUMN mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE pk_rooms ADD COLUMN is_match INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS match_results(room_code TEXT NOT NULL, round INTEGER NOT NULL, host_id INTEGER NOT NULL, guest_id INTEGER NOT NULL, winner_id INTEGER, finished_at INTEGER NOT NULL, PRIMARY KEY(room_code,round));
CREATE INDEX IF NOT EXISTS idx_match_results_host ON match_results(host_id);
CREATE INDEX IF NOT EXISTS idx_match_results_guest ON match_results(guest_id);
CREATE INDEX IF NOT EXISTS idx_match_results_winner ON match_results(winner_id);
