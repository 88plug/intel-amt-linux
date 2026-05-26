'use strict';
// Compatibility shim: expose @electron/remote as electron.remote
// Required because Electron 14+ removed the built-in remote module.
// IMC's minified main.js calls require('electron').remote.* throughout.
const remote = require('@electron/remote');
Object.defineProperty(require('electron'), 'remote', { get: () => remote });

// --- AMT Credential Vault (step 3) ---
// Intercepts the auth dialog DOM to auto-fill and offer to save passwords.
// Uses safeStorage (OS keyring) via ipcRenderer → main process vault handlers.
const { ipcRenderer } = require('electron');

// Track which hostname the Connect button was last clicked for.
let _pendingHost = null;

window.addEventListener('DOMContentLoaded', () => {
    // Capture-phase click listener: fires before IMC's own listeners.
    document.addEventListener('click', (e) => {
        // Walk up from the clicked element to find the computerListItemView container.
        const view = e.target.closest('.computerListItemView');
        if (!view) return;
        // The Connect button or anywhere inside the card triggers this.
        const hostnameEl = view.querySelector('[id="id-clivDetailsHostname"]');
        if (hostnameEl && hostnameEl.textContent.trim()) {
            _pendingHost = hostnameEl.textContent.trim();
        }
    }, true);

    // MutationObserver: watch for the auth dialog to appear in the DOM.
    const observer = new MutationObserver(() => {
        const userInput = document.getElementById('id-authDlg-username');
        const passInput = document.getElementById('id-authDlg-password');

        if (!userInput || !passInput || userInput._vaultWired) return;
        userInput._vaultWired = true;

        const host = _pendingHost;

        // Auto-fill from vault if we have saved credentials.
        if (host) {
            ipcRenderer.invoke('vault:load', host).then((cred) => {
                if (!cred) return;
                if (!userInput.value) userInput.value = cred.user;
                if (!passInput.value) passInput.value = cred.pass;
                // Mark "Remember" checkbox as checked since we found saved creds.
                const chk = document.getElementById('_amt-remember-cb');
                if (chk) chk.checked = true;
            });
        }

        // Inject "Remember credentials" checkbox into the auth dialog.
        const container = passInput.closest('div') || passInput.parentElement;
        if (container && !document.getElementById('_amt-remember-cb')) {
            const label = document.createElement('label');
            label.style.cssText = 'display:block;margin-top:6px;font-size:12px;cursor:pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id   = '_amt-remember-cb';
            cb.style.marginRight = '5px';
            label.appendChild(cb);
            label.appendChild(document.createTextNode('Remember credentials'));
            container.parentElement ? container.parentElement.appendChild(label)
                                    : container.appendChild(label);
        }

        // Hook the dialog OK button to save credentials when "Remember" is checked.
        // IMC uses a dialog with class "dialogButton" or similar for OK.
        // We watch for any button click inside the auth dialog area.
        const authArea = passInput.closest('[id]') || passInput.closest('div');
        if (authArea) {
            authArea.addEventListener('click', (e) => {
                const btn = e.target.closest('input[type="button"]');
                if (!btn || btn.id === '_amt-remember-cb') return;
                const cb = document.getElementById('_amt-remember-cb');
                if (!cb || !cb.checked) return;
                const h = host || _pendingHost;
                const u = (document.getElementById('id-authDlg-username') || {}).value;
                const p = (document.getElementById('id-authDlg-password') || {}).value;
                if (h && u && p) ipcRenderer.invoke('vault:save', h, u, p);
            }, true);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
});
