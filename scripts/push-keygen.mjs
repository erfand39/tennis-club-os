import { generateVAPIDKeys } from 'web-push';
import { validPushSubject } from '../local/push-config.mjs';

const subject=process.argv[2];
if (!validPushSubject(subject)) {
  console.error('Usage: ./scripts/local.sh push-setup mailto:manager@example.com');
  process.exit(2);
}
const {publicKey,privateKey}=generateVAPIDKeys();
process.stdout.write(`SAM_PUSH_SUBJECT=${subject}\nSAM_PUSH_PUBLIC_KEY=${publicKey}\nSAM_PUSH_PRIVATE_KEY=${privateKey}\n`);
