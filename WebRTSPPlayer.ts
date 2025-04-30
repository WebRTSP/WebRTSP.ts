import { WebRTSPClient } from "./WebRTSPClient";
import { IceCandidate  } from "./parse/Parser";

export class WebRTSPPlayer {
    #connection: WebRTSPClient;
    #videoElement: HTMLVideoElement;
    #peerConnection: RTCPeerConnection;
    #streamerName: string;

    #mediaSession?: string;

    constructor(
        connection: WebRTSPClient,
        iceServers: RTCIceServer[],
        streamerName: string,
        videoElement: HTMLVideoElement
    ) {
        this.#connection = connection;
        this.#videoElement = videoElement;
        this.#streamerName = streamerName;

        this.#peerConnection = new RTCPeerConnection({ iceServers });
        this.#peerConnection.onicecandidate =
            (event) => { this.#onIceCandidate(event); };
        this.#peerConnection.onicegatheringstatechange =
            (event) => { this.#onIceGatheringStateChange(event); };
        this.#peerConnection.ontrack =
            (event) => { this.#onTrack(event); };
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
    #onIceGatheringStateChange(event: Event) {
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
        this.#close();
    }

    #close() {
        this.#videoElement.srcObject = null;

        // FIXME? detach callbacks from PeerConnection
        this.#peerConnection.close();
    }

    async play() {
        console.assert(this.#mediaSession == undefined);

        try {
            const { mediaSession, offer } =
                await this.#connection.DESCRIBE(
                    this.#streamerName,
                    this.#onRemoteIceCandidate.bind(this),
                    this.#onRemoteTeardown.bind(this),
                );
            this.#mediaSession = mediaSession;

            await this.#peerConnection.setRemoteDescription({
                type: "offer",
                sdp: offer
            });

            const answer = (await this.#peerConnection.createAnswer());
            if(!answer.sdp)
                throw new Error("SDP is missing");

            await this.#peerConnection.setLocalDescription(answer);

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

        this.#close();
    }
}
