'use strict';

var JDataView = require('jdataview');

// all input and output buffers are jDataView objects so this can be used in a browser or in node.js

var LEN_HEADER = 4;
// header
// 4 bytes length of body

var STATE_HEADER = 0;
var STATE_BODY = 1;

var Packetizer = function (onComplete, thisArg) {
    this.onComplete = onComplete;
    this.thisArg = thisArg || null;
    this.state = STATE_HEADER;
    this.header_buf = new JDataView(LEN_HEADER);
    this.index = 0; // index into header_buf or body, depending on state
    this.body_buf = null;
};

var setState = function (new_state) {
    if (this.state === new_state) {
        return;
    }

    this.state = new_state;
    switch (this.state) {
    case STATE_HEADER:
        this.index = 0;
        this.body_buf = null;
        break;
    case STATE_BODY:
        var body_length = this.header_buf.getUint32(0);
        this.index = 0;
        this.body_buf = new JDataView(body_length);
        break;
    default:
        console.error('unknown state', new_state);
    }
};

// process from bytes 0 through min(LEN_HEADER, chunk.byteLength)
// return anything remaining in chunk
var processDataHeader = function (chunk) {
    var remaining = LEN_HEADER - this.index;

    var bytes_to_copy = Math.min(remaining, chunk.byteLength);

    console.log('header: bytes to copy:', bytes_to_copy, 'from:', chunk.getBytes(chunk.byteLength, 0));
    this.header_buf.setBytes(this.index, chunk.getBytes(bytes_to_copy, 0));
    this.index += bytes_to_copy;

    // complete
    if (this.index === LEN_HEADER) {
        setState.call(this, STATE_BODY);
    }

    // remaining part of chunk
    if ((chunk.byteLength - bytes_to_copy) > 0) {
        var remaining_chunk = chunk.slice(bytes_to_copy);
        return remaining_chunk;
    }
    return null;
};

// process from bytes 0 through min(body_length, chunk.byteLength)
// return anything remaining in chunk
var processDataBody = function (chunk) {
    var body_length = this.header_buf.getUint32(0);
    var remaining = body_length - this.index;

    var bytes_to_copy = Math.min(remaining, chunk.byteLength);

    console.log('body: bytes to copy:', bytes_to_copy, 'from:', chunk.getBytes(chunk.byteLength, 0), 'index:', this.index);
    this.body_buf.setBytes(this.index, chunk.getBytes(bytes_to_copy, 0));
    this.index += bytes_to_copy;

    // complete
    if (body_length === this.index) {
        var complete = this.body_buf.slice(0);
        console.log('got a complete packet:', complete.getBytes(complete.byteLength, 0));
        this.onComplete.call(this.thisArg, complete);
        setState.call(this, STATE_HEADER);
    }

    // remaining part of chunk
    if (chunk.byteLength - bytes_to_copy > 0) {
        var remaining_chunk = chunk.slice(bytes_to_copy);
        return remaining_chunk;
    }
    return null;
};

// called with new data
Packetizer.prototype.write = function (chunk) {
    chunk = new JDataView(chunk);
    while (chunk !== null) {
        if (this.state === STATE_HEADER) {
            chunk = processDataHeader.call(this, chunk);
        } else {
            chunk = processDataBody.call(this, chunk);
        }
    }
};

//
Packetizer.createPacket = function (obj) {
    var json;
    try {
        json = JSON.stringify(obj);
    } catch (err) {
        console.error('error stringifying obj', err);
        return;
    }
    var data = new JDataView(new Buffer(json, 'utf8'));
    console.log('creating a packet for', data.getBytes(data.byteLength, 0));
    var buf = new JDataView(LEN_HEADER + data.byteLength);

    // length
    var index = 0;
    buf.setUint32(index, data.byteLength);
    index += 4;

    // data
    data.seek(0);
    buf.setBytes(index, data.getBytes(data.byteLength, 0));

    return buf;
};

module.exports = Packetizer;
