import os
import uuid
import datetime
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from stress_detector import MultimodalFusionDetector

app = Flask(__name__, static_folder='static', template_folder='templates')

# Create uploads folder for processing temporary clips
UPLOAD_FOLDER = 'temp_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Load the fusion detector
detector = MultimodalFusionDetector()

# In-memory store for session metrics to plot live graphs
analysis_history = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze-video', methods=['POST'])
def analyze_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
        
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
        
    filename = secure_filename(f"video_{uuid.uuid4().hex}_{file.filename}")
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filepath_safe(filename))
    file.save(filepath)
    
    try:
        face_result = detector.face_detector.analyze_video_file(filepath)
        fusion_result = detector.fuse_predictions(face_result, None)
        
        # Log to history
        record_history(fusion_result)
        
        # Cleanup
        if os.path.exists(filepath):
            os.remove(filepath)
            
        return jsonify({
            'success': True,
            'face_analysis': face_result,
            'fusion': fusion_result,
            'history': analysis_history[-10:]
        })
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-audio', methods=['POST'])
def analyze_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
        
    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
        
    filename = secure_filename(f"audio_{uuid.uuid4().hex}_{file.filename}")
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filepath_safe(filename))
    file.save(filepath)
    
    try:
        voice_result = detector.voice_detector.analyze_audio_file(filepath)
        fusion_result = detector.fuse_predictions(None, voice_result)
        
        # Log to history
        record_history(fusion_result)
        
        # Cleanup
        if os.path.exists(filepath):
            os.remove(filepath)
            
        return jsonify({
            'success': True,
            'voice_analysis': voice_result,
            'fusion': fusion_result,
            'history': analysis_history[-10:]
        })
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-multimodal', methods=['POST'])
def analyze_multimodal():
    has_video = 'video' in request.files
    has_audio = 'audio' in request.files
    
    if not has_video and not has_audio:
        return jsonify({'error': 'At least one video or audio stream is required'}), 400
        
    video_filepath = None
    audio_filepath = None
    
    try:
        face_result = None
        if has_video:
            video_file = request.files['video']
            if video_file.filename != '':
                video_filename = secure_filename(f"video_{uuid.uuid4().hex}_{video_file.filename}")
                video_filepath = os.path.join(app.config['UPLOAD_FOLDER'], filepath_safe(video_filename))
                video_file.save(video_filepath)
                face_result = detector.face_detector.analyze_video_file(video_filepath)
                
        voice_result = None
        if has_audio:
            audio_file = request.files['audio']
            if audio_file.filename != '':
                audio_filename = secure_filename(f"audio_{uuid.uuid4().hex}_{audio_file.filename}")
                audio_filepath = os.path.join(app.config['UPLOAD_FOLDER'], filepath_safe(audio_filename))
                audio_file.save(audio_filepath)
                voice_result = detector.voice_detector.analyze_audio_file(audio_filepath)
                
        # Combine
        fusion_result = detector.fuse_predictions(face_result, voice_result)
        
        # Log to history
        record_history(fusion_result)
        
        # Cleanup
        if video_filepath and os.path.exists(video_filepath):
            os.remove(video_filepath)
        if audio_filepath and os.path.exists(audio_filepath):
            os.remove(audio_filepath)
            
        return jsonify({
            'success': True,
            'face_analysis': face_result,
            'voice_analysis': voice_result,
            'fusion': fusion_result,
            'history': analysis_history[-10:]
        })
    except Exception as e:
        if video_filepath and os.path.exists(video_filepath):
            os.remove(video_filepath)
        if audio_filepath and os.path.exists(audio_filepath):
            os.remove(audio_filepath)
        return jsonify({'error': str(e)}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    return jsonify({
        'success': True,
        'history': analysis_history[-10:]
    })

@app.route('/api/reset-history', methods=['POST'])
def reset_history():
    global analysis_history
    analysis_history = []
    return jsonify({'success': True})

def filepath_safe(name):
    # sanitize characters that secure_filename might keep but could cause directory issues
    return name.replace(" ", "_")

def record_history(fusion_result):
    global analysis_history
    # Log records with dynamic percentages
    history_item = {
        'timestamp': datetime.datetime.now().strftime('%H:%M:%S'),
        'face_score': round(fusion_result['face_score'] * 100, 1) if fusion_result.get('face_score') is not None else None,
        'voice_score': round(fusion_result['voice_score'] * 100, 1) if fusion_result.get('voice_score') is not None else None,
        'fused_score': round(fusion_result['fused_stress_score'] * 100, 1),
        'emotion': (fusion_result.get('face_emotion') or 'neutral').capitalize(),
        'stress_level': fusion_result['stress_level']
    }
    analysis_history.append(history_item)

if __name__ == '__main__':
    app.run(debug=True, port=8080)
