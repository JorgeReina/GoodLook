-- No raw IP address or email is stored; keys are HMAC digests.
CREATE TABLE auth_rate_limits (
 bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 window_start DATETIME(3) NOT NULL,
 attempts INT UNSIGNED NOT NULL,
 KEY ix_auth_rate_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
