let handLandmarker = undefined;
let lastVideoTime = -1;

// --- PHASE 4 & 5 STATE MANAGEMENT ---
let isDrawing = false;
let isEraserMode = false; // Tracks if we are currently erasing instead of drawing
let drawings = [];
let currentLine = [];
let currentColor = "#00ffcc";

// --- PHASE 5 UI CONFIGURATION ---
// We add an Eraser button and a Snapshot button with explicit coordinates
const UI_BUTTONS = [
  { name: "cyan", x: 60, y: 50, radius: 25, color: "#00ffcc", type: "color" },
  {
    name: "purple",
    x: 130,
    y: 50,
    radius: 25,
    color: "#ff00ff",
    type: "color",
  },
  {
    name: "yellow",
    x: 200,
    y: 50,
    radius: 25,
    color: "#ffff00",
    type: "color",
  },
  {
    name: "eraser",
    x: 290,
    y: 50,
    radius: 25,
    color: "#ffffff",
    type: "action",
    label: "🧼",
  },
  {
    name: "camera",
    x: 380,
    y: 50,
    radius: 25,
    color: "#ff3366",
    type: "action",
    label: "📸",
  },
];

// Anti-bounce flag to prevent the camera snapshot from triggering 60 times in one second
let isSnapshotCooldown = false;

// Import the official MediaPipe classes directly using ESM modules
import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/vision_bundle.mjs";

const video = document.getElementById("webcam");
const canvas = document.getElementById("output-canvas");
const ctx = canvas.getContext("2d");

// Initialize the MediaPipe Hand Landmarker Machine Learning Model
async function initializeHandDetector() {
  try {
    // Resolve the web assembly components smoothly from the CDN paths
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm",
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });

    console.log("MediaPipe ML Model loaded successfully via ESM! 🎉");
    initWebcam();
  } catch (error) {
    console.error("Error initializing MediaPipe:", error);
  }
}

// Initialize the Webcam Stream
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60 },
      },
      audio: false,
    });

    video.srcObject = stream;

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      renderLoop();
    };
  } catch (error) {
    console.error("Error accessing the webcam: ", error);
    alert("Could not access your webcam. Please allow camera permissions.");
  }
}

// High-Performance Rendering Heartbeat Loop (60 FPS)
function renderLoop() {
  // 1. Clear the canvas overlay on every frame tick
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. Draw the background live video stream frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 3. Render our UI interface control circles
  drawInterface();

  // 4. ALWAYS DRAW YOUR HISTORICAL DATA (Moved here to prevent disappearing/flickering)
  // Draw completed lines from history
  for (let line of drawings) {
    drawStroke(line.points, line.color);
  }
  // Draw the live line currently tracking your active movement
  if (isDrawing && currentLine.length > 0) {
    drawStroke(currentLine, currentColor);
  }

  // 5. Run machine learning inference ONLY if the frame has a hand
  if (handLandmarker && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    const startTimeMs = performance.now();
    const detections = handLandmarker.detectForVideo(video, startTimeMs);

    if (detections.landmarks && detections.landmarks.length > 0) {
      const handPoints = detections.landmarks[0];

      const thumbTip = handPoints[4]; // Landmark 4: Thumb Tip
      const indexTip = handPoints[8]; // Landmark 8: Index Tip

      // Convert index tip coordinates to actual screen pixels
      const pixelX = indexTip.x * canvas.width;
      const pixelY = indexTip.y * canvas.height;

      // Virtual Button Hover & Action Execution Engine
      for (let button of UI_BUTTONS) {
        const distToButton = Math.sqrt(
          Math.pow(pixelX - button.x, 2) + Math.pow(pixelY - button.y, 2),
        );

        if (distToButton < button.radius) {
          if (button.type === "color") {
            isEraserMode = false; // Turn off eraser if a color is picked
            currentColor = button.color;
          } else if (button.name === "eraser") {
            isEraserMode = true;
          } else if (button.name === "camera" && !isSnapshotCooldown) {
            triggerCameraSnapshot();
          }
        }
      }

      // Calculate 3D Euclidean Distance between Thumb and Index Tip
      const distance = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) +
          Math.pow(indexTip.y - thumbTip.y, 2) +
          Math.pow(indexTip.z - thumbTip.z, 2),
      );

      const PINCH_THRESHOLD = 0.08;

      if (distance < PINCH_THRESHOLD) {
        if (isEraserMode) {
          // If eraser mode is on, wipe lines instead of adding them
          executeEraser(pixelX, pixelY);
        } else {
          // Normal drawing code
          if (!isDrawing) {
            isDrawing = true;
            currentLine = [];
          }
          currentLine.push({ x: pixelX, y: pixelY });
        }
      } else {
        // (Keep your normal open-hand line lifting code exactly the same here)
        if (isDrawing) {
          if (currentLine.length > 0) {
            drawings.push({ points: currentLine, color: currentColor });
          }
          isDrawing = false;
          currentLine = [];
        }
      }

      // Draw Cursor Dot over the active finger position
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, 12, 0, 2 * Math.PI);
      ctx.fillStyle = isDrawing ? "#ff0055" : "#00ffcc";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Keep the heartbeat loop ticking smoothly
  requestAnimationFrame(renderLoop);
}

// Fire up the engine!
initializeHandDetector();

// Helper function to render a smooth line path from an array of coordinates
function drawStroke(points, color) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = "round"; // Smoothes the connecting segments
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawInterface() {
  for (let button of UI_BUTTONS) {
    ctx.beginPath();
    ctx.arc(button.x, button.y, button.radius, 0, 2 * Math.PI);
    ctx.fillStyle = button.color;
    ctx.fill();

    // Highlight active state
    if (
      (button.type === "color" &&
        currentColor === button.color &&
        !isEraserMode) ||
      (button.name === "eraser" && isEraserMode)
    ) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
    }
    ctx.stroke();

    // Draw Emoji Icons for Action Buttons
    if (button.label) {
      ctx.fillStyle = "#121212";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(button.label, button.x, button.y);
    }
  }
}

// --- ERASER ENGINE ---
function executeEraser(px, py) {
  const ERASE_RADIUS = 40; // Pixels around your finger that get wiped out

  // Filter out any lines in our history that are too close to the eraser coordinate
  drawings = drawings.filter((line) => {
    // Keep the line only if ALL its points are outside the erase radius
    return !line.points.some((pt) => {
      const dist = Math.sqrt(Math.pow(pt.x - px, 2) + Math.pow(pt.y - py, 2));
      return dist < ERASE_RADIUS;
    });
  });
}

// --- SNAPSHOT ENGINE ---
function triggerCameraSnapshot() {
  isSnapshotCooldown = true;

  // Create a temporary downloding link element
  const link = document.createElement("a");
  link.download = `gesture-canvas-${Date.now()}.png`;

  // Convert the HTML5 Canvas pixel matrix directly into a base64 Data URL string
  link.href = canvas.toDataURL("image/png");
  link.click();

  // Set a 3-second cooldown before another picture can be taken
  setTimeout(() => {
    isSnapshotCooldown = false;
  }, 3000);
}
