export class InvalidStateError implements Error {
  name: string;
  message: string;

  constructor(message: string) {
    this.name = this.constructor.name;
    this.message = message;
  }
}

export class ParseError implements Error {
  name: string;
  message: string;

  constructor(message: string) {
    this.name = this.constructor.name;
    this.message = message;
  }
}

export class InvalidResponse implements Error {
  name: string;
  message: string;

  constructor(message: string) {
    this.name = this.constructor.name;
    this.message = message;
  }
}

export class RequestFailed implements Error {
  name: string;
  get message(): string { return this.reasonPhrase; }

  statusCode: number;
  reasonPhrase: string;

  constructor(statusCode: number, reasonPhrase: string) {
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.reasonPhrase = reasonPhrase;
  }
}
