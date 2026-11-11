import { ECDH } from 'node:crypto';

const encoded = /^[A-Za-z0-9_-]+$/;
const providers = ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
const isProvider = name => providers.includes(name) || name.endsWith('.push.apple.com') || name.endsWith('.notify.windows.com');

export function parsePushSubscription(value) {
  if (typeof value?.endpoint!=='string'||value.endpoint.length>2048) return null;
  let url;
  try { url=new URL(value.endpoint); } catch { return null; }
  if (url.protocol!=='https:'||!isProvider(url.hostname)||url.port||url.username||url.password||url.hash||url.pathname==='/') return null;
  const {p256dh,auth}=value.keys??{};
  if (typeof p256dh!=='string'||p256dh.length!==87||!encoded.test(p256dh)||
      typeof auth!=='string'||auth.length!==22||!encoded.test(auth)) return null;
  try { ECDH.convertKey(p256dh,'prime256v1','base64url','base64url','uncompressed'); } catch { return null; }
  return {endpoint:url.href,keys:{p256dh,auth}};
}

export const validPushSubject = value => /^mailto:[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value ?? '') && !/[#?"'\\$]/.test(value);

export function pushSettings(env=process.env) {
  const {SAM_PUSH_SUBJECT:subject,SAM_PUSH_PUBLIC_KEY:publicKey,SAM_PUSH_PRIVATE_KEY:privateKey}=env;
  return validPushSubject(subject)&&publicKey?.length===87&&privateKey?.length===43
    ? {subject,publicKey,privateKey} : null;
}
