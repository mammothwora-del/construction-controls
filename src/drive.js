/* Minimal Google Drive sync using Google Identity Services (GIS) token flow.
   Scope drive.file = the app can only see/manage the one file it creates.
   You provide your own OAuth Client ID (public, safe in client-side code). */
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const NAME = "construction-controls.json";
let _token = null;
let _tokenClient = null;
let _gisReady = null;

export function driveEnsure() {
  if (_gisReady) return _gisReady;
  _gisReady = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    const el = document.createElement("script");
    el.src = "https://accounts.google.com/gsi/client";
    el.async = true; el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load Google sign-in script"));
    document.head.appendChild(el);
  });
  return _gisReady;
}

export function driveGetToken(clientId, interactive) {
  return new Promise((resolve, reject) => {
    if (_token && !interactive) return resolve(_token);
    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.error) return reject(new Error(resp.error));
          _token = resp.access_token; resolve(_token);
        },
      });
    }
    try { _tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" }); }
    catch (e) { reject(e); }
  });
}

async function api(url, opts) {
  const res = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + _token, ...((opts && opts.headers) || {}) } });
  if (res.status === 401) { _token = null; throw new Error("Session expired — click Connect Google Drive again"); }
  if (!res.ok) throw new Error("Drive error " + res.status);
  return res;
}

export async function driveFind(name) {
  const q = encodeURIComponent("name='" + (name || NAME) + "' and trashed=false");
  const res = await api("https://www.googleapis.com/drive/v3/files?q=" + q + "&spaces=drive&fields=files(id,name)");
  const data = await res.json();
  return data.files && data.files[0] ? data.files[0].id : null;
}

export async function driveSave(fileId, name, obj) {
  const body = JSON.stringify(obj);
  if (fileId) {
    await api("https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    return fileId;
  }
  const boundary = "ccx" + Math.random().toString(36).slice(2);
  const meta = { name: name || NAME, mimeType: "application/json" };
  const multipart =
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
    "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" + body +
    "\r\n--" + boundary + "--";
  const res = await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body: multipart });
  const data = await res.json();
  return data.id;
}

export async function driveLoad(fileId) {
  const res = await api("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
  return await res.json();
}
