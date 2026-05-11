import type { ActivityRecord } from "../types/activity";

export class DiscordService {
  async maybeSendAlert(_activity: ActivityRecord): Promise<void> {
    return;
  }
}
