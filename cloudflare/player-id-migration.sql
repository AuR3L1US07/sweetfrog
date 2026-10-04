ALTER TABLE users ADD COLUMN public_id INTEGER CHECK(public_id BETWEEN 10000 AND 99999);
WITH shuffled AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY random()) AS position FROM users
), shuffle_seed AS MATERIALIZED (
  SELECT abs(random() % 90000) AS value
)
UPDATE users SET public_id = (
  SELECT 10000 + ((shuffled.position * 29989 + shuffle_seed.value) % 90000)
  FROM shuffled CROSS JOIN shuffle_seed WHERE shuffled.id = users.id
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id);
