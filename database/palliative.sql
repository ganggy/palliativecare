CREATE DATABASE IF NOT EXISTS palliative
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE palliative;

CREATE TABLE IF NOT EXISTS palliative_units (
  id VARCHAR(50) NOT NULL,
  code VARCHAR(20) NOT NULL,
  short_name VARCHAR(120) NOT NULL,
  name VARCHAR(255) NOT NULL,
  kind ENUM('hospital','rphst','pcu') NOT NULL,
  color VARCHAR(20) NOT NULL,
  description VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS palliative_users (
  id VARCHAR(50) NOT NULL,
  username VARCHAR(80) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role ENUM('hospital_admin','hospital_case_manager','hospital_executive','hospital_card_room','hospital_pcu','unit_manager','unit_nurse') NOT NULL,
  unit_id VARCHAR(50) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  password_hash VARCHAR(255) NULL,
  approval_status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved',
  requested_at TIMESTAMP NULL,
  approved_at TIMESTAMP NULL,
  approved_by_user_id VARCHAR(50) NULL,
  review_note VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_username (username)
);

CREATE TABLE IF NOT EXISTS palliative_auth_sessions (
  token_hash VARCHAR(128) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_auth_sessions_user (user_id),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES palliative_users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS palliative_registry (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hn VARCHAR(20) NOT NULL,
  cid VARCHAR(20) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  age INT NOT NULL DEFAULT 0,
  birthday DATE NULL,
  sex CHAR(1) NOT NULL DEFAULT 'F',
  insurance_group VARCHAR(50) NULL,
  assigned_unit_id VARCHAR(50) NOT NULL,
  assigned_unit_name VARCHAR(255) NOT NULL,
  assigned_unit_kind ENUM('hospital','rphst','pcu') NOT NULL,
  primary_dx_code VARCHAR(20) NOT NULL,
  primary_dx_name VARCHAR(255) NOT NULL,
  care_status ENUM('candidate','registered','scheduled','active','completed','cancelled','deceased') NOT NULL DEFAULT 'registered',
  eligible_reason VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  relative_phone VARCHAR(50) NULL,
  line_id VARCHAR(100) NULL,
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  registered_at DATE NOT NULL,
  registered_by_user_id VARCHAR(50) NOT NULL,
  last_visit_at DATE NULL,
  next_visit_at DATE NULL,
  service_month_count INT NOT NULL DEFAULT 0,
  visit_window_start DATE NOT NULL,
  visit_window_end DATE NOT NULL,
  claim_checklist_json JSON NOT NULL,
  cancellation_reason VARCHAR(255) NULL,
  discharged_at DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_registry_hn (hn),
  UNIQUE KEY uk_registry_cid (cid),
  KEY idx_registry_unit_visit (assigned_unit_id, next_visit_at),
  KEY idx_registry_status (care_status)
);

CREATE TABLE IF NOT EXISTS palliative_visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  unit_id VARCHAR(50) NOT NULL,
  visit_date DATE NOT NULL,
  scheduled_date DATE NOT NULL,
  rescheduled_from DATE NULL,
  status ENUM('planned','completed','missed') NOT NULL DEFAULT 'completed',
  visitor_user_id VARCHAR(50) NOT NULL,
  visitor_name VARCHAR(255) NOT NULL,
  authen_code VARCHAR(80) NULL,
  symptoms TEXT NOT NULL,
  note TEXT NULL,
  checklist_json JSON NOT NULL,
  clinical_json JSON NULL,
  acp_json JSON NULL,
  photos_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_visits_patient_date (patient_id, visit_date),
  CONSTRAINT fk_visit_patient FOREIGN KEY (patient_id) REFERENCES palliative_registry (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS palliative_comments (
  id VARCHAR(80) NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  unit_id VARCHAR(50) NOT NULL,
  author_user_id VARCHAR(50) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  audience ENUM('hospital','unit','all') NOT NULL DEFAULT 'all',
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_comments_patient (patient_id),
  CONSTRAINT fk_comment_patient FOREIGN KEY (patient_id) REFERENCES palliative_registry (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS palliative_stm_batches (
  id VARCHAR(80) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imported_by_user_id VARCHAR(50) NOT NULL,
  imported_by_name VARCHAR(255) NOT NULL,
  default_split_percent DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS palliative_stm_rows (
  id VARCHAR(80) NOT NULL,
  batch_id VARCHAR(80) NOT NULL,
  hn VARCHAR(20) NOT NULL,
  patient_name VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit_id VARCHAR(50) NOT NULL,
  claim_month VARCHAR(7) NOT NULL,
  note VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_stm_batch (batch_id),
  CONSTRAINT fk_stm_batch FOREIGN KEY (batch_id) REFERENCES palliative_stm_batches (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS palliative_hos_sync_cache (
  cache_key VARCHAR(80) NOT NULL,
  payload_json JSON NOT NULL,
  refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cache_key)
);

INSERT INTO palliative_units (id, code, short_name, name, kind, color, description, sort_order) VALUES
  ('hospital-core', 'HOS', 'โรงพยาบาล', 'โรงพยาบาลแม่ข่าย', 'hospital', '#6be2d3', 'กำหนดเคสและคุมคุณภาพข้อมูลทั้งเครือข่าย', 1),
  ('pcu-hospital', 'PCU', 'PCU โรงพยาบาล', 'หน่วย PCU โรงพยาบาล', 'pcu', '#f3bd6a', 'ดูแลผู้ป่วยในโซน PCU ของโรงพยาบาล', 2),
  ('huey-hib', 'HHB', 'ห้วยหีบ', 'รพ.สต.ห้วยหีบ', 'rphst', '#74c69d', 'หน่วยเยี่ยมบ้านพื้นที่ห้วยหีบ', 3),
  ('muang-khai', 'MKH', 'ม่วงไข', 'รพ.สต.ม่วงไข', 'rphst', '#4ea8de', 'หน่วยเยี่ยมบ้านพื้นที่ม่วงไข', 4),
  ('phon-thong', 'PTW', 'โพนทองวัฒนา', 'รพ.สต.โพนทองวัฒนา', 'rphst', '#ff9f1c', 'หน่วยเยี่ยมบ้านพื้นที่โพนทองวัฒนา', 5),
  ('ban-lao', 'BLP', 'บ้านเหล่าโพนค้อ', 'รพ.สต.บ้านเหล่าโพนค้อ', 'rphst', '#ef476f', 'หน่วยเยี่ยมบ้านพื้นที่บ้านเหล่าโพนค้อ', 6),
  ('khok-na-dee', 'KND', 'โคกนาดี', 'รพ.สต.โคกนาดี', 'rphst', '#c77dff', 'หน่วยเยี่ยมบ้านพื้นที่โคกนาดี', 7)
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  short_name = VALUES(short_name),
  name = VALUES(name),
  kind = VALUES(kind),
  color = VALUES(color),
  description = VALUES(description),
  sort_order = VALUES(sort_order);

INSERT INTO palliative_users (id, username, display_name, role, unit_id, active) VALUES
  ('u-hos-admin', 'hosadmin', 'ผู้ดูแลระบบโรงพยาบาล', 'hospital_admin', 'hospital-core', 1),
  ('u-hos-case', 'case.manager', 'Case Manager โรงพยาบาล', 'hospital_case_manager', 'hospital-core', 1),
  ('u-executive', 'executive', 'ผู้บริหาร', 'hospital_executive', 'hospital-core', 1),
  ('u-rukchanoke', 'rukchanoke', 'ผู้บริหาร', 'hospital_executive', 'hospital-core', 1),
  ('u-card-room', 'card.room', 'ห้องบัตร', 'hospital_card_room', 'hospital-core', 1),
  ('u-pcu-hospital', 'pcu.hospital', 'ทีม PCU โรงพยาบาล', 'hospital_pcu', 'pcu-hospital', 1),
  ('u-huey-manager', 'huey.manager', 'หัวหน้าทีมห้วยหีบ', 'unit_manager', 'huey-hib', 1),
  ('u-huey-nurse', 'huey.nurse', 'พยาบาลห้วยหีบ', 'unit_nurse', 'huey-hib', 1),
  ('u-muang-manager', 'muang.manager', 'หัวหน้าทีมม่วงไข', 'unit_manager', 'muang-khai', 1),
  ('u-phon-manager', 'phon.manager', 'หัวหน้าทีมโพนทองวัฒนา', 'unit_manager', 'phon-thong', 1),
  ('u-banlao-manager', 'banlao.manager', 'หัวหน้าทีมบ้านเหล่าโพนค้อ', 'unit_manager', 'ban-lao', 1),
  ('u-khok-manager', 'khok.manager', 'หัวหน้าทีมโคกนาดี', 'unit_manager', 'khok-na-dee', 1)
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  role = VALUES(role),
  unit_id = VALUES(unit_id),
  active = VALUES(active);
