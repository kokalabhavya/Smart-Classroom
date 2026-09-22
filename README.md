# Smart Classroom

A web-based Smart Classroom application designed to support online classroom sessions with separate teacher and student roles, real-time communication, video interaction, and student focus monitoring.

## Features

* Teacher and student registration/login
* Separate teacher and student dashboards
* Classroom creation and joining
* Class ID-based classroom access
* Real-time communication using WebSockets
* Camera/video interaction
* Student focus monitoring
* Tab-switch detection
* Focus score tracking
* Real-time alerts for teachers
* Student warnings and strike tracking
* Classroom and user data stored locally using JSON

## Technology Stack

### Frontend

* React
* Vite
* JavaScript
* Bootstrap
* Bootstrap Icons
* Font Awesome

### Backend

* Python
* FastAPI
* Uvicorn
* WebSockets
* JWT Authentication
* Pydantic
* JSON-based data storage

## Project Structure

```text
Smart-Classroom/
│
├── backend/
│   ├── main.py
│   ├── db.json
│   └── requirements.txt
│
├── frontend-react/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── StudentDashboard.jsx
│   │   │   └── TeacherDashboard.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── custom.css
│   │   └── main.jsx
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── .gitignore
├── QUICK_START.md
└── README.md
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/kokalabhavya/Smart-Classroom.git
cd Smart-Classroom
```

### 2. Set up the backend

Open a terminal and run:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment on Windows:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the required packages:

```bash
pip install -r requirements.txt
```

Start the backend:

```bash
python main.py
```

The backend runs on:

```text
http://127.0.0.1:8000
```

### 3. Set up the frontend

Open a **new terminal** and run:

```bash
cd frontend-react
npm install
npm run dev
```

The frontend runs on:

```text
http://127.0.0.1:5500
```

Open the frontend URL in your browser.

## Basic Usage

### Teacher

1. Register as a teacher.
2. Log in to the application.
3. Create a classroom.
4. Share the generated Class ID with students.
5. Monitor students through the teacher dashboard.
6. View focus-related alerts and student status.

### Student

1. Register as a student.
2. Log in to the application.
3. Enter the Class ID provided by the teacher.
4. Join the classroom.
5. Allow camera access when requested.
6. Participate in the classroom session.

## Focus Monitoring

The application includes basic student focus monitoring.

When a student switches away from the classroom tab:

* A warning can be displayed to the student.
* The teacher can receive a real-time alert.
* The student's focus score can be updated.
* Warning/strike information can be tracked.

## API

The FastAPI backend provides endpoints for:

* Authentication
* User registration and login
* Classroom management
* Student/classroom information
* Real-time WebSocket communication
* Focus monitoring and alerts

The backend also provides a health endpoint:

```text
GET /health
```

## Important Notes

* Camera permissions must be allowed in the browser for video features.
* Both the backend and frontend servers should be running at the same time.
* The application currently uses local JSON storage through `backend/db.json`.
* Environment files, virtual environments, and `node_modules` are excluded from Git using `.gitignore`.

## Project Status

This is an academic project developed for learning and demonstrating concepts related to:

* Web application development
* React frontend development
* FastAPI backend development
* Real-time WebSocket communication
* Authentication
* Classroom management
* Student focus monitoring

## Author

**Kokala Bhavya**

GitHub: https://github.com/kokalabhavya
