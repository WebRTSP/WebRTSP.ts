import { WebRTSPClient } from "./WebRTSPClient";
import { type IceCandidate  } from "./parse/Parser";


export class WebRTSPPlayerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WebRTSPPlayerError";
    }
}

export class PlayerClosed extends WebRTSPPlayerError {
    constructor() {
        super("Player closed");
    }
}

export class SDPMissing extends WebRTSPPlayerError {
    constructor() {
        super("SDP is missing");
    }
}

export class WebRTSPPlayer {
    #connection: WebRTSPClient;
    #videoElement: HTMLVideoElement;
    #peerConnection: RTCPeerConnection;
    #streamerName: string;

    #mediaSession?: string;

    #closed: boolean = false;

    readonly events = new EventTarget();

    constructor(
        connection: WebRTSPClient,
        iceServers: RTCIceServer[],
        streamerName: string,
        videoElement: HTMLVideoElement
    ) {
        this.#connection = connection;
        this.#videoElement = videoElement;
        this.#streamerName = streamerName;

        const peerConnection = new RTCPeerConnection({ iceServers });
        peerConnection.onicecandidate =
            (event) => { this.#onIceCandidate(event); };
        peerConnection.onicegatheringstatechange =
            (event) => { this.#onIceGatheringStateChange(event); };
        peerConnection.ontrack =
            (event) => { this.#onTrack(event); };
        peerConnection.onconnectionstatechange =
            () => {
                this.events.dispatchEvent(
                    new CustomEvent(
                        "connectionstatechanged",
                        {
                            detail: {
                                connectionstate: peerConnection.connectionState,
                            }
                        }
                    )
                );
            };
        this.#peerConnection = peerConnection;
    }

    #ensureNotClosed() {
        if(this.#closed)
            throw new PlayerClosed;
    }

    #onIceCandidate(event: RTCPeerConnectionIceEvent) {
        if(!this.#streamerName)
            return;
        if(!this.#mediaSession)
            return;

        if(
            event.candidate &&
            event.candidate.sdpMLineIndex != null
        ) {
            const candidate =
                `${event.candidate.sdpMLineIndex}/${
                    event.candidate.candidate !== "" ?
                        event.candidate.candidate :
                        "a=end-of-candidates"
                }\r\n`;

            this.#connection.SETUP(
                this.#streamerName,
                this.#mediaSession,
                candidate);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    #onIceGatheringStateChange(_event: Event) {
    }

    #onTrack(event: RTCTrackEvent) {
        if(event.track.kind != "video")
            return;

        if(event.streams.length < 1)
            return;

        const stream = event.streams[0];

        this.#videoElement.srcObject = stream;
    }

    #onRemoteIceCandidate(iceCandidate: IceCandidate) {
        this.#peerConnection.addIceCandidate(iceCandidate).catch(() => {});
    }

    #onRemoteTeardown() {
        this.#mediaSession = undefined;
        this.#close(true);
    }

    #close(keepCurrentFrame: boolean) {
        if(!keepCurrentFrame)
            this.#videoElement.srcObject = null;

        if(this.#closed)
            return;

        this.#closed = true;

        // FIXME? detach callbacks from PeerConnection
        this.#peerConnection.close();
        this.events.dispatchEvent(
            new CustomEvent(
                "connectionstatechanged",
                {
                    detail: {
                        connectionstate: "closed",
                    }
                }
            )
        );
    }

    async play() /*throws*/ {
        console.assert(this.#mediaSession == undefined);

        this.#ensureNotClosed();

        try {
            const { mediaSession, offer } =
                await this.#connection.DESCRIBE(
                    this.#streamerName,
                    this.#onRemoteIceCandidate.bind(this),
                    this.#onRemoteTeardown.bind(this),
                );
            this.#mediaSession = mediaSession;

            this.#ensureNotClosed();

            await this.#peerConnection.setRemoteDescription({
                type: "offer",
                sdp: offer
            });

            this.#ensureNotClosed();

            const answer = (await this.#peerConnection.createAnswer());

            this.#ensureNotClosed();

            if(!answer.sdp)
                throw SDPMissing;

            await this.#peerConnection.setLocalDescription(answer);

            this.#ensureNotClosed();

            await this.#connection.PLAY(
                this.#streamerName,
                mediaSession,
                answer.sdp);
        } catch(e: unknown) {
            this.stop();
            throw e;
        }
    }

    stop() {
        if(this.#mediaSession) {
            this.#connection.TEARDOWN(
                this.#streamerName,
                this.#mediaSession
            ).catch();
            this.#mediaSession = undefined;
        }

        this.#close(false);
    }
}
