/**
 * Клиент realtime-телеметрии существующего WebSocket Gateway (порт 81).
 * Никаких fake-сообщений: только реальные фреймы от ESP32.
 * При разрыве соединения — автоматический reconnect с экспоненциальной задержкой.
 */

import { wsUrl } from "./api";

export type WsState = "connecting" | "open" | "closed";

export class GatewaySocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: number | null = null;
  private stopped = false;

  onMessage: ((payload: unknown) => void) | null = null;
  onState: ((state: WsState, viaHttpFallback: boolean) => void) | null = null;

  connect(): void {
    if (this.stopped) return;
    this.cleanup();
    this.setState("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setState("open");
    };

    socket.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== "string") return;
      try {
        const parsed: unknown = JSON.parse(ev.data);
        this.onMessage?.(parsed);
      } catch {
        /* повреждённый фрейм игнорируется — данные не фабрикуются */
      }
    };

    socket.onclose = () => {
      if (this.ws === socket) {
        this.setState("closed");
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        /* noop */
      }
    };
  }

  close(): void {
    this.stopped = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.cleanup();
    this.setState("closed");
  }

  private cleanup(): void {
    if (this.ws) {
      const s = this.ws;
      this.ws = null;
      s.onopen = null;
      s.onmessage = null;
      s.onclose = null;
      s.onerror = null;
      try {
        s.close();
      } catch {
        /* noop */
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer !== null) return;
    const delay = Math.min(1000 * 2 ** this.attempt, 10000);
    this.attempt += 1;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private setState(state: WsState): void {
    this.onState?.(state, false);
  }
}
