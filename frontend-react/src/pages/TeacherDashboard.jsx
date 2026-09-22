import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8001';
const WS_BASE = 'ws://127.0.0.1:8001';

function TeacherDashboard() {
  const [className, setClassName] = useState('');
  const [created, setCreated] = useState(false);
  const [currentClassId, setCurrentClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [activeTab, setActiveTab] = useState('participants');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [copied, setCopied] = useState(false);
  const [autoRemoveThreshold, setAutoRemoveThreshold] = useState(30);
  const [autoRemoveEnabled, setAutoRemoveEnabled] = useState(false);

  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const videoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionStorage.getItem('token') || sessionStorage.getItem('role') !== 'teacher') {
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'get_students' }));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const createClassroom = async () => {
    if (!className.trim()) return alert('Please enter a class name.');
    try {
      const response = await fetch(`${API_BASE}/create-classroom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ name: className })
      });
      const data = await response.json();
      if (response.ok) {
        setCurrentClassId(data.class_id);
        setCreated(true);
        setShowModal(false);
        setupWebSocket(data.class_id);
        setupVideo();
      }
    } catch {
      alert('Connection error');
    }
  };

  const setupWebSocket = (classId) => {
    const userId = sessionStorage.getItem('userId');
    wsRef.current = new WebSocket(`${WS_BASE}/ws/${classId}/${userId}/teacher`);
    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: 'get_students' }));
      setTimeout(() => broadcastVideoOffer(), 1000);
    };
    wsRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'focus_alert') addAlert(`Student ${data.student_id} lost focus — Score: ${data.focus_score}%`);
      else if (data.type === 'students_data') {
        setStudents(prev => data.students.map(student => {
          const current = prev.find(item => String(item.user_id) === String(student.user_id));
          return current && current.strikes > student.strikes
            ? { ...student, strikes: current.strikes }
            : student;
        }));
      }
      else if (data.type === 'student_removed') addAlert(`Student ${data.student_id} removed: ${data.reason}`);
      else if (data.type === 'student_timeout') addAlert(`Student ${data.student_id} timed out for ${data.minutes} min`);
      else if (data.type === 'strike_added') {
        setStudents(prev => prev.map(student => String(student.user_id) === String(data.student_id)
          ? { ...student, strikes: data.strikes, behavior_points: Math.max(0, (student.behavior_points ?? 100) - 10) }
          : student
        ));
        addAlert(`Strike on Student ${data.student_id} (${data.strikes}/5) — ${data.reason}`);
      }
      else if (data.type === 'strike_error') addAlert(data.message);
      else if (data.type === 'auto_strike_added') addAlert(`AUTO: Student ${data.student_id} (${data.strikes}/5) — ${data.reason}`);
      else if (data.type === 'chat_message') {
        setChatMessages(prev => [...prev, {
          sender: data.sender,
          text: data.text,
          time: new Date(data.timestamp).toLocaleTimeString(),
          self: String(data.sender_id) === String(sessionStorage.getItem('userId'))
        }]);
      }
      else if (data.type === 'video_offer_requested') await broadcastVideoOffer();
      else if (data.type === 'webrtc_answer') await handleWebRTCAnswer(data.answer);
      else if (data.type === 'ice_candidate') await handleICECandidate(data.candidate);
    };
  };

  const setupVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      console.error('Camera error:', e);
    }
  };

  const addAlert = (message) => {
    setAlerts(prev => [{ message, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => t.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(t => t.enabled = isCameraOff);
      setIsCameraOff(!isCameraOff);
    }
  };

  const copyClassId = () => {
    navigator.clipboard.writeText(currentClassId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendChat = () => {
    if (!chatMessage.trim()) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      addAlert('Classroom connection is not ready.');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'chat_message', text: chatMessage.trim() }));
    setChatMessage('');
  };

  const broadcastVideoOffer = async () => {
    const activeStream = screenStreamRef.current || streamRef.current;
    if (!activeStream) return;
    peerConnectionsRef.current['broadcast']?.close();
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'ice_candidate', candidate: e.candidate }));
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({
        type: 'webrtc_offer',
        offer,
        screen_share: Boolean(screenStreamRef.current)
      }));
    peerConnectionsRef.current['broadcast'] = pc;
  };

  const toggleScreenShare = async () => {
    if (isSharingScreen) {
      stopScreenShare();
      return;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      addAlert('Screen sharing requires a supported browser on localhost or HTTPS.');
      return;
    }

    try {
      let screenStream;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor' },
          audio: false
        });
      } catch (error) {
        if (error.name !== 'NotSupportedError') throw error;
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }
      const screenTrack = screenStream.getVideoTracks()[0];

      screenStreamRef.current = screenStream;
      setIsSharingScreen(true);
      screenTrack.onended = stopScreenShare;
      await broadcastVideoOffer();
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        addAlert('Screen sharing was cancelled or permission was denied.');
      } else if (error.name === 'NotSupportedError') {
        addAlert('This browser cannot share screens. Open the app in a normal Chrome or Edge tab at http://127.0.0.1:5500.');
      } else {
        addAlert(`Screen sharing failed: ${error.name || 'Unknown error'}${error.message ? ` - ${error.message}` : ''}`);
      }
    }
  };

  const stopScreenShare = async () => {
    const screenStream = screenStreamRef.current;
    screenStreamRef.current = null;
    setIsSharingScreen(false);
    screenStream?.getTracks().forEach(track => track.stop());
    await broadcastVideoOffer();
  };

  const handleWebRTCAnswer = async (answer) => {
    const pc = peerConnectionsRef.current['broadcast'];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleICECandidate = async (candidate) => {
    const pc = peerConnectionsRef.current['broadcast'];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const endClass = () => {
    if (wsRef.current) wsRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    setCreated(false);
    setClassName('');
    setStudents([]);
    setAlerts([]);
  };

  // ── AUTO-REMOVE: watch focus scores ──
  useEffect(() => {
    if (!autoRemoveEnabled || !created) return;
    students.forEach(student => {
      if (student.focus_score < autoRemoveThreshold && student.status === 'active') {
        wsRef.current?.send(JSON.stringify({
          type: 'remove_student',
          student_id: String(student.user_id),
          reason: `Auto-removed: focus score ${student.focus_score}% below threshold ${autoRemoveThreshold}%`
        }));
        addAlert(`AUTO-REMOVED Student #${student.user_id} — Focus: ${student.focus_score}%`);
      }
    });
  }, [students, autoRemoveEnabled, autoRemoveThreshold, created]);

  const downloadReport = () => {
    const rows = [
      ['Student Name', 'Join Time', 'Focus Score (%)', 'Status'],
      ...students.map(s => [
        `Student #${s.user_id}`,
        s.join_time ? new Date(s.join_time).toLocaleTimeString() : 'N/A',
        s.focus_score ?? 'N/A',
        s.focus_score >= 60 ? 'Active' : 'Distracted'
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${className.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeStudentDirect = (studentId) => {
    const confirmed = window.confirm(`Remove Student #${studentId} from the class?`);
    if (!confirmed) return;
    wsRef.current?.send(JSON.stringify({
      type: 'remove_student',
      student_id: String(studentId),
      reason: 'Removed by teacher'
    }));
    setStudents(prev => prev.filter(s => String(s.user_id) !== String(studentId)));
    if (selectedStudent === String(studentId)) setSelectedStudent('');
  };

  const getScoreBadge = (score) => {
    if (score >= 80) return 'sc-badge-green';
    if (score >= 60) return 'sc-badge-yellow';
    return 'sc-badge-red';
  };

  return (
    <div className="sc-root">

      {/* ── CREATE CLASSROOM MODAL ── */}
      {showModal && (
        <div className="sc-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sc-modal" onClick={e => e.stopPropagation()}>
            <div className="sc-modal-header">
              <h4><i className="fas fa-chalkboard-teacher"></i> New Classroom</h4>
              <button className="sc-modal-close" onClick={() => setShowModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="sc-modal-body">
              <p className="sc-modal-sub">Enter a name for your classroom session</p>
              <input
                type="text"
                className="sc-input"
                placeholder="e.g. Math Class — Period 3"
                value={className}
                onChange={e => setClassName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createClassroom()}
                autoFocus
              />
            </div>
            <div className="sc-modal-footer">
              <button className="sc-btn sc-btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="sc-btn sc-btn-primary" onClick={createClassroom}>
                <i className="fas fa-play"></i> Start Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP NAV ── */}
      <nav className="sc-nav">
        <div className="sc-nav-left">
          <span className="sc-logo"><i className="fas fa-graduation-cap"></i> Smart Classroom</span>
          {created && <span className="sc-nav-classname">{className}</span>}
        </div>
        <div className="sc-nav-right">
          <span className="sc-nav-user"><i className="fas fa-user-circle"></i> {sessionStorage.getItem('username')}</span>
          {!created
            ? <button className="sc-btn sc-btn-primary" onClick={() => setShowModal(true)}>
                <i className="fas fa-plus"></i> New Class
              </button>
            : <button className="sc-btn sc-btn-danger" onClick={endClass}>
                <i className="fas fa-phone-slash"></i> End Class
              </button>
          }
        </div>
      </nav>

      {/* ── PRE-CLASS LANDING ── */}
      {!created && (
        <div className="sc-landing">
          <div className="sc-landing-card">
            <div className="sc-landing-icon"><i className="fas fa-chalkboard-teacher"></i></div>
            <h2>Welcome, {sessionStorage.getItem('username')}</h2>
            <p>Start a new classroom session to connect with your students in real time.</p>
            <button className="sc-btn sc-btn-primary sc-btn-lg" onClick={() => setShowModal(true)}>
              <i className="fas fa-plus-circle"></i> Create Classroom
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE CLASS LAYOUT ── */}
      {created && (
        <>
          {/* Class ID Banner */}
          <div className="sc-banner">
            <span><i className="fas fa-key"></i> Class ID: <strong>{currentClassId}</strong></span>
            <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={copyClassId}>
              <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`}></i> {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Main Area */}
          <div className="sc-main">

            {/* ── VIDEO GRID ── */}
            <div className="sc-video-area">

              {/* Teacher tile */}
              <div className="sc-video-grid">
                <div className="sc-tile sc-tile-teacher">
                  {isCameraOff
                    ? <div className="sc-tile-avatar"><i className="fas fa-user-tie"></i></div>
                    : <video autoPlay playsInline muted ref={videoRef} className="sc-tile-video" />
                  }
                  <div className="sc-tile-bar">
                    <span className="sc-tile-name"><i className="fas fa-star"></i> {sessionStorage.getItem('username')} (You)</span>
                    <span className="sc-tile-mic">{isMuted ? <i className="fas fa-microphone-slash sc-red"></i> : <i className="fas fa-microphone sc-green"></i>}</span>
                  </div>
                  <span className="sc-live-badge"><i className="fas fa-circle"></i> LIVE</span>
                </div>

                {students.length === 0 ? (
                  <div className="sc-tile sc-tile-empty">
                    <i className="fas fa-user-plus"></i>
                    <p>Waiting for students...</p>
                  </div>
                ) : (
                  students.map(student => (
                    <div
                      key={student.user_id}
                      className={`sc-tile ${selectedStudent === String(student.user_id) ? 'sc-tile-selected' : ''}`}
                      onClick={() => { setSelectedStudent(String(student.user_id)); setActiveTab('participants'); }}
                    >
                      <div className="sc-tile-avatar sc-tile-avatar-student">
                        <i className="fas fa-user-graduate"></i>
                      </div>
                      <div className="sc-tile-bar">
                        <span className="sc-tile-name">{student.username || `Student #${student.user_id}`}</span>
                        <span className={`sc-score-badge ${getScoreBadge(student.focus_score)}`}>{student.focus_score}%</span>
                      </div>
                      <span className={`sc-status-dot sc-status-${student.status}`}></span>
                    </div>
                  ))
                )}
              </div>

              {/* ── BOTTOM CONTROL BAR ── */}
              <div className="sc-controls">
                <div className="sc-controls-left">
                  <span className="sc-controls-time"><i className="fas fa-circle sc-red"></i> {new Date().toLocaleTimeString()}</span>
                </div>
                <div className="sc-controls-center">
                  <button className={`sc-ctrl-btn ${isMuted ? 'sc-ctrl-active' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                    <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                    <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                  </button>
                  <button className={`sc-ctrl-btn ${isCameraOff ? 'sc-ctrl-active' : ''}`} onClick={toggleCamera} title={isCameraOff ? 'Start Video' : 'Stop Video'}>
                    <i className={`fas ${isCameraOff ? 'fa-video-slash' : 'fa-video'}`}></i>
                    <span>{isCameraOff ? 'Start Video' : 'Stop Video'}</span>
                  </button>
                  <button className={`sc-ctrl-btn ${isSharingScreen ? 'sc-ctrl-active' : ''}`} onClick={toggleScreenShare} title={isSharingScreen ? 'Stop Sharing' : 'Share Screen'}>
                    <i className={`fas ${isSharingScreen ? 'fa-stop-circle' : 'fa-desktop'}`}></i>
                    <span>{isSharingScreen ? 'Stop Sharing' : 'Share Screen'}</span>
                  </button>
                  <button className={`sc-ctrl-btn ${isRecording ? 'sc-ctrl-recording' : ''}`} onClick={() => setIsRecording(!isRecording)} title="Record">
                    <i className="fas fa-record-vinyl"></i>
                    <span>{isRecording ? 'Stop Rec' : 'Record'}</span>
                  </button>
                </div>
                <div className="sc-controls-right">
                  <button className="sc-btn sc-btn-danger" onClick={endClass}>
                    <i className="fas fa-phone-slash"></i> End Class
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className="sc-panel">
              {/* Tabs */}
              <div className="sc-tabs">
                <button className={`sc-tab ${activeTab === 'participants' ? 'sc-tab-active' : ''}`} onClick={() => setActiveTab('participants')}>
                  <i className="fas fa-users"></i> Participants <span className="sc-tab-count">{students.length}</span>
                </button>
                <button className={`sc-tab ${activeTab === 'chat' ? 'sc-tab-active' : ''}`} onClick={() => setActiveTab('chat')}>
                  <i className="fas fa-comment-dots"></i> Chat
                </button>
                <button className={`sc-tab ${activeTab === 'alerts' ? 'sc-tab-active' : ''}`} onClick={() => setActiveTab('alerts')}>
                  <i className="fas fa-bell"></i> Alerts {alerts.length > 0 && <span className="sc-tab-count sc-tab-count-red">{alerts.length}</span>}
                </button>
              </div>

              {/* Participants Tab */}
              {activeTab === 'participants' && (
                <div className="sc-panel-body">

                  {/* Report + Auto-remove bar */}
                  {students.length > 0 && (
                    <div className="sc-report-bar">
                      <button className="sc-btn sc-btn-primary sc-btn-sm" onClick={downloadReport}>
                        <i className="fas fa-file-csv"></i> Download Report
                      </button>
                      <div className="sc-auto-remove-row">
                        <label className="sc-toggle-label">
                          <input
                            type="checkbox"
                            checked={autoRemoveEnabled}
                            onChange={e => setAutoRemoveEnabled(e.target.checked)}
                          />
                          <span>Auto-remove</span>
                        </label>
                        <select
                          className="sc-select-sm"
                          value={autoRemoveThreshold}
                          onChange={e => setAutoRemoveThreshold(Number(e.target.value))}
                          title="Focus threshold for auto-removal"
                        >
                          <option value={20}>{'< 20%'}</option>
                          <option value={30}>{'< 30%'}</option>
                          <option value={40}>{'< 40%'}</option>
                          <option value={50}>{'< 50%'}</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="sc-participant-item sc-participant-teacher">
                    <div className="sc-participant-avatar"><i className="fas fa-user-tie"></i></div>
                    <div className="sc-participant-info">
                      <span className="sc-participant-name">{sessionStorage.getItem('username')}</span>
                      <span className="sc-participant-role">Host · Teacher</span>
                    </div>
                    <div className="sc-participant-icons">
                      <i className={`fas ${isMuted ? 'fa-microphone-slash sc-red' : 'fa-microphone sc-green'}`}></i>
                      <i className={`fas ${isCameraOff ? 'fa-video-slash sc-red' : 'fa-video sc-green'}`}></i>
                    </div>
                  </div>

                  {students.length === 0
                    ? <p className="sc-empty-msg"><i className="fas fa-hourglass-half"></i> No students yet</p>
                    : students.map(student => (
                      <div
                        key={student.user_id}
                        className={`sc-participant-item ${student.focus_score < 40 ? 'sc-participant-distracted' : ''}`}
                        onClick={() => setSelectedStudent(String(student.user_id))}
                      >
                        <div className={`sc-participant-avatar sc-avatar-student ${selectedStudent === String(student.user_id) ? 'sc-avatar-selected' : ''}`}>
                          <i className="fas fa-user-graduate"></i>
                        </div>
                        <div className="sc-participant-info">
                          <span className="sc-participant-name">
                            {student.username || `Student #${student.user_id}`}
                            {student.focus_score < 40 && (
                              <span className="sc-warn-indicator" title="Low focus — distracted">
                                <i className="fas fa-exclamation-triangle"></i>
                              </span>
                            )}
                          </span>
                          <span className="sc-participant-role">
                            Focus: <strong className={student.focus_score >= 80 ? 'sc-green' : student.focus_score >= 60 ? 'sc-yellow' : 'sc-red'}>{student.focus_score}%</strong>
                            &nbsp;· Strikes: {student.strikes}/5
                          </span>
                        </div>
                        <div className="sc-participant-actions">
                          <span className={`sc-status-pill sc-status-${student.status}`}>{student.status}</span>
                          <button
                            className="sc-remove-btn"
                            title="Remove student"
                            onClick={e => { e.stopPropagation(); removeStudentDirect(student.user_id); }}
                          >
                            <i className="fas fa-user-times"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  }

                </div>
              )}

              {/* Chat Tab */}
              {activeTab === 'chat' && (
                <div className="sc-panel-body sc-chat-body">
                  <div className="sc-chat-messages">
                    {chatMessages.length === 0
                      ? <p className="sc-empty-msg"><i className="fas fa-comment-slash"></i> No messages yet</p>
                      : chatMessages.map((m, i) => (
                        <div key={i} className="sc-chat-msg">
                          <span className="sc-chat-sender">{m.sender}</span>
                          <span className="sc-chat-text">{m.text}</span>
                          <span className="sc-chat-time">{m.time}</span>
                        </div>
                      ))
                    }
                  </div>
                  <div className="sc-chat-input-row">
                    <input
                      className="sc-input sc-chat-input"
                      placeholder="Send a message..."
                      value={chatMessage}
                      onChange={e => setChatMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendChat()}
                    />
                    <button className="sc-btn sc-btn-primary sc-btn-sm" onClick={sendChat}>
                      <i className="fas fa-paper-plane"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Alerts Tab */}
              {activeTab === 'alerts' && (
                <div className="sc-panel-body">
                  {alerts.length === 0
                    ? <p className="sc-empty-msg"><i className="fas fa-check-circle sc-green"></i> All clear, no alerts</p>
                    : alerts.map((a, i) => (
                      <div key={i} className="sc-alert-item">
                        <i className="fas fa-exclamation-circle sc-yellow"></i>
                        <div>
                          <p className="sc-alert-msg">{a.message}</p>
                          <span className="sc-alert-time">{a.timestamp}</span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TeacherDashboard;
