// Constants and configuration
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const SIMILARITY_THRESHOLD = 0.65;

class GestureRecognizer {
    constructor() {
        this.initializeElements();
        this.initializeState();
        this.setupEventListeners();
    }

    initializeElements() {
        // Video and canvas elements
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output');
        this.ctx = this.canvas.getContext('2d');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        // Status elements
        this.modelStatus = document.getElementById('modelStatus');
        this.cameraStatus = document.getElementById('cameraStatus');
        
        // UI controls
        this.capturesList = document.getElementById('capturesList');
        this.predictionResult = document.getElementById('predictionResult');
        this.trainingModeBtn = document.getElementById('trainingModeBtn');
        this.inferenceModeBtn = document.getElementById('inferenceModeBtn');
        this.trainingControls = document.getElementById('trainingControls');
        this.inferenceControls = document.getElementById('inferenceControls');
        this.gestureInput = document.getElementById('gestureName');
        this.captureBtn = document.getElementById('captureBtn');
        this.clearBtn = document.getElementById('clearBtn');
        
        // Set initial canvas size
        this.canvas.width = VIDEO_WIDTH;
        this.canvas.height = VIDEO_HEIGHT;
    }

    initializeState() {
        this.model = null;
        this.gestures = new Map(); // Map of gesture name to landmarks
        this.inferenceActive = false;
        
        // Landmark indices for each finger
        this.fingerIndices = {
            thumb: [1, 2, 3, 4],
            index: [5, 6, 7, 8],
            middle: [9, 10, 11, 12],
            ring: [13, 14, 15, 16],
            pinky: [17, 18, 19, 20]
        };
    }

    setupEventListeners() {
        // Mode switching
        this.trainingModeBtn.addEventListener('click', () => this.setMode('training'));
        this.inferenceModeBtn.addEventListener('click', () => this.setMode('inference'));
        
        // Training controls
        this.captureBtn.addEventListener('click', () => this.captureSnapshot());
        this.clearBtn.addEventListener('click', () => this.clearGestures());
        
        // Input validation
        this.gestureInput.addEventListener('input', (e) => {
            this.captureBtn.disabled = !e.target.value.trim();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keypress', (e) => {
            if (e.code === 'Space' && !this.gestureInput.disabled) {
                e.preventDefault();
                this.captureSnapshot();
            }
        });
    }

    async initialize() {
        try {
            // Update camera status
            this.cameraStatus.textContent = 'Camera: Initializing...';
            this.modelStatus.textContent = 'Status: Loading model...';
            
            // Initialize video stream
            const stream = await navigator.mediaDevices.getUserMedia({
                'video': { 
                    width: VIDEO_WIDTH,
                    height: VIDEO_HEIGHT,
                    facingMode: 'user'
                }
            });
            this.video.srcObject = stream;
            await new Promise(resolve => this.video.onloadedmetadata = resolve);
            await this.video.play();
            
            this.cameraStatus.textContent = 'Camera: Active';

            // Load handpose model
            this.model = await handpose.load();
            console.log('Handpose model loaded');
            this.modelStatus.textContent = 'Status: Model Ready';
            
            // Hide loading overlay
            this.loadingOverlay.style.display = 'none';
            
            // Start detection loop
            this.startDetection();
            
            // Set initial mode
            this.setMode('training');
            
            return true;
        } catch (error) {
            console.error('Initialization error:', error);
            this.cameraStatus.textContent = 'Camera: Error';
            this.modelStatus.textContent = 'Status: Error';
            this.showError('Failed to initialize camera or model');
            return false;
        }
    }

    setMode(mode) {
        if (mode === 'training') {
            this.trainingModeBtn.classList.add('active');
            this.inferenceModeBtn.classList.remove('active');
            this.trainingControls.style.display = 'block';
            this.inferenceControls.style.display = 'none';
            this.stopInference();
        } else {
            this.trainingModeBtn.classList.remove('active');
            this.inferenceModeBtn.classList.add('active');
            this.trainingControls.style.display = 'none';
            this.inferenceControls.style.display = 'block';
            this.startInference();
        }
    }

    async startDetection() {
        const detectFrame = async () => {
            // Clear and draw video frame
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

            try {
                const predictions = await this.model.estimateHands(this.video);
                if (predictions.length > 0) {
                    const landmarks = predictions[0].landmarks;
                    this.drawHandLandmarks(landmarks);

                    if (this.inferenceActive) {
                        const match = this.findBestMatch(landmarks);
                        this.predictionResult.textContent = `Detected Gesture: ${match}`;
                    }
                } else if (this.inferenceActive) {
                    this.predictionResult.textContent = 'No hand detected';
                }
            } catch (error) {
                console.error('Detection error:', error);
            }

            requestAnimationFrame(detectFrame);
        };

        detectFrame();
    }

    drawHandLandmarks(landmarks) {
        // Draw joints
        this.ctx.fillStyle = '#FF0000';
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;

        for (let i = 0; i < landmarks.length; i++) {
            const [x, y] = landmarks[i];
            this.ctx.beginPath();
            this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();
        }

        // Connect fingers
        const fingers = [
            [0, 1, 2, 3, 4],          // thumb
            [0, 5, 6, 7, 8],          // index finger
            [0, 9, 10, 11, 12],       // middle finger
            [0, 13, 14, 15, 16],      // ring finger
            [0, 17, 18, 19, 20]       // pinky
        ];

        this.ctx.strokeStyle = '#FF0000';
        this.ctx.lineWidth = 2;

        fingers.forEach(finger => {
            for (let i = 1; i < finger.length; i++) {
                const [x1, y1] = landmarks[finger[i - 1]];
                const [x2, y2] = landmarks[finger[i]];
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            }
        });
    }

    normalizeHandLandmarks(landmarks) {
        // Get palm center (landmark 0)
        const palmCenter = landmarks[0];
        
        // Calculate bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        landmarks.forEach(point => {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
        });
        
        const width = maxX - minX;
        const height = maxY - minY;
        const scale = Math.max(width, height);

        // Normalize positions
        const normalizedLandmarks = landmarks.map(point => [
            (point[0] - palmCenter[0]) / scale,
            (point[1] - palmCenter[1]) / scale,
            (point[2] - palmCenter[2]) / scale
        ]);

        // Calculate features
        const features = [];

        // Add normalized positions
        features.push(...normalizedLandmarks.flat());

        // Add finger angles
        for (const indices of Object.values(this.fingerIndices)) {
            for (let i = 0; i < indices.length - 2; i++) {
                const angle = this.calculateAngle(
                    normalizedLandmarks[indices[i]],
                    normalizedLandmarks[indices[i + 1]],
                    normalizedLandmarks[indices[i + 2]]
                );
                features.push(angle);
            }
        }

        // Add distances between fingertips
        const fingerTips = [4, 8, 12, 16, 20];
        for (let i = 0; i < fingerTips.length; i++) {
            for (let j = i + 1; j < fingerTips.length; j++) {
                const distance = this.distance(
                    normalizedLandmarks[fingerTips[i]],
                    normalizedLandmarks[fingerTips[j]]
                );
                features.push(distance);
            }
        }

        return features;
    }

    distance(p1, p2) {
        return Math.sqrt(
            Math.pow(p2[0] - p1[0], 2) +
            Math.pow(p2[1] - p1[1], 2) +
            Math.pow(p2[2] - p1[2], 2)
        );
    }

    calculateAngle(p1, p2, p3) {
        const v1 = [
            p1[0] - p2[0],
            p1[1] - p2[1],
            p1[2] - p2[2]
        ];
        const v2 = [
            p3[0] - p2[0],
            p3[1] - p2[1],
            p3[2] - p2[2]
        ];

        const dotProduct = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
        const mag1 = Math.sqrt(v1[0]*v1[0] + v1[1]*v1[1] + v1[2]*v1[2]);
        const mag2 = Math.sqrt(v2[0]*v2[0] + v2[1]*v2[1] + v2[2]*v2[2]);
        
        return Math.acos(dotProduct / (mag1 * mag2));
    }

    async captureSnapshot() {
        const gestureName = this.gestureInput.value.trim();
        
        if (!gestureName) {
            this.showError('Please enter a gesture name');
            return;
        }

        try {
            const predictions = await this.model.estimateHands(this.video);
            if (predictions.length > 0) {
                const features = this.normalizeHandLandmarks(predictions[0].landmarks);
                this.gestures.set(gestureName, features);
                this.addCaptureToList(gestureName);
                this.gestureInput.value = '';
                this.captureBtn.disabled = true;
                this.showSuccess(`Captured gesture: ${gestureName}`);
            } else {
                this.showError('No hand detected! Please show your hand clearly.');
            }
        } catch (error) {
            console.error('Capture error:', error);
            this.showError('Failed to capture gesture');
        }
    }

    addCaptureToList(gestureName) {
        const item = document.createElement('div');
        item.className = 'capture-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = gestureName;
        item.appendChild(nameSpan);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => {
            this.gestures.delete(gestureName);
            item.remove();
        };
        item.appendChild(deleteBtn);
        
        this.capturesList.appendChild(item);
    }

    clearGestures() {
        this.gestures.clear();
        this.capturesList.innerHTML = '';
        this.showSuccess('All gestures cleared');
    }

    startInference() {
        if (this.gestures.size === 0) {
            this.showError('Please train some gestures first!');
            return;
        }
        this.inferenceActive = true;
    }

    stopInference() {
        this.inferenceActive = false;
        this.predictionResult.textContent = '';
    }

    calculateSimilarity(features1, features2) {
        if (features1.length !== features2.length) {
            console.error('Feature length mismatch:', features1.length, features2.length);
            return 0;
        }

        let totalDiff = 0;
        let maxDiff = 0;

        // Calculate weighted differences
        for (let i = 0; i < features1.length; i++) {
            const diff = Math.abs(features1[i] - features2[i]);
            // Give more weight to angle and distance features
            const weight = i >= features1.length - 20 ? 2 : 1;
            totalDiff += diff * weight;
            maxDiff += weight;
        }

        // Normalize similarity score
        return 1 - (totalDiff / maxDiff);
    }

    findBestMatch(currentLandmarks) {
        const currentFeatures = this.normalizeHandLandmarks(currentLandmarks);
        let bestMatch = 'Unknown';
        let highestSimilarity = 0;

        for (const [gestureName, gestureFeatures] of this.gestures.entries()) {
            const similarity = this.calculateSimilarity(currentFeatures, gestureFeatures);
            if (similarity > highestSimilarity && similarity > SIMILARITY_THRESHOLD) {
                highestSimilarity = similarity;
                bestMatch = gestureName;
            }
        }

        const confidence = Math.round(highestSimilarity * 100);
        return `${bestMatch} (${confidence}% confidence)`;
    }

    showError(message) {
        this.predictionResult.textContent = `Error: ${message}`;
        this.predictionResult.style.color = '#ff4444';
        setTimeout(() => {
            this.predictionResult.style.color = '';
            if (!this.inferenceActive) {
                this.predictionResult.textContent = '';
            }
        }, 3000);
    }

    showSuccess(message) {
        this.predictionResult.textContent = message;
        this.predictionResult.style.color = '#44ff44';
        setTimeout(() => {
            this.predictionResult.style.color = '';
            if (!this.inferenceActive) {
                this.predictionResult.textContent = '';
            }
        }, 3000);
    }
}

// Start the application
async function main() {
    const recognizer = new GestureRecognizer();
    if (!(await recognizer.initialize())) {
        document.body.innerHTML = `
            <div class="error-container">
                <h1>Error</h1>
                <p>Failed to initialize the gesture recognizer. Please make sure:</p>
                <ul>
                    <li>You have granted camera permissions</li>
                    <li>Your browser supports WebGL</li>
                    <li>You have a working webcam</li>
                </ul>
            </div>
        `;
    }
}

// Start when the page loads
window.addEventListener('load', main);
