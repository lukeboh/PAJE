export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
};

export type LogTransport = {
  name: string;
  minLevel: LogLevel;
  log: (entry: LogEntry) => void;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const formatTimestamp = (date: Date = new Date()): string => {
  return date.toISOString().replace("T", " ").slice(0, 19);
};

export class LoggerBroker {
  private readonly transports: LogTransport[] = [];

  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  setTransportLevel(name: string, minLevel: LogLevel): void {
    const transport = this.transports.find((item) => item.name === name);
    if (transport) {
      transport.minLevel = minLevel;
    }
  }

  log(level: LogLevel, message: string): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: formatTimestamp(),
    };
    this.transports.forEach((transport) => {
      if (LEVEL_ORDER[level] >= LEVEL_ORDER[transport.minLevel]) {
        transport.log(entry);
      }
    });
  }

  debug(message: string): void {
    this.log("debug", message);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  error(message: string): void {
    this.log("error", message);
  }
}
