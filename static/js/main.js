// State variables
let activeTab = 'live';
let camStream = null;
let micStream = null;
let videoRecorder = null;
let audioRecorder = null;
let videoBlob = null;
let audioBlob = null;
let isMediaActive = false;
let timelineChart = null;

// Initialize Chart and Event Listeners when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    setupDropZone();
    loadHistory();
    
    // Wire up live control buttons
    document.getElementById('btn-camera').addEventListener('click', toggleCamera);
    document.getElementById('btn-record-mic').addEventListener('click', toggleMic);
    document.getElementById('btn-analyze').addEventListener('click', runLiveAnalysis);
    
    // Wire up upload controls
    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    document.getElementById('btn-upload-analyze').addEventListener('click', processUploadedFiles);
    
    // Breathing Guide
    document.getElementById('btn-breathing').addEventListener('click', toggleBreathingGuide);
});

// Tab Navigation
function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Set active
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.textContent.toLowerCase().includes(tabId === 'live' ? 'live' : 'file'));
    if (activeBtn) activeBtn.classList.add('active');
    document.getElementById(`${tabId}-tab`).classList.add('active');
}

// Camera Toggle
async function toggleCamera() {
    const video = document.getElementById('webcam');
    const overlay = document.getElementById('camera-overlay');
    const camBtn = document.getElementById('btn-camera');
    const micBtn = document.getElementById('btn-record-mic');
    
    if (camStream) {
        // Stop Camera
        camStream.getTracks().forEach(track => track.stop());
        camStream = null;
        video.srcObject = null;
        video.classList.add('placeholder-bg');
        overlay.classList.remove('hidden');
        camBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Start Cam';
        micBtn.disabled = true;
        document.getElementById('btn-analyze').disabled = true;
        isMediaActive = false;
    } else {
        try {
            updateStatus('Requesting webcam permission...', 'info');
            camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
            video.srcObject = camStream;
            video.classList.remove('placeholder-bg');
            overlay.classList.add('hidden');
            camBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i> Stop Cam';
            micBtn.disabled = false;
            isMediaActive = true;
            updateStatus('Webcam active. Click "Record Voice" to set up audio recording.', 'success');
        } catch (err) {
            console.error('Camera access error:', err);
            updateStatus('Camera permission denied or not found.', 'error');
        }
    }
}

// Microphone / Voice capture setup
async function toggleMic() {
    const micBtn = document.getElementById('btn-record-mic');
    const micText = document.getElementById('mic-text');
    const micWave = document.getElementById('mic-wave');
    const analyzeBtn = document.getElementById('btn-analyze');
    
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
        micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Record Voice';
        micText.innerHTML = '<i class="fa-solid fa-microphone-slash"></i> Microphone idle';
        micWave.classList.remove('active');
        analyzeBtn.disabled = true;
    } else {
        try {
            updateStatus('Requesting microphone permission...', 'info');
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micBtn.innerHTML = '<i class="fa-solid fa-microphone-lines-slash"></i> Release Mic';
            micText.innerHTML = '<i class="fa-solid fa-microphone"></i> Microphone active';
            micWave.classList.add('active');
            analyzeBtn.disabled = false;
            updateStatus('System configured. Click "Run Analysis" to perform stress test.', 'success');
        } catch (err) {
            console.error('Microphone access error:', err);
            updateStatus('Microphone permission denied or not found.', 'error');
        }
    }
}

// Run Live Multimodal Recording and Analysis (3-second capture)
function runLiveAnalysis() {
    if (!camStream || !micStream) {
        updateStatus('Both camera and microphone must be enabled.', 'error');
        return;
    }
    
    const analyzeBtn = document.getElementById('btn-analyze');
    const scanLine = document.getElementById('scanning-line');
    
    analyzeBtn.disabled = true;
    scanLine.classList.remove('hidden');
    
    // Set up recorders
    videoChunks = [];
    audioChunks = [];
    
    videoRecorder = new MediaRecorder(camStream, { mimeType: 'video/webm' });
    audioRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });
    
    videoRecorder.ondataavailable = e => { if (e.data.size > 0) videoChunks.push(e.data); };
    audioRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    
    // Handle saving recording on stop
    let stopCount = 0;
    const handleStop = async () => {
        stopCount++;
        if (stopCount === 2) {
            // Both video and audio have stopped recording
            videoBlob = new Blob(videoChunks, { type: 'video/webm' });
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            updateStatus('Recording finished. Analyzing stress parameters...', 'info');
            
            // Upload chunks
            await submitMultimodal(videoBlob, audioBlob);
            
            // Re-enable
            analyzeBtn.disabled = false;
            scanLine.classList.add('hidden');
        }
    };
    
    videoRecorder.onstop = handleStop;
    audioRecorder.onstop = handleStop;
    
    // Start Recording
    videoRecorder.start();
    audioRecorder.start();
    
    // 3-second countdown
    let secondsLeft = 3;
    updateStatus(`Recording visual and voice patterns... ${secondsLeft}s`, 'info');
    
    const countdown = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
            updateStatus(`Recording visual and voice patterns... ${secondsLeft}s`, 'info');
        } else {
            clearInterval(countdown);
            videoRecorder.stop();
            audioRecorder.stop();
        }
    }, 1000);
}

// Submit Recordings to Flask Backend
async function submitMultimodal(videoFile, audioFile) {
    const formData = new FormData();
    if (videoFile) formData.append('video', videoFile, 'live_video.webm');
    if (audioFile) formData.append('audio', audioFile, 'live_audio.webm');
    
    try {
        const response = await fetch('/api/analyze-multimodal', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (data.success) {
            updateUI(data);
            updateStatus('Analysis complete. Stress levels evaluated successfully.', 'success');
        } else {
            updateStatus(`Analysis failed: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error(err);
        updateStatus('Network connection error during analysis.', 'error');
    }
}

// Update the diagnostics panel UI
function updateUI(data) {
    const fusion = data.fusion;
    
    // Update main gauge
    const stressPercent = Math.round(fusion.fused_stress_score * 100);
    document.getElementById('stress-percentage').textContent = `${stressPercent}%`;
    
    const labelElem = document.getElementById('stress-label');
    labelElem.textContent = fusion.stress_level;
    
    // Color categorization
    const fillRing = document.getElementById('stress-gauge');
    // Calculate strokeDashoffset (circumference is 251.2)
    const offset = 251.2 - (251.2 * fusion.fused_stress_score);
    fillRing.style.strokeDashoffset = offset;
    
    let colorVar = 'var(--relaxed-color)';
    if (fusion.stress_level === 'Mild Stress') {
        colorVar = 'var(--mild-stress-color)';
        labelElem.style.color = 'var(--mild-stress-color)';
    } else if (fusion.stress_level === 'Highly Stressed') {
        colorVar = 'var(--high-stress-color)';
        labelElem.style.color = 'var(--high-stress-color)';
        // Alert trigger
        triggerDeStressAlert();
    } else {
        labelElem.style.color = 'var(--relaxed-color)';
    }
    fillRing.style.stroke = colorVar;
    
    // Update face sub-bar
    const faceScoreBar = document.getElementById('face-score-bar');
    const faceScoreVal = document.getElementById('face-score-val');
    const faceEmotionTxt = document.getElementById('face-emotion-txt');
    
    if (fusion.face_score !== null) {
        const facePercent = Math.round(fusion.face_score * 100);
        faceScoreBar.style.width = `${facePercent}%`;
        faceScoreVal.textContent = `${facePercent}%`;
        faceEmotionTxt.textContent = fusion.face_emotion ? fusion.face_emotion.toUpperCase() : 'NEUTRAL';
    } else {
        faceScoreBar.style.width = '0%';
        faceScoreVal.textContent = 'N/A';
        faceEmotionTxt.textContent = 'NO FACE';
    }
    
    // Update voice sub-bar
    const voiceScoreBar = document.getElementById('voice-score-bar');
    const voiceScoreVal = document.getElementById('voice-score-val');
    
    if (fusion.voice_score !== null) {
        const voicePercent = Math.round(fusion.voice_score * 100);
        voiceScoreBar.style.width = `${voicePercent}%`;
        voiceScoreVal.textContent = `${voicePercent}%`;
    } else {
        voiceScoreBar.style.width = '0%';
        voiceScoreVal.textContent = 'N/A';
    }
    
    // Description update
    document.getElementById('stress-description').innerHTML = `
        <strong>Fusion Modality:</strong> ${fusion.modality_used.replace('_', ' ').toUpperCase()}<br>
        <strong>Diagnostic Log:</strong> ${fusion.description}
    `;
    
    document.getElementById('diagnostics-status').textContent = 'Live Diagnostic Updated';
    
    // Refresh history chart
    if (data.history) {
        updateChartData(data.history);
    }
}

// Flash background or trigger alert if stress is high
function triggerDeStressAlert() {
    const desc = document.getElementById('stress-description');
    desc.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    desc.style.background = 'rgba(239, 68, 68, 0.05)';
    setTimeout(() => {
        desc.style.border = '1px solid var(--border-color)';
        desc.style.background = 'rgba(0, 0, 0, 0.15)';
    }, 1500);
}

// Drag & Drop Upload
let uploadedFiles = [];
function setupDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary-cyan)';
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        if (e.dataTransfer.files.length > 0) {
            addSelectedFiles(e.dataTransfer.files);
        }
    });
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        addSelectedFiles(e.target.files);
    }
}

function addSelectedFiles(filesList) {
    const listContainer = document.getElementById('selected-files');
    const uploadBtn = document.getElementById('btn-upload-analyze');
    
    for (let file of filesList) {
        // Prevent duplicate additions
        if (uploadedFiles.some(f => f.name === file.name)) continue;
        
        uploadedFiles.push(file);
        
        const isVideo = file.type.startsWith('video/');
        const iconClass = isVideo ? 'fa-regular fa-file-video' : 'fa-regular fa-file-audio';
        const typeClass = isVideo ? 'video-type' : 'audio-type';
        
        const fileCard = document.createElement('div');
        fileCard.className = `file-card ${typeClass}`;
        fileCard.innerHTML = `
            <span><i class="${iconClass}"></i> ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
            <i class="fa-solid fa-trash-can" onclick="removeUploadedFile('${file.name}')"></i>
        `;
        listContainer.appendChild(fileCard);
    }
    
    uploadBtn.disabled = uploadedFiles.length === 0;
}

function removeUploadedFile(fileName) {
    uploadedFiles = uploadedFiles.filter(f => f.name !== fileName);
    renderSelectedFiles();
    document.getElementById('btn-upload-analyze').disabled = uploadedFiles.length === 0;
}

function renderSelectedFiles() {
    const listContainer = document.getElementById('selected-files');
    listContainer.innerHTML = '';
    
    uploadedFiles.forEach(file => {
        const isVideo = file.type.startsWith('video/');
        const iconClass = isVideo ? 'fa-regular fa-file-video' : 'fa-regular fa-file-audio';
        const typeClass = isVideo ? 'video-type' : 'audio-type';
        
        const fileCard = document.createElement('div');
        fileCard.className = `file-card ${typeClass}`;
        fileCard.innerHTML = `
            <span><i class="${iconClass}"></i> ${file.name}</span>
            <i class="fa-solid fa-trash-can" onclick="removeUploadedFile('${file.name}')"></i>
        `;
        listContainer.appendChild(fileCard);
    });
}

// Upload and process files on backend
async function processUploadedFiles() {
    if (uploadedFiles.length === 0) return;
    
    const uploadBtn = document.getElementById('btn-upload-analyze');
    uploadBtn.disabled = true;
    updateStatus('Uploading and processing assets...', 'info');
    
    const formData = new FormData();
    
    // Group files by type (first video and first audio)
    const videoFile = uploadedFiles.find(f => f.type.startsWith('video/'));
    const audioFile = uploadedFiles.find(f => f.type.startsWith('audio/'));
    
    if (videoFile) formData.append('video', videoFile);
    if (audioFile) formData.append('audio', audioFile);
    
    try {
        let endpoint = '/api/analyze-multimodal';
        if (videoFile && !audioFile) endpoint = '/api/analyze-video';
        if (audioFile && !videoFile) endpoint = '/api/analyze-audio';
        
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (data.success) {
            updateUI(data);
            updateStatus('File parsing complete. Report updated.', 'success');
            // Clear selections
            uploadedFiles = [];
            renderSelectedFiles();
        } else {
            updateStatus(`Processing failed: ${data.error}`, 'error');
            uploadBtn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        updateStatus('Network exception during file upload.', 'error');
        uploadBtn.disabled = false;
    }
}

// Chart.js Timeline Configuration
function initChart() {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    
    // Set custom grid styles for dark aesthetic
    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Fused Stress Score (%)',
                    borderColor: '#06b6d4',
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#06b6d4',
                    pointHoverRadius: 6,
                    tension: 0.35,
                    fill: true,
                    backgroundColor: 'rgba(6, 182, 212, 0.08)',
                    data: []
                },
                {
                    label: 'Face Score (%)',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.35,
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Outfit', size: 10 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

function updateChartData(history) {
    if (!timelineChart) return;
    
    const labels = history.map(item => item.timestamp);
    const fusedData = history.map(item => item.fused_score);
    const faceData = history.map(item => item.face_score !== null ? item.face_score : null);
    
    timelineChart.data.labels = labels;
    timelineChart.data.datasets[0].data = fusedData;
    timelineChart.data.datasets[1].data = faceData;
    timelineChart.update();
}

async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        if (data.success && data.history.length > 0) {
            updateChartData(data.history);
        }
    } catch (err) {
        console.warn('Failed to load logs history:', err);
    }
}

async function resetHistory() {
    try {
        await fetch('/api/reset-history', { method: 'POST' });
        if (timelineChart) {
            timelineChart.data.labels = [];
            timelineChart.data.datasets[0].data = [];
            timelineChart.data.datasets[1].data = [];
            timelineChart.update();
        }
        updateStatus('Timeline metrics reset.', 'info');
    } catch (err) {
        console.error('History reset failed:', err);
    }
}

// Grounding breathing script (Box Breathing 4-4-4-4)
let breathingActive = false;
let breathingInterval = null;

function toggleBreathingGuide() {
    const btn = document.getElementById('btn-breathing');
    const circle = document.getElementById('breath-circle');
    const instruction = document.getElementById('breath-instruction');
    
    if (breathingActive) {
        // Stop
        clearInterval(breathingInterval);
        breathingInterval = null;
        breathingActive = false;
        btn.textContent = 'Start Breathing Guide';
        btn.className = 'btn btn-secondary btn-small';
        circle.className = 'breathing-circle';
        instruction.textContent = 'Click Start to Breathe';
    } else {
        // Start
        breathingActive = true;
        btn.textContent = 'Stop Guide';
        btn.className = 'btn btn-primary btn-small';
        runBreathingSequence();
    }
}

function runBreathingSequence() {
    const circle = document.getElementById('breath-circle');
    const instruction = document.getElementById('breath-instruction');
    
    let step = 0; // 0: inhale, 1: hold, 2: exhale, 3: hold
    
    const steps = [
        { class: 'inhale', text: 'Inhale...' },
        { class: 'hold', text: 'Hold...' },
        { class: 'exhale', text: 'Exhale...' },
        { class: 'hold', text: 'Hold...' }
    ];
    
    const cycle = () => {
        const current = steps[step];
        circle.className = `breathing-circle ${current.class}`;
        instruction.textContent = current.text;
        step = (step + 1) % 4;
    };
    
    cycle(); // Run immediately
    breathingInterval = setInterval(cycle, 4000); // Repeat every 4s
}

// Utility message console
function updateStatus(text, type = 'info') {
    const statusElem = document.getElementById('status-message');
    statusElem.textContent = text;
    
    statusElem.style.color = 'var(--text-secondary)';
    if (type === 'success') {
        statusElem.style.color = 'var(--relaxed-color)';
    } else if (type === 'error') {
        statusElem.style.color = 'var(--high-stress-color)';
    } else if (type === 'info') {
        statusElem.style.color = 'var(--primary-cyan)';
    }
}
