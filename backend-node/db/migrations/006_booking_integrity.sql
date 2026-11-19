ALTER TABLE professional_services ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX ix_appointments_profile_time ON appointments (professional_id, start_at, end_at);

CREATE TABLE professional_closures (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  professional_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  KEY ix_closures_profile_time (business_id, professional_id, start_at, end_at),
  CONSTRAINT fk_closure_prof FOREIGN KEY (business_id, professional_id) REFERENCES professionals(business_id,id),
  CONSTRAINT ck_closure_interval CHECK (start_at < end_at)
) ENGINE=InnoDB;

CREATE TABLE appointment_requests (
  customer_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  body_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  appointment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (customer_user_id, request_key),
  UNIQUE KEY uq_request_appointment (appointment_id),
  CONSTRAINT fk_request_customer FOREIGN KEY (customer_user_id) REFERENCES users(id),
  CONSTRAINT fk_request_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id)
) ENGINE=InnoDB;
