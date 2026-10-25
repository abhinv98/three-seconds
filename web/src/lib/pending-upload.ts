"use client";

// Hands a file dropped on the landing page to the upload flow on /check. Client navigation keeps
// this module in memory, so the File object survives the route change without touching a server.
let pending: File | null = null;

export function setPendingUpload(file: File) {
  pending = file;
}

export function takePendingUpload(): File | null {
  const file = pending;
  pending = null;
  return file;
}
