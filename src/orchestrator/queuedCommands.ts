import type { QueuedCommand } from "../types";

export type CommandHandlers = Record<string, (payload: unknown) => void>;

export function isQueuedCommand(entry: unknown): entry is QueuedCommand {
  return Array.isArray(entry);
}

/**
 * Runs one `[name, payload]` entry from the host page's command queue through the handler
 * registered for its name. An unknown name does nothing, and a handler that throws is swallowed:
 * a host page's queued entry must never break the page (Constitution Principle V).
 */
export function applyQueuedCommand(command: QueuedCommand, handlers: CommandHandlers): void {
  try {
    const [name, payload] = command;
    if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(handlers, name)) {
      return;
    }
    handlers[name](payload);
  } catch {
    // See above.
  }
}
