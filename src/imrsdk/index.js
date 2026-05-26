'use strict';

// Intel AMT Redirection SDK — Linux JavaScript port.
// Replaces imrsdk.node (PE32 Windows DLL) with pure Node.js IDER/SOL implementation.
// Uses the same synchronous API surface as the original C++ N-API binding.
//
// Underlying protocol engine vendored from MeshCentral (Apache 2.0, Intel Corp copyright).
// IMR SDK result codes mirror IMRSDK.h enum IMRResult.

const deasync = require('deasync');
const CreateAmtRemoteIder = require('./amt-ider-standalone.js');
const CreateAmtRedirect = require('./amt-redir-standalone.js');
const path = require('path');
const fs = require('fs');

const IMR_RES = {
    OK: 0,
    ERROR: 1,
    INVALID_PARAMETER: 2,
    NOT_INITIALIZED: 3,
    ALREADY_INITIALIZED: 4,
    MEMALLOC_FAILED: 5,
    UNSUPPORTED: 6,
    CLIENT_NOT_FOUND: 7,
    DUPLICATE_CLIENT: 8,
    CLIENT_NOT_ACTIVE: 9,
    CLIENT_ACTIVE: 10,
    SESSION_ALREADY_OPEN: 11,
    SESSION_CLOSED: 12,
    SOCKET_ERROR: 13,
};

let _session = null;
let _stats = { data_transfer: false, data_sent: 0, data_received: 0 };

// params: useTls(bool), hostname(str), username(str), password(str),
//         imgPath(str), isoPath(str), timing(int 0=graceful/1=onreset/2=immediate)
function startIderSession(useTls, hostname, username, password, imgPath, isoPath, timing) {
    if (typeof hostname !== 'string' || !hostname) {
        return { retCode: IMR_RES.INVALID_PARAMETER, message: 'Must supply valid hostname.' };
    }
    if (typeof username !== 'string') {
        return { retCode: IMR_RES.INVALID_PARAMETER, message: 'Must supply valid username.' };
    }
    if (typeof password !== 'string') {
        return { retCode: IMR_RES.INVALID_PARAMETER, message: 'Must supply valid password.' };
    }
    if (typeof imgPath !== 'string') {
        return { retCode: IMR_RES.INVALID_PARAMETER, message: 'Must supply valid imgPath.' };
    }
    if (typeof isoPath !== 'string') {
        return { retCode: IMR_RES.INVALID_PARAMETER, message: 'Must supply valid isoPath.' };
    }

    if (_session) {
        return { retCode: IMR_RES.SESSION_ALREADY_OPEN, message: 'Session already open.' };
    }

    const iderModule = CreateAmtRemoteIder();

    // Map timing param to iderStart values: 0=graceful, 1=onreset, 2=immediate
    iderModule.iderStart = timing || 0;

    // Attach disk images
    if (imgPath && fs.existsSync(imgPath)) {
        iderModule.floppy = imgPath;
        iderModule.floppyReady = true;
    }
    if (isoPath && fs.existsSync(isoPath)) {
        iderModule.cdrom = isoPath;
        iderModule.cdromReady = true;
    }

    const port = useTls ? 16995 : 16994;
    const redir = CreateAmtRedirect(iderModule);

    let done = false;
    let result = null;

    redir.onStateChanged = function(stack, newState) {
        if (newState === 4) { // connected and auth done
            _session = { redir, iderModule };
            _stats = { data_transfer: false, data_sent: 0, data_received: 0 };
            result = { retCode: IMR_RES.OK, message: 'Session started successfully.' };
            done = true;
        }
    };

    iderModule.onDone = function() {
        if (!done) {
            result = { retCode: IMR_RES.SESSION_CLOSED, message: 'IDER session closed by AMT.' };
            done = true;
        }
    };

    iderModule.onBytesTransferred = function(toAmt, fromAmt) {
        _stats.data_sent = toAmt;
        _stats.data_received = fromAmt;
        _stats.data_transfer = true;
    };

    try {
        redir.Start(hostname, port, username, password, useTls, false, null);
    } catch(e) {
        return { retCode: IMR_RES.SOCKET_ERROR, message: 'Connect failed: ' + e.message };
    }

    // Block synchronously (up to 30s) until session established or error.
    // deasync spins the libuv event loop so async callbacks fire while blocked.
    const timeout = Date.now() + 30000;
    while (!done && Date.now() < timeout) {
        deasync.sleep(50);
    }

    if (!done) {
        if (_session) { try { _session.redir.Stop(); } catch(e) {} _session = null; }
        return { retCode: IMR_RES.TIMEOUT, message: 'Session startup timed out.' };
    }

    return result;
}

function stopSession() {
    if (!_session) {
        return { retCode: IMR_RES.NOT_INITIALIZED, message: 'No active session.' };
    }
    try {
        _session.redir.Stop();
    } catch(e) {}
    _session = null;
    _stats = { data_transfer: false, data_sent: 0, data_received: 0 };
    return { retCode: IMR_RES.OK, message: 'Closed session successfully.' };
}

function getStats() {
    if (!_session) {
        return { retCode: IMR_RES.NOT_INITIALIZED };
    }
    return {
        retCode: IMR_RES.OK,
        data_transfer: _stats.data_transfer,
        data_sent: _stats.data_sent,
        data_received: _stats.data_received,
    };
}

module.exports = { startIderSession, stopSession, getStats };
