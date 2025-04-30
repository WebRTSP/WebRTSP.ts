export default class ParseBuffer
{
    #buffer: string;
    #pos: number = 0;

    constructor(buffer: string, pos: number = 0) {
        this.#buffer = buffer;
        this.#pos = pos;
    }

    get eos() {
        return this.pos >= this.length;
    }

    get pos() {
        return this.#pos;
    }

    get length() {
        return this.#buffer.length;
    }

    get tailLength() {
        return this.#buffer.length - this.#pos;
    }

    get currentChar() {
        return this.#buffer.charAt(this.#pos);
    }

    get currentCharCode() {
        return this.#buffer.charCodeAt(this.#pos);
    }

    get tail() {
        return this.#buffer.substring(this.#pos);
    }

    clone() {
        return new ParseBuffer(this.#buffer, this.#pos);
    }

    assign(parseBuffer: ParseBuffer) {
        this.#buffer = parseBuffer.#buffer;
        this.#pos = parseBuffer.#pos;
    }

    advance(count?: number) {
        if(count === undefined) {
            ++this.#pos;
        } else {
            this.#pos += count;
        }
    }

    char(offset: number) {
        return this.#buffer.charAt(this.#pos + offset);
    }

    charCode(offset: number) {
        return this.#buffer.charCodeAt(this.#pos + offset);
    }

    substring(length: number) {
        return this.#buffer.substring(this.#pos, this.#pos + length);
    }

    startsWith(searchString: string) {
        return this.#buffer.startsWith(searchString, this.#pos);
    }
}
