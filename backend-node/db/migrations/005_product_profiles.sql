-- Product profiles and an identity-first lookup across business locations.
ALTER TABLE businesses
  ADD COLUMN sector VARCHAR(80) NULL,
  ADD COLUMN address VARCHAR(250) NULL,
  ADD COLUMN first_published_at DATETIME(3) NULL;

UPDATE businesses
SET first_published_at = created_at
WHERE is_public = TRUE;

ALTER TABLE services
  ADD COLUMN description VARCHAR(500) NULL;

ALTER TABLE professional_invitations
  ADD COLUMN revoked_at DATETIME(3) NULL;

ALTER TABLE professionals
  ADD INDEX ix_prof_user_business (user_id, business_id, id);
