// Database setup (SQLite - all queries are standard SQL). Tables are created automatically.
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const db = new Database(__dirname + "/hospital.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','doctor','patient')));
CREATE TABLE IF NOT EXISTS doctors(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL, specialization TEXT, fee REAL DEFAULT 500);
CREATE TABLE IF NOT EXISTS patients(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL, age INTEGER, gender TEXT, phone TEXT, address TEXT, blood_group TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS appointments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER NOT NULL REFERENCES doctors(id), date TEXT NOT NULL, time TEXT NOT NULL,
  reason TEXT, status TEXT DEFAULT 'Scheduled', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS consultations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, appointment_id INTEGER, patient_id INTEGER NOT NULL,
  doctor_id INTEGER NOT NULL, diagnosis TEXT, prescription TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS lab_tests(
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL, doctor_id INTEGER,
  test_name TEXT NOT NULL, price REAL DEFAULT 0, status TEXT DEFAULT 'Pending', result TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS medicines(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, stock INTEGER DEFAULT 0, price REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS charges(
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL, type TEXT, description TEXT,
  amount REAL NOT NULL, paid INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS emergencies(
  id INTEGER PRIMARY KEY AUTOINCREMENT, reported_by INTEGER, patient_name TEXT, location TEXT,
  description TEXT, severity TEXT DEFAULT 'High', status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT, target_role TEXT, target_user_id INTEGER, type TEXT,
  message TEXT, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS beds(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ward TEXT, bed_no TEXT, rate REAL DEFAULT 1000,
  status TEXT DEFAULT 'Available', patient_id INTEGER, admitted_at TEXT);
CREATE TABLE IF NOT EXISTS discharges(
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL, summary TEXT, total REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

// ---- Demo data (only when database is empty) ----
if (db.prepare("SELECT COUNT(*) c FROM users").get().c === 0) {
  const hash = (p) => bcrypt.hashSync(p, 10);
  const addUser = db.prepare(
    "INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)",
  );
  db.transaction(() => {
    addUser.run(
      "Hospital Admin",
      "admin@hospital.com",
      hash("admin123"),
      "admin",
    );
    const d1 = addUser.run(
      "Dr. Anil Sharma",
      "doctor@hospital.com",
      hash("doctor123"),
      "doctor",
    ).lastInsertRowid;
    const d2 = addUser.run(
      "Dr. Priya Nair",
      "priya@hospital.com",
      hash("doctor123"),
      "doctor",
    ).lastInsertRowid;
    const p1 = addUser.run(
      "Rahul Verma",
      "patient@hospital.com",
      hash("patient123"),
      "patient",
    ).lastInsertRowid;
    const addDoc = db.prepare(
      "INSERT INTO doctors(user_id,name,specialization,fee) VALUES(?,?,?,?)",
    );
    addDoc.run(d1, "Dr. Anil Sharma", "Cardiology", 600);
    addDoc.run(d2, "Dr. Priya Nair", "General Medicine", 400);
    db.prepare(
      "INSERT INTO patients(user_id,name,age,gender,phone,address,blood_group) VALUES(?,?,?,?,?,?,?)",
    ).run(p1, "Rahul Verma", 32, "Male", "9876543210", "Bengaluru", "B+");
    const addMed = db.prepare(
      "INSERT INTO medicines(name,stock,price) VALUES(?,?,?)",
    );
    [
      ["Paracetamol 500mg", 200, 2],
      ["Amoxicillin 250mg", 120, 8],
      ["Cetirizine 10mg", 15, 3],
      ["Omeprazole 20mg", 90, 5],
      ["ORS Sachet", 60, 12],
    ].forEach((m) => addMed.run(...m));
    const addBed = db.prepare(
      "INSERT INTO beds(ward,bed_no,rate) VALUES(?,?,?)",
    );
    for (let i = 1; i <= 6; i++) addBed.run("General", "G-" + i, 1000);
    for (let i = 1; i <= 4; i++) addBed.run("ICU", "ICU-" + i, 5000);
  })();
}
module.exports = db;
