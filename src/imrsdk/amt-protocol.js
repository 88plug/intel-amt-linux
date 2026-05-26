'use strict';

/**
 * Intel AMT Redirection Protocol (AMTRP) transport
 * Ref: Intel AMT Implementation and Reference Guide §6 — Redirection Library
 *
 * Flow:
 *   1. TCP connect → port 16994 (plain) or 16995 (TLS)
 *   2. POST /RedirectionService → 401 Digest challenge
 *   3. Compute MD5 digest, re-POST with Authorization header
 *   4. 200 OK → binary AMT protocol begins on same socket
 */

const net    = require('net');
const tls    = require('tls');
const crypto = require('crypto');

// AMT Redirection session-start magic bytes (protocol §6.3.1)
const REDIR_START_IDER = Buffer.from([0x10, 0x00, 0x00, 0x00, 0x49, 0x44, 0x45, 0x52]);
const REDIR_START_SOL  = Buffer.from([0x10, 0x00, 0x00, 0x00, 0x53, 0x4F, 0x4C, 0x20]);

// States
const S_IDLE     = 0;
const S_HTTP     = 1;  // waiting for HTTP 401/200
const S_AUTH     = 2;  // waiting for HTTP 200 after auth
const S_OPEN     = 3;  // binary AMT protocol active
const S_CLOSED   = 4;

function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

function parseDigestChallenge(wwwAuth) {
    const fields = {};
    const re = /(\w+)="([^"]+)"/g;
    let m;
    while ((m = re.exec(wwwAuth)) !== null) fields[m[1]] = m[2];
    return fields;
}

function buildDigestResponse(method, uri, user, pass, challenge, nc, cnonce) {
    const ha1 = md5(`${user}:${challenge.realm}:${pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`);
    return `Digest username="${user}", realm="${challenge.realm}", nonce="${challenge.nonce}", ` +
           `uri="${uri}", qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
}

module.exports = function createAmtProtocol(opts) {
    // opts: { host, port, user, pass, tls, onOpen, onData, onClose, onError }
    const obj = {
        state:  S_IDLE,
        socket: null,
        buf:    Buffer.alloc(0),
        nc:     1,
        cnonce: crypto.randomBytes(4).toString('hex'),
        challenge: null,
        keepalive: null,
    };

    const URI    = '/RedirectionService';
    const METHOD = 'POST';

    function send(data) {
        if (obj.socket && !obj.socket.destroyed) obj.socket.write(data);
    }

    function httpPost(auth) {
        const headers = [
            `${METHOD} ${URI} HTTP/1.1`,
            `Host: ${opts.host}:${opts.port}`,
            'Content-Length: 0',
            auth ? `Authorization: ${auth}` : null,
            '\r\n',
        ].filter(Boolean).join('\r\n');
        send(headers);
    }

    function onData(chunk) {
        obj.buf = Buffer.concat([obj.buf, chunk]);

        if (obj.state === S_HTTP || obj.state === S_AUTH) {
            const str = obj.buf.toString('ascii');
            const end = str.indexOf('\r\n\r\n');
            if (end === -1) return;

            const header = str.slice(0, end);
            obj.buf = obj.buf.slice(end + 4);

            if (header.includes('401')) {
                // Parse Digest challenge and retry
                const wwwLine = header.split('\r\n').find(l => l.startsWith('WWW-Authenticate:')) || '';
                obj.challenge = parseDigestChallenge(wwwLine);
                const nc = String(obj.nc++).padStart(8, '0');
                const auth = buildDigestResponse(METHOD, URI, opts.user, opts.pass,
                                                  obj.challenge, nc, obj.cnonce);
                obj.state = S_AUTH;
                httpPost(auth);
            } else if (header.includes('200')) {
                obj.state = S_OPEN;
                // Send IDER session-start bytes
                send(REDIR_START_IDER);
                // Keepalive every 20s (AMT drops idle connections)
                obj.keepalive = setInterval(() => {
                    if (obj.state === S_OPEN) send(Buffer.from([0x14, 0x00, 0x00, 0x00]));
                }, 20000);
                if (opts.onOpen) opts.onOpen();
                // Remaining buf is protocol data
                if (obj.buf.length > 0) opts.onData && opts.onData(obj.buf);
                obj.buf = Buffer.alloc(0);
            } else {
                close(`Unexpected HTTP response: ${header.split('\r\n')[0]}`);
            }
            return;
        }

        if (obj.state === S_OPEN && opts.onData) opts.onData(chunk);
    }

    function close(reason) {
        if (obj.state === S_CLOSED) return;
        obj.state = S_CLOSED;
        if (obj.keepalive) { clearInterval(obj.keepalive); obj.keepalive = null; }
        if (obj.socket)    { obj.socket.destroy(); obj.socket = null; }
        if (reason && opts.onError) opts.onError(reason);
        if (opts.onClose)  opts.onClose();
    }

    obj.connect = function() {
        obj.state = S_HTTP;
        const tlsOpts = { host: opts.host, port: opts.port, rejectUnauthorized: false };
        obj.socket = opts.tls
            ? tls.connect(tlsOpts, () => httpPost(null))
            : net.createConnection({ host: opts.host, port: opts.port }, () => httpPost(null));

        obj.socket.on('data',  onData);
        obj.socket.on('close', () => close(null));
        obj.socket.on('error', e  => close(e.message));
    };

    obj.send  = send;
    obj.close = () => close(null);

    return obj;
};
