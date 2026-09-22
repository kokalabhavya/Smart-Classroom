import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8001';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', email: '', password: '', role: '' });
  const [message, setMessage] = useState({ text: '', type: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res  = await fetch(`${API_BASE}${isLogin ? '/login' : '/register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem('token',    data.access_token);
        sessionStorage.setItem('role',     data.role);
        sessionStorage.setItem('userId',   data.user_id);
        sessionStorage.setItem('username', formData.username);
        navigate(data.role === 'student' ? '/student' : '/teacher');
      } else {
        setMessage({ text: data.detail || 'Something went wrong', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Connection error. Is the backend running?', type: 'error' });
    }
  };

  const update = (field) => (e) => setFormData({ ...formData, [field]: e.target.value });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');

        .login-page {
          font-family: 'Poppins', Arial, sans-serif;
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 45%, #0f3460 100%);
          padding: 20px;
        }

        .login-card {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.35);
          padding: 2.5rem 2rem;
          width: 100%;
          max-width: 420px;
          animation: fadeUp 0.45s ease;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .login-header {
          text-align: center;
          margin-bottom: 1.75rem;
        }

        .login-header .icon {
          font-size: 3rem;
          display: block;
          margin-bottom: 0.4rem;
        }

        .login-header h1 {
          font-size: 1.6rem;
          font-weight: 700;
          color: #1a1a2e;
        }

        .login-header p {
          font-size: 0.83rem;
          color: #6b7280;
          margin-top: 0.2rem;
        }

        .login-tabs {
          display: flex;
          background: #f3f4f6;
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 1.5rem;
          gap: 4px;
        }

        .login-tab {
          flex: 1;
          padding: 0.55rem;
          border: none;
          background: transparent;
          border-radius: 7px;
          font-family: 'Poppins', sans-serif;
          font-size: 0.88rem;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.22s ease;
        }

        .login-tab.active {
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          color: #fff;
          box-shadow: 0 4px 12px rgba(37,99,235,0.35);
        }

        .form-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #374151;
          text-align: center;
          margin-bottom: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          margin-bottom: 1rem;
        }

        .form-group label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 0.72rem 1rem;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-family: 'Poppins', sans-serif;
          font-size: 0.9rem;
          color: #1f2937;
          background: #f9fafb;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }

        .form-group input:focus,
        .form-group select:focus {
          border-color: #2563eb;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }

        .form-group input::placeholder { color: #9ca3af; }

        .btn-submit {
          width: 100%;
          padding: 0.82rem;
          margin-top: 0.5rem;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          color: #fff;
          font-family: 'Poppins', sans-serif;
          font-size: 0.98rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(37,99,235,0.4);
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
        }

        .btn-submit:hover {
          opacity: 0.91;
          transform: translateY(-2px);
          box-shadow: 0 8px 22px rgba(37,99,235,0.45);
        }

        .btn-submit:active { transform: translateY(0); }

        .login-message {
          margin-top: 1rem;
          padding: 0.72rem 1rem;
          border-radius: 10px;
          font-size: 0.84rem;
          text-align: center;
        }

        .login-message.error {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .login-message.success {
          background: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
        }

        @media (max-width: 480px) {
          .login-card { padding: 2rem 1.25rem; border-radius: 16px; }
          .login-header h1 { font-size: 1.35rem; }
        }
      `}</style>

      <div className="login-page">
        <div className="login-card">

          <div className="login-header">
            <span className="icon">🎓</span>
            <h1>Smart Classroom</h1>
            <p>Virtual learning with focus monitoring</p>
          </div>

          <div className="login-tabs">
            <button className={`login-tab ${isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(true); setMessage({ text: '', type: '' }); }}>
              Login
            </button>
            <button className={`login-tab ${!isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(false); setMessage({ text: '', type: '' }); }}>
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <p className="form-title">{isLogin ? 'Welcome back 👋' : 'Create your account ✨'}</p>

            <div className="form-group">
              <label>Username</label>
              <input type="text" placeholder="Enter your username" value={formData.username} onChange={update('username')} required />
            </div>

            {!isLogin && (
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="Enter your email" value={formData.email} onChange={update('email')} required />
              </div>
            )}

            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="Enter your password" value={formData.password} onChange={update('password')} required />
            </div>

            <div className="form-group">
              <label>Role</label>
              <select value={formData.role} onChange={update('role')} required>
                <option value="">Select your role</option>
                <option value="student">🎓 Student</option>
                <option value="teacher">👨🏫 Teacher</option>
              </select>
            </div>

            <button type="submit" className="btn-submit">
              {isLogin ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          {message.text && (
            <div className={`login-message ${message.type}`}>{message.text}</div>
          )}

        </div>
      </div>
    </>
  );
}
