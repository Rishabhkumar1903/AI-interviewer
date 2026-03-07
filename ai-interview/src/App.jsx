import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
// 🔴 FIREBASE IMPORTS
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, query, where, doc, setDoc, getDoc } from "firebase/firestore";
// 🔴 EMAILJS IMPORT
import emailjs from '@emailjs/browser';
import './App.css';

// 🔴 1. FIREBASE SETUP
const firebaseConfig = {
  apiKey: "AIzaSyC-A04fXwc__Qtb-9qEh9aW9Ya5bkyeCSE",
  authDomain: "mockgeniusai.firebaseapp.com",
  projectId: "mockgeniusai",
  storageBucket: "mockgeniusai.firebasestorage.app",
  messagingSenderId: "609865232585",
  appId: "1:609865232585:web:57cc44e1db3698ac0fdd18",
  measurementId: "G-XEZM9J1X75"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 

// 🔴 2. GEMINI AI SETUP
const API_KEY = "AIzaSyAHrzEXgk2fVODYYGeEYgH5g7K7YJp_Mls";
const genAI = new GoogleGenerativeAI(API_KEY);

// 🔴 3. CLOUDINARY SETUP 
const CLOUDINARY_UPLOAD_PRESET = "ml_default"; 
const CLOUDINARY_CLOUD_NAME = "deqy8ecza"; 

// 🔴 4. EMAILJS CONFIG (Dual Templates)
const EMAILJS_SERVICE_ID = "service_m88sddk"; 
const EMAILJS_TEMPLATE_ID_CANDIDATE = "template_os3cr9s"; // 👈 Yahan Candidate wale template ki ID dalo
const EMAILJS_TEMPLATE_ID_HR = "template_g9s1jjk"; // 👈 Yahan HR wale template ki ID dalo
const EMAILJS_PUBLIC_KEY = "nKihqC9JtF6BcTTfM"; 

function App() {
  const videoRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const transcriptRef = useRef("");
  const isProcessingRef = useRef(false);
  const sessionActiveRef = useRef(false); 

  // =========================================
  // AUTHENTICATION STATES
  // =========================================
  const [user, setUser] = useState(null); 
  const [userData, setUserData] = useState(null); 
  const [authMode, setAuthMode] = useState("LOGIN"); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authRole, setAuthRole] = useState("CANDIDATE"); 
  const [authName, setAuthName] = useState("");
  const [authCompany, setAuthCompany] = useState("");
  const [hrSecretKey, setHrSecretKey] = useState(""); 
  const [authLoading, setAuthLoading] = useState(false);

  // HR Dashboard States
  const [adminDatabase, setAdminDatabase] = useState([]); 
  const [selectedHrReport, setSelectedHrReport] = useState(null);
  const [isFetchingData, setIsFetchingData] = useState(false);
  
  // Candidate Flow States
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [jobRole, setJobRole] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const [isListening, setIsListening] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false); 
  const [chat, setChat] = useState(null);

  // Recording & Result States
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const conversationHistoryRef = useRef([]); 
  const [videoUrl, setVideoUrl] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState("");

  const userDataRef = useRef(null);
  const jobRoleRef = useRef("");

  useEffect(() => { userDataRef.current = userData; }, [userData]);
  useEffect(() => { jobRoleRef.current = jobRole; }, [jobRole]);

  // =========================================
  // 🔴 ANTI-CHEATING PROCTORING ENGINE 🔴
  // =========================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && sessionActiveRef.current) {
        alert("🚨 CHEATING DETECTED: You switched the tab or minimized the app. Your interview has been terminated!");
        handleEndSession("TAB_SWITCH_VIOLATION");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []); 

  // =========================================
  // AUTHENTICATION LOGIC
  // =========================================
  const handleSignup = async () => {
    if (!email || !password || !authName || !authCompany) return alert("Please fill all details!");
    setAuthLoading(true);

    if (authRole === "HR") {
      if (!hrSecretKey) {
        setAuthLoading(false);
        return alert("⛔ Please enter an Enterprise License Key.");
      }
      try {
        const keyRef = doc(db, "license_keys", hrSecretKey);
        const keySnap = await getDoc(keyRef);
        if (!keySnap.exists()) {
          setAuthLoading(false);
          return alert("⛔ Access Denied! Invalid or Expired Enterprise License Key.");
        }
      } catch (error) {
        setAuthLoading(false);
        return alert("Error verifying license key.");
      }
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      
      const newUserData = { 
        name: authName, 
        role: authRole, 
        companyCode: authCompany.toUpperCase(),
        email: email 
      };
      
      await setDoc(doc(db, "users", newUser.uid), newUserData);
      setUserData(newUserData);
      setUser(newUser);
    } catch (error) { alert("Signup Failed: " + error.message); }
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!email || !password) return alert("Enter email and password!");
    setAuthLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const docSnap = await getDoc(doc(db, "users", userCredential.user.uid));
      if (docSnap.exists()) {
        setUserData(docSnap.data());
        setUser(userCredential.user);
      } else { alert("User data not found!"); }
    } catch (error) { alert("Login Failed: Incorrect Email or Password"); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    signOut(auth);
    setUser(null); setUserData(null); setIsSetupComplete(false); setShowReport(false);
    setAdminDatabase([]); setEmail(""); setPassword(""); setJobRole(""); setResumeFile(null);
    setVideoUrl(null); setHrSecretKey("");
  };

  // =========================================
  // HR DATA FETCHING
  // =========================================
  useEffect(() => {
    if (user && userData && userData.role === "HR") fetchHrDatabase();
  }, [user, userData]);

  const fetchHrDatabase = async () => {
    setIsFetchingData(true);
    try {
      const q = query(collection(db, "interviews"), where("companyCode", "==", userData.companyCode));
      const querySnapshot = await getDocs(q);
      const fetchedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedData.sort((a, b) => b.timestamp - a.timestamp);
      setAdminDatabase(fetchedData);
    } catch (error) { alert("Failed to fetch candidates from Database."); }
    setIsFetchingData(false);
  };

  // =========================================
  // CANDIDATE INTERVIEW LOGIC
  // =========================================
  useEffect(() => {
    if (user && userData?.role === "CANDIDATE" && isSetupComplete && !showReport && !isAnalyzing) {
      const startCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) { 
          alert("❌ Camera and Microphone access is REQUIRED for the interview. Please allow permissions and reload.");
          setIsSetupComplete(false); 
        }
      };
      startCamera();
    }
  }, [user, userData, isSetupComplete, showReport, isAnalyzing]);

  useEffect(() => {
    let timer;
    if (isStarted && timeLeft > 0) timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [isStarted, timeLeft]);

  const handleStartSession = async () => {
    setIsStarted(true);
    setIsAiThinking(true);
    sessionActiveRef.current = true;
    conversationHistoryRef.current = []; 

    if (videoRef.current && videoRef.current.srcObject) {
      recordedChunksRef.current = [];
      const stream = videoRef.current.srcObject;
      try {
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
        mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        mediaRecorderRef.current.start();
      } catch (err) {}
    }
    
    try {
      const dynamicPrompt = `You are a STRICT, fast-paced Technical Interviewer. Candidate Name: ${userData.name}, Target Role: ${jobRole}. NEVER REPEAT A QUESTION. Keep responses extremely short (max 2 sentences). Ask ONE technical question at a time. Read the attached resume and start by welcoming the candidate and asking the first question.`;

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: dynamicPrompt });
      const newChat = model.startChat({ history: [] });
      setChat(newChat);

      let msgParts = [`Hello, I am ${userData.name}. I am ready for my interview for the ${jobRole} role.`];
      if (resumeFile) {
        const base64Data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(resumeFile);
        });
        msgParts.push({ inlineData: { data: base64Data, mimeType: resumeFile.type } });
      }

      const result = await newChat.sendMessage(msgParts);
      if (!sessionActiveRef.current) return;

      const firstQuestion = result.response.text();
      conversationHistoryRef.current.push(`AI: ${firstQuestion}`);
      setIsAiThinking(false);
      speak(firstQuestion);

    } catch (error) {
      alert("API Limit reached or network issue. Please wait 1 min and retry.");
      setIsAiThinking(false); setIsStarted(false); sessionActiveRef.current = false;
    }
  };

  // 🔴 2. UPDATED DUAL-TEMPLATE EMAIL LOGIC 🔴
  const handleEndSession = async (violationType = null) => {
    sessionActiveRef.current = false; 
    window.speechSynthesis.cancel(); 
    setIsAiSpeaking(false); setIsAiThinking(false); setIsListening(false);
    if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); }
    clearTimeout(silenceTimerRef.current);
    setIsStarted(false); setIsAnalyzing(true); 

    let finalBlob = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      finalBlob = await new Promise((resolve) => {
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          setVideoUrl(URL.createObjectURL(blob)); 
          resolve(blob);
        };
        mediaRecorderRef.current.stop();
      });
    }

    if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }

    // CLOUDINARY UPLOAD
    let cloudVideoUrl = "";
    if (finalBlob) {
        try {
            const formData = new FormData();
            formData.append("file", finalBlob);
            formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, { method: "POST", body: formData });
            const cloudData = await res.json();
            cloudVideoUrl = cloudData.secure_url || "";
        } catch (error) { console.error("Cloudinary Upload Failed:", error); }
    }

    // AI REPORT GENERATION
    let finalReport = "";
    let extractedScore = "N/A";
    
    if (violationType === "TAB_SWITCH_VIOLATION") {
        finalReport = `SCORE: 0/10\nSTRENGTHS: None observed.\nWEAKNESSES: Candidate tried to cheat by switching tabs or minimizing the application.\nEXPERT TIP: Immediate Disqualification due to violation of Proctoring Rules.`;
        extractedScore = "0/10";
        setReportData(finalReport);
    } else {
        try {
            const historyText = conversationHistoryRef.current.join('\n');
            const evalPrompt = `Act as an expert HR. Analyze interview for ${userDataRef.current?.name} (${jobRoleRef.current}):\n${historyText}\nFormat: SCORE: [X/10]\nSTRENGTHS: [2 points]\nWEAKNESSES: [2 points]\nEXPERT TIP: [1 sentence]`;
            const evalModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const evalResult = await evalModel.generateContent(evalPrompt);
            finalReport = evalResult.response.text();
            const scoreMatch = finalReport.match(/SCORE:\s*(.*)/i);
            extractedScore = scoreMatch ? scoreMatch[1].trim() : "N/A";
            setReportData(finalReport);
        } catch (error) {
            finalReport = "SCORE: N/A\nSTRENGTHS: Data not generated due to API limit.\nWEAKNESSES: Try again after 1 min.\nEXPERT TIP: API Quota exceeded.";
            setReportData(finalReport);
        }
    }

    // FETCH HR EMAIL FROM FIREBASE
    let autoFetchedHrEmail = "";
    try {
        const hrQuery = query(collection(db, "users"), where("role", "==", "HR"), where("companyCode", "==", userDataRef.current.companyCode));
        const hrSnapshot = await getDocs(hrQuery);
        if (!hrSnapshot.empty) {
            autoFetchedHrEmail = hrSnapshot.docs[0].data().email; 
        }
    } catch (e) {
        console.error("Failed to fetch HR Email", e);
    }

    try {
        const newInterviewData = {
            name: userDataRef.current?.name || "Candidate",
            role: jobRoleRef.current,
            companyCode: userDataRef.current?.companyCode || "DEFAULT", 
            candidate_email: auth.currentUser.email,
            date: new Date().toLocaleString(),
            timestamp: Date.now(), 
            score: extractedScore,
            report: finalReport,
            video: cloudVideoUrl,
            status: violationType ? "DISQUALIFIED" : "COMPLETED" 
        };
        
        await addDoc(collection(db, "interviews"), newInterviewData);

        // 🔴 SENDING DOUBLE EMAILS WITH DIFFERENT TEMPLATES 🔴
        if (EMAILJS_SERVICE_ID) {
            const emailParams = {
              candidate_name: newInterviewData.name,
              target_role: newInterviewData.role,
              score: newInterviewData.score,
              company_code: newInterviewData.companyCode,
              video_link: newInterviewData.video || "No video link available",
              report_summary: newInterviewData.report
            };

            console.log("Triggering Emails...");
            
            // 1. Mail to Candidate (Using CANDIDATE Template)
            if (EMAILJS_TEMPLATE_ID_CANDIDATE !== "YOUR_CANDIDATE_TEMPLATE_ID") {
              emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_CANDIDATE, {
                ...emailParams,
                to_email: newInterviewData.candidate_email 
              }, EMAILJS_PUBLIC_KEY)
              .then(() => console.log("✅ Candidate feedback email sent."))
              .catch(err => console.error("❌ Candidate email failed:", err));
            }

            // 2. Mail to Fetched HR (Using HR Template)
            if (autoFetchedHrEmail && EMAILJS_TEMPLATE_ID_HR !== "YOUR_HR_TEMPLATE_ID") {
                emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_HR, {
                    ...emailParams,
                    to_email: autoFetchedHrEmail 
                }, EMAILJS_PUBLIC_KEY)
                .then(() => console.log(`✅ HR Report email sent to: ${autoFetchedHrEmail}`))
                .catch(err => console.error("❌ HR email failed:", err));
            }
        }

    } catch (error) { console.error("Firebase DB Save Error:", error); }
    
    setIsAnalyzing(false);
    setShowReport(true); 
  };

  const processAnswer = useCallback(async (userAnswer) => {
    if (isProcessingRef.current || !chat || !sessionActiveRef.current) return;
    isProcessingRef.current = true;
    clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false); setIsAiThinking(true); 
    transcriptRef.current = ""; 

    conversationHistoryRef.current.push(`${userData?.name || "Candidate"}: ${userAnswer}`);

    try {
      const result = await chat.sendMessage(userAnswer);
      if (!sessionActiveRef.current) { isProcessingRef.current = false; return; }
      const aiReply = result.response.text();
      conversationHistoryRef.current.push(`AI: ${aiReply}`);
      setIsAiThinking(false);
      speak(aiReply);
    } catch (error) {
      if (sessionActiveRef.current) { setIsAiThinking(false); speak("I missed that due to a network issue. Could you please repeat?"); }
    } finally { isProcessingRef.current = false; }
  }, [chat, userData]);

  const speak = (text) => {
    if (!sessionActiveRef.current) return; 
    window.speechSynthesis.cancel();
    setIsAiSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ""));
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.onend = () => { setIsAiSpeaking(false); if (sessionActiveRef.current) startMic(); };
    window.speechSynthesis.speak(utterance);
  };

  const startMic = () => {
    if (!sessionActiveRef.current) return;
    transcriptRef.current = "";
    try { recognitionRef.current?.start(); setIsListening(true); } catch (e) {}
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true; rec.interimResults = true; rec.lang = 'en-IN';
      rec.onresult = (event) => {
        if (!sessionActiveRef.current) return;
        clearTimeout(silenceTimerRef.current);
        let text = "";
        for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
        transcriptRef.current = text;
        silenceTimerRef.current = setTimeout(() => {
          if (transcriptRef.current.trim().length > 5 && sessionActiveRef.current) processAnswer(transcriptRef.current);
        }, 3500); 
      };
      rec.onend = () => {
        if (!sessionActiveRef.current) return; 
        if (!isAiSpeaking && !isAiThinking && transcriptRef.current.trim().length > 5) processAnswer(transcriptRef.current);
        else if (!isAiSpeaking && !isAiThinking) try { rec.start(); } catch(e){}
      };
      recognitionRef.current = rec;
    }
  }, [processAnswer, isAiSpeaking, isAiThinking]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) setResumeFile(file);
      else alert("Please upload a valid PDF or JPG/PNG image.");
    }
  };

  return (
    <div className="container-override">
      <header className="top-nav">
        <div className="nav-left">
          <h1 className="main-logo">MockGenius AI <span className="pro-badge">PRO</span></h1>
          <p className="sub-tagline">Real-time Voice Analysis</p>
        </div>
        <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user && userData && (
            <>
              <div className="user-profile-badge">
                <span className="user-icon">👤</span>
                {userData.name} ({userData.role}) - {userData.companyCode}
              </div>
              <button onClick={handleLogout} className="logout-btn">Log Out</button>
            </>
          )}
          {user && userData?.role === "CANDIDATE" && isSetupComplete && !isAnalyzing && !showReport && (
            <div className="timer-pill">
              <span className="timer-icon">⏱️</span>
              {Math.floor(timeLeft/60)}:{(timeLeft%60).toString().padStart(2,'0')}
            </div>
          )}
        </div>
      </header>

      <main className="stage">
        {/* AUTHENTICATION SCREEN */}
        {!user && (
           <div className="setup-card auth-card">
              <div className="auth-toggle">
                <button className={authMode === "LOGIN" ? "active" : ""} onClick={() => setAuthMode("LOGIN")}>Login</button>
                <button className={authMode === "SIGNUP" ? "active" : ""} onClick={() => setAuthMode("SIGNUP")}>Sign Up</button>
              </div>
              <div className="setup-header">
                <h2>{authMode === "LOGIN" ? "Welcome Back 👋" : "Create Account 🚀"}</h2>
                <p>{authMode === "LOGIN" ? "Login to access your dashboard." : "Join MockGenius AI to start interviewing."}</p>
              </div>

              {authMode === "SIGNUP" && (
                <>
                  <div className="input-group">
                    <label>Select Role</label>
                    <div className="role-selector">
                      <button className={`role-btn ${authRole === "CANDIDATE" ? "active-role" : ""}`} onClick={() => setAuthRole("CANDIDATE")}>👨‍💻 Candidate</button>
                      <button className={`role-btn ${authRole === "HR" ? "active-role" : ""}`} onClick={() => setAuthRole("HR")}>👔 HR Admin</button>
                    </div>
                  </div>
                  
                  {authRole === "HR" && (
                    <div className="input-group" style={{background: 'rgba(234, 179, 8, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid #eab308'}}>
                      <label style={{color: '#eab308'}}>🔑 Enterprise License Key</label>
                      <input 
                        type="password" 
                        placeholder="Enter your provided License Key" 
                        value={hrSecretKey} 
                        onChange={(e) => setHrSecretKey(e.target.value)} 
                        style={{borderColor: '#eab308'}}
                      />
                      <p style={{fontSize: '11px', color: '#fde047', marginTop: '5px', marginBottom: 0}}>
                        * Don't have a key? Contact MockGenius Sales to purchase an enterprise license.
                      </p>
                    </div>
                  )}

                  <div className="input-group">
                    <label>Full Name</label>
                    <input type="text" placeholder="e.g. Rahul Mahto" value={authName} onChange={(e) => setAuthName(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>{authRole === "HR" ? "Company Code (Create a new one)" : "Company Code (Given by HR)"}</label>
                    <input type="text" placeholder="e.g. TCS-101" value={authCompany} onChange={(e) => setAuthCompany(e.target.value)} />
                  </div>
                </>
              )}

              <div className="input-group">
                <label>Email Address</label>
                <input type="email" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              <button className="btn-main submit-btn" onClick={authMode === "LOGIN" ? handleLogin : handleSignup} disabled={authLoading}>
                {authLoading ? "Processing..." : authMode === "LOGIN" ? "Login to Account ➜" : "Create Account ➜"}
              </button>
           </div>
        )}

        {/* HR DASHBOARD */}
        {user && userData?.role === "HR" && (
           <div className="hr-dashboard">
             <div className="hr-dash-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
               <div>
                  <h2>🏢 {userData.companyCode} Candidates</h2>
                  <p>Review interviews taken by candidates under your company code.</p>
               </div>
               <button onClick={fetchHrDatabase} className="switcher-btn">🔄 Refresh Data</button>
             </div>

             {isFetchingData ? (
                <div style={{textAlign:'center', color: '#94a3b8', marginTop: '50px'}}>Fetching Database from Cloud... ⏳</div>
             ) : selectedHrReport ? (
               <div className="hr-full-report">
                 <button onClick={() => setSelectedHrReport(null)} className="back-btn">⬅ Back to Candidates List</button>
                 <div className="hr-report-flex">
                   <div className="hr-report-left">
                     <h3>📹 Candidate Recording</h3>
                     <div className="video-player-box">
                       {selectedHrReport.video ? (
                         <video src={selectedHrReport.video} controls className="recorded-video"></video>
                       ) : (
                         <p className="error-text">Video not uploaded to cloud.</p>
                       )}
                     </div>
                     {selectedHrReport.video && (
                       <a href={selectedHrReport.video} target="_blank" rel="noreferrer" className="btn-main download-btn">
                         ⬇ Open & Download Video
                       </a>
                     )}
                   </div>
                   <div className="hr-report-right">
                     <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '15px'}}>
                        <h3 style={{margin: 0, color: 'white', border: 'none', padding: 0}}>
                          {selectedHrReport.name} - {selectedHrReport.role} 
                          {selectedHrReport.status === "DISQUALIFIED" && <span style={{color: '#ef4444', fontSize: '14px', marginLeft: '10px'}}>⛔ (CHEATING DETECTED)</span>}
                        </h3>
                        <span style={{color: '#64748b', fontSize: '13px'}}>{selectedHrReport.date}</span>
                     </div>
                     <div className="feedback-content">
                       {selectedHrReport.report.split('\n').map((line, idx) => {
                         if(line.includes("SCORE:")) return <div key={idx} className="score-badge" style={{background: selectedHrReport.status === "DISQUALIFIED" ? '#ef4444' : '#3b82f6'}}>{line}</div>;
                         if(line.includes("STRENGTHS:")) return <div key={idx} className="feed-box positive"><b>{line}</b></div>;
                         if(line.includes("WEAKNESSES:")) return <div key={idx} className="feed-box negative"><b>{line}</b></div>;
                         if(line.includes("EXPERT TIP:")) return <div key={idx} className="feed-box tip"><b>{line}</b></div>;
                         return line.trim() ? <p key={idx}>{line}</p> : null;
                       })}
                     </div>
                   </div>
                 </div>
               </div>
             ) : (
               <div className="candidates-grid">
                 {adminDatabase.length === 0 ? (
                   <p className="error-text" style={{width: '100%', gridColumn: '1 / -1'}}>No interviews found for {userData.companyCode} yet.</p>
                 ) : (
                   adminDatabase.map((candidate) => (
                     <div key={candidate.id} className="candidate-card" style={{border: candidate.status === "DISQUALIFIED" ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)'}}>
                       <h4>{candidate.name} {candidate.status === "DISQUALIFIED" && "⛔"}</h4>
                       <span className="job-badge">{candidate.role}</span>
                       <div className="card-meta">
                         <span className="score-text" style={{color: candidate.status === "DISQUALIFIED" ? '#ef4444' : '#10b981'}}>Score: {candidate.score}</span>
                         <span className="date-text">{candidate.date.split(',')[0]}</span>
                       </div>
                       <button onClick={() => setSelectedHrReport(candidate)} className="view-report-btn">View Detailed Report</button>
                     </div>
                   ))
                 )}
               </div>
             )}
           </div>
        )}

        {/* CANDIDATE FLOW */}
        {user && userData?.role === "CANDIDATE" && (
          <>
            {!isSetupComplete && !isAnalyzing && !showReport && (
              <div className="setup-card">
                <div className="setup-header">
                  <h2>Interview Setup 📄</h2>
                  <p>Your details are locked to your HR's company code.</p>
                </div>
                <div className="input-group">
                  <label>Company Code (Locked)</label>
                  <input type="text" value={userData.companyCode} disabled style={{opacity: 0.7}} />
                </div>
                <div className="input-group">
                  <label>Full Name (Locked)</label>
                  <input type="text" value={userData.name} disabled style={{opacity: 0.7}} />
                </div>
                <div className="input-group">
                  <label>Target Job Role</label>
                  <input type="text" placeholder="e.g. React Developer" value={jobRole} onChange={(e) => setJobRole(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Upload Resume</label>
                  <div className="file-upload-box">
                    <input type="file" id="resume-upload" accept=".pdf, image/jpeg, image/png, image/jpg" onChange={handleFileChange} className="hidden-file-input" />
                    <label htmlFor="resume-upload" className="file-upload-label">
                      {resumeFile ? (
                        <div className="file-selected"><span className="file-icon">✅</span><span className="file-name">{resumeFile.name}</span></div>
                      ) : (
                        <div className="file-placeholder"><span className="upload-icon">📤</span><span>Click to Upload PDF or JPG/PNG</span></div>
                      )}
                    </label>
                  </div>
                </div>
                <button className="btn-main submit-btn" onClick={() => setIsSetupComplete(true)} disabled={!jobRole || !resumeFile}>
                  Verify & Proceed to Interview ➜
                </button>
              </div>
            )}

            {isSetupComplete && !isAnalyzing && !showReport && (
              <>
                <div className="camera-frame">
                  <video ref={videoRef} autoPlay playsInline muted className="video-feed"></video>
                  <div className="status-tag"><div className="pulsing-dot"></div>{isStarted ? "REC • LIVE SESSION" : "LIVE SESSION"}</div>
                </div>
                <div className="interaction-area">
                  <div className={`siri-orb ${isAiSpeaking ? 'is-speaking' : isListening ? 'is-listening' : isAiThinking ? 'is-thinking' : 'is-idle'}`}>
                    <div className="siri-wave wave-1"></div><div className="siri-wave wave-2"></div><div className="siri-wave wave-3"></div><div className="siri-flare"></div>
                  </div>
                  <div className="action-buttons">
                    {!isStarted ? (
                      <button onClick={handleStartSession} className="btn-main start">Start Session</button>
                    ) : (
                      <button onClick={() => handleEndSession(null)} className="btn-main stop">End Session</button>
                    )}
                  </div>
                  <div className="info-box">
                    {!isStarted ? (
                      <p>💡 The AI will analyze your profile and auto-detect voice.</p>
                    ) : (
                      <p className={isAiSpeaking ? 'text-blue' : isListening ? 'text-green' : isAiThinking ? 'text-purple' : 'text-gray'}>
                        {isAiThinking ? "⏳ AI is scanning resume & generating question..." : isAiSpeaking ? "🤖 AI Interviewer is speaking..." : isListening ? "🎙️ Mic Active - Listening to your answer..." : "Ready"}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {isAnalyzing && (
              <div className="analyzing-card">
                <div className="spinner"></div>
                <h2>Processing & Saving to Cloud...</h2>
                <p>AI is evaluating your answers. Your HR will receive this report.</p>
              </div>
            )}

            {showReport && (
              <div className="report-dashboard">
                <div className="report-left">
                  <h3>📹 Session Recording</h3>
                  <div className="video-player-box">
                    {videoUrl ? (
                      <video src={videoUrl} controls className="recorded-video"></video>
                    ) : (
                      <p className="error-text">Recording unavailable.</p>
                    )}
                  </div>
                  {videoUrl && (
                    <a href={videoUrl} download={`${userData.name}_Interview.webm`} className="btn-main download-btn">⬇ Download Local Copy</a>
                  )}
                </div>
                <div className="report-right">
                  <h3>🏆 AI Interview Feedback</h3>
                  <div className="feedback-content">
                    {reportData.split('\n').map((line, idx) => {
                      if(line.includes("SCORE:")) return <div key={idx} className="score-badge">{line}</div>;
                      if(line.includes("STRENGTHS:")) return <div key={idx} className="feed-box positive"><b>{line}</b></div>;
                      if(line.includes("WEAKNESSES:")) return <div key={idx} className="feed-box negative"><b>{line}</b></div>;
                      if(line.includes("EXPERT TIP:")) return <div key={idx} className="feed-box tip"><b>{line}</b></div>;
                      return line.trim() ? <p key={idx}>{line}</p> : null;
                    })}
                  </div>
                  <button onClick={() => {
                    setShowReport(false); 
                    setIsSetupComplete(false); 
                    setJobRole(""); 
                    setResumeFile(null);
                    setVideoUrl(null);
                  }} className="btn-main retry-btn">Back to Dashboard</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="professional-footer">
        <p className="warning-text">⚠️ <strong>Proctoring Active:</strong> Switching tabs or minimizing the window will instantly terminate your interview.</p>
        <p>🔒 Secure Session • All interviews are recorded and analyzed by real interviewers.</p>
      </footer>

      <style>{`
        :global(body), :global(#root) { margin: 0 !important; padding: 0 !important; width: 100vw !important; height: 100vh !important; overflow: hidden !important; background: #f8fafc !important; }
        .container-override { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: linear-gradient(135deg, #000000b9 0%, #0c1a2c 100%); display: flex; flex-direction: column; align-items: center; font-family: 'Inter', system-ui, sans-serif; color: #1e293b; overflow: hidden; box-sizing: border-box; }
        .top-nav { width: 100%; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; background: rgb(255, 255, 255); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(226, 232, 240, 0.8); box-sizing: border-box; height: 85px; }
        .main-logo { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px;}
        .pro-badge { color: white; font-size: 10px; background: #3b82f6; padding: 4px 8px; border-radius: 6px;}
        .sub-tagline { margin: 4px 0 0 0; font-size: 13px; color: #64748b; font-weight: 500;}
        .timer-pill { background: white; padding: 8px 20px; border-radius: 50px; font-family: 'SF Mono', monospace; font-weight: 700; font-size: 18px; color: #334155; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
        .stage { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; gap: 25px; padding-bottom: 20px; }
        .auth-toggle { display: flex; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 5px; margin-bottom: 10px;}
        .auth-toggle button { flex: 1; background: transparent; border: none; color: #94a3b8; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;}
        .auth-toggle button.active { background: #3b82f6; color: white;}
        .role-selector { display: flex; gap: 10px; }
        .role-btn { flex: 1; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; border-radius: 8px; cursor: pointer; transition: 0.2s;}
        .active-role { background: #10b981; border-color: #10b981; color: white; font-weight: bold;}
        .user-profile-badge { background: #f1f5f9; padding: 6px 15px; border-radius: 50px; font-size: 13px; font-weight: bold; color: #334155; display: flex; align-items: center; gap: 8px; border: 1px solid #cbd5e1;}
        .logout-btn { background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 6px 15px; border-radius: 50px; font-size: 12px; font-weight: bold; cursor: pointer; transition: 0.3s;}
        .logout-btn:hover { background: #ef4444; color: white;}
        .switcher-btn { background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid #3b82f6; padding: 8px 16px; border-radius: 50px; font-weight: 700; cursor: pointer; transition: all 0.3s; font-size: 14px;}
        .switcher-btn:hover { background: #3b82f6; color: white; }
        .hr-dashboard { width: 90%; max-width: 1000px; height: 80vh; background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 30px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; animation: fadeIn 0.5s;}
        .hr-dashboard::-webkit-scrollbar { width: 6px; } .hr-dashboard::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px;}
        .hr-dash-header h2 { color: white; margin: 0 0 5px 0; font-size: 24px;}
        .hr-dash-header p { color: #94a3b8; margin: 0; font-size: 14px; }
        .candidates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin-top: 10px;}
        .candidate-card { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 10px; transition: transform 0.2s;}
        .candidate-card:hover { transform: translateY(-5px); border-color: #3b82f6;}
        .candidate-card h4 { margin: 0; color: white; font-size: 18px;}
        .job-badge { background: #334155; color: white; padding: 4px 10px; border-radius: 6px; font-size: 12px; width: max-content;}
        .card-meta { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; margin-top: 5px;}
        .score-text { color: #10b981; font-weight: bold; font-size: 14px;}
        .date-text { color: #64748b; font-size: 12px;}
        .view-report-btn { background: #1e293b; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: background 0.3s;}
        .view-report-btn:hover { background: #3b82f6;}
        .hr-full-report { background: rgba(0,0,0,0.3); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .back-btn { background: transparent; border: none; color: #94a3b8; cursor: pointer; text-align: left; padding: 0; font-size: 14px; margin-bottom: 10px;}
        .back-btn:hover { color: white; text-decoration: underline;}
        .hr-report-flex { display: flex; gap: 30px; }
        @media (max-width: 768px) { .hr-report-flex { flex-direction: column; } }
        .hr-report-left { flex: 1; display: flex; flex-direction: column; gap: 15px;}
        .hr-report-right { flex: 1.2; display: flex; flex-direction: column; gap: 15px;}
        .hr-report-left h3, .hr-report-right h3 { color: white; margin: 0 0 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;}
        .setup-card { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); padding: 35px 40px; border-radius: 24px; width: 90%; max-width: 500px; box-shadow: 0 25px 50px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 20px; animation: fadeIn 0.5s ease-out; max-height: 85vh; overflow-y: auto; }
        .setup-card::-webkit-scrollbar { width: 6px; }
        .setup-card::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .setup-header h2 { color: white; margin: 0 0 5px 0; font-size: 24px; }
        .setup-header p { color: #94a3b8; margin: 0; font-size: 13px; line-height: 1.4; }
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        .input-group label { color: #cbd5e1; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .input-group input[type="text"], .input-group input[type="password"], .input-group input[type="email"] { background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.15); color: white; padding: 14px; border-radius: 12px; font-size: 14px; font-family: inherit; transition: all 0.3s ease; }
        .input-group input[type="text"]:focus, .input-group input[type="password"]:focus, .input-group input[type="email"]:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
        .hidden-file-input { display: none; }
        .file-upload-box { border: 2px dashed rgba(255, 255, 255, 0.2); border-radius: 12px; background: rgba(0, 0, 0, 0.2); transition: all 0.3s ease; cursor: pointer; }
        .file-upload-box:hover { border-color: #3b82f6; background: rgba(59, 130, 246, 0.05); }
        .file-upload-label { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 25px; cursor: pointer; min-height: 100px; }
        .file-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #cbd5e1; font-size: 14px; font-weight: 500; }
        .upload-icon { font-size: 28px; margin-bottom: 2px; }
        .file-hint { font-size: 11px; color: #64748b; }
        .file-selected { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #10b981; font-weight: 600; }
        .file-icon { font-size: 24px; }
        .file-name { color: white; font-size: 14px; word-break: break-all; text-align: center; }
        .submit-btn { background: #3b82f6 !important; color: white !important; width: 100%; padding: 15px !important; font-size: 15px !important; margin-top: 5px; }
        .submit-btn:disabled { background: #1e293b !important; color: #64748b !important; cursor: not-allowed; border: 1px solid #334155; box-shadow: none; }
        .camera-frame { position: relative; width: 90vw; max-width: 580px; aspect-ratio: 16 / 9; background: #000; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5); border: 4px solid white; }
        .video-feed { width: 100%; height: 100%; object-fit: cover; }
        .status-tag { position: absolute; top: 15px; left: 15px; background: rgba(0, 0, 0, 0.6); color: white; font-size: 10px; font-weight: 700; padding: 6px 12px; border-radius: 50px; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(8px); }
        .pulsing-dot { width: 6px; height: 6px; background: #ef4444; border-radius: 50%; animation: ping 1.5s infinite; }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        .interaction-area { display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%; max-width: 500px; }
        .siri-orb { position: relative; width: 90px; height: 90px; border-radius: 50%; background: #050505; box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.1), 0 10px 30px rgba(0,0,0,0.6); overflow: hidden; display: flex; align-items: center; justify-content: center; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid rgba(255,255,255,0.05); }
        .siri-wave { position: absolute; width: 250%; height: 250%; border-radius: 50%; mix-blend-mode: screen; filter: blur(10px); }
        .is-idle { transform: scale(1); }
        .is-idle .wave-1 { background: conic-gradient(from 0deg, transparent, rgba(59,130,246,0.3), transparent 50%); animation: spin 5s linear infinite; }
        .is-thinking { transform: scale(1.05); box-shadow: 0 0 30px rgba(255, 255, 255, 0.2); }
        .is-thinking .wave-1 { background: conic-gradient(from 0deg, transparent, #94a3b8, #cbd5e1, transparent); animation: spin 1s linear infinite; }
        .is-speaking { box-shadow: 0 0 45px rgba(139, 92, 246, 0.5), inset 0 0 25px rgba(255,255,255,0.3); transform: scale(1.15); }
        .is-speaking .wave-1 { background: conic-gradient(from 0deg, transparent, #3b82f6, #8b5cf6, #ec4899, #f43f5e, transparent); animation: spin 2s linear infinite; }
        .is-speaking .wave-2 { background: radial-gradient(ellipse at center, rgba(255,255,255,0.7), transparent 40%); animation: siri-pulse 1.5s ease-in-out infinite alternate; }
        .is-listening { box-shadow: 0 0 35px rgba(16, 185, 129, 0.4), inset 0 0 20px rgba(255,255,255,0.2); transform: scale(1.05); }
        .is-listening .wave-1 { background: conic-gradient(from 0deg, transparent, #10b981, #06b6d4, transparent); animation: spin 2.5s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes siri-pulse { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(1.3); opacity: 1; } }
        .btn-main { padding: 12px 40px; border-radius: 50px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s ease; display: inline-block; text-decoration: none;}
        .start { background: #ffffff; color: #0f172a; box-shadow: 0 8px 15px -5px rgba(255, 255, 255, 0.2); }
        .start:hover { transform: translateY(-2px); box-shadow: 0 12px 20px -5px rgba(255, 255, 255, 0.3); }
        .stop { background: #1e293b; color: #ef4444; border: 1px solid #ef4444; }
        .info-box { background: white; padding: 12px 20px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); text-align: center; width: 100%; }
        .info-box p { margin: 0; font-size: 13px; color: #475569; font-weight: 500; }
        .text-blue { color: #3b82f6 !important; font-weight: 600; }
        .text-green { color: #10b981 !important; font-weight: 600; }
        .text-purple { color: #8b5cf6 !important; font-weight: 600; font-style: italic; }
        .text-gray { color: #64748b !important; font-weight: 600; }
        .analyzing-card { display: flex; flex-direction: column; align-items: center; gap: 15px; color: white; animation: fadeIn 0.5s ease; }
        .spinner { width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
        .report-dashboard { display: flex; flex-direction: row; gap: 30px; width: 90%; max-width: 1000px; background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 30px; box-shadow: 0 25px 50px rgba(0,0,0,0.4); animation: fadeIn 0.5s ease-out; }
        @media (max-width: 768px) { .report-dashboard { flex-direction: column; } }
        .report-left { flex: 1; display: flex; flex-direction: column; gap: 15px; }
        .report-right { flex: 1.2; display: flex; flex-direction: column; gap: 15px; }
        .report-dashboard h3 { color: white; margin: 0 0 10px 0; font-size: 18px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
        .video-player-box { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden; border: 2px solid rgba(255,255,255,0.1); }
        .recorded-video { width: 100%; height: 100%; object-fit: cover; }
        .error-text { color: #94a3b8; text-align: center; margin-top: 25%; font-size: 14px; }
        .download-btn { background: #10b981 !important; color: white !important; text-align: center; padding: 15px !important; }
        .download-btn:hover { background: #059669 !important; }
        .feedback-content { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 400px; padding-right: 10px; color: #cbd5e1; font-size: 14px; line-height: 1.6; }
        .feedback-content::-webkit-scrollbar { width: 6px; }
        .feedback-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
        .score-badge { display: inline-block; background: #3b82f6; color: white; padding: 12px 25px; border-radius: 50px; font-size: 20px; font-weight: bold; width: max-content; margin-bottom: 5px; box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3); }
        .feed-box { padding: 15px; border-radius: 12px; font-size: 14px; }
        .positive { background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; color: #d1fae5; }
        .negative { background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; color: #fee2e2; }
        .tip { background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; color: #fef3c7; }
        .retry-btn { background: #334155 !important; color: white !important; margin-top: auto; padding: 15px !important; text-align: center;}
        .professional-footer { width: 100%; padding: 10px 20px 20px 20px; text-align: center; font-size: 12px; color: rgba(255, 255, 255, 0.5); font-weight: 400; letter-spacing: 0.5px; margin-top: auto; }
        .professional-footer p { margin: 0; }
        .warning-text { color: #ef4444 !important; font-size: 13px !important; margin-bottom: 8px !important; }
      `}</style>
    </div>
  );
}

export default App;