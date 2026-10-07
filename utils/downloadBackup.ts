const DOWNLOAD_PREFIX = "conversation-backup";

export function saveAudioBackup(blob: Blob, conversationId?: string) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const suffix = conversationId ? `-${conversationId}` : "";
  const extension = blob.type.includes("mp4")
    ? "m4a"
    : blob.type.includes("ogg")
    ? "ogg"
    : blob.type.includes("wav")
    ? "wav"
    : "webm";
  const filename = `${DOWNLOAD_PREFIX}${suffix}-${timestamp}.${extension}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
