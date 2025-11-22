import { inngest } from '../lib/inngest';
import { yieldService } from '../services/yield.service';
import { logger } from '../utils/logger';

/**
 * Automated Yield Harvesting Workflow
 * Runs daily to harvest yield from all projects
 */
export const autoYieldHarvest = inngest.createFunction(
  {
    id: 'auto-yield-harvest',
    name: 'Automated Yield Harvesting',
  },
  { cron: '0 0 * * *' }, // Run daily at midnight
  async ({ step }) => {
    // Step 1: Harvest yield for all projects
    const result = await step.run('harvest-all-projects', async () => {
      await yieldService.autoHarvestAll();
      return { success: true };
    });

    // Step 2: Claim platform fees (weekly)
    const today = new Date().getDay();
    if (today === 0) {
      // Sunday
      await step.run('claim-platform-fees', async () => {
        const claimed = await yieldService.claimPlatformFees();
        logger.info(`Claimed ${claimed} in platform fees`);
        return { claimed };
      });
    }

    return result;
  }
);
