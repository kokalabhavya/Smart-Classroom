# 🚀 Quick Start Guide - Smart Virtual Classroom

## 3-Step Setup

### 1️⃣ Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2️⃣ Start Backend Server
```bash
python main.py
```
✅ Backend runs on: http://localhost:8000

### 3️⃣ Start Frontend (New Terminal)
```bash
cd frontend
python -m http.server 5500
```
✅ Frontend runs on: http://localhost:5500

## 🧪 Testing the Application

### Teacher Flow:
1. Open http://localhost:5500
2. Click "Register" → Select "Teacher" → Create account
3. Create classroom with any name
4. Share the generated Class ID with students
5. Allow camera access when prompted

### Student Flow:
1. Open http://localhost:5500 (new browser tab/window)
2. Click "Register" → Select "Student" → Create account  
3. Enter the Class ID from teacher
4. Allow camera access when prompted

### Test Focus Monitoring:
1. As student, switch to another browser tab
2. Warning appears on student screen
3. Alert appears in teacher dashboard
4. Focus score decreases by 5%

## ✅ Expected Behavior

- **Video**: Both teacher and student cameras should appear
- **Focus Alert**: Switching tabs triggers warning + teacher notification
- **Real-time**: Teacher sees student focus scores update instantly
- **Scoring**: Starts at 100%, decreases 5% per warning

## 🔧 Troubleshooting

**Camera not working?**
- Allow camera permissions in browser
- Try Chrome (recommended browser)

**Connection issues?**
- Check both servers are running
- Verify ports 8000 and 5500 are available

**Database errors?**
- Delete `classroom.db` file and restart backend

## 🎯 Key Features to Test

✅ User registration/login  
✅ Classroom creation (teacher)  
✅ Joining classroom (student)  
✅ Video streaming  
✅ Tab switch detection  
✅ Real-time alerts  
✅ Focus score tracking  

Ready to test! 🎓