#!/usr/bin/env node
/**
 * amt-net.js — Read/write AMT_EthernetPortSettings via WS-Man
 *
 * Usage:
 *   node amt-net.js get   <host> <user> <pass> [--tls]
 *   node amt-net.js dhcp  <host> <user> <pass> [--tls]
 *   node amt-net.js static <host> <user> <pass> <ip> <mask> <gw> <dns1> [dns2] [--tls]
 *
 * Connects to AMT WS-Man on port 16992 (plain) or 16993 (TLS).
 * Uses HTTP Digest auth. Sends WS-Man Get then Put for write operations.
 *
 * AMT_EthernetPortSettings resource URI (Intel AMT spec):
 *   http://intel.com/wbem/wscim/1/amt-schema/1/AMT_EthernetPortSettings
 * Selector: InstanceID = "Intel(r) AMT Ethernet Port Settings 0"  (wired)
 */
'use strict';
const https  = require('https');
const http   = require('http');
const crypto = require('crypto');

const AMT_NS = 'http://intel.com/wbem/wscim/1/amt-schema/1/AMT_EthernetPortSettings';
const WSMAN_NS = 'http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd';
const ADDR_NS  = 'http://schemas.xmlsoap.org/ws/2004/08/addressing';
const XFER_NS  = 'http://schemas.xmlsoap.org/ws/2004/09/transfer';
const SELECTOR = 'Intel(r) AMT Ethernet Port Settings 0';

let _nc = 1;

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

function digestHeader(method, path, user, pass, wwwAuth) {
    const fields = {};
    const re = /(\w+)="?([^",\s]+)"?/g;
    let m;
    while ((m = re.exec(wwwAuth)) !== null) fields[m[1]] = m[2];
    const nc     = String(_nc++).padStart(8, '0');
    const cnonce = crypto.randomBytes(4).toString('hex');
    const ha1    = md5(`${user}:${fields.realm}:${pass}`);
    const ha2    = md5(`${method}:${path}`);
    const resp   = md5(`${ha1}:${fields.nonce}:${nc}:${cnonce}:${fields.qop}:${ha2}`);
    return `Digest username="${user}", realm="${fields.realm}", nonce="${fields.nonce}", ` +
           `uri="${path}", qop=${fields.qop}, nc=${nc}, cnonce="${cnonce}", response="${resp}"`;
}

function wsmanEnvelope(action, body, extra) {
    const msgId = `uuid:${crypto.randomUUID()}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:a="${ADDR_NS}"
            xmlns:w="${WSMAN_NS}"
            xmlns:x="${XFER_NS}">
  <s:Header>
    <a:Action s:mustUnderstand="true">${action}</a:Action>
    <a:To>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:To>
    <w:ResourceURI s:mustUnderstand="true">${AMT_NS}</w:ResourceURI>
    <a:MessageID>${msgId}</a:MessageID>
    <a:ReplyTo><a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <w:OperationTimeout>PT60.000S</w:OperationTimeout>
    <w:SelectorSet><w:Selector Name="InstanceID">${SELECTOR}</w:Selector></w:SelectorSet>
    ${extra || ''}
  </s:Header>
  <s:Body>${body}</s:Body>
</s:Envelope>`;
}

function request(opts, body, auth) {
    return new Promise((resolve, reject) => {
        const headers = {
            'Content-Type':   'application/soap+xml;charset=UTF-8',
            'Content-Length': Buffer.byteLength(body),
        };
        if (auth) headers['Authorization'] = auth;
        const lib = opts.tls ? https : http;
        const req = lib.request({
            hostname:           opts.host,
            port:               opts.tls ? 16993 : 16992,
            path:               '/wsman',
            method:             'POST',
            headers,
            rejectUnauthorized: false,
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end',  () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function wsmanCall(opts, action, body, extra) {
    const envelope = wsmanEnvelope(action, body, extra);
    let r = await request(opts, envelope, null);
    if (r.status === 401) {
        const wwwAuth = r.headers['www-authenticate'] || '';
        const auth = digestHeader('POST', '/wsman', opts.user, opts.pass, wwwAuth);
        r = await request(opts, envelope, auth);
    }
    return r;
}

function extractTag(xml, tag) {
    const re = new RegExp(`<[^:>]*:?${tag}[^>]*>(.*?)<\/[^:>]*:?${tag}>`, 's');
    const m = xml.match(re);
    return m ? m[1].trim() : null;
}

async function getSettings(opts) {
    const r = await wsmanCall(opts, `${XFER_NS}/Get`, '');
    if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${r.body.slice(0, 200)}`);
    return r.body;
}

function buildPutBody(fields) {
    const ns = AMT_NS;
    const tag = 'AMT_EthernetPortSettings';
    let inner = '';
    for (const [k, v] of Object.entries(fields)) {
        inner += `\n      <r:${k}>${v}</r:${k}>`;
    }
    return `<r:${tag} xmlns:r="${ns}">${inner}\n    </r:${tag}>`;
}

async function putSettings(opts, fields) {
    const body = buildPutBody(fields);
    const r = await wsmanCall(opts, `${XFER_NS}/Put`, body);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${r.body.slice(0, 400)}`);
    return r.body;
}

// ---- CLI ----
const args  = process.argv.slice(2);
const cmd   = args[0];
const host  = args[1];
const user  = args[2];
const pass  = args[3];
const tls   = args.includes('--tls');
const opts  = { host, user, pass, tls };

if (!cmd || !host || !user || !pass) {
    console.error('Usage: node amt-net.js <get|dhcp|static> <host> <user> <pass> [options]');
    console.error('  static: ... <ip> <mask> <gw> <dns1> [dns2] [--tls]');
    process.exit(1);
}

(async () => {
    try {
        if (cmd === 'get') {
            const xml = await getSettings(opts);
            for (const field of ['DHCPEnabled','IPAddress','SubnetMask','DefaultGateway',
                                  'PrimaryDNS','SecondaryDNS','MACAddress','LinkIsUp']) {
                const v = extractTag(xml, field);
                if (v !== null) console.log(`${field}: ${v}`);
            }
        } else if (cmd === 'dhcp') {
            // First Get to retrieve the full instance (Put requires full object)
            const xml = await getSettings(opts);
            const fields = {};
            for (const f of ['InstanceID','MACAddress','LinkIsUp','LinkPreference',
                              'LinkControl','SharedMAC','SharedStaticIp','SharedDynamicIP',
                              'IpSyncEnabled','ConsoleTcpMaxRetransmissions','VLANTag',
                              'WLANLinkProtectionLevel']) {
                const v = extractTag(xml, f);
                if (v !== null) fields[f] = v;
            }
            fields['DHCPEnabled'] = 'true';
            // Remove static IP fields per AMT spec
            delete fields['IPAddress'];
            delete fields['SubnetMask'];
            delete fields['DefaultGateway'];
            delete fields['PrimaryDNS'];
            delete fields['SecondaryDNS'];
            await putSettings(opts, fields);
            console.log('AMT NIC set to DHCP. Allow ~10s for AMT to rebind.');
        } else if (cmd === 'static') {
            const ip   = args[4];
            const mask = args[5];
            const gw   = args[6];
            const dns1 = args[7];
            const dns2 = args[8] && !args[8].startsWith('--') ? args[8] : '0.0.0.0';
            if (!ip || !mask || !gw || !dns1) {
                console.error('static requires: <ip> <mask> <gw> <dns1> [dns2]');
                process.exit(1);
            }
            const xml = await getSettings(opts);
            const fields = {};
            for (const f of ['InstanceID','MACAddress','LinkIsUp','LinkPreference',
                              'LinkControl','SharedMAC','SharedStaticIp','SharedDynamicIP',
                              'IpSyncEnabled','ConsoleTcpMaxRetransmissions','VLANTag',
                              'WLANLinkProtectionLevel']) {
                const v = extractTag(xml, f);
                if (v !== null) fields[f] = v;
            }
            Object.assign(fields, {
                DHCPEnabled:    'false',
                IPAddress:      ip,
                SubnetMask:     mask,
                DefaultGateway: gw,
                PrimaryDNS:     dns1,
                SecondaryDNS:   dns2,
            });
            await putSettings(opts, fields);
            console.log(`AMT NIC set to static ${ip}/${mask} gw ${gw}. Allow ~10s for AMT to rebind.`);
        } else {
            console.error(`Unknown command: ${cmd}. Use get, dhcp, or static.`);
            process.exit(1);
        }
    } catch(e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
})();
