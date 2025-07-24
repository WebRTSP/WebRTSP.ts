import { AsyncWebSocket } from "./helpers/AsyncWebSocket";
import {
    Method,
    Options,
    type CSeq,
    Request,
    Response,
    ContentType,
    URI2Description,
    StatusCode,
    ReasonPhrase} from "./Types";
import { SerializeRequest, SerializeResponse } from "./Serialize";
import * as Parser from "./parse/Parser";
import { Log, FormatTag } from './helpers/Log';
import { Continuation, withContinuation } from "./helpers/Continuation";
import { InvalidResponse, RequestFailed } from "./helpers/Error";


const TAG = FormatTag("WebRTSP.Client");

interface RequestData {
    request: Request,
    continuation: Continuation<Response>,
}

type IceCandidateHandler = (candidate: Parser.IceCandidate) => void
type TeardownHandler = () => void

interface MediaSessionData {
    teardownHandler: TeardownHandler
    iceCandidateHandler: IceCandidateHandler
}

export class WebRTSPClient {
    #socket: AsyncWebSocket;
    #nextCSeq: CSeq = 1;
    #sentRequests = new Map<CSeq, RequestData>();
    #mediaSessions = new Map<string, MediaSessionData>();

    debug: boolean = true;

    #createRequest(
        method: Method,
        uri: string,
        mediaSession?: string
    ): Request {
        for(; this.#sentRequests.has(this.#nextCSeq); ++this.#nextCSeq);

        return new Request(method, encodeURI(uri), this.#nextCSeq, mediaSession);
    }

    #sendOkResponse(
        cseq: CSeq,
        session: string,
    ) {
        const response = new Response(
            StatusCode.OK,
            ReasonPhrase.OK,
            cseq,
            session);
        this.#response(response);
    }

    #onMediaSessionRequest(
        request: Request,
        sessionData: MediaSessionData
    ) {
        if(!request.session)
            return;

        try {
            switch(request.method) {
                case Method.SETUP: {
                    const candidate = Parser.ParseIceCandidate(request);
                    sessionData.iceCandidateHandler(candidate);
                    break;
                }
                case Method.TEARDOWN: {
                    sessionData.teardownHandler();
                    break;
                }
                default:
                    Log.warn(TAG, `There is no handler for "${request.method}" request`);
                    break;
            }
        } finally {
            this.#sendOkResponse(request.cseq, request.session); // FIXME?
        }
    }

    #onMessage(message: unknown) {
        if(typeof message != "string")
            return;

        if(this.debug)
            Log.debug(TAG, `<-\n${message}`);

        if(Parser.IsRequest(message)) {
            const request = Parser.ParseRequest(message);
            if(!request) {
                Log.error(TAG, "Failed to parse message:\n", message);
                return;
            }

            if(request.session) {
                const sessionData = this.#mediaSessions.get(request.session);
                if(sessionData) {
                    this.#onMediaSessionRequest(request, sessionData);
                } else {
                    console.assert(false, "Got request for unknown media session");
                }
            } else {
                console.assert(false, "Gor request without media session");
            }
            /*
            if(!this.handleRequest(request)) {
                    console.error(`Failed to handle message:\n${message}\nDisconnecting...`)
                    this.disconnect();
                    return;
            }
            */
        } else {
            const response = Parser.ParseResponse(message);
            if(!response) {
                Log.error(TAG, "Failed to parse message:\n", message);
                return;
            }

            const requestData = this.#sentRequests.get(response.cseq);
            if(!requestData) {
                Log.error(TAG, "Can't find request for message:\n", message);
                return;
            }

            requestData.continuation.resume(response);
        }
    }

    #checkStatusCode(response: Response): Response {
        if(response.statusCode != StatusCode.OK)
            throw new RequestFailed(response.statusCode, response.reasonPhrase);

        return response;
    }

    #checkContentType<T extends Request | Response>(
        message: T,
        contentType: string
    ): T {
        if(message.contentType != contentType)
            throw new InvalidResponse(`Unexpected Content-Type: ${contentType}`);

        return message;
    }

    async #request(request: Request) /*throws*/ {
        return this.#checkStatusCode(
            await withContinuation<Response>((continuation) => {
                const requestMessage = SerializeRequest(request);

                if(this.debug)
                  Log.debug(TAG, `->\n${requestMessage}`);

                this.#sentRequests.set(request.cseq, { request, continuation });

                try {
                    this.#socket.send(requestMessage);
                } catch(e: unknown) {
                    this.#sentRequests.delete(request.cseq);

                    throw e;
                }
            })
        );
    }

    async #response(response: Response) {
        const message = SerializeResponse(response);

        if(this.debug)
            Log.debug(TAG, `->\n${message}`);

        try {
            this.#socket.send(message);
        } catch(e: unknown) {
            Log.error(TAG, "Failed to send response:", e);
        }
    }

    #cleanup() {
        for(const [, requestData] of this.#sentRequests)
            requestData.continuation.resumeWithError("Disconnected");
    }

    constructor(url: string) {
        this.#socket = new AsyncWebSocket(url);
        this.#socket.onMessage = (message) => { this.#onMessage(message); };

        this.onDisconnected = this.#cleanup;
    }

    set onConnected(handler: ((client: WebRTSPClient) => void) | undefined ) {
        this.#socket.onConnected = () => {
            if(handler)
                handler(this);
        };
    }
    set onDisconnected(handler: ((client: WebRTSPClient) => void) | undefined) {
        this.#socket.onDisconnected = () => {
            this.#cleanup();

            if(handler)
                handler(this); // FIXME? call on next tick?
        };
    }

    connect() {
        this.#socket.connect();
    }

    async disconnect() {
        return this.#socket.disconnect();
    }

    async OPTIONS(uri: string): Promise<Options> /*throws*/ {
        const request = this.#createRequest(Method.OPTIONS, uri);
        const response = await this.#request(request);

        return Parser.ParseOptions(response);
    }

    async LIST(uri: string): Promise<URI2Description> /*throws*/ {
        const request = this.#createRequest(Method.LIST, uri);
        const response = this.#checkContentType(
            await this.#request(request),
            ContentType.TEXT_PARAMETERS);

        const responseParameters = Parser.ParseParameters(response.body);
        if(!responseParameters)
            throw new InvalidResponse(`Invalid URI list:\n${response.body}`);

        const list = new URI2Description();
        responseParameters.forEach((value, key) => {
            list.set(decodeURI(key), value);
        });

        return list;
    }

    async DESCRIBE(
        uri: string,
        onIceCandidate: IceCandidateHandler,
        onTeardown: TeardownHandler,
    ): Promise<{ offer: string, mediaSession: string }> {
        const request = this.#createRequest(Method.DESCRIBE, uri);
        const response = this.#checkContentType(
            await this.#request(request),
            ContentType.APPLICATION_SDP);

        if(!response.session)
            throw new InvalidResponse("Media session is missing");

        this.#mediaSessions.set(
            response.session,
            {
                teardownHandler: onTeardown,
                iceCandidateHandler: onIceCandidate
            }
        );

        return { offer: response.body, mediaSession: response.session };
    }

    async PLAY(uri: string, mediaSession: string, answer: string) {
        const request = this.#createRequest(Method.PLAY, uri, mediaSession);
        request.contentType = ContentType.APPLICATION_SDP;
        request.body = answer;
        await this.#request(request);
    }

    async SETUP(uri: string, mediaSession: string, iceCandidate: string) {
        const request = this.#createRequest(Method.SETUP, uri, mediaSession);
        request.contentType = ContentType.APPLICATION_ICE_CANDIDATE;
        request.body = iceCandidate;
        await this.#request(request);
    }

    async TEARDOWN(uri: string, mediaSession: string) {
        const request = this.#createRequest(Method.TEARDOWN, uri, mediaSession);
        await this.#request(request);
    }
}
