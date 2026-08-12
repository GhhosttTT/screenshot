const preview = document.getElementById("preview");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const timer = document.getElementById("timer");
const state = document.getElementById("state");
const message = document.getElementById("message");

const params = new URLSearchParams(location.search);
const streamId = params.get("streamId");
const includeAudio = params.get("audio") === "1";

let recorder;
let stream;
let chunks = [];
let timerId;
let audioContext;

function setMessage(text) {
  message.textContent = text;
}

function setState(text) {
  state.textContent = text;
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startTimer() {
  const startedAt = Date.now();
  timerId = setInterval(() => {
    timer.textContent = formatElapsed(Date.now() - startedAt);
  }, 250);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = undefined;
}

function getSupportedMimeType() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function filename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `tab-recording-${stamp}.webm`;
}

async function closeAudioContext() {
  if (audioContext && audioContext.state !== "closed") {
    await audioContext.close();
  }
  audioContext = undefined;
}

async function startRecording() {
  if (!streamId) {
    throw new Error("Missing media stream id.");
  }

  setState("Requesting media stream");
  setMessage("The browser is capturing the selected tab.");

  const mandatoryVideo = {
    chromeMediaSource: "tab",
    chromeMediaSourceId: streamId,
    maxWidth: 1920,
    maxHeight: 1080,
    maxFrameRate: 30
  };
  const mandatoryAudio = {
    chromeMediaSource: "tab",
    chromeMediaSourceId: streamId
  };

  stream = await navigator.mediaDevices.getUserMedia({
    video: { mandatory: mandatoryVideo },
    audio: includeAudio ? { mandatory: mandatoryAudio } : false
  });

  if (!stream) {
    throw new Error("Could not acquire tab media stream.");
  }

  if (includeAudio) {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);
  }

  preview.srcObject = stream;
  chunks = [];
  const mimeType = getSupportedMimeType();
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = async () => {
    stopTimer();
    stream.getTracks().forEach((track) => track.stop());
    await closeAudioContext();
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: filename(),
      saveAs: true
    });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    startButton.disabled = false;
    stopButton.disabled = true;
    setState("Saved");
    setMessage("The recording is ready. Confirm the browser download dialog to save it.");
  };

  recorder.start(1000);
  startTimer();
  startButton.disabled = true;
  stopButton.disabled = false;
  setState("Recording");
  setMessage("Keep this recorder window open until you stop recording.");
}

startButton.addEventListener("click", async () => {
  try {
    await startRecording();
  } catch (error) {
    startButton.disabled = false;
    stopButton.disabled = true;
    setState("Start failed");
    setMessage(error.message || "Recording failed to start.");
  }
});

stopButton.addEventListener("click", () => {
  if (recorder && recorder.state !== "inactive") {
    setState("Saving");
    setMessage("Preparing video data.");
    recorder.stop();
  }
});

window.addEventListener("beforeunload", () => {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  closeAudioContext();
});
