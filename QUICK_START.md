# 🚀 Quick Start Guide - Smart Virtual Classroom

## 1. Setup the Backend

Open a terminal in the project root folder:

```powershell
cd backend
python -m venv venv
```

Activate the virtual environment on Windows:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```powershell
pip install -r requirements.txt
```

Start the backend server:

```powershell
python main.py
```

Backend:

```text
http://127.0.0.1:8000
```

Keep this terminal running.

---

## 2. Setup the Frontend

Open a **new terminal** in the project root folder:

```powershell
cd frontend-react
npm install
npm run dev
```

Frontend:

```text
http://127.0.0.1:5500
```

Open the frontend URL in your browser.

---

## 3. Test the Application

### Teacher Flow

1. Open the application.
2. Register as a **Teacher**.
3. Log in with the teacher account.
4. Create a classroom.
5. Note the generated **Class ID**.
6. Share the Class ID with students.
7. Monitor students from the teacher dashboard.

### Student Flow

1. Open the application.
2. Register as a **Student**.
3. Log in with the student account.
4. Enter the **Class ID** provided by the teacher.
5. Join the classroom.
6. Allow camera access when prompted.

---

## 4. Test Focus Monitoring

1. Join a classroom as a student.
2. Switch to another browser tab.
3. A focus warning should be triggered.
4. The teacher should receive a focus-related alert.
5. The student's focus score should decrease.
6. The teacher can monitor the student's focus status.

The focus score starts at **100** and decreases by **5 points** for each focus warning.

---

## 5. Main Features

- User registration and login
- Teacher and student roles
- Classroom creation and joining
- Class ID-based classroom access
- Camera/video interaction
- Student focus monitoring
- Focus alerts
- Focus score tracking
- Student strikes and warnings
- Student timeout/removal
- Classroom chat
- Real-time WebSocket communication

---

## 6. Troubleshooting

### Camera not working?

- Allow camera permissions in your browser.
- Make sure no other application is using the camera.
- Try using Google Chrome.

### Frontend not starting?

Make sure you are inside the `frontend-react` folder:

```powershell
cd frontend-react
npm install
npm run dev
```

### Backend not starting?

Make sure the virtual environment is activated:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python main.py
```

### Connection issues?

Make sure **both** servers are running:

```text
Backend  → http://127.0.0.1:8000
Frontend → http://127.0.0.1:5500
```

---

## 7. Project Structure

```text
Smart-Classroom/
├── backend/
│   ├── main.py
│   ├── db.json
│   └── requirements.txt
├── frontend-react/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── StudentDashboard.jsx
│   │   │   └── TeacherDashboard.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── custom.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── .gitignore
├── QUICK_START.md
└── README.md
```

---

## 8. Technology Stack

### Frontend

- React
- Vite
- JavaScript
- Bootstrap
- Bootstrap Icons
- Font Awesome

### Backend

- Python
- FastAPI
- Uvicorn
- WebSockets
- JWT Authentication
- Pydantic
- JSON-based storage

---

## 9. Important Notes

- Run the backend and frontend in separate terminals.
- Allow camera permissions when testing video features.
- The application currently uses `backend/db.json` for local data storage.
- The virtual environment and `node_modules` should not be committed to GitHub.
- Environment files such as `.env` are excluded through `.gitignore`.

---

## Project Status

This is an academic Smart Classroom project developed to demonstrate web application development, real-time communication, authentication, classroom management, and student focus monitoring.
