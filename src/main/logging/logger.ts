import fs from 'fs';
import path from 'path';
import { storagePaths } from '../storage/paths';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVES = 4;

class AppLogger {
  private logFilePath(): string {
    return path.join(storagePaths.getLogsDir(), 'studydock.log');
  }

  private redact(message: string): string {
    return message.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
  }

  private rotateIfNeeded(filePath: string): void {
    try {
      if (fs.statSync(filePath).size < MAX_LOG_BYTES) return;
    } catch {
      return;
    }

    for (let index = MAX_ARCHIVES; index >= 1; index--) {
      const source = index === 1 ? filePath : `${filePath}.${index - 1}`;
      const destination = `${filePath}.${index}`;
      if (index === MAX_ARCHIVES && fs.existsSync(destination)) fs.unlinkSync(destination);
      if (fs.existsSync(source)) fs.renameSync(source, destination);
    }
  }

  public log(level: LogLevel, message: string): void {
    const line = `${new Date().toISOString()} [${level}] ${this.redact(message)}\n`;
    const output = level === 'ERROR' ? process.stderr : process.stdout;
    output.write(line);

    try {
      const filePath = this.logFilePath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      this.rotateIfNeeded(filePath);
      fs.appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Keep stdout/stderr logging available if Electron storage is unavailable.
      // Never fall back to writing runtime logs into the project directory.
    }
  }

  public info(message: string): void {
    this.log('INFO', message);
  }

  public warn(message: string): void {
    this.log('WARN', message);
  }

  public error(message: string): void {
    this.log('ERROR', message);
  }
}

export const appLogger = new AppLogger();
