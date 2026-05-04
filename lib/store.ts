import fs from "fs";
import path from "path";
import { Job } from "./scanner";

const DATA_FILE = path.join("/tmp", "jobs.json");

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