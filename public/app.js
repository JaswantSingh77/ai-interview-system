const app=document.getElementById("app");
const S={candidate:null,stream:null,questions:[],index:0,alerts:[],evaluations:[],recorder:null,chunks:[],recording:false,faceLandmarker:null,tracking:false,lastAlertAt:0,alertCount:0,tts:null};

const esc=x=>String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const nav=t=>`<div class="nav"><div class="brand">AI <span>Interview</span></div><small>${esc(t)}</small></div>`;

function home(){app.innerHTML=nav("Home")+`<main class="container"><div class="hero"><span class="badge">BCA Final-Year Project</span><h1>AI-Powered Proctored Interview</h1><p class="muted">AI-led interview, voice answers, browser camera access and computer-vision monitoring.</p></div><div class="grid"><div class="card"><h2>Candidate</h2><p class="muted">Give your complete interview from the browser.</p><button class="btn primary" onclick="candidateLogin()">Candidate Login</button></div><div class="card"><h2>Admin</h2><p class="muted">Review completed interviews and monitoring events.</p><button class="btn secondary" onclick="adminLogin()">Admin Login</button></div></div></main>`}

function candidateLogin(){app.innerHTML=nav("Candidate Login")+`<main class="container"><div class="card form"><h2>Candidate Login</h2><form onsubmit="candidateSetup(event)"><div class="field"><label>Name</label><input id="name" required></div><div class="field"><label>Email</label><input id="email" type="email" required></div><div class="field"><label>Subject</label><select id="subject"><option>Java</option><option>Python</option><option>Web Development</option><option>Database</option><option>Data Structures</option></select></div><button class="btn primary">Continue</button></form></div></main>`}

async function candidateSetup(e) {
    e.preventDefault();

    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const subjectInput = document.getElementById("subject");

    const candidateName = nameInput.value.trim();
    const candidateEmail = emailInput.value.trim();
    const candidateSubject = subjectInput.value;

    if (!candidateName || !candidateSubject) {
        alert("Please enter your name and select a subject.");
        return;
    }

    S.candidate = {
        name: candidateName,
        email: candidateEmail,
        subject: candidateSubject
    };

    console.log("Candidate saved:", S.candidate);

    app.innerHTML = nav("System Check") + `
        <main class="container">
            <div class="card form">
                <h2>Camera & Microphone Check</h2>

                <p class="muted">
                    Camera and microphone access is required
                    for the interview.
                </p>

                <div id="status" class="alert">
                    Waiting for permission...
                </div>

                <video
                    id="setupVideo"
                    autoplay
                    muted
                    playsinline
                    style="width:100%;border-radius:12px">
                </video>

                <div class="actions">
                    <button
                        class="btn primary"
                        onclick="requestDevices()">
                        Allow Camera & Microphone
                    </button>
                </div>
            </div>
        </main>
    `;
}

async function requestDevices(){
 try{
   S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   const v=document.getElementById("setupVideo");v.srcObject=S.stream;
   document.getElementById("status").className="alert ok";document.getElementById("status").textContent="Camera and microphone are ready.";
   setTimeout(loadInterview,700);
 }catch(e){document.getElementById("status").textContent="Permission/device error: "+e.message}
}

async function loadInterview() {
    console.log("Starting interview with:", S.candidate);

    if (!S.candidate) {
        alert("Candidate information is missing. Please login again.");
        home();
        return;
    }

    if (!S.candidate.name || !S.candidate.subject) {
        alert("Candidate name or subject is missing.");
        home();
        return;
    }

    app.innerHTML = nav("Preparing Interview") + `
        <main class="container">
            <div class="card form">
                <h2>Preparing your AI interview...</h2>
                <p class="muted">
                    Gemini is creating your interview questions.
                </p>
                <div class="badge">Please wait</div>
            </div>
        </main>
    `;

    try {
        const response = await fetch("/api/interview/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: S.candidate.name,
                subject: S.candidate.subject,
                difficulty: "medium"
            })
        });

        const data = await response.json();

        console.log("Gemini response:", data);

        if (!response.ok) {
            throw new Error(data.error || "Could not generate questions.");
        }

        S.questions = data.questions;

        if (!S.questions || S.questions.length === 0) {
            throw new Error("Gemini did not return any questions.");
        }

        instructions();

    } catch (error) {
        console.error("Interview start error:", error);

        app.innerHTML = nav("Error") + `
            <main class="container">
                <div class="card">
                    <h2>Could not start AI interview</h2>
                    <p>${esc(error.message)}</p>
                    <button class="btn primary" onclick="home()">
                        Home
                    </button>
                </div>
            </main>
        `;
    }
}

function instructions(){app.innerHTML=nav("Interview Instructions")+`<main class="container"><div class="card"><h2>Ready to start</h2><ul><li>Keep your face visible and stay centered.</li><li>Answer naturally through the microphone.</li><li>The question will be spoken aloud.</li><li>Camera monitoring produces alerts for review.</li><li>Two monitoring alerts will flag the interview for admin review.</li></ul><div class="actions"><button class="btn primary" onclick="startInterview()">Start Interview</button></div></div></main>`}

async function startInterview(){S.index=0;S.alerts=[];S.evaluations=[];S.alertCount=0;renderInterview();await initFaceTracking();speakQuestion();startMicMonitor();}

function renderInterview(){
 const q=S.questions[S.index].question;
 app.innerHTML=nav("Live Interview")+`<main class="container"><div class="interview"><section><div class="video"><video id="video" autoplay muted playsinline></video><div class="tag">Camera • Monitoring active</div></div><div class="card" style="margin-top:15px"><span class="badge">Question ${S.index+1} of ${S.questions.length}</span><div class="progress" style="margin:14px 0"><div style="width:${(S.index/S.questions.length)*100}%"></div></div><div class="question">${esc(q)}</div><div class="card" style="padding:15px;margin-top:15px;background:#f8fafc;box-shadow:none"><strong>🎙️ Your answer</strong><span id="micStatus" class="badge" style="float:right">Ready</span><div class="meter" style="margin:12px 0"><div id="micBar"></div></div><button id="recordBtn" class="btn primary" onclick="toggleRecording()">Start Answer</button></div><textarea id="answer" placeholder="Your transcribed answer will appear here." style="min-height:130px;margin-top:12px"></textarea><div class="actions"><button class="btn secondary" onclick="repeatQuestion()">🔊 Repeat Question</button><button class="btn primary" onclick="submitAnswer()">Submit Answer</button></div></div></section><aside><div class="card"><h3>Candidate</h3><strong>${esc(S.candidate.name)}</strong><p class="muted">${esc(S.candidate.subject)}</p></div><div class="card" style="margin-top:15px"><h3>Monitoring</h3><div id="alerts"><span class="muted">No alerts.</span></div><p id="reviewFlag" class="badge hidden">Flagged for admin review</p></div></aside></div></main>`;
 const v=document.getElementById("video");v.srcObject=S.stream;
}

function speakQuestion(){const q=S.questions[S.index]?.question;if(!q||!("speechSynthesis"in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(q);u.lang="en-IN";u.rate=.92;u.pitch=1;window.speechSynthesis.speak(u)}
function repeatQuestion(){speakQuestion()}

async function toggleRecording(){if(S.recording)stopRecording();else await startRecording()}
async function startRecording(){
 if(!S.stream)return;
 S.chunks=[];S.recording=true;
 const btn=document.getElementById("recordBtn");btn.textContent="⏹ Stop Answer";document.getElementById("micStatus").textContent="Listening…";
 const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm";
 S.recorder=new MediaRecorder(new MediaStream(S.stream.getAudioTracks()),{mimeType:mime});
 S.recorder.ondataavailable=e=>{if(e.data.size)S.chunks.push(e.data)};
 S.recorder.onstop=async()=>{const blob=new Blob(S.chunks,{type:mime});await transcribe(blob)};
 S.recorder.start(250);
}
function stopRecording(){S.recording=false;try{S.recorder?.stop()}catch{};const b=document.getElementById("recordBtn");if(b)b.textContent="Start Answer";const st=document.getElementById("micStatus");if(st)st.textContent="Processing…"}
async function transcribe(blob){
 const fd=new FormData();fd.append("audio",blob,"answer.webm");
 try{const r=await fetch("/api/transcribe",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||"Transcription error");document.getElementById("answer").value=d.transcript||"";document.getElementById("micStatus").textContent="Transcribed";}catch(e){document.getElementById("micStatus").textContent="Transcription failed";alert(e.message)}
}
function startMicMonitor(){
 const ctx=new AudioContext(),src=ctx.createMediaStreamSource(S.stream),an=ctx.createAnalyser();an.fftSize=256;src.connect(an);const data=new Uint8Array(an.frequencyBinCount);
 const loop=()=>{if(!S.stream)return;an.getByteTimeDomainData(data);let sum=0;for(const v of data){let n=(v-128)/128;sum+=n*n}const level=Math.min(100,Math.sqrt(sum/data.length)*250);const bar=document.getElementById("micBar");if(bar)bar.style.width=level+"%";requestAnimationFrame(loop)};loop();
}

async function initFaceTracking(){
 try{
   if(!window.vision){console.warn("MediaPipe library unavailable");return}
   const {FaceLandmarker,FilesetResolver}=window.vision;
   const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
   S.faceLandmarker=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",delegate:"GPU"},runningMode:"VIDEO",numFaces:2,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
   S.tracking=true;trackFrame();
 }catch(e){console.warn("Face tracking unavailable",e)}
}

function trackFrame(){
 if(!S.tracking||!S.faceLandmarker)return;
 const v=document.getElementById("video");if(!v||v.readyState<2){requestAnimationFrame(trackFrame);return}
 const result=S.faceLandmarker.detectForVideo(v,performance.now());
 const faces=result.faceLandmarks||[];
 if(faces.length===0)maybeAlert("Face not visible");
 else if(faces.length>1)maybeAlert("Multiple faces detected");
 else{
   const lm=faces[0];
   // Approximate gaze indicator from iris positions relative to eye corners.
   const leftEye=eyeRatio(lm,33,133,468), rightEye=eyeRatio(lm,362,263,473);
   const gaze=(leftEye+rightEye)/2;
   if(gaze<0.23||gaze>0.77)maybeAlert("Candidate gaze/head direction is outside the expected viewing area");
 }
 requestAnimationFrame(trackFrame);
}
function eyeRatio(lm,a,b,iris){const x1=lm[a].x,x2=lm[b].x,xi=lm[iris].x;const den=Math.max(.001,Math.abs(x2-x1));return (xi-x1)/den}
function maybeAlert(message){
 const now=Date.now();if(now-S.lastAlertAt<5000)return;S.lastAlertAt=now;S.alertCount++;
 S.alerts.push({message,time:new Date().toLocaleTimeString()});
 const box=document.getElementById("alerts");if(box)box.innerHTML=S.alerts.map((a,i)=>`<div class="alert"><strong>Alert ${i+1}</strong> • ${esc(a.message)}<br><small>${esc(a.time)}</small></div>`).join("");
 if(S.alertCount>=2){const flag=document.getElementById("reviewFlag");if(flag)flag.classList.remove("hidden");}
}

async function submitAnswer(){
 if(S.recording)stopRecording();
 const answer=(document.getElementById("answer")?.value||"").trim();
 if(!answer){alert("Please record an answer first.");return}
 const q=S.questions[S.index].question;
 try{
   const r=await fetch("/api/interview/evaluate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:q,answer,subject:S.candidate.subject})});
   const ev=await r.json();if(!r.ok)throw new Error(ev.error||"Evaluation failed");S.evaluations.push({question:q,answer,...ev});
 }catch(e){S.evaluations.push({question:q,answer,score:0,feedback:"Evaluation unavailable: "+e.message})}
 if(S.index<S.questions.length-1){S.index++;renderInterview();setTimeout(speakQuestion,250)}
 else finishInterview();
}

async function finishInterview(){
 if(S.recording)stopRecording();window.speechSynthesis?.cancel();S.tracking=false;S.stream?.getTracks().forEach(t=>t.stop());
 let report={overallScore:0,summary:"Report unavailable",technicalSummary:"",recommendationForReviewer:"Review the interview report and monitoring events before making any candidate decision."};
 try{const r=await fetch("/api/report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({candidate:S.candidate.name,subject:S.candidate.subject,evaluations:S.evaluations,alerts:S.alerts})});report=await r.json()}catch{}
 const saved=JSON.parse(localStorage.getItem("reports")||"[]");saved.unshift({id:Date.now(),candidate:S.candidate,report,evaluations:S.evaluations,alerts:S.alerts,date:new Date().toLocaleString()});localStorage.setItem("reports",JSON.stringify(saved));
 app.innerHTML=nav("Interview Complete")+`<main class="container"><div class="card"><span class="badge">Completed</span><h2>Interview Submitted</h2><div class="metric-grid"><div class="metric">AI Score<strong>${esc(report.overallScore)}/100</strong></div><div class="metric">Questions<strong>${S.questions.length}</strong></div><div class="metric">Alerts<strong>${S.alerts.length}</strong></div><div class="metric">Status<strong>Review</strong></div></div><h3>Summary</h3><p>${esc(report.summary)}</p><h3>Monitoring</h3><p>${S.alerts.length?S.alerts.map(a=>esc(a.message)).join("<br>"):"No alerts recorded."}</p><button class="btn primary" onclick="home()">Return Home</button></div></main>`;
}

function adminLogin(){app.innerHTML=nav("Admin Login")+`<main class="container"><div class="card form"><h2>Admin Login</h2><p class="muted">Demo only: admin / admin123</p><form onsubmit="admin(event)"><div class="field"><label>Username</label><input id="au" required></div><div class="field"><label>Password</label><input id="ap" type="password" required></div><button class="btn primary">Login</button></form></div></main>`}
function admin(e){e.preventDefault();if(au.value==="admin"&&ap.value==="admin123")dashboard();else alert("Invalid demo credentials")}
function dashboard(){const r=JSON.parse(localStorage.getItem("reports")||"[]");app.innerHTML=nav("Admin Dashboard")+`<main class="container"><div class="hero" style="text-align:left;margin:0 0 25px"><h1 style="font-size:32px">Admin Dashboard</h1><p class="muted">Review candidate interview results and monitoring alerts.</p></div><div class="metric-grid"><div class="metric">Interviews<strong>${r.length}</strong></div><div class="metric">Alerts<strong>${r.reduce((a,x)=>a+x.alerts.length,0)}</strong></div><div class="metric">Avg Score<strong>${r.length?Math.round(r.reduce((a,x)=>a+(x.report.overallScore||0),0)/r.length):0}</strong></div><div class="metric">Review Flags<strong>${r.filter(x=>x.alerts.length>=2).length}</strong></div></div><div class="card" style="margin-top:18px"><h2>Reports</h2>${r.length?`<table class="table"><tr><th>Candidate</th><th>Subject</th><th>Score</th><th>Alerts</th><th></th></tr>${r.map(x=>`<tr><td>${esc(x.candidate.name)}</td><td>${esc(x.candidate.subject)}</td><td>${esc(x.report.overallScore)}/100</td><td>${x.alerts.length}</td><td><button class="btn secondary" onclick="view(${x.id})">View</button></td></tr>`).join("")}</table>`:`<p class="muted">No completed interviews.</p>`}</div></main>`}
function view(id){const x=JSON.parse(localStorage.getItem("reports")||"[]").find(v=>v.id===id);if(!x)return;app.innerHTML=nav("Interview Report")+`<main class="container"><div class="card"><button class="btn" onclick="dashboard()">← Back</button><h2>${esc(x.candidate.name)}</h2><p class="muted">${esc(x.candidate.email)} • ${esc(x.candidate.subject)}</p><div class="metric-grid"><div class="metric">Score<strong>${esc(x.report.overallScore)}/100</strong></div><div class="metric">Alerts<strong>${x.alerts.length}</strong></div></div><h3>AI Summary</h3><p>${esc(x.report.summary)}</p><h3>Monitoring Events</h3>${x.alerts.length?x.alerts.map(a=>`<div class="alert">${esc(a.message)} • ${esc(a.time)}</div>`).join(""):`<p class="muted">No alerts.</p>`}<h3>Answers</h3>${x.evaluations.map((e,i)=>`<div class="card" style="box-shadow:none;background:#f8fafc;margin:10px 0"><strong>Q${i+1}. ${esc(e.question)}</strong><p><b>Answer:</b> ${esc(e.answer)}</p><p><b>Score:</b> ${esc(e.score)}/100</p><p>${esc(e.feedback)}</p></div>`).join("")}</div></main>`}
home();