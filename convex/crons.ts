import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "scan expiring quotes",
  { hourUTC: 9, minuteUTC: 0 },
  internal.expiry.scanExpiringQuotes,
);

export default crons;
