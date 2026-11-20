-- GoodLook schema 001. MySQL 8.0.16+ / InnoDB. Apply to an empty database.
-- Every DATETIME is UTC; session time_zone must be '+00:00'. UUIDs are supplied
-- by the application. This schema is not an authorization mechanism.

CREATE TABLE users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_auth_sessions_user (user_id),
  KEY ix_auth_sessions_expiry (expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE businesses (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE memberships (
  business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('owner','admin','professional') NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (business_id, user_id),
  KEY ix_memberships_user (user_id),
  CONSTRAINT fk_membership_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE professionals (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  display_name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_prof_business_id (business_id,id),
  UNIQUE KEY uq_prof_business_user (business_id,user_id),
  CONSTRAINT fk_prof_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_prof_membership FOREIGN KEY (business_id,user_id) REFERENCES memberships(business_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE services (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'EUR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_service_business_id (business_id,id),
  CONSTRAINT fk_service_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT ck_service_duration CHECK (duration_minutes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE professional_services (
  business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  professional_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  service_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (business_id,professional_id,service_id),
  KEY ix_prof_service_service (business_id,service_id),
  CONSTRAINT fk_prof_service_prof FOREIGN KEY (business_id,professional_id) REFERENCES professionals(business_id,id),
  CONSTRAINT fk_prof_service_service FOREIGN KEY (business_id,service_id) REFERENCES services(business_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE working_hours (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  professional_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL COMMENT 'ISO weekday: Monday 1 through Sunday 7',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  KEY ix_working_hours_prof_day (business_id,professional_id,weekday),
  CONSTRAINT fk_working_hours_prof FOREIGN KEY (business_id,professional_id) REFERENCES professionals(business_id,id),
  CONSTRAINT ck_working_hours_day CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT ck_working_hours_time CHECK (start_time >= '00:00:00' AND end_time <= '24:00:00' AND start_time < end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE appointments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  business_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  professional_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  service_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  status ENUM('booked','completed','cancelled','no_show') NOT NULL DEFAULT 'booked',
  notes VARCHAR(500) NULL,
  price_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_appointments_prof_time (business_id,professional_id,start_at,end_at),
  KEY ix_appointments_customer_time (customer_user_id,start_at),
  CONSTRAINT fk_appointment_prof_service FOREIGN KEY (business_id,professional_id,service_id)
    REFERENCES professional_services(business_id,professional_id,service_id),
  CONSTRAINT fk_appointment_customer FOREIGN KEY (customer_user_id) REFERENCES users(id),
  CONSTRAINT ck_appointment_interval CHECK (start_at < end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
