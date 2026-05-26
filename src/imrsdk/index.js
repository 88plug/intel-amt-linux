'use strict';

/**
 * Intel AMT Redirection SDK — Linux port
 * Implements the same synchronous API as the original Windows imrsdk.node binding.
 *
 * Uses deasync to satisfy IMC's synchronous call contract while running
 * an async TCP session underneath. deasync spins libuv's event loop so
 * async I/O fires normally; the calling Promise wrapper in IMC sees a
 * regular synchronous return value.
 */

const deasync       = require('deasync');
const createProto   = require('./amt-protocol');
const createIder    = require('./amt-ider');

// Mirror of IMRSDK.h enum IMRResult
const IMR = {
    RES_OK:                0,
    RES_ERROR:             1,
    RES_INVALID_PARAMETER: 2,
    RES_NOT_INITIALIZED:   3,
    RES_SESSION_ALREADY_OPEN: 11,
    RES_SESSION_CLOSED:    12,
    RES_SOCKET_ERROR:      13,
    RES_TIMEOUT:           18,
};

let _session = null;

// startIderSession(useTls, hostname, username, password, imgPath, isoPath, timing)
// Returns { retCode, message } — synchronous (blocked via deasync)
function startIderSession(useTls, hostname, username, password, imgPath, isoPath, timing) {
    if (!hostname) return { retCode: IMR.RES_INVALID_PARAMETER, message: 'Must supply valid hostname.' };
    if (typeof username !== 'string') return { retCode: IMR.RES_INVALID_PARAMETER, message: 'Must supply valid username.' };
    if (typeof password !== 'string') return { retCode: IMR.RES_INVALID_PARAMETER, message: 'Must supply valid password.' };
    if (!imgPath)  return { retCode: IMR.RES_INVALID_PARAMETER, message: 'Must supply valid imgPath.' };
    if (!isoPath)  return { retCode: IMR.RES_INVALID_PARAMETER, message: 'Must supply valid isoPath.' };
    if (_session)  return { retCode: IMR.RES_SESSION_ALREADY_OPEN, message: 'Session already open.' };

    const port = useTls ? 16995 : 16994;
    let result = null;

    const ider = createIder(imgPath, isoPath, timing || 0);

    const proto = createProto({
        host: hostname,
        port,
        user: username,
        pass: password,
        tls:  !!useTls,
        onOpen() {
            ider.send = data => proto.send(data);
            ider.onReady = () => {
                _session = { proto, ider };
                result = { retCode: IMR.RES_OK, message: 'Session started successfully.' };
            };
            ider.onClose = () => {
                _session = null;
                if (!result) result = { retCode: IMR.RES_SESSION_CLOSED, message: 'IDER session closed by AMT.' };
            };
        },
        onData(chunk) { ider.feed(chunk); },
        onClose() {
            if (!result) result = { retCode: IMR.RES_SESSION_CLOSED, message: 'Connection closed.' };
        },
        onError(msg) {
            if (!result) result = { retCode: IMR.RES_SOCKET_ERROR, message: msg };
        },
    });

    proto.connect();

    // Block (spin event loop) until session opens or error — max 30s
    const deadline = Date.now() + 30000;
    while (!result && Date.now() < deadline) deasync.sleep(50);

    if (!result) {
        proto.close(); ider.close(); _session = null;
        return { retCode: IMR.RES_TIMEOUT, message: 'Session startup timed out.' };
    }

    if (result.retCode !== IMR.RES_OK) { ider.close(); _session = null; }
    return result;
}

function stopSession() {
    if (!_session) return { retCode: IMR.RES_NOT_INITIALIZED, message: 'No active session.' };
    try { _session.proto.close(); } catch(e) {}
    try { _session.ider.close(); } catch(e) {}
    _session = null;
    return { retCode: IMR.RES_OK, message: 'Closed session successfully.' };
}

function getStats() {
    if (!_session) return { retCode: IMR.RES_NOT_INITIALIZED };
    const { ider } = _session;
    return {
        retCode:       IMR.RES_OK,
        data_transfer: ider.bytesIn > 0 || ider.bytesOut > 0,
        data_sent:     ider.bytesOut,
        data_received: ider.bytesIn,
    };
}

module.exports = { startIderSession, stopSession, getStats };
