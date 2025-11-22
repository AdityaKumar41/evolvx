import { Inngest } from 'inngest';
import { config } from '../config';

export const inngest = new Inngest({
  id: config.inngest.appId,
  eventKey: config.inngest.eventKey,
});
