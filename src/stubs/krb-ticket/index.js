'use strict';

// Kerberos stub for Linux — IMC uses this for domain auth (Windows-only).
// Returns "not supported" so IMC falls back to digest auth.
module.exports = {
    getTicket: function(host, port, spn) {
        return { retCode: 1, ticket: '' };
    }
};
