CREATE TABLE IF NOT EXISTS games (
  game_id TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS game_players (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games (game_id),
  player_id TEXT NOT NULL,
  win BOOLEAN NOT NULL DEFAULT FALSE,
  score INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS game_players_player_id_idx ON game_players (player_id);

CREATE TABLE IF NOT EXISTS game_events (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp BIGINT NOT NULL,
  state_hash TEXT NOT NULL,
  CONSTRAINT game_events_game_id_sequence_unique UNIQUE (game_id, sequence)
);

CREATE TABLE IF NOT EXISTS game_achievements (
  player_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (player_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS game_snapshots (
  game_id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
