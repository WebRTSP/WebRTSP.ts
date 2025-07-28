import ParseBuffer from './ParseBuffer';


export default class Token
{
    #buffer: ParseBuffer;
    #length: number;

    constructor(parseBuffer: ParseBuffer) {
        this.#buffer = parseBuffer.clone();
        this.#length = 0;
    }

    get pos() {
        return this.#buffer.pos;
    }

    get length() {
        return this.#length;
    }
    set length(length: number) {
        // Log.assert(length >= 0, TAG, "Lenght should be 0 or positive")
        if(length < 0) {
            return;
        }

        this.#length = length;
    }

    get string() {
        return this.#buffer.substring(this.#length);
    }

    get empty() {
        if(!this.#length)
            return true;

        return this.#buffer.eos;
    }

    charAt(index: number) {
        return this.#buffer.char(index);
    }

    charCodeAt(index: number) {
        return this.#buffer.charCode(index);
    }

    startsWith(searchString: string) {
        return this.#buffer.startsWith(searchString);
    }
}
