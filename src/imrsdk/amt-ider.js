'use strict';

/**
 * Intel AMT IDE Redirection (IDER) Protocol handler
 * Ref: Intel AMT Implementation and Reference Guide §7 — IDE Redirection
 *
 * After the transport reaches S_OPEN and sends REDIR_START_IDER, AMT sends
 * IDER negotiation then SCSI commands (emulating a BIOS talking to a disk).
 * We serve sectors from local .img (floppy, drive0) and .iso (CD-ROM, drive1).
 *
 * IDER packet format (§7.2):
 *   [cmd:1][flags:1][seq_h:2][seq_l:2][len:2] [payload:len]
 */

const fs = require('fs');

// IDER command bytes (§7.3)
const IDER_OPEN_SESSION       = 0x40;
const IDER_CLOSE_SESSION      = 0x41;
const IDER_HEARTBEAT          = 0x42;
const IDER_COMMAND_FROM_AMT   = 0x48;
const IDER_RESPONSE_TO_AMT    = 0x49;
const IDER_FEATURES_RESPONSE  = 0x61;

// SCSI command opcodes
const SCSI_READ10             = 0x28;
const SCSI_READ_CAPACITY10    = 0x25;
const SCSI_MODE_SENSE6        = 0x1A;
const SCSI_MODE_SENSE10       = 0x5A;
const SCSI_REQUEST_SENSE      = 0x03;
const SCSI_INQUIRY            = 0x12;
const SCSI_TEST_UNIT_READY    = 0x00;
const SCSI_GET_CONFIGURATION  = 0x46;
const SCSI_READ_TOC           = 0x43;

const SECTOR = 2048;  // CD-ROM logical block size

function u16be(buf, off) { return (buf[off] << 8) | buf[off + 1]; }
function u32be(buf, off) { return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0; }

function be16(v) { return Buffer.from([(v >> 8) & 0xff, v & 0xff]); }
function be32(v) { return Buffer.from([(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]); }

// Build IDER response packet header
function iderHdr(seq, payloadLen) {
    const hdr = Buffer.alloc(8);
    hdr[0] = IDER_RESPONSE_TO_AMT;
    hdr[1] = 0x00;
    hdr.writeUInt16BE((seq >>> 16) & 0xffff, 2);
    hdr.writeUInt16BE(seq & 0xffff, 4);
    hdr.writeUInt16BE(payloadLen, 6);
    return hdr;
}

module.exports = function createIder(imgPath, isoPath, timing) {
    const obj = {
        seq:         0,
        bytesIn:     0,
        bytesOut:    0,
        active:      false,
        send:        null,   // set by caller: send(Buffer)
        onReady:     null,
        onClose:     null,
        acc:         Buffer.alloc(0),
    };

    // Open disk images
    let floppyFd = null, isoFd = null;
    let floppySectors = 0, isoSectors = 0;

    if (imgPath && fs.existsSync(imgPath)) {
        floppyFd = fs.openSync(imgPath, 'r');
        floppySectors = Math.ceil(fs.statSync(imgPath).size / 512);
    }
    if (isoPath && fs.existsSync(isoPath)) {
        isoFd = fs.openSync(isoPath, 'r');
        isoSectors = Math.ceil(fs.statSync(isoPath).size / SECTOR);
    }

    function sendPkt(payload) {
        const hdr = iderHdr(obj.seq++, payload.length);
        obj.send(Buffer.concat([hdr, payload]));
        obj.bytesOut += payload.length;
    }

    function readSectors(fd, lba, count, sectorSize) {
        const buf = Buffer.alloc(count * sectorSize);
        try {
            fs.readSync(fd, buf, 0, buf.length, lba * sectorSize);
        } catch(e) {
            return null;  // caller sends CHECK CONDITION
        }
        return buf;
    }

    function scsiResponse(driveIdx, statusByte, data) {
        // IDER SCSI response: [driveIdx:1][reserved:1][scsiStatus:1][senseLen:1][sense:senseLen][dataLen:2][data]
        const sense  = Buffer.alloc(0);
        const pkt    = Buffer.allocUnsafe(4 + sense.length + 2 + data.length);
        pkt[0] = driveIdx;
        pkt[1] = 0x00;
        pkt[2] = statusByte;
        pkt[3] = sense.length;
        sense.copy(pkt, 4);
        pkt.writeUInt16BE(data.length, 4 + sense.length);
        data.copy(pkt, 6 + sense.length);
        sendPkt(pkt);
    }

    function handleScsi(driveIdx, cdb) {
        const cmd = cdb[0];
        const isCD = driveIdx === 1;
        const fd   = isCD ? isoFd : floppyFd;
        const sectorSz = isCD ? SECTOR : 512;
        const totalSectors = isCD ? isoSectors : floppySectors;

        switch (cmd) {
            case SCSI_TEST_UNIT_READY:
                scsiResponse(driveIdx, 0x00, Buffer.alloc(0));
                break;

            case SCSI_READ_CAPACITY10: {
                const data = Buffer.alloc(8);
                be32(totalSectors - 1).copy(data, 0);
                be32(sectorSz).copy(data, 4);
                scsiResponse(driveIdx, 0x00, data);
                break;
            }

            case SCSI_READ10: {
                const lba   = u32be(cdb, 2);
                const count = u16be(cdb, 7);
                const raw   = fd ? readSectors(fd, lba, count, sectorSz) : Buffer.alloc(count * sectorSz);
                if (!raw) { scsiResponse(driveIdx, 0x02, Buffer.alloc(0)); break; }
                obj.bytesIn += raw.length;
                scsiResponse(driveIdx, 0x00, raw);
                break;
            }

            case SCSI_REQUEST_SENSE: {
                const data = Buffer.alloc(18);
                data[0] = 0x70; data[7] = 0x0a;  // no sense
                scsiResponse(driveIdx, 0x00, data);
                break;
            }

            case SCSI_INQUIRY: {
                const data = Buffer.alloc(36);
                data[0] = isCD ? 0x05 : 0x00;  // CD-ROM or disk
                data[1] = isCD ? 0x80 : 0x00;  // removable
                data[2] = 0x05;                 // SPC-3
                data[3] = 0x02;
                data[4] = 0x1f;                 // additional length
                Buffer.from('INTEL   ').copy(data, 8);
                Buffer.from(isCD ? 'AMT CD-ROM      ' : 'AMT FLOPPY      ').copy(data, 16);
                scsiResponse(driveIdx, 0x00, data);
                break;
            }

            case SCSI_MODE_SENSE6:
            case SCSI_MODE_SENSE10: {
                const data = Buffer.alloc(4);
                scsiResponse(driveIdx, 0x00, data);
                break;
            }

            case SCSI_GET_CONFIGURATION: {
                // Minimal Feature Descriptor List for CD-ROM
                const data = Buffer.alloc(8);
                be32(8).copy(data, 0);
                scsiResponse(driveIdx, 0x00, data);
                break;
            }

            case SCSI_READ_TOC: {
                // Simple TOC: one track, one session
                const data = Buffer.alloc(20);
                data[1] = 18; data[2] = 1; data[3] = 1;
                data[5] = 0x14; data[6] = 1;
                be32(0).copy(data, 8);
                data[13] = 0x14; data[14] = 0xaa;
                be32(isoSectors).copy(data, 16);
                scsiResponse(driveIdx, 0x00, data);
                break;
            }

            default:
                // Unknown command — reply with CHECK CONDITION / ILLEGAL REQUEST
                scsiResponse(driveIdx, 0x02, Buffer.alloc(0));
        }
    }

    function processPacket(pkt) {
        if (pkt.length < 8) return;
        const cmd = pkt[0];
        // const payLen = u16be(pkt, 6);
        const payload = pkt.slice(8);

        switch (cmd) {
            case IDER_OPEN_SESSION: {
                // Respond with IDER_FEATURES_RESPONSE then signal ready
                const resp = Buffer.alloc(8);
                resp[0] = IDER_FEATURES_RESPONSE;
                resp[1] = timing || 0;  // iderStart: 0=graceful,1=onreset,2=immediate
                obj.send(resp);
                obj.active = true;
                if (obj.onReady) obj.onReady();
                break;
            }
            case IDER_CLOSE_SESSION:
                obj.active = false;
                if (obj.onClose) obj.onClose();
                break;

            case IDER_HEARTBEAT:
                // Echo heartbeat back
                obj.send(Buffer.from([IDER_HEARTBEAT, 0, 0, 0, 0, 0, 0, 0]));
                break;

            case IDER_COMMAND_FROM_AMT: {
                if (payload.length < 2) break;
                const driveIdx = payload[0];
                const cdb = payload.slice(2, 2 + 16);
                handleScsi(driveIdx, cdb);
                break;
            }
        }
    }

    obj.feed = function(chunk) {
        obj.acc = Buffer.concat([obj.acc, chunk]);
        while (obj.acc.length >= 8) {
            const payLen = u16be(obj.acc, 6);
            const total  = 8 + payLen;
            if (obj.acc.length < total) break;
            processPacket(obj.acc.slice(0, total));
            obj.acc = obj.acc.slice(total);
        }
    };

    obj.close = function() {
        if (floppyFd !== null) { try { fs.closeSync(floppyFd); } catch(e) {} floppyFd = null; }
        if (isoFd    !== null) { try { fs.closeSync(isoFd);    } catch(e) {} isoFd    = null; }
    };

    return obj;
};
