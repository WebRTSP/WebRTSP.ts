/* eslint-disable no-unused-vars */
export const PROTOCOL_NAME = "WEBRTSP";

export enum Protocol {
    WEBRTSP_0_2 = PROTOCOL_NAME + "/0.2",
}

const DEFAULT_PROTOCOL = Protocol.WEBRTSP_0_2;

export enum Method {
    OPTIONS,
    LIST,
    DESCRIBE,
    SETUP,
    PLAY,
    RECORD,
    TEARDOWN,
    GET_PARAMETER,
    SET_PARAMETER,
}

export enum ContentType {
    TEXT_PARAMETERS = "text/parameters",
    APPLICATION_SDP = "application/sdp",
    APPLICATION_ICE_CANDIDATE = "application/x-ice-candidate",
}

export enum StatusCode {
    OK = 200
}

export enum ReasonPhrase {
    OK = "OK"
}

export type CSeq = number

export class HeaderFields extends Map<string, string> {}

export class Options extends Set<Method> {}

export class Parameters extends Map<string, string> {}

export class URI2Description extends Map<string, string> {} // uri -> description

export class Request {
    readonly method: Method;
    readonly uri: string;
    readonly protocol: Protocol = DEFAULT_PROTOCOL;
    readonly cseq: CSeq;
    readonly session?: string;

    headerFields = new HeaderFields();

    body: string = "";

    constructor(method: Method, uri: string, cseq: CSeq, session?: string) {
        this.method = method;
        this.uri = uri;
        this.cseq = cseq;
        if(session)
            this.session = session;
    }

    get contentType(): string | undefined {
        return this.headerFields.get("content-type");
    }

    set contentType(contentType: ContentType) {
        this.headerFields.set("content-type", contentType);
    }
}

export class Response {
    readonly protocol: Protocol = DEFAULT_PROTOCOL;
    readonly statusCode: number;
    readonly reasonPhrase: string;
    readonly cseq: CSeq;
    readonly session?: string;

    headerFields = new HeaderFields();

    body: string = "";

    constructor(
        statusCode: number,
        reasonPhrase: string,
        cseq: CSeq,
        session: string | undefined
    ) {
        this.statusCode = statusCode;
        this.reasonPhrase = reasonPhrase;
        this.cseq = cseq;
        this.session = session;
    }

    get contentType(): string | undefined {
        return this.headerFields.get("content-type");
    }

    set contentType(contentType: ContentType) {
        this.headerFields.set("content-type", contentType);
    }
}
