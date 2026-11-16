-- Tokens are random, stored only as SHA-256 digests, and expire after 7 days.
CREATE TABLE professional_invitations (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 professional_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME(3) NOT NULL,
 used_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_invitation_professional (business_id,professional_id),
 CONSTRAINT fk_invitation_prof FOREIGN KEY (business_id,professional_id) REFERENCES professionals(business_id,id),
 CONSTRAINT fk_invitation_creator FOREIGN KEY (business_id,created_by) REFERENCES memberships(business_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
