CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  anime_id INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Plan to Watch',
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, anime_id)
);
CREATE TABLE IF NOT EXISTS progress (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  anime_id INT NOT NULL,
  episode INT NOT NULL,
  seconds INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, anime_id, episode)
);
