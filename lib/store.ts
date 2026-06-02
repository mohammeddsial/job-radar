import fs from "fs";
import path from "path";
import os from "os";
import { Job } from "./scanner";

// NEW

const DATA_FILE = path.join(os.tmpdir(), "jobs.json");
export interface JobsData {
  jobs: Job[];
  lastScanned: string;
  count: number;
}

export function saveJobs(jobs: Job[]): void {
  const data: JobsData = {
    jobs,
    lastScanned: new Date().toISOString(),
    count: jobs.length,
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function loadJobs(): JobsData | null {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as JobsData;
  } catch {
    return null;
  }
}