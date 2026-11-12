import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import * as P from "./pages.jsx";

const MENUS = {
  admin: [
    "Dashboard",
    "Patients",
    "Appointments",
    "Doctors",
    "Laboratory",
    "Pharmacy",
    "Billing",
    "Beds",
    "Discharge",
    "Emergency",
    "Notifications",
  ],
  doctor: [
    "Dashboard",
    "Patients",
    "Appointments",
    "Consultation",
    "Laboratory",
    "Pharmacy",
    "Beds",
    "Emergency",
    "Notifications",
  ],
  patient: [
    "My Records",
    "Appointments",
    "Laboratory",
    "Billing",
    "Emergency",
    "Notifications",
  ],
};

function Login({ onLogin }) {
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({
    name: "",
    email: "",
    password: "",
    age: "",
    gender: "",
    phone: "",
    blood_group: "",
  });
  const [msg, setMsg] = useState(null);
  const set = (e) => setF({ ...f, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      if (reg) {
        const r = await api("/auth/register", { method: "POST", body: f });
        setMsg({ ok: true, t: r.message });
        setReg(false);
      } else {
        const r = await api("/auth/login", { method: "POST", body: f });
        localStorage.setItem("token", r.token);
        localStorage.setItem("user", JSON.stringify(r.user));
        onLogin(r.user);
      }
    } catch (err) {
      setMsg({ ok: false, t: err.message });
    }
  };
  return (
    <div className="login">
      <div className="card">
        <h1>City Hospital</h1>
        <h2>{reg ? "Patient registration" : "Sign in"}</h2>
        <form
          onSubmit={submit}
          className="grid"
          style={{ display: "grid", gap: 10 }}
        >
          {reg && (
            <label>
              Full name
              <input name="name" value={f.name} onChange={set} required />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              value={f.email}
              onChange={set}
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              value={f.password}
              onChange={set}
              required
            />
          </label>
          {reg && (
            <>
              <label>
                Age
                <input name="age" type="number" value={f.age} onChange={set} />
              </label>
              <label>
                Gender
                <select name="gender" value={f.gender} onChange={set}>
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Phone
                <input name="phone" value={f.phone} onChange={set} />
              </label>
              <label>
                Blood group
                <input
                  name="blood_group"
                  value={f.blood_group}
                  onChange={set}
                />
              </label>
            </>
          )}
          <button className="btn">
            {reg ? "Create patient account" : "Sign in"}
          </button>
        </form>
        {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.t}</div>}
        <p style={{ marginTop: 12 }}>
          {reg ? "Already registered?" : "New patient?"}{" "}
          <button
            className="link"
            onClick={() => {
              setReg(!reg);
              setMsg(null);
            }}
          >
            {reg ? "Sign in" : "Register here"}
          </button>
        </p>
        {!reg && (
          <div className="demo">
            Demo logins:
            <br />
            Admin: admin@hospital.com / admin123
            <br />
            Doctor: doctor@hospital.com / doctor123
            <br />
            Patient: patient@hospital.com / patient123
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("user") || "null"),
  );
  const [page, setPage] = useState(null);
  const [unread, setUnread] = useState(0);
  const [active, setActive] = useState(0);

  const poll = useCallback(async () => {
    try {
      const n = await api("/notifications");
      setUnread(n.filter((x) => !x.is_read).length);
      if (user.role !== "patient") {
        const e = await api("/emergency");
        setActive(e.filter((x) => x.status === "Active").length);
      }
    } catch (e) {
      if (/login/i.test(e.message)) logout();
    }
  }, [user]);
  useEffect(() => {
    if (user) {
      poll();
      const t = setInterval(poll, 8000);
      return () => clearInterval(t);
    }
  }, [user, poll]);

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setPage(null);
  };
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          setPage(null);
        }}
      />
    );

  const menu = MENUS[user.role];
  const cur = page || menu[0];
  const view = {
    Dashboard: <P.Dashboard />,
    Patients: <P.Patients />,
    Appointments: <P.Appointments user={user} />,
    Doctors: <P.Doctors />,
    Consultation: <P.Consultation />,
    Laboratory: <P.Lab user={user} />,
    Pharmacy: <P.Pharmacy user={user} />,
    Billing: <P.Billing user={user} />,
    Beds: <P.Beds user={user} />,
    Discharge: <P.Discharge />,
    Emergency: <P.Emergency user={user} />,
    Notifications: <P.Notifications onRead={poll} />,
    "My Records": <P.MyRecords user={user} />,
  }[cur];

  return (
    <div className="layout">
      <nav className="side">
        <div className="brand">City Hospital</div>
        <div className="who">
          {user.name}
          <br />
          {user.role}
        </div>
        {menu.map((m) => (
          <button
            key={m}
            className={m === cur ? "on" : ""}
            onClick={() => setPage(m)}
          >
            {m}
            {m === "Notifications" && unread > 0 && (
              <span className="count">{unread}</span>
            )}
            {m === "Emergency" && active > 0 && (
              <span className="count">{active}</span>
            )}
          </button>
        ))}
        <button className="logout" onClick={logout}>
          Log out
        </button>
      </nav>
      <main className="main">
        {active > 0 && (
          <div className="alert">
            🆘 {active} active emergency alert(s) — open Emergency to respond.
          </div>
        )}
        {view}
      </main>
    </div>
  );
}
