'use strict';

var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var util = require('util');
var ws = require('ws');

var Packetizer = require('./packetizer');
var WSClient = require('./ws-client');

var jDataView_client = null;
fs.readFile(path.resolve(path.join('client', 'jdataview.js')), function (err, content) {
    if (err) {
        console.error('error reading jDataView:', err);
        return;
    }
    jDataView_client = content.toString('utf8');
});
var wsprotocol_client = null;
fs.readFile(path.resolve(path.join('client', 'wsprotocol.js')), function (err, content) {
    if (err) {
        console.error('error reading protocol client:', err);
        return;
    }
    wsprotocol_client = content.toString('utf8');
});

var WSProtocol = function (server, options) {
    EventEmitter.call(this);
    this.options = {
        base_path: '/_ws/',
        enable_jdataview: true,
        enable_client: true
    };
    Object.keys(this.options).forEach(function (option) {
        if (options.hasOwnProperty(option)) {
            this.options[option] = options[option];
        }
    });
    this.connect_string = '\nWSProtocol.connect_url = "' + path.join('/', this.options.base_path, '_s') + '";\n';
    this.server = server;
    this.setUpWS();
    this.setUpRequests();
};
util.inherits(WSProtocol, EventEmitter);

WSProtocol.protocol.broadcast = function (obj) {
    var packet = Packetizer.createPacket(obj);
    console.log('packet:', packet.getBytes(packet.byteLength, 0));
    this.sockets.clients.forEach(function (client) {
        client.send(packet.getBytes(packet.byteLength, 0), {binary: true, mask: false}, function (err) {
            if (err) {
                console.error('error sending to client id', client.id, err);
            }
        });
    });
};

WSProtocol.protocol.setUpWS = function () {
    var ws_options = {
        server: this.server,
        path: path.join('/', this.options.base_path, '_s'),
        clientTracking: true
    };

    this.sockets = new ws.Server(ws_options);

    this.sockets.on('connection', function (connection) {
        var client = new WSClient(connection);
        this.emit('client', client);
    }.bind(this));

    this.sockets.on('listening', function () {
        console.log('websocket is listening');
    }.bind(this));

    this.sockets.on('error', function (err) {
        console.error('got a websocket error:', err);
        this.emit('error', err);
    }.bind(this));
};

WSProtocol.protocol.setUpRequests = function () {
    if (!this.options.enable_client && !this.options.enable_jdataview) {
        // nothing to do
        return;
    }

    // reset listeners
    var old_request_listeners = this.server.listeners('request').splice(0);
    this.server.removeAllListeners('request');
    var client_path = path.join('/', this.options.base_path, 'ws-client.js');

    this.server.on('request', function (req, res) {
        if (req.url !== client_path) {
            old_request_listeners.forEach(function (listener) {
                listener.call(this.server, req, res);
            }, this);
        }
        var headers = {
            'Content-Type': 'application/javascript'
        };
        var length = 0;
        if (this.options.enable_jdataview) {
            length += Buffer.byteLength(jDataView_client, 'utf8');
        }
        if (this.options.enable_client) {
            length += Buffer.byteLength(wsprotocol_client, 'utf8');
            length += Buffer.byteLength(this.connect_string, 'utf8');
        }

        headers['Content-Length'] = length;
        res.writeHead(200, headers);

        if (this.options.enable_jdataview) {
            res.write(jDataView_client, 'utf8');
        }
        if (this.options.enable_client) {
            res.write(wsprotocol_client, 'utf8');
            res.write(this.connect_string, 'utf8');
        }
        res.end();
    }.bind(this));
};

module.exports = WSProtocol;
