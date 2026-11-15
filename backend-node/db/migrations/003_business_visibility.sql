-- A business is private by default until an authorized owner/admin publishes it.
ALTER TABLE businesses ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
