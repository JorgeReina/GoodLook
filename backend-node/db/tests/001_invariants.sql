-- Run only against a newly migrated, disposable goodlook_test database.
-- The surrounding transaction rolls back all fixtures; DDL creates a temporary
-- test procedure which is dropped at the end.
DELIMITER //
CREATE PROCEDURE goodlook_test_invariants()
BEGIN
  DECLARE rejected BOOLEAN DEFAULT FALSE;
  START TRANSACTION;
  INSERT INTO users (id,email,password_hash,display_name) VALUES
    ('00000000-0000-0000-0000-000000000001','one@example.test','hash','One');
  INSERT INTO businesses (id,name,timezone) VALUES
    ('10000000-0000-0000-0000-000000000001','One','Europe/Madrid'),
    ('10000000-0000-0000-0000-000000000002','Two','Europe/Madrid');
  INSERT INTO memberships (business_id,user_id,role,status) VALUES
    ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner','active');
  INSERT INTO professionals (id,business_id,user_id,display_name) VALUES
    ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','One');
  INSERT INTO services (id,business_id,name,duration_minutes,price_cents,currency) VALUES
    ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Cut',30,1500,'EUR'),
    ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other',30,1500,'EUR');
  INSERT INTO professional_services (business_id,professional_id,service_id) VALUES
    ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');

  -- Cross-business service/professional associations must fail.
  SET rejected = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR 1452 SET rejected = TRUE;
    INSERT INTO professional_services (business_id,professional_id,service_id) VALUES
      ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
  END;
  IF NOT rejected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cross-business association accepted'; END IF;

  -- A service not assigned to a professional cannot be booked together.
  SET rejected = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR 1452 SET rejected = TRUE;
    INSERT INTO appointments (id,business_id,professional_id,service_id,customer_user_id,start_at,end_at,price_cents,currency) VALUES
      ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','2030-01-01 09:00:00','2030-01-01 09:30:00',1500,'EUR');
  END;
  IF NOT rejected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cross-business appointment accepted'; END IF;

  SET rejected = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR 3819 SET rejected = TRUE;
    INSERT INTO working_hours (id,business_id,professional_id,weekday,start_time,end_time) VALUES
      ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'18:00:00','09:00:00');
  END;
  IF NOT rejected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invalid working interval accepted'; END IF;

  INSERT INTO appointments (id,business_id,professional_id,service_id,customer_user_id,start_at,end_at,price_cents,currency) VALUES
    ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','2030-01-01 09:00:00','2030-01-01 09:30:00',1500,'EUR');
  ROLLBACK;
END//
DELIMITER ;
CALL goodlook_test_invariants();
DROP PROCEDURE goodlook_test_invariants;
