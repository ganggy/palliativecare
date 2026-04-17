CREATE DATABASE IF NOT EXISTS paliative
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE paliative;

CREATE TABLE IF NOT EXISTS paliative_registry (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hn VARCHAR(20) NOT NULL,
  cid VARCHAR(20) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  age INT NOT NULL DEFAULT 0,
  sex CHAR(1) NOT NULL DEFAULT 'F',
  clinic_name VARCHAR(255) NOT NULL,
  clinic_short_name VARCHAR(100) NOT NULL,
  unit_code VARCHAR(50) NOT NULL,
  primary_dx_code VARCHAR(20) NOT NULL,
  primary_dx_name VARCHAR(255) NOT NULL,
  care_status ENUM('active','due','paused','completed','deceased') NOT NULL DEFAULT 'active',
  eligible_reason VARCHAR(255) NOT NULL,
  opioid_eligible TINYINT(1) NOT NULL DEFAULT 0,
  acp_required TINYINT(1) NOT NULL DEFAULT 0,
  authen_code VARCHAR(50) NULL,
  phone VARCHAR(50) NULL,
  relative_phone VARCHAR(50) NULL,
  line_id VARCHAR(100) NULL,
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  service_month_count INT NOT NULL DEFAULT 0,
  last_visit_at DATE NULL,
  next_visit_at DATE NULL,
  registered_at DATE NOT NULL,
  discharged_at DATE NULL,
  discharge_reason ENUM('ครบช่วงการให้บริการ','เสียชีวิต') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_registry_hn (hn),
  UNIQUE KEY uk_registry_cid (cid),
  KEY idx_registry_status_visit (care_status, next_visit_at),
  KEY idx_registry_clinic (clinic_short_name)
);

CREATE TABLE IF NOT EXISTS paliative_visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  visit_date DATE NOT NULL,
  visitor VARCHAR(255) NOT NULL,
  authen_code VARCHAR(50) NULL,
  service_fee DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
  home_visit_fee DECIMAL(10,2) NOT NULL DEFAULT 300.00,
  change_reason VARCHAR(255) NULL,
  status ENUM('done','planned','missed') NOT NULL DEFAULT 'done',
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_visits_patient_date (patient_id, visit_date),
  KEY idx_visits_date (visit_date),
  CONSTRAINT fk_visits_registry
    FOREIGN KEY (patient_id)
    REFERENCES paliative_registry (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS paliative_area_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clinic_name VARCHAR(255) NOT NULL,
  short_name VARCHAR(100) NOT NULL,
  chwpart VARCHAR(10) NOT NULL,
  amppart VARCHAR(10) NOT NULL,
  tmbpart_include JSON NOT NULL,
  moopart_include JSON NULL,
  moopart_exclude JSON NULL,
  exclude_death TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_area_short_name (short_name)
);

CREATE TABLE IF NOT EXISTS paliative_sync_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visit_date DATE NOT NULL,
  imported_count INT NOT NULL DEFAULT 0,
  source VARCHAR(50) NOT NULL DEFAULT 'hos',
  PRIMARY KEY (id),
  KEY idx_sync_visit_date (visit_date)
);

INSERT INTO paliative_area_rules (
  clinic_name, short_name, chwpart, amppart, tmbpart_include, moopart_include, moopart_exclude, exclude_death
)
VALUES
  ('รพ.สต. ห้วยหีบ', 'ห้วยหีบ', '47', '15', JSON_ARRAY('01', '1'), JSON_ARRAY('3', '03', '6', '06', '11', '12', '17', '18'), NULL, 1),
  ('รพ.สต.ม่วงไข', 'ม่วงไข', '47', '15', JSON_ARRAY('03', '3'), NULL, NULL, 0),
  ('รพ.สต.โพนทองวัฒนา', 'โพนทองวัฒนา', '47', '15', JSON_ARRAY('01', '1'), JSON_ARRAY('1', '01', '4', '04', '5', '05', '9', '09', '10', '11', '12'), NULL, 1),
  ('รพ.สต.บ้านเหล่าโพนค้อ', 'บ้านเหล่าโพนค้อ', '47', '15', JSON_ARRAY('02', '2'), NULL, NULL, 0),
  ('รพ.สต.โคกนาดี', 'โคกนาดี', '47', '15', JSON_ARRAY('04', '4'), NULL, JSON_ARRAY('1', '01', '4', '04', '5', '05', '9', '09', '10', '11', '12'), 1)
ON DUPLICATE KEY UPDATE
  clinic_name = VALUES(clinic_name),
  chwpart = VALUES(chwpart),
  amppart = VALUES(amppart),
  tmbpart_include = VALUES(tmbpart_include),
  moopart_include = VALUES(moopart_include),
  moopart_exclude = VALUES(moopart_exclude),
  exclude_death = VALUES(exclude_death),
  updated_at = CURRENT_TIMESTAMP;
