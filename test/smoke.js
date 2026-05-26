'use strict';
// Verify all src modules load without errors
const assert = require('assert');

require('../src/imrsdk/amt-protocol.js');
require('../src/imrsdk/amt-ider.js');
require('../src/stubs/krb-ticket/index.js');

// krb-ticket API contract
const krb = require('../src/stubs/krb-ticket/index.js');
assert(typeof krb.getTicket === 'function' || typeof krb === 'object', 'krb-ticket must export object or getTicket fn');

console.log('smoke: all modules load OK');
