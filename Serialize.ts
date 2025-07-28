import { Method, Request, Response } from "./Types";


export function SerializeStatusCode(statusCode: number) {
    if(statusCode > 999)
        return "999";
    else if(statusCode < 100)
        return "100";
    else
        return statusCode.toString();
}

export function SerializeRequest(request: Request): string {
    let out = Method[request.method];
    out += " ";
    out += request.uri;
    out += " ";
    out += request.protocol;
    out += "\r\n";

    out += "CSeq: ";
    out += request.cseq.toString();
    out += "\r\n";

    if(request.session) {
        out += "Session: ";
        out += request.session;
        out += "\r\n";
    }

    for(const [key, value] of request.headerFields) {
        out += key;
        out += ": ";
        out += value;
        out += "\r\n";
    }

    if(request.body) {
        out +="\r\n";
        out += request.body;
    }

    return out;
}

export function SerializeResponse(response: Response): string {
    let out: string = response.protocol;
    out += " ";
    out += SerializeStatusCode(response.statusCode);
    out += " ";
    out += response.reasonPhrase;
    out += "\r\n";

    out += "CSeq: ";
    out += response.cseq.toString();
    out += "\r\n";

    if(response.session) {
        out += "Session: ";
        out += response.session;
        out += "\r\n";
    }

    for(const [key, value] of response.headerFields) {
        out += key;
        out += ": ";
        out += value;
        out += "\r\n";
    }

    if(response.body) {
        out +="\r\n";
        out += response.body;
    }

    return out;
}
