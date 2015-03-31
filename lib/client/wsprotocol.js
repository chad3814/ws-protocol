(function () {
    'use strict';

    /*global window, unescape*/

    var JDataView = window.jDataView;

    // all input and output buffers are jDataView objects so this can be used in a browser or in node.js

    var LEN_HEADER = 4;
    // header
    // 4 bytes length of body

    var STATE_HEADER = 0;
    var STATE_BODY = 1;

    var convertToUtf8 = function (str) {
        return unescape(encodeURIComponent(str));
    };

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
            json = convertToUtf8(JSON.stringify(obj));
        } catch (err) {
            console.error('error stringifying obj', err);
            return;
        }
        var data = new JDataView(json);
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

    window.Packetizer = Packetizer;
}());

(function () {
    'use strict';
    /*global window*/

    var Events = function () {
        var listeners = {};
        this.on = function (event, callback) {
            if (listeners[event]) {
                listeners[event].push(callback);
            } else {
                listeners[event] = [callback];
            }
        };
        this.emit = function (event, data) {
            if (!listeners[event]) {
                return;
            }
            listeners[event].forEach(function (callback) {
                callback.call(this, data);
            }, this);
        };
    };
    window.Events = Events;
}());

(function () {
    'use strict';
    /*global window, Events, Packetizer, jDataView*/

    var JDataView = jDataView;
    var newMessage = function (message) {
        var obj;
        try {
            obj = JSON.parse(message.getString(message.byteLength, 0, 'utf8'));
        } catch (err) {
            console.error('error parsing message into object:', message, err);
            return;
        }
        this.emit('message', obj);
    };

    var WSProtocol = function () {
        var self = this;
        var packetizer = new Packetizer(newMessage, this);
        var socket = new window.WebSocket(WSProtocol.connect_url);

        socket.binaryType = "arraybuffer";
        socket.onopen = function () {
            self.socket.onclose = function () {
                self.emit('disconnect', {});
            };
            self.emit('connect', {});
        };
        socket.onmessage = function (message) {
            self.packetizer.write(new JDataView(message.data));
        };
        socket.onerror = function (err) {
            self.emit('error', err);
        };
        this.packetizer = packetizer;
        this.socket = socket;
    };
    WSProtocol.prototype = new Events();

    WSProtocol.prototype.send = function (message) {
        var packet = Packetizer.createPacket(message);
        this.socket.send(packet.getString(packet.byteLength, 0, 'binary'));
    };

    window.WSProtocol = WSProtocol;
}());
