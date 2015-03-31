'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var Packetizer = require('./packetizer');

var next_id = 0;
var WSClient = function (socket) {
    EventEmitter.call(this);
    this.socket = socket;
    this.id = next_id;
    next_id += 1;

    var packetizer = new Packetizer(function (json) {
        var message;
        try {
            message = JSON.parse(json.getString(json.byteLength, 0, 'utf8'));
        } catch (err) {
            console.error('error parsing json:', json);
            return;
        }
        this.emit('message', message);
    }, this);

    socket.on('message', function (data, flags) {
        if (flags.masked) {
            packetizer.write(flags.buffer);
        } else {
            packetizer.write(data);
        }
    }.bind(this));

    socket.on('close', function () {
        console.log('connection closed');
        this.emit('close');
    }.bind(this));
};

util.inherits(WSClient, EventEmitter);

WSClient.prototype.send = function (obj) {
    var packet = Packetizer.createPacket(obj);
    console.log('packet:', packet.getBytes(packet.byteLength, 0));
    this.socket.send(packet.getBytes(packet.byteLength, 0), {binary: true, mask: false}, function (err) {
        if (err) {
            console.error('error sending to client id', this.id, err);
        }
    }.bind(this));
};

WSClient.prototype.toString = function () {
    return 'wsclient #' + this.id;
};


module.exports = WSClient;
