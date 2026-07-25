let animationStarted = false;
let userNickname = "";
let map = null;
const markerInstances = {};

// ============================
// ANKARA KML GEOMETRY VERTICES
// ============================
const positions = {
    leftNode:  [32.845501, 39.921050], 
    rightNode: [32.858463, 39.923483], 
    mainNode:  [32.858746, 39.913890]  
};

const people = [
    { id: "leftNode", markerType: "grey-letter-dot", initial: "G" },
    { id: "rightNode", markerType: "grey-letter-dot", initial: "M" },
    { id: "mainNode", markerType: "blue-pulse-dot" }
];

function createMarkerElement(person) {
    const clusterEl = document.createElement("div");
    clusterEl.className = "marker-cluster";
    const agentEl = document.createElement("div");
    agentEl.className = "agent-node";

    if (person.markerType === "blue-pulse-dot") {
        const mapsDotContainer = document.createElement("div");
        mapsDotContainer.className = "google-maps-dot-container";
        const breathingPulse = document.createElement("div");
        breathingPulse.className = "google-maps-pulse";
        const solidCore = document.createElement("div");
        solidCore.className = "google-maps-core";
        mapsDotContainer.appendChild(breathingPulse);
        mapsDotContainer.appendChild(solidCore);
        agentEl.appendChild(mapsDotContainer);
        const labelEl = document.createElement("div");
        labelEl.className = "agent-label";
        labelEl.textContent = userNickname || "User";
        agentEl.appendChild(labelEl);
    } 
    else if (person.markerType === "grey-letter-dot") {
        const greyDot = document.createElement("div");
        greyDot.className = "experimental-grey-letter-dot";
        greyDot.textContent = person.initial;
        agentEl.appendChild(greyDot);
    }
    clusterEl.appendChild(agentEl);
    return clusterEl;
}

function initMarkers() {
    if (!map) return;
    people.forEach(person => {
        const marker = new maplibregl.Marker({ element: createMarkerElement(person), anchor: "center" })
        .setLngLat(positions[person.id])
        .addTo(map);
        markerInstances[person.id] = marker;
    });
}

// ============================
// TIMED LINEAR INTERPOLATION ENGINE
// ============================
const PRE_SEQUENCE_DURATION = 12 * 1000; // 12 seconds standardized neutral baseline phase
const PAUSE_DURATION = 4 * 1000;         // 4 seconds pause after baseline
const MOVE_DURATION = 12 * 1000;         // 12 seconds movement phase to come together
const POST_JOIN_DURATION = 12 * 1000;    // 12 seconds post-join small independent movements
// Total map procedure duration: 12 + 4 + 12 + 12 = 40 seconds
let startTime = null;

const startG = positions.leftNode;
const startM = positions.rightNode;
const startMain = positions.mainNode;

// Target calculations for meeting behavior
const midLng = (startG[0] + startM[0]) / 2;
const midLat = (startG[1] + startM[1]) / 2; 
const offsetPercent = 0.04; 
const deltaLng = startM[0] - startG[0];
const deltaLat = startM[1] - startG[1];

const targetG = [midLng - (deltaLng * offsetPercent), midLat - (deltaLat * offsetPercent)];
const targetM = [midLng + (deltaLng * offsetPercent), midLat + (deltaLat * offsetPercent)];

// Standardized neutral baseline parameters
const BASELINE_DRIFT_RADIUS = 0.0005; 

// Calculate exact coordinates at t = 12s to ensure seamless transitions without spatial snapping
const finalDriftG_X = Math.sin(PRE_SEQUENCE_DURATION / 1800) * BASELINE_DRIFT_RADIUS;
const finalDriftG_Y = Math.cos(PRE_SEQUENCE_DURATION / 2700) * (BASELINE_DRIFT_RADIUS * 0.8);
const finalDriftM_X = Math.cos(PRE_SEQUENCE_DURATION / 2200) * BASELINE_DRIFT_RADIUS;
const finalDriftM_Y = Math.sin(PRE_SEQUENCE_DURATION / 3100) * (BASELINE_DRIFT_RADIUS * 0.8);

const holdG_Lng = startG[0] + finalDriftG_X;
const holdG_Lat = startG[1] + finalDriftG_Y;
const holdM_Lng = startM[0] + finalDriftM_X;
const holdM_Lat = startM[1] + finalDriftM_Y;

function animateNodes(timestamp) {
    if (!animationStarted) return;
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    let currentG_Lng = startG[0]; let currentG_Lat = startG[1];
    let currentM_Lng = startM[0]; let currentM_Lat = startM[1];

    if (elapsed < PRE_SEQUENCE_DURATION) {
        // =========================================================================
        // PHASE 1: STANDARDIZED NEUTRAL BASELINE PHASE (0 - 12 Seconds)
        // =========================================================================
        const driftG_X = Math.sin(elapsed / 1800) * BASELINE_DRIFT_RADIUS;
        const driftG_Y = Math.cos(elapsed / 2700) * (BASELINE_DRIFT_RADIUS * 0.8);
        const driftM_X = Math.cos(elapsed / 2200) * BASELINE_DRIFT_RADIUS;
        const driftM_Y = Math.sin(elapsed / 3100) * (BASELINE_DRIFT_RADIUS * 0.8);

        currentG_Lng = startG[0] + driftG_X;
        currentG_Lat = startG[1] + driftG_Y;
        currentM_Lng = startM[0] + driftM_X;
        currentM_Lat = startM[1] + driftM_Y;

    } else if (elapsed < (PRE_SEQUENCE_DURATION + PAUSE_DURATION)) {
        // =========================================================================
        // PHASE 2: PAUSE / WAITING PHASE (12 - 16 Seconds)
        // =========================================================================
        // Hold at the exact final baseline position during the pause window
        currentG_Lng = holdG_Lng;
        currentG_Lat = holdG_Lat;
        currentM_Lng = holdM_Lng;
        currentM_Lat = holdM_Lat;

    } else if (elapsed < (PRE_SEQUENCE_DURATION + PAUSE_DURATION + MOVE_DURATION)) {
        // =========================================================================
        // PHASE 3: MOVEMENT PHASE TO COME TOGETHER (16 - 28 Seconds)
        // =========================================================================
        const moveElapsed = elapsed - (PRE_SEQUENCE_DURATION + PAUSE_DURATION);
        const progress = Math.min(moveElapsed / MOVE_DURATION, 1);
        
        currentG_Lng = holdG_Lng + (targetG[0] - holdG_Lng) * progress;
        currentG_Lat = holdG_Lat + (targetG[1] - holdG_Lat) * progress;
        currentM_Lng = holdM_Lng + (targetM[0] - holdM_Lng) * progress;
        currentM_Lat = holdM_Lat + (targetM[1] - holdM_Lat) * progress;

    } else {
        // =========================================================================
        // PHASE 4: POST-JOIN SMALL INDEPENDENT MOVEMENTS (28 - 40 Seconds)
        // =========================================================================
        // Agents maintain proximity at their final target coordinates while performing small local drifts
        const postJoinElapsed = elapsed - (PRE_SEQUENCE_DURATION + PAUSE_DURATION + MOVE_DURATION);
        const postDriftG_X = Math.sin(postJoinElapsed / 1500) * (BASELINE_DRIFT_RADIUS * 0.6);
        const postDriftG_Y = Math.cos(postJoinElapsed / 2000) * (BASELINE_DRIFT_RADIUS * 0.6);
        const postDriftM_X = Math.cos(postJoinElapsed / 1700) * (BASELINE_DRIFT_RADIUS * 0.6);
        const postDriftM_Y = Math.sin(postJoinElapsed / 2300) * (BASELINE_DRIFT_RADIUS * 0.6);

        currentG_Lng = targetG[0] + postDriftG_X;
        currentG_Lat = targetG[1] + postDriftG_Y;
        currentM_Lng = targetM[0] + postDriftM_X;
        currentM_Lat = targetM[1] + postDriftM_Y;
    }

    if (markerInstances["leftNode"]) markerInstances["leftNode"].setLngLat([currentG_Lng, currentG_Lat]);
    if (markerInstances["rightNode"]) markerInstances["rightNode"].setLngLat([currentM_Lng, currentM_Lng ? currentM_Lat : targetM[1]]); // Safely updating coordinates
    if (markerInstances["rightNode"]) markerInstances["rightNode"].setLngLat([currentM_Lng, currentM_Lat]);
    
    // Continue loop until total 40-second duration finishes
    if (elapsed < (PRE_SEQUENCE_DURATION + PAUSE_DURATION + MOVE_DURATION + POST_JOIN_DURATION)) {
        requestAnimationFrame(animateNodes);
    } else {
        setTimeout(() => {
            if (window.parent) {
                window.parent.postMessage("mapAnimationFinished", "*");
            }
        }, 1000); 
    }
}

const flowScreen = document.getElementById("experiment-flow-screen");
const stepConnecting = document.getElementById("step-connecting");
const stepWaiting = document.getElementById("step-waiting");
const stepJoined = document.getElementById("step-joined");
const stepNickname = document.getElementById("step-nickname");
const nicknameInput = document.getElementById("nickname-input");
const submitBtn = document.getElementById("submit-btn");

function startExperimentFlow() {
    setTimeout(() => {
        if (stepConnecting) stepConnecting.classList.add("hidden");
        if (stepWaiting) stepWaiting.classList.remove("hidden");
        setTimeout(() => {
            if (stepWaiting) stepWaiting.classList.add("hidden");
            if (stepJoined) stepJoined.classList.remove("hidden");
            setTimeout(() => {
                if (stepJoined) stepJoined.classList.add("hidden");
                if (stepNickname) stepNickname.classList.remove("hidden");
                if (nicknameInput) nicknameInput.focus();
            }, 3000);
        }, 5000);
    }, 3000);
}

function handleLoginSubmit() {
    const val = nicknameInput ? nicknameInput.value.trim() : "User";
    if (val === "") { alert("Please enter a valid nickname."); return; }
    userNickname = val;
    if (flowScreen) {
        flowScreen.style.opacity = "0";
        flowScreen.style.transform = "scale(0.95)";
    }
    setTimeout(() => {
        if (flowScreen) flowScreen.style.display = "none";
        initMarkers();
        animationStarted = true;
        requestAnimationFrame(animateNodes);
    }, 500);
}
if (submitBtn) submitBtn.addEventListener("click", handleLoginSubmit);
if (nicknameInput) {
    nicknameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleLoginSubmit(); });
}

startExperimentFlow();

try {
    if (typeof maplibregl !== 'undefined') {
        map = new maplibregl.Map({
            container: 'map',
            style: 'https://tiles.openfreemap.org/styles/liberty',
            center: [32.8540, 39.9195], 
            zoom: 13.6,                
            minZoom: 13.6,             
            maxZoom: 13.6,             
            dragPan: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoomRotate: false,    
            pixelRatio: window.devicePixelRatio || 2 
        });

        map.on('load', () => {
            map.getCanvas().style.filter = 'grayscale(0.6) contrast(1.1) brightness(0.95) hue-rotate(25deg)';
        });
    }
} catch (e) {
    console.error("Map library loading error:", e);
}