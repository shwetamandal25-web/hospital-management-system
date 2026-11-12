const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
const SECRET = process.env.JWT_SECRET || "hospital-secret-change-me";
const STAFF = ["admin", "doctor"];

// ---------- helpers ----------
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const n = (sql, ...a) => db.prepare(sql).get(...a).c;
const notify = (type, message, { role = null, user_id = null } = {}) =>
  db
    .prepare(
      "INSERT INTO notifications(target_role,target_user_id,type,message) VALUES(?,?,?,?)",
    )
    .run(role, user_id, type, message);
const patientUser = (pid) =>
  db.prepare("SELECT user_id FROM patients WHERE id=?").get(pid)?.user_id;
const addCharge = (pid, type, desc, amt) =>
  db
    .prepare(
      "INSERT INTO charges(patient_id,type,description,amount) VALUES(?,?,?,?)",
    )
    .run(pid, type, desc, amt);
const canSee = (u, pid) => STAFF.includes(u.role) || u.patient_id == pid;

// Security: JWT authentication + role-based access control
function auth(...roles) {
  return (req, res, next) => {
    try {
      req.user = jwt.verify(
        (req.headers.authorization || "").replace("Bearer ", ""),
        SECRET,
      );
    } catch {
      return bad(res, "Please login again", 401);
    }
    if (roles.length && !roles.includes(req.user.role))
      return bad(res, "Access denied for your role", 403);
    next();
  };
}

// ---------- 1. LOGIN SYSTEM + SECURITY (password hashing with bcrypt) ----------
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email || "");
  if (!u || !bcrypt.compareSync(password || "", u.password))
    return bad(res, "Invalid email or password");
  const p = db.prepare("SELECT id FROM patients WHERE user_id=?").get(u.id);
  const d = db.prepare("SELECT id FROM doctors WHERE user_id=?").get(u.id);
  const payload = {
    id: u.id,
    role: u.role,
    name: u.name,
    patient_id: p?.id ?? null,
    doctor_id: d?.id ?? null,
  };
  res.json({
    token: jwt.sign(payload, SECRET, { expiresIn: "8h" }),
    user: payload,
  });
});

// 3. PATIENT REGISTRATION (self-registration, creates patient login)
app.post("/api/auth/register", (req, res) => {
  const { name, email, password, age, gender, phone, address, blood_group } =
    req.body;
  if (!name || !email || !password)
    return bad(res, "Name, email and password are required");
  if (password.length < 6)
    return bad(res, "Password must be at least 6 characters");
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    return bad(res, "Email already registered");
  db.transaction(() => {
    const u = db
      .prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)")
      .run(name, email, bcrypt.hashSync(password, 10), "patient");
    db.prepare(
      "INSERT INTO patients(user_id,name,age,gender,phone,address,blood_group) VALUES(?,?,?,?,?,?,?)",
    ).run(
      u.lastInsertRowid,
      name,
      age || null,
      gender || null,
      phone || null,
      address || null,
      blood_group || null,
    );
  })();
  res.json({ message: "Registered successfully. Please login." });
});

// ---------- 2. DASHBOARD ----------
app.get("/api/dashboard", auth(...STAFF), (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    patients: n("SELECT COUNT(*) c FROM patients"),
    doctors: n("SELECT COUNT(*) c FROM doctors"),
    todayAppointments: n(
      "SELECT COUNT(*) c FROM appointments WHERE date=? AND status!='Cancelled'",
      today,
    ),
    bedsTotal: n("SELECT COUNT(*) c FROM beds"),
    bedsOccupied: n("SELECT COUNT(*) c FROM beds WHERE status='Occupied'"),
    pendingLab: n("SELECT COUNT(*) c FROM lab_tests WHERE status='Pending'"),
    lowStock: n("SELECT COUNT(*) c FROM medicines WHERE stock<20"),
    activeEmergencies: n(
      "SELECT COUNT(*) c FROM emergencies WHERE status='Active'",
    ),
    revenue: db
      .prepare("SELECT COALESCE(SUM(amount),0) s FROM charges WHERE paid=1")
      .get().s,
    recentAppointments: db
      .prepare(
        `SELECT a.*,p.name patient_name,d.name doctor_name FROM appointments a
      JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id ORDER BY a.id DESC LIMIT 6`,
      )
      .all(),
  });
});

// ---------- 3. PATIENTS + 12. RECORDS / MEDICAL HISTORY ----------
app.get("/api/patients", auth(...STAFF), (req, res) =>
  res.json(db.prepare("SELECT * FROM patients ORDER BY id DESC").all()),
);

app.post("/api/patients", auth(...STAFF), (req, res) => {
  const b = req.body;
  if (!b.name) return bad(res, "Patient name is required");
  const r = db
    .prepare(
      "INSERT INTO patients(name,age,gender,phone,address,blood_group) VALUES(?,?,?,?,?,?)",
    )
    .run(
      b.name,
      b.age || null,
      b.gender || null,
      b.phone || null,
      b.address || null,
      b.blood_group || null,
    );
  res.json({ id: r.lastInsertRowid });
});

app.get("/api/patients/:id/history", auth(), (req, res) => {
  const id = +req.params.id;
  if (!canSee(req.user, id)) return bad(res, "Access denied", 403);
  res.json({
    patient: db.prepare("SELECT * FROM patients WHERE id=?").get(id),
    consultations: db
      .prepare(
        "SELECT c.*,d.name doctor_name FROM consultations c JOIN doctors d ON d.id=c.doctor_id WHERE c.patient_id=? ORDER BY c.id DESC",
      )
      .all(id),
    labs: db
      .prepare("SELECT * FROM lab_tests WHERE patient_id=? ORDER BY id DESC")
      .all(id),
    discharges: db
      .prepare("SELECT * FROM discharges WHERE patient_id=? ORDER BY id DESC")
      .all(id),
  });
});

// ---------- Doctors ----------
app.get("/api/doctors", auth(), (req, res) =>
  res.json(db.prepare("SELECT id,name,specialization,fee FROM doctors").all()),
);
app.post("/api/doctors", auth("admin"), (req, res) => {
  const { name, email, password, specialization, fee } = req.body;
  if (!name || !email || !password)
    return bad(res, "Name, email and password are required");
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    return bad(res, "Email already registered");
  db.transaction(() => {
    const u = db
      .prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)")
      .run(name, email, bcrypt.hashSync(password, 10), "doctor");
    db.prepare(
      "INSERT INTO doctors(user_id,name,specialization,fee) VALUES(?,?,?,?)",
    ).run(u.lastInsertRowid, name, specialization || null, fee || 500);
  })();
  res.json({ message: "Doctor added" });
});

// ---------- 4. APPOINTMENTS ----------
app.get("/api/appointments", auth(), (req, res) => {
  const u = req.user;
  const where =
    u.role === "patient"
      ? "WHERE a.patient_id=" + (+u.patient_id || 0)
      : u.role === "doctor"
        ? "WHERE a.doctor_id=" + (+u.doctor_id || 0)
        : "";
  res.json(
    db
      .prepare(
        `SELECT a.*,p.name patient_name,d.name doctor_name FROM appointments a
    JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id ${where} ORDER BY a.date DESC,a.time`,
      )
      .all(),
  );
});

app.post("/api/appointments", auth(), (req, res) => {
  const b = req.body;
  const pid = req.user.role === "patient" ? req.user.patient_id : b.patient_id;
  if (!pid || !b.doctor_id || !b.date || !b.time)
    return bad(res, "Patient, doctor, date and time are required");
  if (
    db
      .prepare(
        "SELECT id FROM appointments WHERE doctor_id=? AND date=? AND time=? AND status!='Cancelled'",
      )
      .get(b.doctor_id, b.date, b.time)
  )
    return bad(
      res,
      "Doctor is already booked at this time. Choose another slot.",
    );
  const r = db
    .prepare(
      "INSERT INTO appointments(patient_id,doctor_id,date,time,reason) VALUES(?,?,?,?,?)",
    )
    .run(pid, b.doctor_id, b.date, b.time, b.reason || null);
  const d = db
    .prepare("SELECT user_id,name FROM doctors WHERE id=?")
    .get(b.doctor_id);
  if (d?.user_id)
    notify("appointment", `New appointment on ${b.date} at ${b.time}`, {
      user_id: d.user_id,
    });
  const pu = patientUser(pid);
  if (pu)
    notify(
      "appointment",
      `Appointment booked with ${d.name} on ${b.date} at ${b.time}`,
      { user_id: pu },
    );
  res.json({ id: r.lastInsertRowid });
});

app.patch("/api/appointments/:id/status", auth(), (req, res) => {
  const { status } = req.body;
  const a = db
    .prepare("SELECT * FROM appointments WHERE id=?")
    .get(req.params.id);
  if (!a) return bad(res, "Appointment not found", 404);
  if (
    req.user.role === "patient" &&
    (a.patient_id !== req.user.patient_id || status !== "Cancelled")
  )
    return bad(res, "Access denied", 403);
  db.prepare("UPDATE appointments SET status=? WHERE id=?").run(status, a.id);
  res.json({ ok: true });
});

// ---------- 5 & 6. DOCTOR CONSULTATION: diagnosis + prescription (auto adds consultation fee to bill) ----------
app.get("/api/consultations", auth(), (req, res) => {
  const u = req.user;
  const where =
    u.role === "patient"
      ? "WHERE c.patient_id=" + (+u.patient_id || 0)
      : u.role === "doctor"
        ? "WHERE c.doctor_id=" + (+u.doctor_id || 0)
        : "";
  res.json(
    db
      .prepare(
        `SELECT c.*,p.name patient_name,d.name doctor_name FROM consultations c
    JOIN patients p ON p.id=c.patient_id JOIN doctors d ON d.id=c.doctor_id ${where} ORDER BY c.id DESC`,
      )
      .all(),
  );
});

app.post("/api/consultations", auth(...STAFF), (req, res) => {
  const { appointment_id, diagnosis, prescription } = req.body;
  const a = db
    .prepare("SELECT * FROM appointments WHERE id=?")
    .get(appointment_id);
  if (!a) return bad(res, "Select an appointment");
  if (!diagnosis) return bad(res, "Diagnosis is required");
  if (req.user.role === "doctor" && a.doctor_id !== req.user.doctor_id)
    return bad(res, "This is not your appointment", 403);
  const doc = db.prepare("SELECT * FROM doctors WHERE id=?").get(a.doctor_id);
  db.transaction(() => {
    db.prepare(
      "INSERT INTO consultations(appointment_id,patient_id,doctor_id,diagnosis,prescription) VALUES(?,?,?,?,?)",
    ).run(a.id, a.patient_id, a.doctor_id, diagnosis, prescription || "");
    db.prepare("UPDATE appointments SET status='Completed' WHERE id=?").run(
      a.id,
    );
    addCharge(
      a.patient_id,
      "Consultation",
      `Consultation - ${doc.name}`,
      doc.fee,
    );
    const pu = patientUser(a.patient_id);
    if (pu)
      notify(
        "consultation",
        "Your consultation is complete. Diagnosis and prescription are in My Records.",
        { user_id: pu },
      );
  })();
  res.json({ ok: true });
});

// ---------- 7. LABORATORY ----------
app.get("/api/lab", auth(), (req, res) => {
  const u = req.user;
  const where =
    u.role === "patient" ? "WHERE l.patient_id=" + (+u.patient_id || 0) : "";
  res.json(
    db
      .prepare(
        `SELECT l.*,p.name patient_name FROM lab_tests l JOIN patients p ON p.id=l.patient_id ${where} ORDER BY l.id DESC`,
      )
      .all(),
  );
});
app.post("/api/lab", auth(...STAFF), (req, res) => {
  const { patient_id, test_name, price } = req.body;
  if (!patient_id || !test_name)
    return bad(res, "Patient and test name are required");
  db.prepare(
    "INSERT INTO lab_tests(patient_id,doctor_id,test_name,price) VALUES(?,?,?,?)",
  ).run(patient_id, req.user.doctor_id, test_name, price || 0);
  res.json({ ok: true });
});
app.patch("/api/lab/:id", auth(...STAFF), (req, res) => {
  const { result } = req.body;
  const t = db.prepare("SELECT * FROM lab_tests WHERE id=?").get(req.params.id);
  if (!t) return bad(res, "Test not found", 404);
  if (!result) return bad(res, "Enter the report result");
  db.transaction(() => {
    db.prepare(
      "UPDATE lab_tests SET result=?,status='Completed' WHERE id=?",
    ).run(result, t.id);
    addCharge(t.patient_id, "Lab", t.test_name, t.price);
    const pu = patientUser(t.patient_id);
    if (pu)
      notify("lab", `Your ${t.test_name} report is ready.`, { user_id: pu });
  })();
  res.json({ ok: true });
});

// ---------- 8. PHARMACY ----------
app.get("/api/medicines", auth(...STAFF), (req, res) =>
  res.json(db.prepare("SELECT * FROM medicines ORDER BY name").all()),
);
app.post("/api/medicines", auth("admin"), (req, res) => {
  const { name, stock, price } = req.body;
  if (!name) return bad(res, "Medicine name is required");
  db.prepare(
    `INSERT INTO medicines(name,stock,price) VALUES(?,?,?)
    ON CONFLICT(name) DO UPDATE SET stock=stock+excluded.stock, price=excluded.price`,
  ).run(name, +stock || 0, +price || 0);
  res.json({ ok: true });
});
app.post("/api/medicines/dispense", auth("admin"), (req, res) => {
  const { patient_id, medicine_id, qty } = req.body;
  const m = db.prepare("SELECT * FROM medicines WHERE id=?").get(medicine_id);
  const q = +qty;
  if (!m || !patient_id || !(q > 0))
    return bad(res, "Select patient, medicine and quantity");
  if (m.stock < q)
    return bad(res, `Only ${m.stock} units of ${m.name} in stock`);
  db.transaction(() => {
    db.prepare("UPDATE medicines SET stock=stock-? WHERE id=?").run(q, m.id);
    addCharge(patient_id, "Pharmacy", `${m.name} x ${q}`, m.price * q);
  })();
  res.json({ ok: true });
});

// ---------- 9. BILLING (bills generate automatically from charges) + payment ----------
app.get("/api/billing/:pid", auth(), (req, res) => {
  const pid = +req.params.pid;
  if (!canSee(req.user, pid)) return bad(res, "Access denied", 403);
  const items = db
    .prepare("SELECT * FROM charges WHERE patient_id=? ORDER BY id")
    .all(pid);
  res.json({
    patient: db.prepare("SELECT * FROM patients WHERE id=?").get(pid),
    items,
    due: items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0),
    paid: items.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0),
  });
});
app.post("/api/billing/:pid/pay", auth(), (req, res) => {
  const pid = +req.params.pid;
  if (!canSee(req.user, pid)) return bad(res, "Access denied", 403);
  db.prepare("UPDATE charges SET paid=1 WHERE patient_id=? AND paid=0").run(
    pid,
  );
  notify("payment", `Payment received for patient #${pid}`, { role: "admin" });
  res.json({ ok: true });
});

// ---------- 10. EMERGENCY / SOS ALERT ----------
app.post("/api/emergency", auth(), (req, res) => {
  const { patient_name, location, description, severity } = req.body;
  if (!location) return bad(res, "Location is required");
  const name = patient_name || req.user.name;
  db.prepare(
    "INSERT INTO emergencies(reported_by,patient_name,location,description,severity) VALUES(?,?,?,?,?)",
  ).run(req.user.id, name, location, description || "", severity || "High");
  const msg = `🆘 EMERGENCY (${severity || "High"}): ${name} at ${location}. ${description || ""}`;
  notify("emergency", msg, { role: "admin" });
  notify("emergency", msg, { role: "doctor" });
  res.json({ ok: true });
});
app.get("/api/emergency", auth(), (req, res) => {
  const where =
    req.user.role === "patient" ? "WHERE reported_by=" + +req.user.id : "";
  res.json(
    db.prepare(`SELECT * FROM emergencies ${where} ORDER BY id DESC`).all(),
  );
});
app.patch("/api/emergency/:id/resolve", auth(...STAFF), (req, res) => {
  db.prepare("UPDATE emergencies SET status='Resolved' WHERE id=?").run(
    req.params.id,
  );
  res.json({ ok: true });
});

// ---------- 11. NOTIFICATIONS ----------
app.get("/api/notifications", auth(), (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT * FROM notifications WHERE target_user_id=? OR (target_role=? AND target_user_id IS NULL)
    ORDER BY id DESC LIMIT 50`,
      )
      .all(req.user.id, req.user.role),
  ),
);
app.post("/api/notifications/read", auth(), (req, res) => {
  db.prepare(
    "UPDATE notifications SET is_read=1 WHERE target_user_id=? OR (target_role=? AND target_user_id IS NULL)",
  ).run(req.user.id, req.user.role);
  res.json({ ok: true });
});

// ---------- 13. BED MANAGEMENT ----------
app.get("/api/beds", auth(...STAFF), (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT b.*,p.name patient_name FROM beds b LEFT JOIN patients p ON p.id=b.patient_id ORDER BY b.ward,b.id",
      )
      .all(),
  ),
);
app.post("/api/beds", auth("admin"), (req, res) => {
  const { ward, bed_no, rate } = req.body;
  if (!ward || !bed_no) return bad(res, "Ward and bed number are required");
  db.prepare("INSERT INTO beds(ward,bed_no,rate) VALUES(?,?,?)").run(
    ward,
    bed_no,
    +rate || 1000,
  );
  res.json({ ok: true });
});
app.post("/api/beds/:id/admit", auth(...STAFF), (req, res) => {
  const { patient_id } = req.body;
  const bed = db.prepare("SELECT * FROM beds WHERE id=?").get(req.params.id);
  if (!bed || bed.status !== "Available")
    return bad(res, "Bed is not available");
  if (!patient_id) return bad(res, "Select a patient");
  if (
    db
      .prepare("SELECT id FROM beds WHERE patient_id=? AND status='Occupied'")
      .get(patient_id)
  )
    return bad(res, "Patient is already admitted");
  db.prepare(
    "UPDATE beds SET status='Occupied',patient_id=?,admitted_at=? WHERE id=?",
  ).run(patient_id, new Date().toISOString(), bed.id);
  res.json({ ok: true });
});

// ---------- 14. DISCHARGE: final bill + summary ----------
app.post("/api/discharge/:pid", auth(...STAFF), (req, res) => {
  const pid = +req.params.pid;
  const bed = db
    .prepare("SELECT * FROM beds WHERE patient_id=? AND status='Occupied'")
    .get(pid);
  if (!bed) return bad(res, "Patient is not admitted");
  const days = Math.max(
    1,
    Math.ceil((Date.now() - new Date(bed.admitted_at).getTime()) / 86400000),
  );
  const p = db.prepare("SELECT * FROM patients WHERE id=?").get(pid);
  let out;
  db.transaction(() => {
    addCharge(
      pid,
      "Bed",
      `${bed.ward} bed ${bed.bed_no} x ${days} day(s)`,
      days * bed.rate,
    );
    db.prepare(
      "UPDATE beds SET status='Available',patient_id=NULL,admitted_at=NULL WHERE id=?",
    ).run(bed.id);
    const items = db
      .prepare("SELECT * FROM charges WHERE patient_id=? AND paid=0")
      .all(pid);
    const total = items.reduce((s, i) => s + i.amount, 0);
    const last = db
      .prepare(
        "SELECT diagnosis,prescription FROM consultations WHERE patient_id=? ORDER BY id DESC LIMIT 1",
      )
      .get(pid);
    const summary =
      `Patient: ${p.name}\nAdmitted: ${bed.admitted_at.slice(0, 10)}  Discharged: ${new Date().toISOString().slice(0, 10)}  (${days} day(s))\n` +
      `Ward/Bed: ${bed.ward} ${bed.bed_no}\nDiagnosis: ${last?.diagnosis || "N/A"}\nMedication: ${last?.prescription || "N/A"}\n` +
      `Doctor's notes: ${req.body.notes || "None"}`;
    db.prepare(
      "INSERT INTO discharges(patient_id,summary,total) VALUES(?,?,?)",
    ).run(pid, summary, total);
    const pu = patientUser(pid);
    if (pu)
      notify(
        "discharge",
        "You have been discharged. Discharge summary is in My Records.",
        { user_id: pu },
      );
    out = { summary, total, items };
  })();
  res.json(out);
});

app.use((err, req, res, next) => {
  console.error(err);
  bad(res, "Server error: " + err.message, 500);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log("Hospital API running on http://localhost:" + PORT),
);
