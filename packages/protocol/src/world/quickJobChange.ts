// custom (owner 2026-11-20): the Quick Job Change window's packet (docs/superpowers/specs/2026-11-20-quick-job-change-
// design.md).
//
//   packet   PACKETTYPE_QUICK_JOB_CHANGE 0x8FFF0130, web client -> World (`CDPSrvr::OnQuickJobChange`, the outer repo's
//            patches/2026-11-20-quick-job-change.patch): one int, the job picked. The World checks the tier, the choice,
//            the class lock and the bag room, gives the job's quest-chain rewards and changes the job; its answer is V15's
//            own updates. A World without the patch ignores it.

import { clientPacket } from './packet';
import { PacketType } from '../constants';

/** A job a change can give: the first jobs 1-4, the second jobs 6-13, the Masters 16-23 and the Heroes 24-31. */
function isTargetJob(job: number): boolean {
  return Number.isInteger(job) && ((job >= 1 && job <= 4) || (job >= 6 && job <= 13) || (job >= 16 && job <= 31));
}

/** The Quick Job Change window's Yes: the job picked. */
export function encodeQuickJobChange(job: number): Uint8Array {
  if (!isTargetJob(job)) throw new RangeError(`Invalid job for a job change ${job}`);
  return clientPacket(PacketType.QUICK_JOB_CHANGE).i32(job).toBytes();
}
