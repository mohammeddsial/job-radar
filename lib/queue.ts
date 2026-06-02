// lib/queue.ts – simplified, no Redis/BullMQ dependency
import type { AgentEvent } from "../types";

export type QueueName =
  | "outreach"
  | "proposal"
  | "social"
  | "portfolio"
  | "telegram";

export interface Queue {
  add(name: string, data: Record<string, unknown>, opts?: { delay?: number; priority?: number }): Promise<string>;
  process(handler: (job: { id: string; name: string; data: Record<string, unknown> }) => Promise<void>): void;
}

// In‑process mock queue (works without any external service)
class InMemoryQueue implements Queue {
  private handlers: Array<(job: { id: string; name: string; data: Record<string, unknown> }) => Promise<void>> = [];
  private counter = 0;

  async add(name: string, data: Record<string, unknown>): Promise<string> {
    const id = `mock-${++this.counter}`;
    // Run handlers asynchronously
    setTimeout(async () => {
      for (const handler of this.handlers) {
        try {
          await handler({ id, name, data });
        } catch (e) {
          console.error(`Queue handler error for ${name}:`, e);
        }
      }
    }, 0);
    return id;
  }

  process(handler: (job: { id: string; name: string; data: Record<string, unknown> }) => Promise<void>): void {
    this.handlers.push(handler);
  }
}

// Factory always returns in‑memory queue (Redis/BullMQ removed for now)
const queues: Map<QueueName, Queue> = new Map();

export async function getQueue(name: QueueName): Promise<Queue> {
  if (queues.has(name)) return queues.get(name)!;
  const q = new InMemoryQueue();
  queues.set(name, q);
  return q;
}

// Typed event publisher
export async function publishEvent(
  queue: QueueName,
  event: Omit<AgentEvent, "id" | "createdAt">
): Promise<string> {
  const q = await getQueue(queue);
  return q.add(event.type, { ...event.payload, _agent: event.agent, _type: event.type });
}

// Simple proposal storage (file‑based) – keep your existing logic
import fs from "fs";
import path from "path";

const PROPOSALS_FILE = path.join(process.cwd(), "proposals.json");

export interface Proposal {
  id: string;
  job_id: string;
  job_title: string;
  company: string;
  raw_job_data: any;
  content: string;
  status: "draft" | "approved" | "sent";
  created_at: string;
}

export async function saveProposal(proposal: Omit<Proposal, "id" | "created_at">) {
  let existing: Proposal[] = [];
  if (fs.existsSync(PROPOSALS_FILE)) {
    existing = JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf-8"));
  }
  const newProposal: Proposal = {
    ...proposal,
    id: Date.now().toString(),
    created_at: new Date().toISOString(),
  };
  existing.push(newProposal);
  fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(existing, null, 2));
}

export async function getProposals(): Promise<Proposal[]> {
  if (!fs.existsSync(PROPOSALS_FILE)) return [];
  return JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf-8"));
}