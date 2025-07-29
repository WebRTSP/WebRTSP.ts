/* eslint-disable @typescript-eslint/ban-ts-comment */
import Token from "./Token";
import ParseBuffer from "./ParseBuffer";
import {
    Protocol,
    Method,
    type CSeq,
    Parameters,
    Request,
    Response,
    HeaderFields,
    Options,
    PROTOCOL_NAME } from "../Types";
import { ParseError } from "../helpers/Error";


function IsWSP(c: string) {
    if(c.length != 1)
        return false;

    return c == ' ' || c == '\t';
}

function IsCtl(c: string) {
    if(c.length != 1)
        return false;

    const code = c.charCodeAt(0);
    return (code >= 0 && code <= 31) || code == 127;
}

function IsDigit(c: string) {
    if(c.length != 1)
        return false;

    switch(c) {
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
        return true;
    }

    return false;
}

function ParseDigit(c: string) {
    if(c.length != 1)
        return undefined;

    switch(c) {
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
        return c.charCodeAt(0) - '0'.charCodeAt(0);
    default:
        return undefined;
    }
}

function IsTspecials(c: string) {
    if(c.length != 1)
        return false;

    switch(c) {
    case '(':
    case ')':
    case '<':
    case '>':
    case '@':
    case ',':
    case ';':
    case ':':
    case '\\':
    case '"':
    case '/':
    case '[':
    case ']':
    case '?':
    case '=':
    case '{':
    case '}':
    case ' ':
    case '\t':
        return true;
    }

    return false;
}

function SkipWSP(buffer: ParseBuffer) {
    const savePos = buffer.pos;

    for(; buffer.pos < buffer.length && IsWSP(buffer.currentChar); buffer.advance());

    return savePos != buffer.pos;
}

function SkipEOL(buffer: ParseBuffer) {
    switch(buffer.currentChar) {
    case '\n':
        buffer.advance();
        return true;
    case '\r':
        buffer.advance();
        // @ts-ignore
        if(!buffer.eos && buffer.currentChar == '\n')
            buffer.advance();
        return true;
    }

    return false;
}

function SkipFolding(buffer: ParseBuffer) {
    const tmpBuffer = buffer.clone();

    if(!SkipEOL(tmpBuffer))
        return false;
    if(!SkipWSP(tmpBuffer))
        return false;

    buffer.assign(tmpBuffer);
    return true;
}

function SkipLWS(buffer: ParseBuffer) {
    const tmpBuffer = buffer.clone();

    SkipEOL(tmpBuffer);
    if(!SkipWSP(tmpBuffer))
        return false;

    buffer.assign(tmpBuffer);

    return true;
}

function Skip(buffer: ParseBuffer, c: string) {
    if(buffer.eos)
        return false;

    if(buffer.currentChar == c) {
        buffer.advance();
        return true;
    }

    return false;
}

function SkipNot(buffer: ParseBuffer, c: string) {
    while(!buffer.eos) {
        if(buffer.currentChar == c)
            return true;

        buffer.advance();
    }

    return false;
}

function GetToken(buffer: ParseBuffer) {
    const token = new Token(buffer);

    for(; !buffer.eos; buffer.advance()) {
        if(IsCtl(buffer.currentChar) || IsTspecials(buffer.currentChar))
            break;
    }

    token.length = buffer.pos - token.pos;
    if(!token.empty)
        return token;
    else
        return undefined;
}

function GetProtocol(buffer: ParseBuffer) {
    const token    = new Token(buffer);

    const protocolNameLength = PROTOCOL_NAME.length;

    if(buffer.tailLength < protocolNameLength + 4)
        return undefined;

    if(!buffer.startsWith(PROTOCOL_NAME))
        return undefined;
    buffer.advance(protocolNameLength);

    if(buffer.currentChar != '/')
        return undefined;
    buffer.advance();

    if(!IsDigit(buffer.currentChar))
        return undefined;
    buffer.advance();

    // @ts-ignore
    if(buffer.currentChar != '.')
        return undefined;
    buffer.advance();

    if(!IsDigit(buffer.currentChar))
        return undefined;
    buffer.advance();

    token.length = buffer.pos - token.pos;

    return token;
}

function GetURI(buffer: ParseBuffer) {
    // FIXME! fix according to rfc

    const uriToken = new Token(buffer);

    for(; !buffer.eos; buffer.advance()) {
        if(IsCtl(buffer.currentChar) || buffer.currentChar == ' ')
            break;
    }

    uriToken.length = buffer.pos - uriToken.pos;

    if(!uriToken.empty)
        return uriToken;
    else
        return undefined;
}

function ParseMethod(token: string): Method | undefined {
    if(isNaN(Number(token))) {
        return Method[token as keyof typeof Method];
    } else {
        return undefined;
    }
}

function ParseProtocol(token: string): Protocol | undefined {
    for(const item in Protocol) {
        const protocol = Protocol[item as keyof typeof Protocol];
        if(token == protocol) {
            return protocol;
        }
    }

    return undefined;
}

type MethodLine = {
    method?: Method,
    uri?: string,
    protocol?: Protocol,
}

function ParseMethodLine(
    buffer: ParseBuffer,
    out: MethodLine)
{
    const methodToken = GetToken(buffer);
    if(!methodToken)
        return false;

    out.method = ParseMethod(methodToken.string);
    if(!out.method)
        return false;

    if(!SkipWSP(buffer))
        return false;

    const uriToken = GetURI(buffer);
    if(!uriToken)
        return false;
    out.uri = uriToken.string;

    if(!SkipWSP(buffer))
        return false;

    const protocolToken = GetProtocol(buffer);
    if(!protocolToken)
        return false;

    out.protocol = ParseProtocol(protocolToken.string);
    if(!out.protocol)
        return false;

    if(!SkipEOL(buffer))
        return false;

    return true;
}

function ParseHeaderField(buffer: ParseBuffer, fields: HeaderFields) {
    const nameToken = GetToken(buffer);
    if(!nameToken || nameToken.empty)
        return false;

    if(!Skip(buffer, ':'))
        return false;

    SkipLWS(buffer);

    const valueToken = new Token(buffer);

    while(!buffer.eos) {
        const tmpPos = buffer.pos;
        if(SkipFolding(buffer))
            continue;
        else if(SkipEOL(buffer)) {
            const lowerName = nameToken.string.toLowerCase();
            valueToken.length = tmpPos - valueToken.pos;

            fields.set(lowerName, valueToken.string);

            return true;
        } else if(!IsCtl(buffer.currentChar))
            buffer.advance();
        else
            return false;
    }

    return false;
}

type CSeqOut = { cseq?: CSeq };
function ParseCSeq(token: string, out?: CSeqOut) {
    let cseq = 0;

    for(const c of token) {
        const digit = ParseDigit(c);
        if(digit === undefined)
            return false;

        if(cseq > (cseq * 10 + digit)) {
            // overflow
            return false;
        }

        cseq = cseq * 10 + digit;
    }

    if(!cseq)
        return false;

    if(out)
        out.cseq = cseq;

    return true;
}

export function ParseRequest(message: string) {
    const buffer = new ParseBuffer(message);

    const methodLine: MethodLine = {};
    if(!ParseMethodLine(buffer, methodLine))
        return undefined;

    const headerFields = new HeaderFields;
    while(!buffer.eos) {
        if(!ParseHeaderField(buffer, headerFields))
            return undefined;
        if(SkipEOL(buffer))
            break;
    }

    const { method, uri, protocol } = methodLine;
    if(!method || !uri || !protocol)
        return undefined;

    const cseqValue = headerFields.get("cseq");
    if(!cseqValue)
        return undefined;

    const cseqOut: CSeqOut = {};
    if(!ParseCSeq(cseqValue.valueOf(), cseqOut) || !cseqOut.cseq)
        return undefined;
    headerFields.delete("cseq");

    const { cseq } = cseqOut;

    const sessionValue = headerFields.get("session");
    let session: string | undefined;
    if(sessionValue) {
        session = sessionValue;
        headerFields.delete("session");
    }

    const request = new Request(method, uri, cseq, session?.valueOf());
    request.headerFields = headerFields;
    if(!buffer.eos)
        request.body = buffer.tail;

    return request;
}

function GetStatusCode(buffer: ParseBuffer) {
    const token = new Token(buffer);

    if(buffer.tailLength < 3)
        return undefined;

    for(let i = 0; i < 3 && !buffer.eos; ++i, buffer.advance())
        if(!IsDigit(buffer.currentChar))
            return undefined;

    token.length = 3;

    return token;
}

function ParseStatusCode(token: Token) {
    if(token.empty || token.length < 3)
        return undefined;

    const digit0 = ParseDigit(token.charAt(0));
    const digit1 = ParseDigit(token.charAt(1));
    const digit2 = ParseDigit(token.charAt(2));

    if(digit0 === undefined || digit1 === undefined || digit2 === undefined)
        return undefined;

    return digit0 * 100 + digit1 * 10 + digit2 * 1;
}

function GetReasonPhrase(buffer: ParseBuffer) {
    const token = new Token(buffer);

    for(; !buffer.eos; buffer.advance()) {
        if(IsCtl(buffer.currentChar))
            break;
    }

    token.length = buffer.pos - token.pos;

    return token;
}

type StatusLine = {
    protocol?: Protocol,
    statusCode?: number,
    reasonPhrase?: string,
}

function ParseStatusLine(buffer: ParseBuffer, out: StatusLine) {
    const protocolToken = GetProtocol(buffer);
    if(!protocolToken || protocolToken.empty)
        return false;

    out.protocol = ParseProtocol(protocolToken.string);
    if(!out.protocol)
        return false;

    if(!SkipWSP(buffer))
        return false;

    const statusCodeToken = GetStatusCode(buffer);
    if(!statusCodeToken)
        return false;

    out.statusCode = ParseStatusCode(statusCodeToken);

    if(!SkipWSP(buffer))
        return false;

    const reasonPhrase = GetReasonPhrase(buffer);
    if(reasonPhrase.empty)
        return false;

    out.reasonPhrase = reasonPhrase.string;

    if(!SkipEOL(buffer))
        return false;

    return true;
}

export function ParseResponse(message: string): Response | undefined {
    const buffer = new ParseBuffer(message);

    const statusLine: StatusLine = {};
    if(!ParseStatusLine(buffer, statusLine))
        return undefined;

    const { protocol, statusCode, reasonPhrase } = statusLine;
    if(!protocol || !statusCode || !reasonPhrase)
        return undefined;

    const headerFields = new HeaderFields;
    while(!buffer.eos) {
        if(!ParseHeaderField(buffer, headerFields))
            return undefined;
        if(SkipEOL(buffer))
            break;
    }

    const cseqValue = headerFields.get("cseq");
    if(!cseqValue)
        return undefined;

    const cseqOut: CSeqOut = {};
    if(!ParseCSeq(cseqValue.valueOf(), cseqOut) || !cseqOut.cseq)
        return undefined;
    headerFields.delete("cseq");

    const { cseq } = cseqOut;

    const sessionValue = headerFields.get("session");
    let session: string | undefined;
    if(sessionValue) {
        session = sessionValue;
        headerFields.delete("session");
    }

    const response = new Response(statusCode, reasonPhrase, cseq, session);
    response.headerFields = headerFields;
    if(!buffer.eos)
        response.body = buffer.tail;

    return response;
}

export function ParseOptions(response: Response): Options /*throws*/ {
    const parsedOptions = new Set<Method>();

    const options = response.headerFields.get("public");
    if(!options)
        return parsedOptions;

    const buffer = new ParseBuffer(options.valueOf());
    while(!buffer.eos) {
        SkipWSP(buffer);

        const methodToken = GetToken(buffer);
        if(!methodToken)
            throw new ParseError("Method expected");

        const method = ParseMethod(methodToken.string);
        if(!method)
            throw new ParseError(`Unknown method "${methodToken}`);

        SkipWSP(buffer);

        if(!buffer.eos && !Skip(buffer, ','))
            return parsedOptions;

        parsedOptions.add(method);
    }

    return parsedOptions;
}

export interface IceCandidate {
    sdpMLineIndex: number;
    candidate?: string;
}

export function ParseIceCandidate(request: Request): IceCandidate {
    if(request.contentType != "application/x-ice-candidate")
        throw new ParseError(`Unexpected Content-Type: ${request.contentType}`);

    const iceCandidate = request.body;
    if(!iceCandidate)
        throw new ParseError("Empty Ice Candidate");

    const separatorIndex = iceCandidate.indexOf("/");
    if(separatorIndex == -1 || separatorIndex == 0)
        throw new ParseError(`Invalid Ice Candidate format: ${iceCandidate}`);

    const eolIndex = iceCandidate.indexOf("\r\n", separatorIndex);
    if(eolIndex == -1 || eolIndex == 0)
        throw new ParseError(`Invalid Ice Candidate format: ${iceCandidate}`);

    const sdpMLineIndex = iceCandidate.substring(0, separatorIndex);
    let candidate: string | undefined = iceCandidate.substring(separatorIndex + 1, eolIndex);
    if(candidate == "a=end-of-candidates")
        candidate = undefined;

    try {
        return { sdpMLineIndex: parseInt(sdpMLineIndex), candidate };
    } catch {
        throw new ParseError(`Invalid Ice Candidate: ${iceCandidate}`);
    }
}

function ParseParameter(buffer: ParseBuffer) {
    const nameToken = new Token(buffer);

    if(!SkipNot(buffer, ':'))
        return undefined;

    nameToken.length = buffer.pos - nameToken.pos;

    const name = nameToken.string;
    if(!name)
        return undefined;

    if(!Skip(buffer, ':'))
        return undefined;

    SkipWSP(buffer);

    const valueToken = new Token(buffer);

    while(!buffer.eos) {
        const tmpPos = buffer.pos;
        if(SkipEOL(buffer)) {
            valueToken.length = tmpPos - valueToken.pos;
            const value = valueToken.string;
            return { name, value };
        } else if(!IsCtl(buffer.currentChar))
            buffer.advance();
        else
            return undefined;
    }

    return undefined;
}

export function ParseParameters(body: string): Parameters | undefined {
    const parameters = new Map<string, string>();

    const buffer = new ParseBuffer(body);

    const eolCheckBuffer = buffer.clone();
    if(SkipEOL(eolCheckBuffer) && eolCheckBuffer.eos)
        return parameters;

    while(!buffer.eos) {
        const { name, value } = ParseParameter(buffer) || {};

        if(!name || value == undefined)
            return undefined;

        parameters.set(name, value);
    }

    return parameters;
}

export function IsRequest(message: string) {
    const buffer = new ParseBuffer(message);

    const methodToken = GetToken(buffer);
    if(!methodToken)
        return false;

    const method = ParseMethod(methodToken.string);
    if(!method)
        return false;

    return true;
}
