# Hospital Management System
React.js (Frontend) -> Node.js + Express.js (Backend) -> SQL (SQLite) -> JSON -> Dashboard

## Run (needs Node.js 18+)
Terminal 1 (backend):
    cd backend
    npm install
    npm start          # http://localhost:5000  (database + demo data are created automatically)

Terminal 2 (frontend):
    cd frontend
    npm install
    npm run dev        # open http://localhost:5173

## Demo logins
Admin   : admin@hospital.com   / admin123
Doctor  : doctor@hospital.com  / doctor123
Patient : patient@hospital.com / patient123
(New patients can register from the login page.)

## Features
Login (Admin/Doctor/Patient) | Dashboard | Patient registration | Appointment booking
Doctor consultation (diagnosis + prescription) | Laboratory | Pharmacy & stock
Automatic billing + payment | SOS emergency alerts | Notifications | Patient records/history
Bed management | Security (JWT, bcrypt password hashing, role-based access) | Discharge summary + final bill

## Folder structure
backend/db.js        tables + demo data (SQL)
backend/server.js    all REST API routes
frontend/src/App.jsx login + layout + menu per role
frontend/src/pages.jsx every module page
