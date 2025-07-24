import { InvalidStateError } from "./Error";
import { Log, FormatTag } from './Log';


const TAG = FormatTag("AsyncWebSocket");

export const AsyncWebSocketState = {
  Disconnected: "disconnected",
  Connecting: "",
  Connected: "",
  Disconnecting: "",
} as const;
export type AsyncWebSocketState = typeof AsyncWebSocketState[keyof typeof AsyncWebSocketState];

const State = AsyncWebSocketState;
type State = AsyncWebSocketState

export class AsyncWebSocket {
  #state: State = State.Disconnected;
  #url: string;
  #socket?: WebSocket;
  #keepConnection = false;
  #reconnectTimeoutId?: number;

  #messageHandler?: ((message: unknown) => void);
  #connectedHandler?: (() => void);
  #disconnectedHandler?: (() => void);

  get state() {
    return this.#state;
  }

  set onMessage(handler: (message: unknown) => void | null) {
    this.#messageHandler = handler;
  }
  set onConnected(handler: () => void | null) {
    this.#connectedHandler = handler;
  }
  set onDisconnected(handler: () => void | null) {
    this.#disconnectedHandler = handler;
  }

  constructor(url: string) {
    this.#url = url;
  }

  #onSocketOpen(socket: WebSocket) {
    console.assert(this.#socket === socket);
    if(this.#socket === socket) {
      this.#state = State.Connected;
      Log.info(TAG, "Connected");

      if(this.#connectedHandler) {
        this.#connectedHandler(); // FIXME? setTimeout(() => { this.#disconnectedHandler() }, 0)
      }
    } else {
      socket.close();
    }
  }

  #onSocketError(socket: WebSocket, event: Event) {
    if(this.#socket !== socket)
      return;

    Log.error(TAG, event);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  #onSocketClose(socket: WebSocket, _event: CloseEvent) {
    if(this.#socket !== socket)
      return;

    this.#state = State.Disconnected;
    this.#socket = undefined;

    Log.info(TAG, "Disonnected");

    if(this.#disconnectedHandler) {
      this.#disconnectedHandler(); // FIXME? setTimeout(() => { this.#disconnectedHandler() }, 0)
    }

    this.#scheduleReconnect();
  }

  #onSocketMessage(socket: WebSocket, event: MessageEvent) {
    if(this.#socket !== socket)
      return;

    if(this.#messageHandler) {
      this.#messageHandler(event.data);
    }
  }

  #scheduleReconnect() {
    if(!this.#keepConnection) {
      return;
    }

    if(this.#reconnectTimeoutId) {
      return;
    }

    const reconnectTimout = Math.floor(1000 + 4000 * Math.random());
    this.#reconnectTimeoutId = window.setTimeout(() => {
        this.#reconnectTimeoutId = undefined;
        if(!this.#keepConnection) {
          return;
        }
        if(this.#state == State.Disconnected) {
          this.connect();
        }
    }, reconnectTimout);
    Log.info(TAG, `Scheduled reconnect in "${reconnectTimout}" ms...`);
  }

  #cancelReconnect() {
    if(!this.#reconnectTimeoutId) {
      return;
    }

    clearTimeout(this.#reconnectTimeoutId);
    this.#reconnectTimeoutId = undefined;
  }

  connect() {
    if(this.#socket) {
      throw new InvalidStateError("Has initialized WebSocket");
    }
    console.assert(this.#state == State.Disconnected);

    this.#cancelReconnect();

    this.#keepConnection = true;
    this.#state = State.Connecting;

    Log.info(TAG, `Connecting to "${this.#url}"...`);

    const socket = new WebSocket(this.#url, "webrtsp");
    this.#socket = socket;

    socket.onopen = () => this.#onSocketOpen(socket);
    socket.onclose = (event) => this.#onSocketClose(socket, event);
    socket.onerror = (event) => this.#onSocketError(socket, event);
    socket.onmessage = (event) => this.#onSocketMessage(socket, event);
  }

  async disconnect() {
    if(!this.#socket) {
      throw new InvalidStateError("No initialized WebSocket");
    }

    console.assert(this.state != State.Disconnected);

    if(this.state == State.Disconnecting) {
      return;
    }

    this.#cancelReconnect();
    this.#keepConnection = false;

    if(this.#state == State.Connecting) {
      // FIXME?
      this.#state = State.Disconnected;
      this.#socket.close();
      this.#socket = undefined;
      Log.info(TAG, "Connect aborted");
    } else {
      this.#state = State.Disconnecting;
      this.#socket.close();
    }
  }

  send(message: string) /*throws*/ {
    const socket = this.#socket;
    if(!socket || this.state != State.Connected) {
      throw new InvalidStateError("Not connected");
    }

    socket.send(message);
  }
}