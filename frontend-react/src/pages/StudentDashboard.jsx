import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8001';
const WS_BASE  = 'ws://127.0.0.1:8001';

function StudentDashboard() {
  const [classId, setClassId]               = useState('');
  const [className, setClassName]           = useState('');
  const [teacherName, setTeacherName]       = useState('Teacher');
  const [isTeacherSharingScreen, setIsTeacherSharingScreen] = useState(false);
  const [joined, setJoined]                 = useState(false);
  const [focusScore, setFocusScore]         = useState(100);
  const [warningCount, setWarningCount]     = useState(0);
  const [strikeCount, setStrikeCount]       = useState(0);
  const [showWarning, setShowWarning]       = useState(false);
  const [movementStatus, setMovementStatus] = useState('Normal');
  const [isMuted, setIsMuted]               = useState(false);
  const [handRaised, setHandRaised]         = useState(false);
  const [activeTab, setActiveTab]           = useState('chat');
  const [chatMessages, setChatMessages]     = useState([]);
  const [chatInput, setChatInput]           = useState('');
  const [participants, setParticipants]     = useState([]);
  const [joining, setJoining]               = useState(false);

  const wsRef           = useRef(null);
  const streamRef       = useRef(null);
  const videoRef        = useRef(null);
  const teacherVideoRef = useRef(null);
  const peerConnRef     = useRef(null);
  const movementRef     = useRef(null);
  const warningCountRef = useRef(0);
  const chatEndRef      = useRef(null);
  const navigate        = useNavigate();

  useEffect(() => {
    if (!sessionStorage.getItem('token') || sessionStorage.getItem('role') !== 'student') {
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && joined) { setShowWarning(true); sendFocusAlert(); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [joined]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const joinClassroom = async () => {
    if (!classId.trim()) return;
    setJoining(true);
    try {
      const res = await fetch(`${API_BASE}/join-classroom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ class_id: classId })
      });
      const data = await res.json();
      if (res.ok) {
        setClassName(data.name || classId);
        setTeacherName(data.teacher_name || 'Teacher');
        setJoined(true);
        setupWebSocket();
        setupVideo();
        setParticipants([{ id: 'teacher', name: data.teacher_name || 'Teacher', role: 'teacher', muted: false }]);
      } else {
        alert('Classroom not found. Check the Class ID.');
      }
    } catch { alert('Connection error. Is the backend running?'); }
    setJoining(false);
  };

  const setupWebSocket = () => {
    const userId = sessionStorage.getItem('userId');
    wsRef.current = new WebSocket(`${WS_BASE}/ws/${classId}/${userId}/student`);
    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: 'request_video_offer' }));
    };
    wsRef.current.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'removed')      { alert(`Removed: ${data.reason}`); leaveClassroom(); }
      else if (data.type === 'timeout') { alert(data.message); leaveClassroom(); }
      else if (data.type === 'strike_added') {
        setStrikeCount(data.strikes);
        alert(`You received strike ${data.strikes}/5: ${data.reason}`);
      }
      else if (data.type === 'chat_message') {
        setChatMessages(prev => [...prev, {
          sender: data.sender,
          text: data.text,
          time: new Date(data.timestamp).toLocaleTimeString(),
          self: String(data.sender_id) === String(sessionStorage.getItem('userId'))
        }]);
      }
      else if (data.type === 'webrtc_offer') {
        setIsTeacherSharingScreen(Boolean(data.screen_share));
        await handleWebRTCOffer(data.offer);
      }
      else if (data.type === 'ice_candidate')  await handleICECandidate(data.candidate);
    };
  };

  const setupVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      startMovementDetection();
    } catch (e) { console.error('Camera error:', e); }
  };

  const startMovementDetection = () => {
    let prevFrame = null, moveCount = 0, lastTime = 0;
    movementRef.current = setInterval(() => {
      if (!videoRef.current?.videoWidth) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (prevFrame) {
        let diff = 0;
        const limit = canvas.width * canvas.height * 0.1;
        for (let i = 0; i < frame.data.length; i += 4) {
          if (Math.abs(frame.data[i] - prevFrame.data[i]) + Math.abs(frame.data[i+1] - prevFrame.data[i+1]) + Math.abs(frame.data[i+2] - prevFrame.data[i+2]) > 50) diff++;
        }
        if (diff > limit) {
          const now = Date.now();
          if (now - lastTime > 2000) { moveCount++; lastTime = now; }
          if (moveCount >= 3) { sendMovementAlert(); moveCount = 0; }
        }
      }
      prevFrame = frame;
    }, 500);
  };

  const sendFocusAlert = () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const newCount = warningCountRef.current + 1;
    const newScore = Math.max(0, 100 - newCount * 5);
    warningCountRef.current = newCount;
    setWarningCount(newCount);
    setFocusScore(newScore);
    wsRef.current.send(JSON.stringify({ type: 'focus_alert', warning_count: newCount, focus_score: newScore }));
  };

  const sendMovementAlert = () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    setMovementStatus('Excessive!');
    setTimeout(() => setMovementStatus('Normal'), 3000);
    wsRef.current.send(JSON.stringify({ type: 'movement_detected', timestamp: new Date().toISOString() }));
  };

  const handleWebRTCOffer = async (offer) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnRef.current = pc;
    pc.ontrack = (e) => { if (teacherVideoRef.current) teacherVideoRef.current.srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'ice_candidate', candidate: e.candidate }));
    };
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: 'webrtc_answer', answer }));
  };

  const handleICECandidate = async (candidate) => {
    if (peerConnRef.current) await peerConnRef.current.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach(t => t.enabled = isMuted);
    setIsMuted(!isMuted);
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'chat_message', text: chatInput.trim() }));
    setChatInput('');
  };

  const leaveClassroom = () => {
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    peerConnRef.current?.close();
    if (movementRef.current) clearInterval(movementRef.current);
    setJoined(false); setClassId(''); setClassName(''); setTeacherName('Teacher');
    setWarningCount(0); setStrikeCount(0); setFocusScore(100);
    warningCountRef.current = 0;
  };

  const username = sessionStorage.getItem('username');

  return (
    <div className="sc-root">

      {/* ── FOCUS WARNING OVERLAY ── */}
      {showWarning && (
        <div className="sc-modal-overlay">
          <div className="sc-modal" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>⚠️</div>
            <h3 style={{ color: 'var(--sc-red)', marginBottom: 8 }}>Focus Alert!</h3>
            <p style={{ color: 'var(--sc-muted)', marginBottom: 24 }}>You switched tabs. Your teacher has been notified.</p>
            <button className="sc-btn sc-btn-primary" onClick={() => setShowWarning(false)}>
              <i className="fas fa-check"></i> I'm Back
            </button>
          </div>
        </div>
      )}

      {/* ── TOP NAV ── */}
      <nav className="sc-nav">
        <div className="sc-nav-left">
          <span className="sc-logo"><i className="fas fa-graduation-cap"></i> Smart Classroom</span>
          {joined && <span className="sc-nav-classname"><i className="fas fa-chalkboard"></i> {className}</span>}
        </div>
        <div className="sc-nav-right">
          {joined && (
            <>
              <span className={`sc-focus-pill ${focusScore >= 80 ? 'sc-focus-good' : focusScore >= 60 ? 'sc-focus-warn' : 'sc-focus-bad'}`}>
                <i className="fas fa-brain"></i> Focus: {focusScore}%
              </span>
              {warningCount > 0 && (
                <span className="sc-warn-pill"><i className="fas fa-exclamation-triangle"></i> {warningCount} warnings</span>
              )}
              {strikeCount > 0 && (
                <span className="sc-warn-pill"><i className="fas fa-gavel"></i> {strikeCount}/5 strikes</span>
              )}
            </>
          )}
          <span className="sc-nav-user"><i className="fas fa-user-graduate"></i> {username}</span>
          {joined && (
            <button className="sc-btn sc-btn-danger" onClick={leaveClassroom}>
              <i className="fas fa-phone-slash"></i> Leave
            </button>
          )}
        </div>
      </nav>

      {/* ── JOIN SCREEN ── */}
      {!joined && (
        <div className="sc-landing">
          <div className="sc-join-card">
            <div className="sc-join-icon"><i className="fas fa-door-open"></i></div>
            <h2>Join a Classroom</h2>
            <p>Enter the Class ID shared by your teacher</p>
            <div className="sc-join-input-wrap">
              <input
                className="sc-input sc-join-input"
                placeholder="Enter Class ID (e.g. ABC123)"
                value={classId}
                onChange={e => setClassId(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && joinClassroom()}
                maxLength={6}
                autoFocus
              />
            </div>
            <button className="sc-btn sc-btn-primary sc-btn-lg sc-join-btn" onClick={joinClassroom} disabled={joining}>
              {joining
                ? <><i className="fas fa-spinner fa-spin"></i> Joining...</>
                : <><i className="fas fa-sign-in-alt"></i> Join Class</>
              }
            </button>
            <div className="sc-join-tips">
              <span><i className="fas fa-info-circle"></i> Make sure your camera and microphone are allowed</span>
            </div>
          </div>
        </div>
      )}

      {/* ── LIVE CLASSROOM ── */}
      {joined && (
        <>
          {/* Class ID Banner */}
          <div className="sc-banner">
            <span><i className="fas fa-key"></i> Class ID: <strong>{classId}</strong></span>
            <span className="sc-banner-dot"><i className="fas fa-circle sc-red"></i> Live Session</span>
          </div>

          <div className="sc-main">

            {/* ── VIDEO GRID ── */}
            <div className="sc-video-area">
              <div className={`sc-video-grid ${isTeacherSharingScreen ? 'sc-video-grid-screen-share' : ''}`}>

                {/* Teacher Tile */}
                <div className="sc-tile sc-tile-teacher">
                  <video autoPlay playsInline ref={teacherVideoRef} className="sc-tile-video" />
                  <div className="sc-tile-avatar" id="teacher-placeholder">
                    <i className="fas fa-user-tie"></i>
                  </div>
                  <div className="sc-tile-bar">
                    <span className="sc-tile-name"><i className="fas fa-star"></i> {teacherName} (Host)</span>
                    <span className="sc-tile-mic"><i className="fas fa-microphone sc-green"></i></span>
                  </div>
                  <span className="sc-live-badge"><i className="fas fa-circle"></i> HOST</span>
                  {isTeacherSharingScreen && <span className="sc-screen-share-badge"><i className="fas fa-desktop"></i> SCREEN SHARING</span>}
                </div>

                {/* Student (You) Tile */}
                <div className="sc-tile sc-tile-self">
                  <video autoPlay playsInline muted ref={videoRef} className="sc-tile-video" />
                  <div className="sc-tile-bar">
                    <span className="sc-tile-name"><i className="fas fa-user"></i> {username} (You)</span>
                    <span className="sc-tile-mic">
                      {isMuted
                        ? <i className="fas fa-microphone-slash sc-red"></i>
                        : <i className="fas fa-microphone sc-green"></i>
                      }
                    </span>
                  </div>
                  {handRaised && <span className="sc-hand-badge">✋ Hand Raised</span>}
                  <span className={`sc-status-dot sc-status-active`}></span>
                </div>

                {/* Focus Score Tile */}
                <div className="sc-tile sc-tile-stats">
                  <div className="sc-stats-inner">
                    <div className="sc-stat-row">
                      <i className="fas fa-brain sc-primary-icon"></i>
                      <div>
                        <div className="sc-stat-label">Focus Score</div>
                        <div className={`sc-stat-val ${focusScore >= 80 ? 'sc-green' : focusScore >= 60 ? 'sc-yellow' : 'sc-red'}`}>{focusScore}%</div>
                      </div>
                    </div>
                    <div className="sc-progress-bar">
                      <div className="sc-progress-fill" style={{ width: `${focusScore}%`, background: focusScore >= 80 ? 'var(--sc-green)' : focusScore >= 60 ? 'var(--sc-yellow)' : 'var(--sc-red)' }}></div>
                    </div>
                    <div className="sc-stat-row" style={{ marginTop: 12 }}>
                      <i className="fas fa-exclamation-triangle sc-yellow"></i>
                      <div>
                        <div className="sc-stat-label">Warnings</div>
                        <div className="sc-stat-val sc-yellow">{warningCount}</div>
                      </div>
                    </div>
                    <div className="sc-stat-row" style={{ marginTop: 12 }}>
                      <i className={`fas fa-running ${movementStatus !== 'Normal' ? 'sc-red' : 'sc-green'}`}></i>
                      <div>
                        <div className="sc-stat-label">Movement</div>
                        <div className={`sc-stat-val ${movementStatus !== 'Normal' ? 'sc-red' : 'sc-green'}`}>{movementStatus}</div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* ── BOTTOM CONTROL BAR ── */}
              <div className="sc-controls">
                <div className="sc-controls-left">
                  <span className="sc-controls-time"><i className="fas fa-circle sc-red"></i> {new Date().toLocaleTimeString()}</span>
                </div>
                <div className="sc-controls-center">
                  <button className={`sc-ctrl-btn ${isMuted ? 'sc-ctrl-active' : ''}`} onClick={toggleMute}>
                    <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                    <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                  </button>
                  <button className={`sc-ctrl-btn ${handRaised ? 'sc-ctrl-hand' : ''}`} onClick={() => setHandRaised(!handRaised)}>
                    <i className="fas fa-hand-paper"></i>
                    <span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
                  </button>
                  <button className="sc-ctrl-btn" onClick={() => setActiveTab('chat')}>
                    <i className="fas fa-comment-dots"></i>
                    <span>Chat</span>
                  </button>
                </div>
                <div className="sc-controls-right">
                  <button className="sc-btn sc-btn-danger" onClick={leaveClassroom}>
                    <i className="fas fa-phone-slash"></i> Leave Class
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className="sc-panel">
              <div className="sc-tabs">
                <button className={`sc-tab ${activeTab === 'chat' ? 'sc-tab-active' : ''}`} onClick={() => setActiveTab('chat')}>
                  <i className="fas fa-comment-dots"></i> Chat
                </button>
                <button className={`sc-tab ${activeTab === 'participants' ? 'sc-tab-active' : ''}`} onClick={() => setActiveTab('participants')}>
                  <i className="fas fa-users"></i> People <span className="sc-tab-count">{participants.length + 1}</span>
                </button>
              </div>

              {/* Chat Tab */}
              {activeTab === 'chat' && (
                <div className="sc-panel-body sc-chat-body">
                  <div className="sc-chat-messages">
                    {chatMessages.length === 0
                      ? <div className="sc-empty-msg"><i className="fas fa-comment-slash"></i><span>No messages yet. Say hello!</span></div>
                      : chatMessages.map((m, i) => (
                        <div key={i} className={`sc-chat-msg ${m.self ? 'sc-chat-self' : ''}`}>
                          <span className="sc-chat-sender">{m.sender}</span>
                          <span className="sc-chat-text">{m.text}</span>
                          <span className="sc-chat-time">{m.time}</span>
                        </div>
                      ))
                    }
                    <div ref={chatEndRef} />
                  </div>
                  <div className="sc-chat-input-row">
                    <input
                      className="sc-input sc-chat-input"
                      placeholder="Type a message..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendChat()}
                    />
                    <button className="sc-btn sc-btn-primary sc-btn-sm" onClick={sendChat}>
                      <i className="fas fa-paper-plane"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Participants Tab */}
              {activeTab === 'participants' && (
                <div className="sc-panel-body">
                  {/* Teacher */}
                  <div className="sc-participant-item sc-participant-teacher">
                    <div className="sc-participant-avatar"><i className="fas fa-user-tie"></i></div>
                    <div className="sc-participant-info">
                      <span className="sc-participant-name">{teacherName}</span>
                      <span className="sc-participant-role">Host · Teacher</span>
                    </div>
                    <div className="sc-participant-icons">
                      <i className="fas fa-microphone sc-green"></i>
                      <i className="fas fa-video sc-green"></i>
                    </div>
                  </div>

                  {/* Self */}
                  <div className="sc-participant-item">
                    <div className="sc-participant-avatar sc-avatar-student">
                      <i className="fas fa-user-graduate"></i>
                    </div>
                    <div className="sc-participant-info">
                      <span className="sc-participant-name">{username} <span style={{ color: 'var(--sc-muted)', fontSize: '0.75rem' }}>(You)</span></span>
                      <span className="sc-participant-role">
                        Focus: <strong className={focusScore >= 80 ? 'sc-green' : focusScore >= 60 ? 'sc-yellow' : 'sc-red'}>{focusScore}%</strong>
                      </span>
                    </div>
                    <div className="sc-participant-icons">
                      <i className={`fas ${isMuted ? 'fa-microphone-slash sc-red' : 'fa-microphone sc-green'}`}></i>
                      <i className="fas fa-video sc-green"></i>
                      {handRaised && <i className="fas fa-hand-paper sc-yellow"></i>}
                    </div>
                  </div>

                  <div className="sc-discipline" style={{ marginTop: 12 }}>
                    <p className="sc-discipline-title"><i className="fas fa-chart-bar"></i> Your Session Stats</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="sc-stat-row-mini">
                        <span className="sc-muted-text">Focus Score</span>
                        <span className={focusScore >= 80 ? 'sc-green' : focusScore >= 60 ? 'sc-yellow' : 'sc-red'}><strong>{focusScore}%</strong></span>
                      </div>
                      <div className="sc-stat-row-mini">
                        <span className="sc-muted-text">Warnings</span>
                        <span className="sc-yellow"><strong>{warningCount}</strong></span>
                      </div>
                      <div className="sc-stat-row-mini">
                        <span className="sc-muted-text">Movement</span>
                        <span className={movementStatus !== 'Normal' ? 'sc-red' : 'sc-green'}><strong>{movementStatus}</strong></span>
                      </div>
                      <div className="sc-stat-row-mini">
                        <span className="sc-muted-text">Hand Raised</span>
                        <span className={handRaised ? 'sc-yellow' : 'sc-muted-text'}><strong>{handRaised ? 'Yes ✋' : 'No'}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default StudentDashboard;
