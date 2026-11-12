import { useState, useEffect, useCallback } from "react";
import { api } from "./api";

// ---------- small shared helpers ----------
export const money = (x) => "₹" + Number(x || 0).toLocaleString("en-IN");
const Badge = ({ s }) => (
  <span className={"badge " + String(s).toLowerCase()}>{s}</span>
);

function useLoad(path) {
  const [data, setData] = useState(null);
  const load = useCallback(
    () =>
      api(path)
        .then(setData)
        .catch(() => setData([])),
    [path],
  );
  useEffect(() => {
    load();
  }, [load]);
  return [data, load];
}
function useForm(initial) {
  const [f, setF] = useState(initial);
  const set = (e) => setF((p) => ({ ...p, [e.target.name]: e.target.value }));
  return [f, set, () => setF(initial)];
}
// run(fn, successText) -> shows green/red message
function useAct() {
  const [msg, setMsg] = useState(null);
  const run = async (fn, ok = "Saved") => {
    try {
      const r = await fn();
      setMsg({ ok: true, t: ok });
      return r;
    } catch (e) {
      setMsg({ ok: false, t: e.message });
    }
  };
  return [
    run,
    msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.t}</div>,
  ];
}
const Field = ({ label, children, wide }) => (
  <label className={wide ? "wide" : ""}>
    {label}
    {children}
  </label>
);
const Empty = ({ list, text }) =>
  list && list.length === 0 ? (
    <p style={{ color: "var(--muted)" }}>{text}</p>
  ) : null;

function PatientSelect({ value, onChange, name = "patient_id", patients }) {
  const [list] = useLoad("/patients");
  const items = patients || list || [];
  return (
    <select name={name} value={value} onChange={onChange} required>
      <option value="">Select patient</option>
      {items.map((p) => (
        <option key={p.id} value={p.id}>
          #{p.id} {p.name}
        </option>
      ))}
    </select>
  );
}

// ---------- 2. DASHBOARD ----------
export function Dashboard() {
  const [d] = useLoad("/dashboard");
  if (!d) return <p>Loading…</p>;
  const cards = [
    ["Total patients", d.patients],
    ["Doctors", d.doctors],
    ["Today's appointments", d.todayAppointments],
    ["Beds occupied", `${d.bedsOccupied} / ${d.bedsTotal}`],
    ["Pending lab tests", d.pendingLab],
    ["Low-stock medicines", d.lowStock, d.lowStock > 0],
    ["Active emergencies", d.activeEmergencies, d.activeEmergencies > 0],
    ["Revenue collected", money(d.revenue)],
  ];
  return (
    <>
      <h1>Hospital overview</h1>
      <div className="stats">
        {cards.map(([l, v, w]) => (
          <div key={l} className={"stat" + (w ? " warn" : "")}>
            <b>{v}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Recent appointments</h2>
        <Empty list={d.recentAppointments} text="No appointments yet." />
        <div className="tablewrap">
          <table>
            <tbody>
              {d.recentAppointments.map((a) => (
                <tr key={a.id}>
                  <td>{a.patient_name}</td>
                  <td>{a.doctor_name}</td>
                  <td>
                    {a.date} {a.time}
                  </td>
                  <td>
                    <Badge s={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- 12. RECORDS: patient history (used by Patients page + My Records) ----------
export function History({ id }) {
  const [h] = useLoad("/patients/" + id + "/history");
  if (!h || !h.patient) return <p>Loading…</p>;
  const p = h.patient;
  return (
    <div className="card">
      <h2>{p.name} — medical history</h2>
      <p>
        Age {p.age || "-"} · {p.gender || "-"} · Blood group{" "}
        {p.blood_group || "-"} · Phone {p.phone || "-"}
      </p>
      <h3>Consultations & prescriptions</h3>
      <Empty list={h.consultations} text="No consultations yet." />
      {h.consultations.map((c) => (
        <div className="note" key={c.id}>
          <b>
            {c.created_at.slice(0, 10)} · {c.doctor_name}
          </b>
          <br />
          Diagnosis: {c.diagnosis}
          <br />
          Prescription: {c.prescription || "-"}
        </div>
      ))}
      <h3>Lab reports</h3>
      <Empty list={h.labs} text="No lab tests yet." />
      {h.labs.map((l) => (
        <div className="note" key={l.id}>
          <b>{l.test_name}</b> <Badge s={l.status} />
          <br />
          {l.result || "Report pending"}
        </div>
      ))}
      <h3>Discharge summaries</h3>
      <Empty list={h.discharges} text="No discharges." />
      {h.discharges.map((d) => (
        <div className="note" key={d.id}>
          <pre>{d.summary}</pre>
        </div>
      ))}
    </div>
  );
}
export const MyRecords = ({ user }) => (
  <>
    <h1>My records</h1>
    <History id={user.patient_id} />
  </>
);

// ---------- 3. PATIENTS ----------
export function Patients() {
  const [list, load] = useLoad("/patients");
  const [f, set, reset] = useForm({
    name: "",
    age: "",
    gender: "",
    phone: "",
    address: "",
    blood_group: "",
  });
  const [run, msg] = useAct();
  const [open, setOpen] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    await run(
      () => api("/patients", { method: "POST", body: f }),
      "Patient registered",
    );
    reset();
    load();
  };
  return (
    <>
      <h1>Patients</h1>
      <div className="card">
        <h2>Register new patient</h2>
        <form className="grid" onSubmit={submit}>
          <Field label="Full name">
            <input name="name" value={f.name} onChange={set} required />
          </Field>
          <Field label="Age">
            <input
              name="age"
              type="number"
              min="0"
              value={f.age}
              onChange={set}
            />
          </Field>
          <Field label="Gender">
            <select name="gender" value={f.gender} onChange={set}>
              <option value="">Select</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Phone">
            <input name="phone" value={f.phone} onChange={set} />
          </Field>
          <Field label="Blood group">
            <input name="blood_group" value={f.blood_group} onChange={set} />
          </Field>
          <Field label="Address">
            <input name="address" value={f.address} onChange={set} />
          </Field>
          <button className="btn">Save patient</button>
        </form>
        {msg}
      </div>
      <div className="card">
        <h2>All patients</h2>
        {!list ? (
          "Loading…"
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Age</th>
                  <th>Phone</th>
                  <th>Blood</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.name}</td>
                    <td>{p.age}</td>
                    <td>{p.phone}</td>
                    <td>{p.blood_group}</td>
                    <td>
                      <button
                        className="btn sm ghost"
                        onClick={() => setOpen(open === p.id ? null : p.id)}
                      >
                        {open === p.id ? "Hide" : "History"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <History id={open} />}
    </>
  );
}

// ---------- Doctors (admin) ----------
export function Doctors() {
  const [list, load] = useLoad("/doctors");
  const [f, set, reset] = useForm({
    name: "",
    email: "",
    password: "",
    specialization: "",
    fee: 500,
  });
  const [run, msg] = useAct();
  const submit = async (e) => {
    e.preventDefault();
    await run(
      () => api("/doctors", { method: "POST", body: f }),
      "Doctor added",
    );
    reset();
    load();
  };
  return (
    <>
      <h1>Doctors</h1>
      <div className="card">
        <h2>Add doctor</h2>
        <form className="grid" onSubmit={submit}>
          <Field label="Name">
            <input name="name" value={f.name} onChange={set} required />
          </Field>
          <Field label="Login email">
            <input
              name="email"
              type="email"
              value={f.email}
              onChange={set}
              required
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              value={f.password}
              onChange={set}
              required
            />
          </Field>
          <Field label="Specialization">
            <input
              name="specialization"
              value={f.specialization}
              onChange={set}
            />
          </Field>
          <Field label="Consultation fee (₹)">
            <input name="fee" type="number" value={f.fee} onChange={set} />
          </Field>
          <button className="btn">Add doctor</button>
        </form>
        {msg}
      </div>
      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Specialization</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.specialization}</td>
                  <td>{money(d.fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- 4. APPOINTMENTS ----------
export function Appointments({ user }) {
  const [list, load] = useLoad("/appointments");
  const [docs] = useLoad("/doctors");
  const [f, set, reset] = useForm({
    patient_id: "",
    doctor_id: "",
    date: "",
    time: "",
    reason: "",
  });
  const [run, msg] = useAct();
  const isPatient = user.role === "patient";
  const submit = async (e) => {
    e.preventDefault();
    const r = await run(
      () => api("/appointments", { method: "POST", body: f }),
      "Appointment booked",
    );
    if (r) reset();
    load();
  };
  const setStatus = async (id, status) => {
    await run(
      () =>
        api(`/appointments/${id}/status`, {
          method: "PATCH",
          body: { status },
        }),
      "Status updated",
    );
    load();
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <h1>Appointments</h1>
      {user.role !== "doctor" && (
        <div className="card">
          <h2>Book appointment</h2>
          <form className="grid" onSubmit={submit}>
            {!isPatient && (
              <Field label="Patient">
                <PatientSelect value={f.patient_id} onChange={set} />
              </Field>
            )}
            <Field label="Doctor">
              <select
                name="doctor_id"
                value={f.doctor_id}
                onChange={set}
                required
              >
                <option value="">Select doctor</option>
                {(docs || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.specialization}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                name="date"
                min={today}
                value={f.date}
                onChange={set}
                required
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                name="time"
                value={f.time}
                onChange={set}
                required
              />
            </Field>
            <Field label="Reason">
              <input name="reason" value={f.reason} onChange={set} />
            </Field>
            <button className="btn">Book appointment</button>
          </form>
          {msg}
        </div>
      )}
      <div className="card">
        <h2>{isPatient ? "My appointments" : "Appointments"}</h2>
        <Empty list={list} text="No appointments yet." />
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor</th>
                <th>When</th>
                <th>Reason</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map((a) => (
                <tr key={a.id}>
                  <td>{a.patient_name}</td>
                  <td>{a.doctor_name}</td>
                  <td>
                    {a.date} {a.time}
                  </td>
                  <td>{a.reason}</td>
                  <td>
                    <Badge s={a.status} />
                  </td>
                  <td>
                    {a.status === "Scheduled" && (
                      <button
                        className="btn sm danger"
                        onClick={() => setStatus(a.id, "Cancelled")}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- 5 & 6. CONSULTATION: diagnosis + prescription ----------
export function Consultation() {
  const [appts, loadA] = useLoad("/appointments");
  const [past, loadP] = useLoad("/consultations");
  const [f, set, reset] = useForm({
    appointment_id: "",
    diagnosis: "",
    prescription: "",
  });
  const [run, msg] = useAct();
  const open = (appts || []).filter((a) => a.status === "Scheduled");
  const submit = async (e) => {
    e.preventDefault();
    const r = await run(
      () => api("/consultations", { method: "POST", body: f }),
      "Consultation saved. Consultation fee added to the bill.",
    );
    if (r) reset();
    loadA();
    loadP();
  };
  return (
    <>
      <h1>Doctor consultation</h1>
      <div className="card">
        <h2>Diagnosis & prescription</h2>
        <form className="grid" onSubmit={submit}>
          <Field label="Appointment" wide>
            <select
              name="appointment_id"
              value={f.appointment_id}
              onChange={set}
              required
            >
              <option value="">Select scheduled appointment</option>
              {open.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.date} {a.time} — {a.patient_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Diagnosis" wide>
            <textarea
              name="diagnosis"
              value={f.diagnosis}
              onChange={set}
              required
            />
          </Field>
          <Field label="Prescription (medicines, dosage)" wide>
            <textarea
              name="prescription"
              value={f.prescription}
              onChange={set}
            />
          </Field>
          <button className="btn">Save consultation</button>
        </form>
        {msg}
      </div>
      <div className="card">
        <h2>Past consultations</h2>
        <Empty list={past} text="None yet." />
        {(past || []).map((c) => (
          <div className="note" key={c.id}>
            <b>
              {c.created_at.slice(0, 10)} · {c.patient_name}
            </b>
            <br />
            Diagnosis: {c.diagnosis}
            <br />
            Prescription: {c.prescription || "-"}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- 7. LABORATORY ----------
function LabRow({ t, staff, reload }) {
  const [res, setRes] = useState("");
  const [run, msg] = useAct();
  const save = async () => {
    await run(
      () => api("/lab/" + t.id, { method: "PATCH", body: { result: res } }),
      "Report saved",
    );
    reload();
  };
  return (
    <tr>
      <td>{t.patient_name}</td>
      <td>{t.test_name}</td>
      <td>{money(t.price)}</td>
      <td>
        <Badge s={t.status} />
      </td>
      <td>
        {t.result ||
          (staff ? (
            <>
              <input
                value={res}
                onChange={(e) => setRes(e.target.value)}
                placeholder="Enter result"
              />
              <button
                className="btn sm"
                style={{ marginTop: 4 }}
                onClick={save}
              >
                Save report
              </button>
              {msg}
            </>
          ) : (
            "Pending"
          ))}
      </td>
    </tr>
  );
}
export function Lab({ user }) {
  const staff = user.role !== "patient";
  const [list, load] = useLoad("/lab");
  const [f, set, reset] = useForm({ patient_id: "", test_name: "", price: "" });
  const [run, msg] = useAct();
  const submit = async (e) => {
    e.preventDefault();
    await run(() => api("/lab", { method: "POST", body: f }), "Test ordered");
    reset();
    load();
  };
  return (
    <>
      <h1>Laboratory</h1>
      {staff && (
        <div className="card">
          <h2>Order a test</h2>
          <form className="grid" onSubmit={submit}>
            <Field label="Patient">
              <PatientSelect value={f.patient_id} onChange={set} />
            </Field>
            <Field label="Test name">
              <input
                name="test_name"
                value={f.test_name}
                onChange={set}
                placeholder="e.g. Blood sugar"
                required
              />
            </Field>
            <Field label="Price (₹)">
              <input
                name="price"
                type="number"
                value={f.price}
                onChange={set}
              />
            </Field>
            <button className="btn">Order test</button>
          </form>
          {msg}
        </div>
      )}
      <div className="card">
        <h2>{staff ? "Tests & reports" : "My lab reports"}</h2>
        <Empty list={list} text="No tests yet." />
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Test</th>
                <th>Price</th>
                <th>Status</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map((t) => (
                <LabRow key={t.id} t={t} staff={staff} reload={load} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- 8. PHARMACY ----------
export function Pharmacy({ user }) {
  const [meds, load] = useLoad("/medicines");
  const admin = user.role === "admin";
  const [f, set, reset] = useForm({ name: "", stock: "", price: "" });
  const [d, setD, resetD] = useForm({
    patient_id: "",
    medicine_id: "",
    qty: 1,
  });
  const [run, msg] = useAct();
  const add = async (e) => {
    e.preventDefault();
    await run(
      () => api("/medicines", { method: "POST", body: f }),
      "Medicine saved (stock added)",
    );
    reset();
    load();
  };
  const dispense = async (e) => {
    e.preventDefault();
    const r = await run(
      () => api("/medicines/dispense", { method: "POST", body: d }),
      "Dispensed. Added to patient bill.",
    );
    if (r) resetD();
    load();
  };
  return (
    <>
      <h1>Pharmacy</h1>
      {admin && (
        <>
          <div className="card">
            <h2>Add medicine / restock</h2>
            <form className="grid" onSubmit={add}>
              <Field label="Medicine name">
                <input name="name" value={f.name} onChange={set} required />
              </Field>
              <Field label="Quantity to add">
                <input
                  name="stock"
                  type="number"
                  min="0"
                  value={f.stock}
                  onChange={set}
                  required
                />
              </Field>
              <Field label="Price per unit (₹)">
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  value={f.price}
                  onChange={set}
                  required
                />
              </Field>
              <button className="btn">Save</button>
            </form>
          </div>
          <div className="card">
            <h2>Dispense medicine</h2>
            <form className="grid" onSubmit={dispense}>
              <Field label="Patient">
                <PatientSelect value={d.patient_id} onChange={setD} />
              </Field>
              <Field label="Medicine">
                <select
                  name="medicine_id"
                  value={d.medicine_id}
                  onChange={setD}
                  required
                >
                  <option value="">Select</option>
                  {(meds || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (stock {m.stock})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity">
                <input
                  name="qty"
                  type="number"
                  min="1"
                  value={d.qty}
                  onChange={setD}
                />
              </Field>
              <button className="btn">Dispense</button>
            </form>
          </div>
          {msg}
        </>
      )}
      <div className="card">
        <h2>Stock</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Stock</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {(meds || []).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>
                    {m.stock}{" "}
                    {m.stock < 20 && (
                      <span className="badge critical">Low stock</span>
                    )}
                  </td>
                  <td>{money(m.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- 9. BILLING + PAYMENT ----------
export function Billing({ user }) {
  const [pid, setPid] = useState(
    user.role === "patient" ? user.patient_id : "",
  );
  const [bill, setBill] = useState(null);
  const [run, msg] = useAct();
  const load = useCallback(() => {
    if (pid) api("/billing/" + pid).then(setBill);
    else setBill(null);
  }, [pid]);
  useEffect(() => {
    load();
  }, [load]);
  const pay = async () => {
    await run(
      () => api(`/billing/${pid}/pay`, { method: "POST" }),
      "Payment received",
    );
    load();
  };
  return (
    <>
      <h1>Billing & payment</h1>
      {user.role !== "patient" && (
        <div className="card noprint">
          <Field label="Patient">
            <PatientSelect
              value={pid}
              onChange={(e) => setPid(e.target.value)}
            />
          </Field>
        </div>
      )}
      {bill && (
        <div className="card">
          <h2>Bill — {bill.patient.name}</h2>
          <Empty
            list={bill.items}
            text="No charges yet. Charges are added automatically from consultations, lab tests, pharmacy and bed stay."
          />
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.created_at.slice(0, 10)}</td>
                    <td>{i.type}</td>
                    <td>{i.description}</td>
                    <td className="right">{money(i.amount)}</td>
                    <td>
                      <Badge s={i.paid ? "Paid" : "Pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="right" style={{ marginTop: 14 }}>
            Amount due: {money(bill.due)}
          </h2>
          <div className="right noprint">
            <button className="btn ghost" onClick={() => window.print()}>
              Print bill
            </button>{" "}
            {bill.due > 0 && (
              <button className="btn" onClick={pay}>
                Pay {money(bill.due)}
              </button>
            )}
          </div>
          {msg}
        </div>
      )}
    </>
  );
}

// ---------- 13. BED MANAGEMENT ----------
export function Beds({ user }) {
  const [beds, load] = useLoad("/beds");
  const [pid, setPid] = useState("");
  const [f, set, reset] = useForm({ ward: "", bed_no: "", rate: 1000 });
  const [run, msg] = useAct();
  const admit = async (id) => {
    await run(
      () =>
        api(`/beds/${id}/admit`, { method: "POST", body: { patient_id: pid } }),
      "Patient admitted",
    );
    load();
  };
  const add = async (e) => {
    e.preventDefault();
    await run(() => api("/beds", { method: "POST", body: f }), "Bed added");
    reset();
    load();
  };
  const free = (beds || []).filter((b) => b.status === "Available").length;
  return (
    <>
      <h1>Bed management</h1>
      <div className="card">
        <p>
          <b>{free}</b> available · <b>{(beds || []).length - free}</b> occupied
        </p>
        <Field label="Patient to admit (select, then press Admit on a free bed)">
          <PatientSelect value={pid} onChange={(e) => setPid(e.target.value)} />
        </Field>
        {msg}
      </div>
      <div className="beds">
        {(beds || []).map((b) => (
          <div
            key={b.id}
            className={"bed" + (b.status === "Occupied" ? " occ" : "")}
          >
            <b>{b.bed_no}</b> <Badge s={b.status} />
            <small>
              {b.ward} · {money(b.rate)}/day
              {b.patient_name && (
                <>
                  <br />
                  {b.patient_name}
                </>
              )}
            </small>
            {b.status === "Available" && (
              <button
                className="btn sm"
                disabled={!pid}
                onClick={() => admit(b.id)}
              >
                Admit
              </button>
            )}
          </div>
        ))}
      </div>
      {user.role === "admin" && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2>Add bed</h2>
          <form className="grid" onSubmit={add}>
            <Field label="Ward">
              <input name="ward" value={f.ward} onChange={set} required />
            </Field>
            <Field label="Bed number">
              <input name="bed_no" value={f.bed_no} onChange={set} required />
            </Field>
            <Field label="Rate per day (₹)">
              <input name="rate" type="number" value={f.rate} onChange={set} />
            </Field>
            <button className="btn">Add bed</button>
          </form>
        </div>
      )}
    </>
  );
}

// ---------- 14. DISCHARGE ----------
export function Discharge() {
  const [beds, load] = useLoad("/beds");
  const [pid, setPid] = useState("");
  const [notes, setNotes] = useState("");
  const [out, setOut] = useState(null);
  const [run, msg] = useAct();
  const admitted = (beds || []).filter((b) => b.status === "Occupied");
  const go = async (e) => {
    e.preventDefault();
    const r = await run(
      () => api("/discharge/" + pid, { method: "POST", body: { notes } }),
      "Patient discharged",
    );
    if (r) {
      setOut(r);
      setPid("");
      setNotes("");
      load();
    }
  };
  return (
    <>
      <h1>Discharge</h1>
      <div className="card noprint">
        <form className="grid" onSubmit={go}>
          <Field label="Admitted patient">
            <select
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              required
            >
              <option value="">Select</option>
              {admitted.map((b) => (
                <option key={b.id} value={b.patient_id}>
                  {b.patient_name} ({b.bed_no})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Doctor's notes" wide>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <button className="btn">Discharge & generate final bill</button>
        </form>
        {msg}
      </div>
      {out && (
        <div className="card">
          <h2>Discharge summary</h2>
          <pre>{out.summary}</pre>
          <h3>Final bill</h3>
          <table>
            <tbody>
              {out.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.type}</td>
                  <td>{i.description}</td>
                  <td className="right">{money(i.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="right" style={{ marginTop: 12 }}>
            Total: {money(out.total)}
          </h2>
          <div className="right noprint">
            <button className="btn ghost" onClick={() => window.print()}>
              Print summary
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- 10. EMERGENCY / SOS ----------
export function Emergency({ user }) {
  const [list, load] = useLoad("/emergency");
  const [f, set, reset] = useForm({
    patient_name: "",
    location: "",
    description: "",
    severity: "High",
  });
  const [run, msg] = useAct();
  const staff = user.role !== "patient";
  const send = async (e) => {
    e.preventDefault();
    await run(
      () => api("/emergency", { method: "POST", body: f }),
      "SOS sent. Doctors and admin have been alerted.",
    );
    reset();
    load();
  };
  const resolve = async (id) => {
    await api(`/emergency/${id}/resolve`, { method: "PATCH" });
    load();
  };
  return (
    <>
      <h1>Emergency alerts</h1>
      <div className="card">
        <h2>Report an emergency</h2>
        <form className="grid" onSubmit={send}>
          <Field label="Patient name">
            <input
              name="patient_name"
              value={f.patient_name}
              onChange={set}
              placeholder={user.name}
            />
          </Field>
          <Field label="Location">
            <input
              name="location"
              value={f.location}
              onChange={set}
              placeholder="Where is the emergency?"
              required
            />
          </Field>
          <Field label="Severity">
            <select name="severity" value={f.severity} onChange={set}>
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
            </select>
          </Field>
          <Field label="What happened" wide>
            <textarea
              name="description"
              value={f.description}
              onChange={set}
              placeholder="Accident, chest pain, etc."
            />
          </Field>
          <button className="sos">SOS</button>
        </form>
        {msg}
      </div>
      <div className="card">
        <h2>Alerts</h2>
        <Empty list={list} text="No alerts." />
        <div className="tablewrap">
          <table>
            <tbody>
              {(list || []).map((a) => (
                <tr key={a.id}>
                  <td>{a.created_at}</td>
                  <td>
                    <b>{a.patient_name}</b>
                    <br />
                    {a.location}
                  </td>
                  <td>{a.description}</td>
                  <td>
                    <Badge s={a.severity} /> <Badge s={a.status} />
                  </td>
                  <td>
                    {staff && a.status === "Active" && (
                      <button className="btn sm" onClick={() => resolve(a.id)}>
                        Mark resolved
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- 11. NOTIFICATIONS ----------
export function Notifications({ onRead }) {
  const [list, load] = useLoad("/notifications");
  const readAll = async () => {
    await api("/notifications/read", { method: "POST" });
    load();
    onRead && onRead();
  };
  return (
    <>
      <h1>Notifications</h1>
      <div className="card">
        <button className="btn sm ghost" onClick={readAll}>
          Mark all as read
        </button>
        <Empty list={list} text="No notifications." />
        {(list || []).map((n) => (
          <div
            className="note"
            key={n.id}
            style={{ opacity: n.is_read ? 0.6 : 1 }}
          >
            <b>{n.type}</b> · <small>{n.created_at}</small>
            <br />
            {n.message}
          </div>
        ))}
      </div>
    </>
  );
}
