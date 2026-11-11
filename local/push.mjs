import { sendNotification } from 'web-push';
import { parsePushSubscription } from './push-config.mjs';

export async function dispatchPush(row,settings,send=sendNotification) {
  const subscription=parsePushSubscription({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth_key}});
  if (!subscription) return 'failed';
  try {
    await send(subscription,JSON.stringify({id:row.event_id,path:`/club/${row.organization_id}/notifications`}),{
      TTL:900,timeout:6000,urgency:'normal',topic:row.event_id.replaceAll('-',''),vapidDetails:settings,
    });
    return 'sent';
  } catch (error) {
    if (error.statusCode===404||error.statusCode===410) return 'gone';
    if (error.statusCode>=400&&error.statusCode<500&&![408,429].includes(error.statusCode)) return 'failed';
    return 'retry';
  }
}
