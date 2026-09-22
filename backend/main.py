from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional, Dict, List
import json
import os
import hashlib
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
security = HTTPBearer()

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hashlib.sha256(password.encode()).hexdigest() == hashed

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Smart Classroom API is running"}

@app.get("/health")
def health():
    return {"status": "healthy"}

# ── Persistent JSON storage ──
DB_FILE = os.path.join(os.path.dirname(__file__), 'db.json')

def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, 'r') as f:
            data = json.load(f)
            return data.get('users', {}), data.get('classrooms', {}), data.get('counter', 1)
    return {}, {}, 1

def save_db():
    serializable_users = {}
    for k, v in users_db.items():
        u = dict(v)
        if isinstance(u.get('created_at'), datetime):
            u['created_at'] = u['created_at'].isoformat()
        serializable_users[str(k)] = u

    serializable_classrooms = {}
    for k, v in classrooms_db.items():
        c = dict(v)
        if isinstance(c.get('created_at'), datetime):
            c['created_at'] = c['created_at'].isoformat()
        serializable_classrooms[str(k)] = c

    with open(DB_FILE, 'w') as f:
        json.dump({'users': serializable_users, 'classrooms': serializable_classrooms, 'counter': user_counter}, f, indent=2)

_raw_users, _raw_classrooms, _counter = load_db()
users_db = {int(k): v for k, v in _raw_users.items()}
classrooms_db = _raw_classrooms
user_counter = _counter

# Models
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str

class UserLogin(BaseModel):
    username: str
    password: str

class ClassroomCreate(BaseModel):
    name: str

class JoinClassroom(BaseModel):
    class_id: str

# Connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.student_data: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, class_id: str, user_id: str, role: str):
        await websocket.accept()
        if class_id not in self.active_connections:
            self.active_connections[class_id] = []
        self.active_connections[class_id].append(websocket)
        
        if role == "student":
            user = users_db.get(int(user_id), {})
            self.student_data[f"{class_id}_{user_id}"] = {
                "user_id": user_id,
                "username": user.get("username", f"Student #{user_id}"),
                "warning_count": 0,
                "focus_score": 100.0,
                "strikes": 0,
                "behavior_points": 100,
                "status": "active",
                "timeout_until": None,
                "banned": False,
                "websocket": websocket
            }

    def disconnect(self, websocket: WebSocket, class_id: str, user_id: str):
        if class_id in self.active_connections:
            if websocket in self.active_connections[class_id]:
                self.active_connections[class_id].remove(websocket)
        self.student_data.pop(f"{class_id}_{user_id}", None)

    async def send_to_teachers(self, class_id: str, message: dict):
        if class_id in self.active_connections:
            for connection in self.active_connections[class_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    pass

    async def send_to_class(self, class_id: str, message: dict):
        if class_id in self.active_connections:
            for connection in self.active_connections[class_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    pass
    
    async def send_to_students(self, class_id: str, message: dict):
        if class_id in self.active_connections:
            for key, data in self.student_data.items():
                if key.startswith(f"{class_id}_"):
                    try:
                        await data["websocket"].send_text(json.dumps(message))
                    except:
                        pass

    async def send_to_student(self, class_id: str, user_id: str, message: dict):
        student = self.student_data.get(f"{class_id}_{user_id}")
        if student:
            try:
                await student["websocket"].send_text(json.dumps(message))
            except:
                pass

    async def remove_student(self, class_id: str, user_id: str, reason: str = "removed"):
        key = f"{class_id}_{user_id}"
        if key in self.student_data:
            websocket = self.student_data[key]["websocket"]
            try:
                await websocket.send_text(json.dumps({
                    "type": "removed",
                    "reason": reason
                }))
                await websocket.close()
            except:
                pass
            self.student_data[key]["status"] = "removed"
    
    async def timeout_student(self, class_id: str, user_id: str, minutes: int):
        key = f"{class_id}_{user_id}"
        if key in self.student_data:
            from datetime import datetime, timedelta
            timeout_until = datetime.utcnow() + timedelta(minutes=minutes)
            self.student_data[key]["timeout_until"] = timeout_until
            self.student_data[key]["status"] = "timeout"
            
            websocket = self.student_data[key]["websocket"]
            try:
                await websocket.send_text(json.dumps({
                    "type": "timeout",
                    "minutes": minutes,
                    "message": f"You have been timed out for {minutes} minutes"
                }))
                await websocket.close()
            except:
                pass
    
    def add_strike(self, class_id: str, user_id: str, reason: str = "manual"):
        key = f"{class_id}_{user_id}"
        if key in self.student_data:
            self.student_data[key]["strikes"] += 1
            self.student_data[key]["behavior_points"] = max(0, self.student_data[key]["behavior_points"] - 10)
            strikes = self.student_data[key]["strikes"]
            
            # Log the strike reason
            if "strike_log" not in self.student_data[key]:
                self.student_data[key]["strike_log"] = []
            self.student_data[key]["strike_log"].append({
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            return strikes
        return 0

manager = ConnectionManager()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", 24)))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, os.getenv("SECRET_KEY", "secret"), algorithm="HS256")

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, os.getenv("SECRET_KEY", "secret"), algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/register")
def register(user: UserCreate):
    global user_counter
    
    if any(u["username"] == user.username for u in users_db.values()):
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed_password = hash_password(user.password)
    user_id = user_counter
    users_db[user_id] = {
        "id": user_id,
        "username": user.username,
        "email": user.email,
        "hashed_password": hashed_password,
        "role": user.role,
        "created_at": datetime.utcnow()
    }
    user_counter += 1
    save_db()
    
    token = create_access_token({"sub": user.username, "role": user.role, "user_id": user_id})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "user_id": user_id}

@app.post("/login")
def login(user: UserLogin):
    db_user = None
    for u in users_db.values():
        if u["username"] == user.username:
            db_user = u
            break
    
    if not db_user or not verify_password(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"sub": user.username, "role": db_user["role"], "user_id": db_user["id"]})
    return {"access_token": token, "token_type": "bearer", "role": db_user["role"], "user_id": db_user["id"]}

@app.post("/create-classroom")
def create_classroom(classroom: ClassroomCreate, current_user: dict = Depends(verify_token)):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create classrooms")
    
    import random, string
    class_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    classrooms_db[class_id] = {
        "class_id": class_id,
        "teacher_id": current_user["user_id"],
        "name": classroom.name,
        "created_at": datetime.utcnow(),
        "is_active": True
    }
    save_db()
    return {"class_id": class_id, "name": classroom.name}

@app.post("/join-classroom")
def join_classroom(join_data: JoinClassroom, current_user: dict = Depends(verify_token)):
    if join_data.class_id not in classrooms_db:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    classroom = classrooms_db[join_data.class_id]
    teacher = users_db.get(int(classroom["teacher_id"]), {})
    return {
        "class_id": join_data.class_id,
        "name": classroom["name"],
        "teacher_name": teacher.get("username", "Teacher")
    }

@app.websocket("/ws/{class_id}/{user_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, class_id: str, user_id: str, role: str):
    await manager.connect(websocket, class_id, user_id, role)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "focus_alert":
                key = f"{class_id}_{user_id}"
                if key in manager.student_data:
                    manager.student_data[key]["warning_count"] += 1
                    manager.student_data[key]["focus_score"] = max(0, 100 - (manager.student_data[key]["warning_count"] * 5))
                    
                    alert = {
                        "type": "focus_alert",
                        "student_id": user_id,
                        "warning_count": manager.student_data[key]["warning_count"],
                        "focus_score": manager.student_data[key]["focus_score"]
                    }
                    await manager.send_to_teachers(class_id, alert)
            
            elif message["type"] == "get_students":
                students = []
                for key, data in manager.student_data.items():
                    if key.startswith(f"{class_id}_"):
                        students.append({
                            "user_id": data["user_id"],
                            "username": data["username"],
                            "warning_count": data["warning_count"],
                            "focus_score": data["focus_score"],
                            "strikes": data["strikes"],
                            "behavior_points": data["behavior_points"],
                            "status": data["status"]
                        })
                await websocket.send_text(json.dumps({"type": "students_data", "students": students}))

            elif message["type"] == "chat_message":
                user = users_db.get(int(user_id), {})
                await manager.send_to_class(class_id, {
                    "type": "chat_message",
                    "sender_id": user_id,
                    "sender": user.get("username", "User"),
                    "text": message.get("text", ""),
                    "timestamp": datetime.utcnow().isoformat()
                })
            
            elif message["type"] == "remove_student":
                if role == "teacher":
                    await manager.remove_student(class_id, message["student_id"], message.get("reason", "removed"))
                    await manager.send_to_teachers(class_id, {
                        "type": "student_removed",
                        "student_id": message["student_id"],
                        "reason": message.get("reason", "removed")
                    })
            
            elif message["type"] == "timeout_student":
                if role == "teacher":
                    await manager.timeout_student(class_id, message["student_id"], message["minutes"])
                    await manager.send_to_teachers(class_id, {
                        "type": "student_timeout",
                        "student_id": message["student_id"],
                        "minutes": message["minutes"]
                    })
            
            elif message["type"] == "add_strike":
                if role == "teacher":
                    strikes = manager.add_strike(class_id, message["student_id"], message.get("reason", "manual"))
                    reason = message.get("reason", "manual")

                    if strikes == 0:
                        await manager.send_to_teachers(class_id, {
                            "type": "strike_error",
                            "message": "That student is no longer connected to this classroom."
                        })
                        continue

                    await manager.send_to_student(class_id, message["student_id"], {
                        "type": "strike_added",
                        "strikes": strikes,
                        "reason": reason
                    })
                    
                    # Auto-actions based on strikes (changed to 4-5 strikes)
                    if strikes >= 5:
                        await manager.remove_student(class_id, message["student_id"], f"{strikes} strikes - auto removed")
                    elif strikes == 4:
                        await manager.timeout_student(class_id, message["student_id"], 5)
                    elif strikes == 2:
                        await manager.timeout_student(class_id, message["student_id"], 2)
                    
                    await manager.send_to_teachers(class_id, {
                        "type": "strike_added",
                        "student_id": message["student_id"],
                        "strikes": strikes,
                        "reason": reason
                    })
            
            elif message["type"] == "movement_detected":
                if role == "student":
                    # Auto-add strike for irregular movement
                    strikes = manager.add_strike(class_id, user_id, "irregular movement")
                    
                    # Auto-actions based on strikes
                    if strikes >= 5:
                        await manager.remove_student(class_id, user_id, f"{strikes} strikes - auto removed")
                    elif strikes == 4:
                        await manager.timeout_student(class_id, user_id, 5)
                    
                    await manager.send_to_teachers(class_id, {
                        "type": "auto_strike_added",
                        "student_id": user_id,
                        "strikes": strikes,
                        "reason": "irregular movement detected"
                    })
            
            elif message["type"] == "webrtc_offer":
                if role == "teacher":
                    await manager.send_to_students(class_id, {
                        "type": "webrtc_offer",
                        "offer": message["offer"],
                        "screen_share": message.get("screen_share", False)
                    })
            
            elif message["type"] == "webrtc_answer":
                if role == "student":
                    await manager.send_to_teachers(class_id, {
                        "type": "webrtc_answer",
                        "answer": message["answer"],
                        "student_id": user_id
                    })
            
            elif message["type"] == "ice_candidate":
                if role == "teacher":
                    await manager.send_to_students(class_id, {
                        "type": "ice_candidate",
                        "candidate": message["candidate"]
                    })
                elif role == "student":
                    await manager.send_to_teachers(class_id, {
                        "type": "ice_candidate",
                        "candidate": message["candidate"],
                        "student_id": user_id
                    })

            elif message["type"] == "request_video_offer":
                if role == "student":
                    await manager.send_to_teachers(class_id, {
                        "type": "video_offer_requested",
                        "student_id": user_id
                    })
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, class_id, user_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)