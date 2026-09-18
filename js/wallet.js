// AEVON Token Launchpad - Wallet Manager with Privy
const PRIVY_APP_ID = 'cmu89bi4v003q0ck0zhejxqsk';

const WALLET_META = [
  { key: 'isMetaMask', name: 'MetaMask', icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg', url: 'https://metamask.io/download/' },
  { key: 'isRabby', name: 'Rabby Wallet', icon: 'https://rabby.io/assets/images/logo.svg', url: 'https://rabby.io/' },
  { key: 'isCoinbaseWallet', name: 'Coinbase Wallet', icon: 'https://altcoinsbox.com/wp-content/uploads/2022/12/coinbase-logo-300x300.webp', url: 'https://www.coinbase.com/wallet' },
  { key: 'isTrust', name: 'Trust Wallet', icon: 'https://trustwallet.com/assets/images/media/assets/trust_platform.svg', url: 'https://trustwallet.com/download' },
  { key: 'isBitKeep', name: 'Bitget Wallet', icon: 'https://img.bitgetimg.com/multiLang/web/43cba33a57c039c9feef3a1178614dc9.png', url: 'https://web3.bitget.com/wallet-download' },
  { key: 'isOkxWallet', name: 'OKX Wallet', icon: 'https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png', url: 'https://www.okx.com/web3' },
  { key: 'isPhantom', name: 'Phantom', icon: 'https://phantom.app/img/phantom-logo.svg', url: 'https://phantom.app/download' },
  { key: 'isRainbow', name: 'Rainbow', icon: 'https://avatars.githubusercontent.com/u/48327834?s=200&v=4', url: 'https://rainbow.me/' },
];

class WalletManager {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.connected = false;
    this.listeners = [];
    this.privy = null;
    this._eip6963Wallets = [];
    this._privyReady = this._initPrivy();
    this._listenEIP6963();
    this._autoReconnect();
  }

  on(event, fn) {
    this.listeners.push({ event, fn });
  }

  emit(event, data) {
    this.listeners.filter(l => l.event === event).forEach(l => l.fn(data));
  }

  async _initPrivy() {
    try {
      const module = await import('https://cdn.jsdelivr.net/npm/@privy-io/js-sdk-core@0.38.3/+esm');
      const PrivyClient = module.PrivyClient || module.default;
      if (PrivyClient) {
        this.privy = new PrivyClient({ appId: PRIVY_APP_ID });
      }
    } catch (e) {
      console.warn('Privy SDK not available, using direct wallet connection', e);
    }
  }

  _listenEIP6963() {
    window.addEventListener('eip6963:announceProvider', (e) => {
      const exists = this._eip6963Wallets.find(w => w.info.uuid === e.detail.info.uuid);
      if (!exists) this._eip6963Wallets.push(e.detail);
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  }

  _detectWallets() {
    const wallets = [];
    const seen = new Set();

    // EIP-6963 wallets first (modern standard)
    for (const w of this._eip6963Wallets) {
      if (seen.has(w.info.name)) continue;
      seen.add(w.info.name);
      const matchedMeta = WALLET_META.find(m => w.info.name.toLowerCase().includes(m.name.toLowerCase().split(' ')[0]));
      wallets.push({
        name: w.info.name,
        icon: w.info.icon,
        provider: w.provider,
        key: matchedMeta?.key || w.info.name,
      });
    }

    // Legacy: check window.ethereum.providers array
    const providers = window.ethereum?.providers || (window.ethereum ? [window.ethereum] : []);
    for (const p of providers) {
      for (const meta of WALLET_META) {
        if (p[meta.key] && !seen.has(meta.name)) {
          seen.add(meta.name);
          wallets.push({ name: meta.name, icon: meta.icon, provider: p, key: meta.key });
        }
      }
    }

    return wallets;
  }

  async _autoReconnect() {
    try {
      const saved = localStorage.getItem('aevon_wallet_connected');
      if (!saved) return;
      if (saved === 'external' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length) {
          this.provider = new ethers.BrowserProvider(window.ethereum);
          this.signer = await this.provider.getSigner();
          this.address = accounts[0];
          this.chainId = await window.ethereum.request({ method: 'eth_chainId' });
          this.connected = true;
          await window.contractManager.init(this.provider, this.signer);
          this.updateUI();
          this._setupExternalListeners();
          this.emit('connected', { address: this.address });
        } else {
          localStorage.removeItem('aevon_wallet_connected');
        }
      }
    } catch {
      localStorage.removeItem('aevon_wallet_connected');
    }
  }

  connect() {
    this._showConnectModal();
  }

  _showConnectModal() {
    if (document.getElementById('connectModal')) return;

    const detected = this._detectWallets();
    const detectedKeys = new Set(detected.map(w => w.key));

    const walletList = [];
    // Detected wallets first
    for (const w of detected) {
      walletList.push({ ...w, installed: true });
    }
    // Then undetected popular wallets
    for (const meta of WALLET_META) {
      if (!detectedKeys.has(meta.key)) {
        walletList.push({ name: meta.name, icon: meta.icon, url: meta.url, installed: false, key: meta.key });
      }
    }

    const walletsHtml = walletList.map((w, i) => `
      <button class="connect-option${w.installed ? '' : ' connect-option-uninstalled'}" data-wallet-idx="${i}">
        <img src="${w.icon}" alt="${w.name}" width="32" height="32" style="border-radius:8px;object-fit:contain" onerror="this.style.display='none'">
        <div class="connect-option-info">
          <span class="connect-option-name">${w.name}</span>
          <span class="connect-option-desc">${w.installed ? 'Detected' : 'Install'}</span>
        </div>
      </button>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'connectModal';
    modal.className = 'connect-modal-overlay';
    modal.innerHTML = `
      <div class="connect-modal">
        <div class="connect-modal-header">
          <h3>Connect Wallet</h3>
          <button class="connect-modal-close" id="connectModalClose">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="connect-modal-body">
          ${walletsHtml}
          <div class="connect-divider"><span>or</span></div>
          <button class="connect-option connect-option-social" id="optEmail">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-1)" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
            <div class="connect-option-info">
              <span class="connect-option-name">Email</span>
              <span class="connect-option-desc">Sign in with email</span>
            </div>
          </button>
        </div>
        <div class="connect-modal-footer">
          <p>Powered by <strong>Privy</strong></p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('connectModalClose').onclick = () => this._closeModal();
    modal.onclick = (e) => { if (e.target === modal) this._closeModal(); };

    // Wallet buttons
    modal.querySelectorAll('[data-wallet-idx]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.walletIdx);
        const wallet = walletList[idx];
        this._closeModal();
        if (wallet.installed && wallet.provider) {
          this._connectWithProvider(wallet.provider, wallet.name);
        } else if (wallet.url) {
          window.open(wallet.url, '_blank');
        }
      };
    });

    // Email
    document.getElementById('optEmail').onclick = () => { this._closeModal(); this._connectPrivy('email'); };
  }

  _closeModal() {
    const modal = document.getElementById('connectModal');
    if (modal) modal.remove();
  }

  async _connectWithProvider(walletProvider, walletName) {
    try {
      const accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) {
        showToast('No accounts found. Please unlock your wallet.', 'error');
        return false;
      }

      this.provider = new ethers.BrowserProvider(walletProvider);
      this.signer = await this.provider.getSigner();
      this.address = accounts[0];
      this.chainId = await walletProvider.request({ method: 'eth_chainId' });
      this.connected = true;
      this._activeProvider = walletProvider;
      try { localStorage.setItem('aevon_wallet_connected', 'external'); } catch {}

      await window.contractManager.init(this.provider, this.signer);

      if (this.chainId !== CONTRACTS.CHAIN_CONFIG.chainId) {
        await window.contractManager.switchToRobinhood();
      }

      this.updateUI();
      this._setupExternalListeners(walletProvider);
      this.emit('connected', { address: this.address });
      showToast(`Connected: ${walletName}`, 'success');
      return true;
    } catch (err) {
      if (err.code === 4001) {
        showToast('Connection rejected by user.', 'error');
      } else {
        showToast('Failed to connect wallet.', 'error');
        console.error(err);
      }
      return false;
    }
  }

  async _connectPrivy(method) {
    await this._privyReady;
    if (!this.privy) {
      showToast('Privy not available. Please use an external wallet.', 'error');
      return;
    }
    try {
      showToast(`Connecting via ${method}...`, 'info');
      await this.privy.login({ loginMethods: [method] });
      const user = this.privy.user;
      if (user?.wallet?.address) {
        this.address = user.wallet.address;
        const provider = await this.privy.getEthereumProvider();
        this.provider = new ethers.BrowserProvider(provider);
        this.signer = await this.provider.getSigner();
        this.connected = true;
        await window.contractManager.init(this.provider, this.signer);
        this.updateUI();
        this.emit('connected', { address: this.address });
        showToast(`Connected: ${this.shortAddress()}`, 'success');
      }
    } catch (err) {
      console.error('Privy login failed:', err);
      showToast('Login failed. Please try again.', 'error');
    }
  }

  async disconnect() {
    if (this.privy?.authenticated) {
      try { await this.privy.logout(); } catch {}
    }
    try { localStorage.removeItem('aevon_wallet_connected'); } catch {}
    this._activeProvider = null;
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.connected = false;
    this.updateUI();
    this.emit('disconnected');
    showToast('Wallet disconnected.', 'info');
  }

  _setupExternalListeners(walletProvider) {
    const p = walletProvider || window.ethereum;
    if (!p) return;

    p.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.disconnect();
      } else {
        this.address = accounts[0];
        this.updateUI();
        this.emit('accountChanged', { address: this.address });
      }
    });

    p.on('chainChanged', (chainId) => {
      this.chainId = chainId;
      this.emit('chainChanged', { chainId });
      if (chainId !== CONTRACTS.CHAIN_CONFIG.chainId) {
        showToast('Please switch to Robinhood network.', 'info');
      }
    });
  }

  shortAddress() {
    if (!this.address) return '';
    return this.address.slice(0, 6) + '...' + this.address.slice(-4);
  }

  updateUI() {
    const btns = document.querySelectorAll('#btnConnect, #btnConnectMobile');
    btns.forEach(btn => {
      if (this.connected) {
        btn.innerHTML = `<span>${this.shortAddress()}</span>`;
        btn.classList.add('connected');
        btn.onclick = () => this.disconnect();
      } else {
        btn.innerHTML = `<span>Connect</span>`;
        btn.classList.remove('connected');
        btn.onclick = () => this.connect();
      }
    });

    const prompt = document.getElementById('portfolioPrompt');
    if (prompt && this.connected) {
      this.emit('connected', { address: this.address });
    }
  }

  async getBalance() {
    if (!this.provider || !this.address) return '0';
    const balance = await this.provider.getBalance(this.address);
    return ethers.formatEther(balance);
  }

  async getTokenBalance(tokenAddress) {
    if (!this.address) return '0';
    try {
      const token = window.contractManager.getToken(tokenAddress);
      const balance = await token.balanceOf(this.address);
      return balance;
    } catch {
      return 0n;
    }
  }
}

window.walletManager = new WalletManager();
