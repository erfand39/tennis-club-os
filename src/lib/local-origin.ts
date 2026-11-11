export function localOrigin(value:string): string {
  const origin = new URL(value);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  const ip=origin.hostname.split('.').map(Number);
  const privateIp=ip.length===4&&ip.every(part=>Number.isInteger(part)&&part>=0&&part<=255)
    && (ip[0]===10||ip[0]===172&&ip[1]>=16&&ip[1]<=31||ip[0]===192&&ip[1]===168);
  const privateName=/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.local$/.test(origin.hostname);
  const allowed=origin.protocol==='http:'&&loopback||origin.protocol==='https:'&&(loopback||privateIp||privateName);
  if (!allowed||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash) {
    throw new Error('SAM_ORIGIN must be loopback HTTP or an approved local HTTPS origin.');
  }
  return origin.origin;
}
