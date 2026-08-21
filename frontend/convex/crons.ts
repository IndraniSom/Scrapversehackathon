/** Recurring production work backed by real internal handlers. */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "source collection",
  { minutes: 60 },
  internal.sourceRuns.cronTrigger,
);

crons.daily(
  "retention cleanup",
  { hourUTC: 4, minuteUTC: 30 },
  internal.retention.purgeExpired,
);

export default crons;
