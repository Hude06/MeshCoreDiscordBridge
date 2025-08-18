class BufferReader {

    constructor(data) {
        this.pointer = 0;
        this.buffer = new Uint8Array(data);
    }

    getRemainingBytesCount() {
        return this.buffer.length - this.pointer;
    }

    readByte() {
        return this.readBytes(1)[0];
    }

    readBytes(count) {
        const data = this.buffer.slice(this.pointer, this.pointer + count);
        this.pointer += count;
        return data;
    }

    readRemainingBytes() {
        return this.readBytes(this.getRemainingBytesCount());
    }

    readString() {
        return new TextDecoder().decode(this.readRemainingBytes());
    }

    readCString(maxLength) {
        const value = [];
        const bytes = this.readBytes(maxLength);
        for(const byte of bytes){

            // if we find a null terminator character, we have reached the end of the cstring
            if(byte === 0){
                return new TextDecoder().decode(new Uint8Array(value));
            }

            value.push(byte);

        }
    }

    readInt8() {
        const bytes = this.readBytes(1);
        const view = new DataView(bytes.buffer);
        return view.getInt8(0);
    }

    readUInt8() {
        const bytes = this.readBytes(1);
        const view = new DataView(bytes.buffer);
        return view.getUint8(0);
    }

    readUInt16LE() {
        const bytes = this.readBytes(2);
        const view = new DataView(bytes.buffer);
        return view.getUint16(0, true);
    }

    readUInt32LE() {
        const bytes = this.readBytes(4);
        const view = new DataView(bytes.buffer);
        return view.getUint32(0, true);
    }

    readInt16LE() {
        const bytes = this.readBytes(2);
        const view = new DataView(bytes.buffer);
        return view.getInt16(0, true);
    }

    readInt32LE() {
        const bytes = this.readBytes(4);
        const view = new DataView(bytes.buffer);
        return view.getInt32(0, true);
    }

}

export default BufferReader;
