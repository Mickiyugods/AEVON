// AEVON Token Launchpad - Main App
// On-chain Deploy, Buy/Sell trading on Robinhood Chain

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

class Router {
  constructor(routes) {
    this.routes = routes;
    window.addEventListener('popstate', () => this.resolve());
    document.addEventListener('click', e => {
      const link = e.target.closest('[data-link]');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) this.navigate(href);
      }
    });
  }
  navigate(path) {
    window.history.pushState(null, '', path);
    this.resolve();
  }
  resolve() {
    const path = window.location.pathname || '/';
    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match) { route.handler(match); this.updateActiveLink(path); window.scrollTo(0, 0); return; }
    }
    this.routes[0].handler([]);
  }
  updateActiveLink(path) {
    document.querySelectorAll('.nav-link[data-link]').forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === path);
    });
  }
}

// Featured / Official tokens — add token addresses here after deploying
const FEATURED_TOKENS = [
  {
    address: '0xA40ac4C7Ac21ECb1Ea283979a587e1Bb92E4C459',
    name: 'AevonPad',
    symbol: 'AEVONPAD',
    description: 'Build your token on Robinhood Chain. Fair launch, bonding curves, zero code.',
    logo: 'assets/aevonpad-logo.png',
    twitter: 'https://x.com/Aevonpad',
    website: 'https://aevonpad.com'
  }
];

class App {
  constructor() {
    this.chart = null;
    this.refreshInterval = null;
    this.tradeMode = 'buy';
    this.slippageBps = 200;
    this.currentTradeToken = null;

    this.router = new Router([
      { pattern: /^\/$/, handler: () => this.renderHome() },
      { pattern: /^\/create$/, handler: () => this.renderCreate() },
      { pattern: /^\/portfolio$/, handler: () => this.renderPortfolio() },
      { pattern: /^\/how$/, handler: () => this.renderHow() },
      { pattern: /^\/docs$/, handler: () => this.renderDocs() },
      { pattern: /^\/privacy$/, handler: () => this.renderLegal('tpl-privacy') },
      { pattern: /^\/terms$/, handler: () => this.renderLegal('tpl-terms') },
      { pattern: /^\/token\/(.+)$/, handler: (m) => this.openToken(m[1]) },
    ]);

    this.initNavbar();
    this.router.resolve();

    window.walletManager.on('connected', () => {
      if (window.location.pathname === '/portfolio') this.renderPortfolio();
    });
  }

  initNavbar() {
    const menu = document.getElementById('mobileMenu');
    const nav = document.getElementById('mobileNav');
    menu.addEventListener('click', () => nav.classList.toggle('open'));
    nav.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', () => nav.classList.remove('open')));
    document.getElementById('btnConnect').addEventListener('click', () => {
      if (window.walletManager.connected) window.walletManager.disconnect();
      else window.walletManager.connect();
    });
    document.getElementById('btnConnectMobile').addEventListener('click', () => {
      if (window.walletManager.connected) window.walletManager.disconnect();
      else window.walletManager.connect();
    });
  }

  // Formatting
  fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toLocaleString();
  }
  fmtPrice(p) {
    if (!p || p === 0) return '$0';
    if (p < 0.000001) return '$' + p.toExponential(2);
    if (p < 0.01) return '$' + p.toFixed(8);
    if (p < 1) return '$' + p.toFixed(6);
    if (p < 1000) return '$' + p.toFixed(4);
    return '$' + this.fmt(p);
  }
  fmtUSD(n) {
    if (!n) return '$0';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    return '$' + n.toFixed(2);
  }
  fmtETH(n) {
    if (!n || n === 0) return '0';
    if (n < 0.0001) {
      const s = n.toFixed(18);
      const m = s.match(/^0\.(0+)(\d{1,4})/);
      if (m) return `0.0<sub>${m[1].length}</sub>${m[2].replace(/0+$/, '')}`;
    }
    if (n < 1) return n.toFixed(6);
    return n.toFixed(4);
  }
  fmtTokens(n) {
    if (!n) return '0';
    if (typeof n === 'bigint') n = Number(ethers.formatEther(n));
    return this.fmt(n);
  }
  esc(str) {
    if (!str) return '';
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }
  fixLogoUrl(logo) {
    if (!logo) return '';
    if (logo.startsWith('ipfs://')) return 'https://gateway.pinata.cloud/ipfs/' + logo.slice(7);
    if (logo.startsWith('data:') || logo.startsWith('http://') || logo.startsWith('https://')) return logo;
    if (logo.startsWith('assets/')) return logo;
    return '';
  }
  timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // ---- HOME ----
  async renderHome() {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = '';
    const ticker = document.getElementById('tickerBar');
    if (ticker) ticker.style.display = '';

    this.currentSort = 'newest';
    const tpl = document.getElementById('tpl-home').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);
    this.renderFeatured();
    this.updateStats();
    await this.loadTokens();

    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch && !globalSearch._aevonBound) {
      let st;
      globalSearch.addEventListener('input', () => {
        clearTimeout(st);
        st = setTimeout(() => {
          if (window.location.pathname === '/') {
            this.loadTokens(globalSearch.value.trim());
          }
        }, 300);
      });
      globalSearch._aevonBound = true;
    }

    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSort = btn.dataset.sort;
        const q = globalSearch ? globalSearch.value.trim() : '';
        this.loadTokens(q, true);
      });
    });

    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => {
      if (window.location.pathname === '/') {
          const q = document.getElementById('globalSearch')?.value.trim() || '';
          this.loadTokens(q, true);
        }
    }, 15000);
  }

  async renderFeatured() {
    const section = document.getElementById('officialSection');
    const container = document.getElementById('officialCards');
    if (!section || !container || !FEATURED_TOKENS.length) return;

    section.style.display = '';

    const cards = await Promise.all(FEATURED_TOKENS.map(async (ft) => {
      let token = ft;
      if (ft.address && !ft._fetched) {
        try {
          await fetchEthPrice();
          const onChain = await window.contractManager.getTokenOnChainData(ft.address);
          if (onChain) {
            const qr = onChain.quoteReserve;
            const tr = onChain.tokenReserve;
            const priceEth = tr > 0n ? Number(qr) / Number(tr) : 0;
            const priceUsd = priceEth * ETH_PRICE_USD;
            const mcap = priceUsd * CONTRACTS.TOKEN_SUPPLY;
            const progressPct = onChain.progressBps / 100;
            const raisedEth = Number(ethers.formatEther(onChain.realQuoteReserve));
            token = { ...ft, priceEth, priceUsd, marketCapUsd: mcap, progressPct, raisedEth, graduated: onChain.graduated, _fetched: true };
          }
        } catch {}
      }
      const logoSrc = this.fixLogoUrl(token.logo);
      const initial = this.esc(token.symbol?.charAt(0) || '?');
      const logoHtml = logoSrc
        ? `<img src="${logoSrc}" alt="${this.esc(token.symbol)}" onerror="this.replaceWith(document.createTextNode('${initial}'))">`
        : `<span class="official-card-initial">${initial}</span>`;
      const desc = token.description ? this.esc(token.description).slice(0, 100) : '';
      return `
        <div class="official-card" data-addr="${token.address || ''}">
          <div class="official-card-left">
            <div class="official-card-logo">${logoHtml}</div>
            <div class="official-card-info">
              <div class="official-card-top">
                <span class="official-card-name">${this.esc(token.name)}</span>
                <span class="official-card-symbol">$${this.esc(token.symbol)}</span>
                <span class="official-badge">Official</span>
              </div>
              ${desc ? `<div class="official-card-desc">${desc}</div>` : ''}
            </div>
          </div>
          <div class="official-card-stats">
            ${token.marketCapUsd != null ? `<div class="official-stat"><span class="official-stat-label">Market Cap</span><span class="official-stat-value">${this.fmtUSD(token.marketCapUsd)}</span></div>` : ''}
            ${token.priceUsd != null ? `<div class="official-stat"><span class="official-stat-label">Price</span><span class="official-stat-value">${token.priceUsd < 0.01 ? '$' + token.priceUsd.toFixed(8) : this.fmtUSD(token.priceUsd)}</span></div>` : ''}
            ${token.volumeUsd != null ? `<div class="official-stat"><span class="official-stat-label">Volume</span><span class="official-stat-value">${this.fmtUSD(token.volumeUsd)}</span></div>` : ''}
            ${token.progressPct != null ? `<div class="official-stat"><span class="official-stat-label">Progress</span><span class="official-stat-value">${token.progressPct.toFixed(1)}%</span></div>` : ''}
          </div>
        </div>`;
    }));

    container.innerHTML = cards.join('');
    container.querySelectorAll('.official-card').forEach(card => {
      card.addEventListener('click', () => {
        const addr = card.dataset.addr;
        if (addr) this.router.navigate('/token/' + addr);
      });
    });
  }

  updateStats() {
    const c = window.tokenRegistry.getCount();
    const el = document.getElementById('statTokens');
    if (el) el.textContent = c;
  }

  async loadTokens(query = '', silent = false) {
    const grid = document.getElementById('tokenGrid');
    if (!grid) return;

    if (!silent) grid.innerHTML = Array(6).fill(`<div class="skeleton-card">
        <div class="sk-header"><div class="sk-badge"></div></div>
        <div class="sk-body">
          <div class="sk-line w60"></div>
          <div class="sk-line w40" style="height:12px"></div>
          <div class="sk-line h20 w80" style="margin-top:4px"></div>
          <div class="sk-line h4 w100" style="margin-top:6px"></div>
          <div class="sk-row"><div class="sk-line w40" style="height:11px"></div><div class="sk-line w40" style="height:11px"></div></div>
        </div>
      </div>`).join('');

    try {
      let tokens = await window.tokenRegistry.fetchLiveData();
      if (query) {
        const q = query.toLowerCase();
        tokens = tokens.filter(t => (t.name || '').toLowerCase().includes(q) || (t.symbol || '').toLowerCase().includes(q));
      }
      if (tokens.length === 0) {
        grid.innerHTML = query
          ? '<div class="empty-state"><h3>No tokens found</h3><p>Try a different search term</p></div>'
          : `<div class="empty-state">
              <h3>No tokens launched yet</h3>
              <p>Be the first to launch a token on AEVON.</p>
              <a href="/create" class="btn btn-primary btn-lg" data-link>Launch Token</a>
            </div>`;
        return;
      }
      const sort = this.currentSort || 'newest';
      if (sort === 'newest') tokens.sort((a, b) => new Date(b.launchedAt) - new Date(a.launchedAt));
      else if (sort === 'mcap') tokens.sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0));
      else if (sort === 'recent') tokens.sort((a, b) => new Date(b.launchedAt) - new Date(a.launchedAt));
      else if (sort === 'name') tokens.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.renderGrid(grid, tokens);
      this.updateLiveStats(tokens);
    } catch (e) {
      console.error('loadTokens error:', e);
      grid.innerHTML = '<div class="empty-state"><h3>Failed to load</h3><p>Check your connection and try again.</p></div>';
    }
  }

  updateLiveStats(tokens) {
    const el = document.getElementById('statTokens');
    if (el) el.textContent = tokens.length;
  }

  renderGrid(grid, tokens) {
    if (!tokens.length) {
      grid.innerHTML = '<div class="empty-state"><h3>No tokens launched yet</h3><a href="/create" class="btn btn-primary" data-link>+ Create</a></div>';
      return;
    }
    grid.innerHTML = tokens.map((t, i) => {
      const progress = t.graduationProgressPct || 0;
      const initial = this.esc(t.symbol?.charAt(0) || '?');
      const logoSrc = this.fixLogoUrl(t.logo);
      const logoHtml = logoSrc ? `<img src="${logoSrc}" alt="${this.esc(t.symbol)}" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(document.createTextNode('${initial}'))">` : initial;
      const addr = t.token ? t.token.slice(0,6) + '...' + t.token.slice(-4) : '';
      const badgeHtml = t.graduated ? '<span class="token-card-badge badge-graduated">graduated</span>' : '';
      return `
        <div class="token-card" data-token="${t.token}" data-idx="${i}">
          <div class="token-card-header">
            ${badgeHtml}
            <div class="token-card-logo">${logoHtml}</div>
          </div>
          <div class="token-card-body">
            <div class="token-card-title-row">
              <div class="token-card-name">${this.esc(t.name)}</div>
              <div class="token-card-symbol">$${this.esc(t.symbol)}</div>
            </div>
            <div class="token-card-mcap">${this.fmtUSD(t.marketCapUsd)} <span class="token-card-mcap-label">MC</span></div>
            <div class="token-card-footer">
              <span>${addr}</span>
              <span>${this.timeAgo(t.launchedAt)}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.token-card').forEach(card => {
      card.addEventListener('click', () => {
        window.app.router.navigate('/token/' + card.dataset.token);
      });
    });
  }

  // ---- TOKEN DETAIL PAGE ----
  async openToken(addr) {
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const ticker = document.getElementById('tickerBar');
    if (ticker) ticker.style.display = 'none';

    const tpl = document.getElementById('tpl-token').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);
    const container = document.getElementById('tokenDetailContent');

    container.innerHTML = `<div class="td-loading">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
        <div class="skeleton" style="width:52px;height:52px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px"><div class="sk-line w60"></div><div class="sk-line w40" style="height:12px"></div></div>
      </div>
      <div class="sk-line w100" style="height:200px;border-radius:8px;margin-bottom:16px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="sk-line" style="height:56px;border-radius:8px"></div><div class="sk-line" style="height:56px;border-radius:8px"></div><div class="sk-line" style="height:56px;border-radius:8px"></div><div class="sk-line" style="height:56px;border-radius:8px"></div></div>
    </div>`;

    try {
      const token = await window.tokenRegistry.fetchSingleToken(addr);
      if (token) this.renderTokenPage(token, container);
      else { container.innerHTML = '<div class="empty-state"><h3>Token not found</h3><p>This token is not in the AEVON registry.</p><a href="/" class="btn btn-primary" data-link>Back to Explore</a></div>'; }
    } catch (e) {
      console.error('openToken error:', e);
      container.innerHTML = '<div class="empty-state"><h3>Failed to load</h3><p>Check your connection and try again.</p><a href="/" class="btn btn-primary" data-link>Back to Explore</a></div>';
    }
  }

  renderTokenPage(token, container) {
    this.currentTradeToken = token;
    this.tradeMode = 'buy';
    const progress = token.graduationProgressPct || 0;
    const explorerUrl = window.ponsLinks.getExplorerUrl(token.token);
    const logoSrc = this.fixLogoUrl(token.logo);
    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none';this.parentElement.textContent='${this.esc(token.symbol?.charAt(0) || '?')}'">`
      : this.esc(token.symbol?.charAt(0) || '?');
    const priceEth = token.priceEth || 0;
    const tokensPerEth = priceEth > 0 ? Math.round(1 / priceEth) : 0;
    const shortContract = token.token ? token.token.slice(0,6) + '...' + token.token.slice(-4) : '—';
    const shortDeployer = token.deployer ? token.deployer.slice(0,6) + '...' + token.deployer.slice(-4) : '—';

    container.innerHTML = `
      <!-- Back link -->
      <a href="/" class="td-back-link" data-link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
        Back to explore
      </a>

      <!-- About card — two-column -->
      <div class="td-about-card">
        <div class="td-about-header">
          <div class="td-about-title">About</div>
          <div class="td-paired-badge">
            <span>Paired</span>
            <span style="font-weight:700">ETH</span>
          </div>
        </div>
        <div class="td-about-body">
          <div class="td-about-left">
            <div class="td-about-desc">${this.esc(token.description || 'No description provided.')}</div>
            <div class="td-creator-row">
              Creator ${shortDeployer}<span class="dot">&middot;</span>${((token.creatorTaxBps || 0) / 100).toFixed(2)}% creator tax
            </div>
          </div>
          <div class="td-about-right">
            <div class="td-supply-block">
              <div class="td-supply-label">Supply</div>
              <div class="td-supply-val">1,000,000,000<span class="td-supply-symbol">${this.esc(token.symbol)}</span></div>
              <div class="td-supply-sub">Fixed at launch</div>
            </div>
          </div>
        </div>
        <div class="td-about-actions">
          <button class="td-copy-btn" id="btnCopyContract">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            ${shortContract}
          </button>
          <a href="${explorerUrl}" target="_blank" rel="noopener" class="td-explorer-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Explorer
          </a>
          ${token.twitter ? `<a href="${this.esc(token.twitter)}" target="_blank" rel="noopener" class="td-explorer-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            X
          </a>` : ''}
          ${token.telegram ? `<a href="${this.esc(token.telegram)}" target="_blank" rel="noopener" class="td-explorer-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Telegram
          </a>` : ''}
          ${token.website ? `<a href="${this.esc(token.website)}" target="_blank" rel="noopener" class="td-explorer-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Website
          </a>` : ''}
        </div>
      </div>

      <!-- Creator fees card -->
      <div class="td-fees-card">
        <div class="td-fees-header">
          <div class="td-fees-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div class="td-fees-title">Creator fees</div>
        </div>
        <div class="td-fees-body">
          ${this.esc(token.symbol)} pays its creator fees to ${shortDeployer}. The creator can route them to holders instead, split pro-rata for each holder to claim from their profile menu.
        </div>
        <div class="td-fees-footer">
          <div class="td-fees-note">Only the fee recipient wallet can switch this on.</div>
          <a href="${window.ponsLinks.getTokenUrl(token.token)}" target="_blank" rel="noopener" class="td-pons-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            Pons Family ↗
          </a>
        </div>
      </div>

      <!-- Two-column: trade left, chart right -->
      <div class="td-main-grid">
        <!-- Left: token card with identity + curve + trade -->
        <div class="td-token-card">
          <div class="td-token-identity">
            <div class="td-logo">${logoHtml}</div>
            <div class="td-token-meta">
              <div class="td-token-name">${this.esc(token.name)}</div>
              <div class="td-token-badges">
                <span class="td-token-sym">${this.esc(token.symbol)}</span>
                <span class="td-paired-badge" style="font-size:11px;padding:2px 8px">${token.graduated ? 'Graduated' : 'Paired ETH'}</span>
              </div>
            </div>
          </div>

          <div class="td-curve-section">
            <div class="td-curve-header">
              <span class="td-curve-label">Bonding curve</span>
              <span class="td-curve-pct">${progress.toFixed(1)}% to graduation</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, progress)}%"></div></div>
            <div class="td-curve-detail">
              ${this.fmtETH(token.raisedEth)} of ${this.fmtETH(token.graduationEth || 4.2)} ETH raised. At the threshold the curve closes and liquidity moves to a Uniswap v4 pool.
            </div>
          </div>

          <div class="td-trade-area">
            <div class="trade-tabs">
              <button class="btn btn-primary trade-tab active" data-mode="buy" style="flex:1;border-radius:8px 0 0 8px">Buy</button>
              <button class="btn btn-outline trade-tab" data-mode="sell" style="flex:1;border-radius:0 8px 8px 0;border-left:0">Sell</button>
            </div>

            <div id="tradeForm">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
                <span style="color:var(--text-2)" id="tradeInputLabel">Pay ETH:</span>
                <span style="color:var(--text-3)" id="tradeBalance">Balance: --</span>
              </div>
              <input type="number" id="tradeAmount" placeholder="0" step="any" min="0" class="form-input" style="width:100%;margin-bottom:8px">
              <div style="display:flex;gap:6px;margin-bottom:12px">
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.01">0.01</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.05">0.05</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.1">0.1</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.5">0.5</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="1">1</button>
              </div>

              <div class="td-conversion" id="tradeConversion">1 ETH ≈ ${tokensPerEth > 0 ? this.fmt(tokensPerEth) : '—'} ${this.esc(token.symbol)}</div>
              <div id="tradeEstimate" style="font-size:13px;color:var(--text-3);margin-bottom:12px"></div>

              <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Slippage</div>
              <div style="display:flex;gap:6px;margin-bottom:16px">
                <button class="btn btn-outline btn-sm slip-btn" data-slip="100">1%</button>
                <button class="btn btn-primary btn-sm slip-btn active" data-slip="200">2%</button>
                <button class="btn btn-outline btn-sm slip-btn" data-slip="500">5%</button>
              </div>

              <button class="btn btn-primary btn-lg btn-full" id="tradeExec" style="font-weight:600;border-radius:10px">
                ${window.walletManager.connected ? 'Buy ' + this.esc(token.symbol) : 'Connect Wallet to Trade'}
              </button>
            </div>
          </div>
        </div>

        <!-- Right: stats + chart -->
        <div class="td-chart-col">
          <div class="td-stats-row">
            <div class="td-stat-cell"><div class="label">Price</div><div class="val">${this.fmtPrice(token.priceUsd)}</div></div>
            <div class="td-stat-cell"><div class="label">Market cap</div><div class="val">${this.fmtUSD(token.marketCapUsd)}</div></div>
            <div class="td-stat-cell"><div class="label">Price in ETH</div><div class="val">${priceEth > 0 ? this.fmtETH(priceEth) : '0'} ETH</div></div>
            <div class="td-stat-cell"><div class="label">Market</div><div class="val">${token.graduated ? 'Uniswap' : 'Bonding curve'}</div></div>
          </div>
          <div class="td-chart-area">
            <div class="td-chart-top">
              <div>
                <div class="td-chart-mcap">${this.fmtUSD(token.marketCapUsd)}</div>
                <div class="td-chart-change" style="color:var(--text-3);font-size:11px">ETH $${ETH_PRICE_USD.toLocaleString()}</div>
              </div>
              <div class="td-chart-ranges" id="chartRanges">
                <button class="td-range-btn" data-range="300000">5M</button>
                <button class="td-range-btn active" data-range="3600000">1H</button>
                <button class="td-range-btn" data-range="21600000">6H</button>
                <button class="td-range-btn" data-range="86400000">1D</button>
                <button class="td-range-btn" data-range="0">ALL</button>
              </div>
            </div>
            <div class="td-chart-wrap">
              <div id="chartLoading" style="position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;padding:16px">
                <div class="sk-line w100" style="flex:1;border-radius:6px"></div>
                <div class="sk-row" style="gap:12px"><div class="sk-line w40" style="height:10px"></div><div class="sk-line w40" style="height:10px"></div><div class="sk-line w40" style="height:10px"></div></div>
              </div>
              <canvas id="priceChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent trades section -->
      <div class="td-trades-card">
        <div class="td-trades-tabs">
          <button class="td-trades-tab active" data-panel="trades">Recent trades</button>
          <button class="td-trades-tab" data-panel="holders">Holders</button>
        </div>
        <div class="td-trades-content" id="tdTradesContent">
          <div class="td-trades-empty">Loading trades...</div>
        </div>
      </div>
    `;

    // Copy contract button
    document.getElementById('btnCopyContract')?.addEventListener('click', () => {
      navigator.clipboard.writeText(token.token).then(() => showToast('Contract address copied!', 'success')).catch(() => showToast('Failed to copy.', 'error'));
    });

    // Bottom trades/holders tab switching
    const tradesTabs = container.querySelectorAll('.td-trades-tab');
    const tradesContent = document.getElementById('tdTradesContent');

    tradesTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tradesTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.panel === 'holders') {
          this.loadHolders(token);
        } else {
          this.loadRecentTrades(token);
        }
      });
    });

    // Trade tabs
    container.querySelectorAll('.trade-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.trade-tab').forEach(t => { t.classList.remove('active'); t.classList.remove('btn-primary'); t.classList.add('btn-outline'); });
        tab.classList.add('active'); tab.classList.remove('btn-outline'); tab.classList.add('btn-primary');
        this.tradeMode = tab.dataset.mode;
        this.updateTradeUI(token);
      });
    });

    // Quick amounts
    container.querySelectorAll('.quick-amt').forEach(btn => {
      btn.addEventListener('click', () => { document.getElementById('tradeAmount').value = btn.dataset.amt; this.updateEstimate(token); });
    });

    // Slippage
    container.querySelectorAll('.slip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.slip-btn').forEach(b => { b.classList.remove('active'); b.classList.remove('btn-primary'); b.classList.add('btn-outline'); });
        btn.classList.add('active'); btn.classList.remove('btn-outline'); btn.classList.add('btn-primary');
        this.slippageBps = parseInt(btn.dataset.slip);
      });
    });

    // Chart range buttons
    container.querySelectorAll('.td-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.td-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Estimate on input
    document.getElementById('tradeAmount').addEventListener('input', () => this.updateEstimate(token));

    // Execute trade
    document.getElementById('tradeExec').addEventListener('click', () => this.executeTrade(token));

    this.updateTradeUI(token);
    this.loadPriceChart(token);
    this.loadRecentTrades(token);

    if (this._tradesInterval) clearInterval(this._tradesInterval);
    this._tradesInterval = setInterval(async () => {
      if (window.location.pathname.startsWith('/token/')) {
        this._curveEventsCache = null;
        const activeTab = document.querySelector('.td-trades-tab.active');
        if (activeTab?.dataset.panel === 'holders') {
          this.loadHolders(token);
        } else {
          this.loadRecentTrades(token);
        }
        const events = token.curve ? await this._fetchCurveEvents(token.curve, 5) : [];
        this._chartAllEvents = events.slice().sort((a, b) => (a.ts || a.block) - (b.ts || b.block));
        this._renderChart();
      } else {
        clearInterval(this._tradesInterval);
      }
    }, 15000);
  }

  _parseCurveLog(log, buyTopic, sellTopic, tsField, txField, blockParse) {
    const topic0 = log.topics?.[0];
    const block = blockParse ? blockParse(log) : log.block_number;
    const ts = log[tsField] ? new Date(log[tsField]).getTime() : 0;
    const tx = log[txField] || '';
    if (topic0 === buyTopic) {
      const d = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
      const qIn = Number(ethers.formatEther(d[0]));
      const tOut = Number(ethers.formatEther(d[1]));
      return { block, ts, type: 'buy', addr: '0x' + log.topics[1].slice(26), amount: tOut, eth: qIn, usd: qIn * ETH_PRICE_USD, price: tOut > 0 ? qIn / tOut : 0, txHash: tx };
    }
    if (topic0 === sellTopic) {
      const d = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
      const tIn = Number(ethers.formatEther(d[0]));
      const qOut = Number(ethers.formatEther(d[1]));
      return { block, ts, type: 'sell', addr: '0x' + log.topics[1].slice(26), amount: tIn, eth: qOut, usd: qOut * ETH_PRICE_USD, price: tIn > 0 ? qOut / tIn : 0, txHash: tx };
    }
    return null;
  }

  async _fetchCurveEvents(curve, maxPages = 3) {
    const cacheKey = curve.toLowerCase();
    if (this._curveEventsCache?.key === cacheKey && Date.now() - this._curveEventsCache.ts < 30000) {
      return this._curveEventsCache.data;
    }
    const buyTopic = ethers.id('CurveBuy(address,address,uint256,uint256,uint256,uint256)');
    const sellTopic = ethers.id('CurveSell(address,address,uint256,uint256,uint256,uint256)');
    const events = [];
    try {
      let url = `${CONTRACTS.EXPLORER}/api/v2/addresses/${curve}/logs`;
      for (let page = 0; page < maxPages; page++) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('API ' + resp.status);
        const data = await resp.json();
        for (const log of (data.items || [])) {
          const ev = this._parseCurveLog(log, buyTopic, sellTopic, 'block_timestamp', 'transaction_hash');
          if (ev) events.push(ev);
        }
        if (!data.next_page_params) break;
        const p = data.next_page_params;
        url = `${CONTRACTS.EXPLORER}/api/v2/addresses/${curve}/logs?index=${p.index}&block_number=${p.block_number}&items_count=${p.items_count}`;
      }
    } catch (e) {
      console.warn('fetchCurveEvents v2 failed, trying v1:', e);
      if (!events.length) {
        try {
          const v1url = `${CONTRACTS.EXPLORER}/api?module=logs&action=getLogs&address=${curve}&fromBlock=0&toBlock=latest`;
          const d = await this._fetchWithRetry(v1url);
          if (d?.status === '1' && d.result) {
            for (const log of d.result) {
              const ev = this._parseCurveLog(log, buyTopic, sellTopic, 'timeStamp', 'transactionHash', (l) => parseInt(l.blockNumber, 16));
              if (ev) events.push(ev);
            }
          }
        } catch {}
      }
    }
    this._curveEventsCache = { key: cacheKey, data: events, ts: Date.now() };
    return events;
  }

  async loadRecentTrades(token) {
    const content = document.getElementById('tdTradesContent');
    if (!content || !token.curve) return;

    try {
      const events = (await this._fetchCurveEvents(token.curve)).slice().sort((a, b) => b.block - a.block);

      if (!events.length) {
        content.innerHTML = '<div class="td-trades-empty">No trades yet</div>';
        return;
      }

      const shortAddr = (a) => a ? a.slice(0,6) + '...' + a.slice(-4) : '';
      const explorer = CONTRACTS.EXPLORER;
      content.innerHTML = `
        <div class="td-trades-header">
          <span>Type</span>
          <span>Amount</span>
          <span>ETH</span>
          <span>USD</span>
          <span>Maker</span>
          <span>Tx</span>
        </div>
        <ul class="td-trades-list">${events.slice(0, 20).map(ev => `
          <li class="td-trade-row">
            <span class="td-trade-type ${ev.type}"><span class="dot"></span>${ev.type === 'buy' ? 'Buy' : 'Sell'}</span>
            <span class="td-trade-tokens">${this.fmtTokens(ev.amount)} ${this.esc(token.symbol)}</span>
            <span class="td-trade-eth">${ev.eth < 0.0001 ? ev.eth.toFixed(8) : ev.eth.toFixed(4)}</span>
            <span class="td-trade-usd">$${ev.usd < 0.01 ? ev.usd.toFixed(4) : ev.usd.toFixed(2)}</span>
            <a class="td-trade-addr" href="${explorer}/address/${ev.addr}" target="_blank" rel="noopener">${shortAddr(ev.addr)}</a>
            <a class="td-trade-tx" href="${explorer}/tx/${ev.txHash}" target="_blank" rel="noopener">${ev.txHash ? ev.txHash.slice(0,6) + '...' + ev.txHash.slice(-4) : ''}</a>
          </li>`).join('')}</ul>`;
    } catch (e) {
      console.warn('loadRecentTrades error:', e);
      content.innerHTML = '<div class="td-trades-empty">No trades yet</div>';
    }
  }

  async loadHolders(token) {
    const content = document.getElementById('tdTradesContent');
    if (!content || !token.token) return;
    content.innerHTML = '<div class="td-trades-empty">Loading holders...</div>';

    try {
      const url = `${CONTRACTS.EXPLORER}/api/v2/tokens/${token.token}/holders`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('API ' + resp.status);
      const data = await resp.json();
      const holders = data.items || [];

      if (!holders.length) {
        content.innerHTML = '<div class="td-trades-empty">No holder data available</div>';
        return;
      }

      const totalSupply = BigInt(CONTRACTS.TOKEN_SUPPLY) * 10n ** 18n;
      const deployer = (token.deployer || '').toLowerCase();
      const curve = (token.curve || '').toLowerCase();
      const shortAddr = (a) => a ? a.slice(0, 6) + '...' + a.slice(-4) : '';
      const explorer = CONTRACTS.EXPLORER;

      holders.sort((a, b) => {
        const aAddr = (a.address?.hash || '').toLowerCase();
        const bAddr = (b.address?.hash || '').toLowerCase();
        if (aAddr === deployer && bAddr !== deployer) return -1;
        if (bAddr === deployer && aAddr !== deployer) return 1;
        return 0;
      });

      const rows = holders.map((h, i) => {
        const addr = h.address?.hash || '';
        const addrLc = addr.toLowerCase();
        const raw = BigInt(h.value || '0');
        const balance = Number(raw) / 1e18;
        const pct = totalSupply > 0n ? Number(raw * 10000n / totalSupply) / 100 : 0;
        let tag = '<span></span>';
        if (addrLc === deployer) tag = '<span class="holder-tag dev">Dev</span>';
        else if (addrLc === curve || h.address?.is_contract) tag = '<span class="holder-tag contract">Contract</span>';

        return `<li class="td-holder-row">
          <span class="td-holder-rank">${i + 1}</span>
          <a class="td-holder-addr" href="${explorer}/address/${addr}" target="_blank" rel="noopener">${shortAddr(addr)}</a>
          ${tag}
          <span class="td-holder-balance">${this.fmtTokens(balance)} ${this.esc(token.symbol)}</span>
          <span class="td-holder-pct">${pct.toFixed(2)}%</span>
        </li>`;
      });

      content.innerHTML = `
        <div class="td-holders-header">
          <span>#</span>
          <span>Address</span>
          <span></span>
          <span>Balance</span>
          <span>%</span>
        </div>
        <ul class="td-trades-list">${rows.join('')}</ul>`;
    } catch (e) {
      console.warn('loadHolders error:', e);
      content.innerHTML = '<div class="td-trades-empty">Failed to load holders</div>';
    }
  }

  async _fetchWithRetry(url, retries = 3, delay = 1500) {
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch(url);
        if (resp.status === 429) {
          await new Promise(r => setTimeout(r, delay * (i + 1)));
          continue;
        }
        return await resp.json();
      } catch {
        if (i < retries - 1) await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
    return null;
  }

  async loadPriceChart(token) {
    const canvas = document.getElementById('priceChart');
    const loading = document.getElementById('chartLoading');
    if (!canvas) return;

    const events = token.curve ? await this._fetchCurveEvents(token.curve, 5) : [];
    if (loading) loading.style.display = 'none';

    this._chartAllEvents = events.slice().sort((a, b) => (a.ts || a.block) - (b.ts || b.block));
    this._chartToken = token;
    this._chartRange = 3600000;

    const rangeContainer = document.getElementById('chartRanges');
    if (rangeContainer) {
      rangeContainer.querySelectorAll('.td-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          rangeContainer.querySelectorAll('.td-range-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._chartRange = parseInt(btn.dataset.range);
          this._renderChart();
        });
      });
    }

    this._renderChart();
  }

  _renderChart() {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const token = this._chartToken;
    const allEvents = this._chartAllEvents || [];
    const rangeMs = this._chartRange;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const ctx = canvas.getContext('2d');
    const fmtMcap = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;

    let filtered = allEvents.filter(e => e.price > 0);
    if (rangeMs > 0 && filtered.length && filtered[0].ts) {
      const cutoff = Date.now() - rangeMs;
      const ranged = filtered.filter(e => e.ts >= cutoff);
      if (ranged.length > 0) filtered = ranged;
    }

    let mcaps, labels, pctChange;
    if (filtered.length >= 2) {
      mcaps = filtered.map(e => e.price * ETH_PRICE_USD * CONTRACTS.TOKEN_SUPPLY);
      labels = filtered.map(e => {
        if (!e.ts) return '';
        const d = new Date(e.ts);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      });
      const first = mcaps[0], last = mcaps[mcaps.length - 1];
      pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
    } else {
      const currentMcap = (token.priceEth || 0) * ETH_PRICE_USD * CONTRACTS.TOKEN_SUPPLY || 4370;
      mcaps = [currentMcap, currentMcap];
      labels = ['', ''];
      pctChange = 0;
    }

    const changeEl = document.querySelector('.td-chart-change');
    if (changeEl) {
      const sign = pctChange >= 0 ? '+' : '';
      const rangeLabel = this._chartRange === 0 ? 'ALL' : this._chartRange <= 300000 ? '5M' : this._chartRange <= 3600000 ? '1H' : this._chartRange <= 21600000 ? '6H' : '1D';
      const color = pctChange >= 0 ? 'var(--green)' : 'var(--red)';
      changeEl.innerHTML = `<span style="color:${color}">${sign}${pctChange.toFixed(2)}%</span> <span style="color:var(--text-3)">${rangeLabel}</span>`;
    }

    const isUp = pctChange >= 0;
    const lineColor = isUp ? (isDark ? '#22c55e' : '#16a34a') : (isDark ? '#ef4444' : '#dc2626');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement?.offsetHeight || 220);
    gradient.addColorStop(0, isUp ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)');
    gradient.addColorStop(0.7, isUp ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    const lastMcap = mcaps[mcaps.length - 1];
    const priceAnnotation = {
      id: 'priceAnnotation',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        const xScale = chart.scales.x;
        if (!yScale || !xScale) return;
        const y = yScale.getPixelForValue(lastMcap);
        const c = chart.ctx;
        c.save(); c.setLineDash([4, 4]); c.strokeStyle = lineColor + '66'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(xScale.left, y); c.lineTo(xScale.right, y); c.stroke(); c.restore();
        c.save(); c.font = "10px 'JetBrains Mono', monospace"; c.fillStyle = lineColor + 'cc';
        c.textAlign = 'right'; c.fillText(fmtMcap(lastMcap), xScale.right, y - 4); c.restore();
      }
    };

    const pointRadii = mcaps.map((_, i) => i === mcaps.length - 1 ? 4 : 0);

    if (this._chart) this._chart.destroy();
    this._chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: mcaps,
          borderColor: lineColor,
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: pointRadii,
          pointHoverRadius: 5,
          pointBackgroundColor: lineColor,
          pointBorderColor: lineColor,
          fill: true,
          tension: 0.3
        }]
      },
      plugins: [priceAnnotation],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#1a1d28' : '#fff',
            titleColor: isDark ? '#f1f3f7' : '#111827',
            bodyColor: isDark ? '#a0a8b8' : '#4b5563',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            borderWidth: 1, padding: 10, displayColors: false,
            callbacks: {
              title: () => 'Market Cap',
              label: (item) => fmtMcap(item.raw)
            }
          }
        },
        scales: {
          x: { display: false },
          y: {
            display: true,
            position: 'right',
            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', drawBorder: false, borderDash: [4, 4] },
            border: { display: false },
            ticks: {
              color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
              font: { size: 9, family: "'JetBrains Mono', monospace" },
              callback: (v) => fmtMcap(v),
              maxTicksLimit: 5,
              padding: 8
            }
          }
        }
      }
    });
  }

  updateTradeUI(token) {
    const label = document.getElementById('tradeInputLabel');
    const balance = document.getElementById('tradeBalance');
    const exec = document.getElementById('tradeExec');
    const estimate = document.getElementById('tradeEstimate');
    const amtInput = document.getElementById('tradeAmount');
    const quickBtns = document.querySelectorAll('.quick-amt');

    if (this.tradeMode === 'buy') {
      label.textContent = 'Pay ETH:';
      amtInput.placeholder = '0.05';
      amtInput.value = '';
      quickBtns.forEach(b => { b.dataset.amt = b.textContent; b.style.display = ''; });
      if (window.walletManager.connected) {
        window.walletManager.getBalance().then(b => { balance.textContent = 'Balance: ' + parseFloat(b).toFixed(4) + ' ETH'; });
        exec.textContent = 'Buy ' + token.symbol;
      } else {
        balance.textContent = 'Balance: -- ETH';
        exec.textContent = 'Connect Wallet to Trade';
      }
    } else {
      label.textContent = 'Sell ' + token.symbol + ':';
      amtInput.placeholder = 'Token amount';
      amtInput.value = '';
      quickBtns[0].dataset.amt = '25'; quickBtns[0].textContent = '25%';
      quickBtns[1].dataset.amt = '50'; quickBtns[1].textContent = '50%';
      quickBtns[2].dataset.amt = '100'; quickBtns[2].textContent = '100%';
      if (window.walletManager.connected && token.token) {
        window.walletManager.getTokenBalance(token.token).then(b => {
          const formatted = ethers.formatEther(b);
          balance.textContent = 'Balance: ' + this.fmtTokens(b) + ' ' + token.symbol;
          balance.dataset.raw = formatted;
          quickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
              const pct = parseInt(btn.dataset.amt);
              const val = parseFloat(formatted) * pct / 100;
              amtInput.value = val.toString();
              this.updateEstimate(token);
            });
          });
        });
        exec.textContent = 'Sell ' + token.symbol;
      } else {
        balance.textContent = 'Balance: -- ' + token.symbol;
        exec.textContent = 'Connect Wallet to Trade';
      }
    }
    estimate.textContent = '';
  }

  async updateEstimate(token) {
    const amt = parseFloat(document.getElementById('tradeAmount').value);
    const estimate = document.getElementById('tradeEstimate');
    if (!amt || amt <= 0 || !token.curve) { estimate.innerHTML = ''; return; }

    try {
      if (this.tradeMode === 'buy') {
        const quoteIn = ethers.parseEther(amt.toString());
        const result = await window.contractManager.getBuyQuote(token.curve, quoteIn, window.walletManager.address || CONTRACTS.ZERO);
        const feeEth = parseFloat(ethers.formatEther(result.fee)).toFixed(6);
        const taxEth = parseFloat(ethers.formatEther(result.tax)).toFixed(6);
        estimate.innerHTML = `<div class="trade-estimate-box">
          <div class="est-label">You receive</div>
          <div class="est-value">${this.fmtTokens(result.tokensOut)} ${this.esc(token.symbol)}</div>
          <div class="est-fee">Fee: ${feeEth} ETH &middot; Tax: ${taxEth} ETH</div>
        </div>`;
      } else {
        const tokensIn = ethers.parseEther(amt.toString());
        const result = await window.contractManager.getSellQuote(token.curve, tokensIn);
        const feeEth = parseFloat(ethers.formatEther(result.fee)).toFixed(6);
        const taxEth = parseFloat(ethers.formatEther(result.tax)).toFixed(6);
        estimate.innerHTML = `<div class="trade-estimate-box">
          <div class="est-label">You receive</div>
          <div class="est-value">${this.fmtETH(parseFloat(ethers.formatEther(result.quoteOut)))} ETH</div>
          <div class="est-fee">Fee: ${feeEth} ETH &middot; Tax: ${taxEth} ETH</div>
        </div>`;
      }
    } catch (e) {
      estimate.innerHTML = '<span style="color:var(--text-3);font-size:12px">Error calculating quote</span>';
      console.error('Quote error:', e);
    }
  }

  async executeTrade(token) {
    if (!window.walletManager.connected) {
      await window.walletManager.connect();
      this.updateTradeUI(token);
      return;
    }

    const amt = parseFloat(document.getElementById('tradeAmount').value);
    if (!amt || amt <= 0) { showToast('Enter an amount.', 'error'); return; }
    if (!token.curve) { showToast('Curve address not found.', 'error'); return; }

    const btn = document.getElementById('tradeExec');
    btn.disabled = true;

    try {
      await window.contractManager.switchToRobinhood();
      await window.contractManager.init(window.walletManager.provider, window.walletManager.signer);
      const recipient = await window.walletManager.signer.getAddress();

      if (this.tradeMode === 'buy') {
        btn.innerHTML = '<span class="spinner"></span> Getting quote...';
        const quoteIn = ethers.parseEther(amt.toString());
        const quote = await window.contractManager.getBuyQuote(token.curve, quoteIn, recipient);
        const minOut = quote.tokensOut * BigInt(10000 - this.slippageBps) / 10000n;

        btn.innerHTML = '<span class="spinner"></span> Confirm in wallet...';
        const receipt = await window.contractManager.buyToken(token.curve, quoteIn, minOut, recipient);
        showToast(`Bought ${this.fmtTokens(quote.tokensOut)} ${token.symbol}!`, 'success');
      } else {
        btn.innerHTML = '<span class="spinner"></span> Getting quote...';
        const tokensIn = ethers.parseEther(amt.toString());
        const quote = await window.contractManager.getSellQuote(token.curve, tokensIn);
        const minOut = quote.quoteOut * BigInt(10000 - this.slippageBps) / 10000n;

        btn.innerHTML = '<span class="spinner"></span> Approve token...';
        const receipt = await window.contractManager.sellToken(token.token, token.curve, tokensIn, minOut, recipient);
        showToast(`Sold for ${this.fmtETH(parseFloat(ethers.formatEther(quote.quoteOut)))} ETH!`, 'success');
      }

      this.updateTradeUI(token);
    } catch (err) {
      console.error('Trade error:', err);
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) showToast('Transaction rejected.', 'error');
      else showToast('Trade failed: ' + (err.reason || err.shortMessage || err.message || 'Unknown error'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = (this.tradeMode === 'buy' ? 'Buy ' : 'Sell ') + token.symbol;
    }
  }

  // ---- CREATE / DEPLOY ----
  renderCreate() {
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';

    const tpl = document.getElementById('tpl-create').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);

    const form = document.getElementById('createForm');
    const nameInput = document.getElementById('tokenName');
    const symbolInput = document.getElementById('tokenSymbol');
    const descInput = document.getElementById('tokenDesc');
    const logoInput = document.getElementById('tokenLogo');
    const logoPreview = document.getElementById('logoPreview');
    const btnChoose = document.getElementById('btnChooseImage');
    let logoDataUrl = null;

    nameInput.addEventListener('input', () => {
      document.getElementById('previewName').textContent = nameInput.value || 'Your token';
    });
    symbolInput.addEventListener('input', () => {
      symbolInput.value = symbolInput.value.toUpperCase();
      document.getElementById('previewSymbol').textContent = '$' + (symbolInput.value || 'TICKER');
    });
    descInput.addEventListener('input', () => {
      document.getElementById('descCount').textContent = descInput.value.length;
    });

    btnChoose.addEventListener('click', () => logoInput.click());
    logoInput.addEventListener('change', () => {
      const file = logoInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showToast('Logo must be under 2MB.', 'error'); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        logoDataUrl = canvas.toDataURL('image/webp', 0.5);
        if (logoDataUrl.length > 20000) {
          logoDataUrl = canvas.toDataURL('image/jpeg', 0.4);
        }
        logoPreview.src = logoDataUrl;
        logoPreview.hidden = false;
        document.getElementById('previewLogo').innerHTML = `<img src="${logoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });

    // Pair selector dropdown
    let selectedPair = window.PAIRED_ASSETS[0];
    const pairSelect = document.getElementById('pairSelect');
    const pairBtn = document.getElementById('pairSelectBtn');
    const pairDropdown = document.getElementById('pairDropdown');

    pairDropdown.innerHTML = window.PAIRED_ASSETS.map((p, i) =>
      `<button type="button" class="pair-option${i === 0 ? ' active' : ''}" data-idx="${i}">
        <img src="${p.img}" alt="">
        <span class="pair-option-symbol">${p.symbol}</span>
        <span class="pair-option-name">${p.name}</span>
      </button>`
    ).join('');

    pairBtn.addEventListener('click', () => pairSelect.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!pairSelect.contains(e.target)) pairSelect.classList.remove('open');
    });

    pairDropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.pair-option');
      if (!opt) return;
      const idx = parseInt(opt.dataset.idx);
      selectedPair = window.PAIRED_ASSETS[idx];
      document.getElementById('pairSelectedImg').src = selectedPair.img;
      document.getElementById('pairSelectedSymbol').textContent = selectedPair.symbol;
      pairDropdown.querySelectorAll('.pair-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      pairSelect.classList.remove('open');
      // Update sidebar preview
      const pairedWith = document.querySelector('.sp-stat-row:nth-child(2) .sp-stat-value');
      if (pairedWith) pairedWith.textContent = selectedPair.symbol;
      // Update footer
      const footerPair = document.querySelector('.footer-pair');
      if (footerPair) footerPair.textContent = selectedPair.symbol + ' pair';
      // Update hint
      const hint = document.getElementById('pairHint');
      if (hint) hint.textContent = selectedPair.symbol === 'ETH' ? 'Graduates once the curve raises 4.2 ETH' : `Paired with ${selectedPair.name} (${selectedPair.symbol})`;
    });

    // Advanced accordion
    const advToggle = document.getElementById('advancedToggle');
    const advSection = document.getElementById('advancedSection');
    advToggle.addEventListener('click', () => {
      advSection.classList.toggle('open');
    });

    // Fetch launch fee
    window.contractManager.getLaunchFee().then(fee => {
      const formatted = ethers.formatEther(fee);
      const el = document.getElementById('launchFeeDisplay');
      if (el) el.textContent = formatted;
      const pf = document.getElementById('previewFee');
      if (pf) pf.textContent = formatted;
    }).catch(() => {});

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const symbol = symbolInput.value.trim().toUpperCase();
      const description = descInput.value.trim();
      if (!name || !symbol) { showToast('Fill in token name and ticker.', 'error'); return; }

      if (!window.walletManager.connected) {
        const ok = await window.walletManager.connect();
        if (!ok) return;
      }

      const btn = document.getElementById('btnCreate');
      btn.disabled = true;

      try {
        btn.innerHTML = '<span class="spinner"></span> Switching...';
        await window.contractManager.switchToRobinhood();
        await window.contractManager.init(window.walletManager.provider, window.walletManager.signer);

        const twitterVal = document.getElementById('tokenTwitter')?.value.trim() || '';
        const telegramVal = document.getElementById('tokenTelegram')?.value.trim() || '';
        const discordVal = document.getElementById('tokenDiscord')?.value.trim() || '';
        const websiteVal = document.getElementById('tokenWebsite')?.value.trim() || '';
        const twitter = twitterVal ? 'https://x.com/' + twitterVal : '';
        const telegram = telegramVal ? 'https://t.me/' + telegramVal : '';
        const discord = discordVal ? 'https://discord.gg/' + discordVal : '';
        const website = websiteVal;
        const creatorTax = parseInt(document.getElementById('creatorTax')?.value || '0');
        const initialBuy = document.getElementById('initialBuy')?.value.trim() || '';

        btn.innerHTML = '<span class="spinner"></span> Confirm in wallet...';

        const result = await window.contractManager.launchToken({
          name, symbol, description,
          logo: logoDataUrl || '',
          twitter, telegram, discord, website,
          creatorTaxBps: Math.min(creatorTax * 100, 1000),
          initialBuyEth: initialBuy,
          pairToken: selectedPair.address
        });

        btn.innerHTML = '<span class="spinner"></span> Saving...';
        const deployer = await window.walletManager.signer.getAddress();

        window.tokenRegistry.add({
          address: result.tokenAddress,
          curve: result.curveAddress,
          name, symbol, description,
          logo: logoDataUrl,
          deployer: result.deployer || deployer,
          txHash: result.txHash,
          launchedAt: new Date().toISOString(),
          twitter, telegram, discord, website,
          creatorTaxBps: Math.min(creatorTax * 100, 1000),
          _aevon: true
        });

        showToast(`${symbol} deployed successfully!`, 'success');
        this.router.navigate(`/token/${result.tokenAddress}`);

      } catch (err) {
        console.error('Deploy error:', err);
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) showToast('Transaction rejected.', 'error');
        else showToast('Deploy failed: ' + (err.reason || err.shortMessage || err.message || 'Unknown error'), 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Deploy Token';
      }
    });
  }

  // ---- PORTFOLIO ----
  async renderPortfolio() {
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';

    const tpl = document.getElementById('tpl-portfolio').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);
    if (!window.walletManager.connected) return;

    const content = document.getElementById('portfolioContent');
    const addr = window.walletManager.address;

    content.innerHTML = `
      <div class="portfolio-stats">
        <div class="portfolio-stat-card">
          <div class="stat-label">Wallet</div>
          <div class="stat-value" style="font-size:14px">${window.walletManager.shortAddress()}</div>
        </div>
        <div class="portfolio-stat-card">
          <div class="stat-label">ETH Balance</div>
          <div class="stat-value" id="pEthBal" style="font-size:14px">Loading...</div>
        </div>
        <div class="portfolio-stat-card">
          <div class="stat-label">Portfolio Value</div>
          <div class="stat-value" id="pTotalVal" style="font-size:14px">Loading...</div>
        </div>
      </div>
      <div style="margin-top:24px">
        <h3 style="font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--text-1);margin-bottom:12px">Holdings</h3>
        <div id="pHoldings">
          <div style="display:flex;flex-direction:column;gap:8px">
            <div class="sk-line w100" style="height:48px;border-radius:8px"></div>
            <div class="sk-line w100" style="height:48px;border-radius:8px"></div>
            <div class="sk-line w100" style="height:48px;border-radius:8px"></div>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;text-align:center">
        <a href="${CONTRACTS.EXPLORER}/address/${addr}" target="_blank" rel="noopener" class="btn btn-outline" style="font-size:12px">View on Explorer</a>
      </div>`;

    try {
      const [ethBal, tokens] = await Promise.all([
        window.walletManager.getBalance(),
        window.tokenRegistry.fetchLiveData()
      ]);

      const ethNum = parseFloat(ethBal);
      document.getElementById('pEthBal').textContent = ethNum.toFixed(4) + ' ETH';

      const holdingsEl = document.getElementById('pHoldings');
      const holdings = [];

      const balChecks = tokens.map(async (t) => {
        try {
          const bal = await window.walletManager.getTokenBalance(t.token);
          if (bal > 0n) {
            const formatted = parseFloat(ethers.formatEther(bal));
            const valueUsd = formatted * (t.priceUsd || 0);
            const valueEth = formatted * (t.priceEth || 0);
            holdings.push({ ...t, balance: bal, balFormatted: formatted, valueUsd, valueEth });
          }
        } catch {}
      });

      await Promise.allSettled(balChecks);
      holdings.sort((a, b) => b.valueUsd - a.valueUsd);

      const totalUsd = holdings.reduce((s, h) => s + h.valueUsd, 0) + ethNum * ETH_PRICE_USD;
      document.getElementById('pTotalVal').textContent = this.fmtUSD(totalUsd);

      if (!holdings.length) {
        holdingsEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-3);font-size:13px">No token holdings found. Buy tokens from the Explore page.</div>';
        return;
      }

      holdingsEl.innerHTML = `<div class="pf-holdings-list">${holdings.map(h => {
        const logoSrc = this.fixLogoUrl(h.logo);
        const initial = this.esc(h.symbol?.charAt(0) || '?');
        const logoHtml = logoSrc
          ? `<img src="${logoSrc}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" onerror="this.replaceWith(document.createTextNode('${initial}'))">`
          : `<div style="width:36px;height:36px;border-radius:50%;background:var(--card-gradient);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:14px">${initial}</div>`;
        return `
          <div class="pf-holding-row" onclick="window.app.router.navigate('/token/${h.token}')">
            <div class="pf-holding-left">
              ${logoHtml}
              <div>
                <div style="font-weight:600;font-size:13px;color:var(--text-1)">${this.esc(h.name)}</div>
                <div style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">$${this.esc(h.symbol)}</div>
              </div>
            </div>
            <div class="pf-holding-right">
              <div style="font-weight:600;font-size:13px;color:var(--text-1);font-family:var(--font-mono)">${this.fmtTokens(h.balance)} ${this.esc(h.symbol)}</div>
              <div style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${this.fmtUSD(h.valueUsd)}</div>
            </div>
          </div>`;
      }).join('')}</div>`;
    } catch (e) {
      console.warn('Portfolio load error:', e);
      document.getElementById('pHoldings').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-3)">Failed to load holdings</div>';
    }
  }

  // ---- LEGAL PAGES ----
  renderLegal(tplId) {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const app = document.getElementById('app');
    const tpl = document.getElementById(tplId);
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));
    window.scrollTo(0, 0);
  }

  // ---- HOW IT WORKS ----
  renderHow() {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const app = document.getElementById('app');
    const tpl = document.getElementById('tpl-how');
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));
  }

  // ---- DOCS ----
  renderDocs() {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const app = document.getElementById('app');
    const tpl = document.getElementById('tpl-docs');
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));

    this._loadDocSection('overview');

    const sidebar = document.getElementById('docsSidebar');
    if (sidebar) {
      sidebar.addEventListener('click', (e) => {
        const link = e.target.closest('[data-doc]');
        if (!link) return;
        e.preventDefault();
        sidebar.querySelectorAll('.docs-nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        this._loadDocSection(link.dataset.doc);
      });
    }
  }

  _loadDocSection(key) {
    const content = document.getElementById('docsContent');
    if (!content) return;
    const sections = {
      overview: `
        <h2>Overview</h2>
        <p>AEVON is a token launchpad built on <strong>Robinhood Chain</strong> (Chain ID 4663). It uses the Pons V2 Factory to deploy tokens with automated bonding curves.</p>
        <p>Anyone can create a token with a fixed supply of 1,000,000,000 tokens. The token launches on a bonding curve where the price increases as more people buy. Once the bonding curve raises 4.2 ETH, the token graduates and liquidity is permanently locked on a Uniswap V4 pool.</p>
        <h3>Key Features</h3>
        <ul>
          <li>Instant token creation with no coding required</li>
          <li>Automated bonding curve pricing</li>
          <li>Built-in snipe protection (99% tax for first 3 seconds)</li>
          <li>Automatic graduation to Uniswap V4</li>
          <li>Permanently locked liquidity after graduation</li>
          <li>Real-time price charts and trade history</li>
          <li>Optional creator tax (up to 10% of trade fee)</li>
        </ul>`,
      chain: `
        <h2>Robinhood Chain</h2>
        <p>AEVON runs on Robinhood Chain, an EVM-compatible Layer 2 network.</p>
        <h3>Network Details</h3>
        <div class="docs-table">
          <div class="docs-table-row"><span class="docs-table-label">Chain Name</span><span class="docs-table-value">Robinhood Chain</span></div>
          <div class="docs-table-row"><span class="docs-table-label">Chain ID</span><span class="docs-table-value">4663 (0x1237)</span></div>
          <div class="docs-table-row"><span class="docs-table-label">Native Currency</span><span class="docs-table-value">ETH</span></div>
          <div class="docs-table-row"><span class="docs-table-label">RPC URL</span><span class="docs-table-value"><code>https://rpc.mainnet.chain.robinhood.com</code></span></div>
          <div class="docs-table-row"><span class="docs-table-label">Block Explorer</span><span class="docs-table-value"><a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noopener">robinhoodchain.blockscout.com</a></span></div>
        </div>
        <h3>Adding to MetaMask</h3>
        <p>AEVON automatically prompts you to add Robinhood Chain when you connect your wallet. You can also add it manually using the network details above.</p>`,
      wallet: `
        <h2>Wallet Setup</h2>
        <p>AEVON supports any EVM-compatible wallet that can connect via the browser.</p>
        <h3>Supported Wallets</h3>
        <ul>
          <li><strong>MetaMask</strong> — Most popular browser extension wallet</li>
          <li><strong>Rabby</strong> — Multi-chain wallet with built-in security</li>
          <li><strong>Trust Wallet</strong> — Mobile wallet with browser extension</li>
          <li>Any wallet injecting <code>window.ethereum</code></li>
        </ul>
        <h3>Getting ETH on Robinhood Chain</h3>
        <p>You need ETH on Robinhood Chain to create tokens and trade. Bridge ETH from Ethereum mainnet using the official Robinhood Chain bridge.</p>`,
      create: `
        <h2>Creating a Token</h2>
        <p>Navigate to the <strong>Create</strong> page to launch your token.</p>
        <h3>Required Fields</h3>
        <ul>
          <li><strong>Name</strong> — Your token's display name (max 32 characters)</li>
          <li><strong>Ticker</strong> — Short symbol like DOGE or PEPE (max 8 characters)</li>
        </ul>
        <h3>Optional Fields</h3>
        <ul>
          <li><strong>Description</strong> — Tell people about your token (max 500 characters)</li>
          <li><strong>Token image</strong> — PNG, JPG, or WebP up to 2MB</li>
          <li><strong>Social links</strong> — X (Twitter) and Telegram links</li>
          <li><strong>Developer buy</strong> — Buy tokens at launch for yourself</li>
          <li><strong>Creator tax</strong> — Earn up to 10% of the 1% trade fee</li>
        </ul>
        <h3>Launch Fee</h3>
        <p>Creating a token costs <strong>0.0005 ETH</strong>. If you add a developer buy, that amount is added to the launch fee.</p>`,
      bonding: `
        <h2>Bonding Curve</h2>
        <p>Every token on AEVON launches with an automated bonding curve that determines the price based on supply and demand.</p>
        <h3>How It Works</h3>
        <p>The bonding curve is a smart contract that holds ETH reserves and token reserves. When you buy tokens, you send ETH to the curve and receive tokens. When you sell, you return tokens and receive ETH.</p>
        <p>The price is calculated as: <code>price = quoteReserve / tokenReserve</code></p>
        <h3>Price Mechanics</h3>
        <ul>
          <li>The price starts low and increases as more ETH is added</li>
          <li>Early buyers get more tokens per ETH</li>
          <li>Selling tokens decreases the price</li>
          <li>The curve ensures there is always liquidity to trade</li>
        </ul>
        <h3>Snipe Protection</h3>
        <p>To prevent bots from sniping new tokens, AEVON applies a <strong>99% tax for the first 3 seconds</strong> after launch. This gives regular users a fair chance to buy.</p>`,
      graduation: `
        <h2>Graduation</h2>
        <p>When a token's bonding curve accumulates <strong>4.2 ETH</strong> in real reserves, the token graduates.</p>
        <h3>What Happens at Graduation</h3>
        <ol>
          <li>The bonding curve closes — no more buys or sells through the curve</li>
          <li>All liquidity (ETH + remaining tokens) moves to a Uniswap V4 pool</li>
          <li>Liquidity is permanently locked — it can never be withdrawn</li>
          <li>The token becomes freely tradeable on Uniswap</li>
        </ol>
        <h3>Why Graduation Matters</h3>
        <p>Graduation is what makes AEVON tokens safe. Once graduated, there is permanent liquidity on Uniswap. No one — not even the token creator — can remove the liquidity. This means no rug pulls.</p>`,
      buy: `
        <h2>Buying Tokens</h2>
        <p>Navigate to any token page and use the trade panel on the left side.</p>
        <h3>Steps</h3>
        <ol>
          <li>Connect your wallet</li>
          <li>Enter the amount of ETH you want to spend</li>
          <li>Use the preset buttons (0.01, 0.05, 0.1, 0.5, 1) for quick amounts</li>
          <li>Set your slippage tolerance (default 2%)</li>
          <li>Click <strong>Buy</strong></li>
          <li>Confirm the transaction in your wallet</li>
        </ol>
        <h3>Estimated Output</h3>
        <p>The estimated number of tokens you'll receive is shown before you confirm. The actual amount may differ slightly due to slippage and other trades happening at the same time.</p>`,
      sell: `
        <h2>Selling Tokens</h2>
        <p>Switch to the <strong>Sell</strong> tab on the token page to sell your tokens.</p>
        <h3>Steps</h3>
        <ol>
          <li>Connect your wallet</li>
          <li>Switch to the Sell tab</li>
          <li>Enter the number of tokens to sell</li>
          <li>The first time you sell, you'll need to approve the token for the bonding curve contract</li>
          <li>Click <strong>Sell</strong></li>
          <li>Confirm the transaction in your wallet</li>
        </ol>
        <h3>Price Impact</h3>
        <p>Selling a large amount of tokens will reduce the price. The bonding curve calculates the output based on the current reserves, so larger sells receive proportionally less ETH per token.</p>`,
      slippage: `
        <h2>Slippage</h2>
        <p>Slippage is the difference between the expected price and the actual price when your transaction executes.</p>
        <h3>Setting Slippage</h3>
        <p>AEVON offers three preset slippage options:</p>
        <ul>
          <li><strong>1%</strong> — Tight slippage, may fail if the price moves</li>
          <li><strong>2%</strong> — Default, good balance between success rate and price protection</li>
          <li><strong>5%</strong> — Loose slippage, higher chance of success but less price protection</li>
        </ul>
        <h3>When to Increase Slippage</h3>
        <p>If your transactions keep failing with "slippage exceeded" errors, try increasing your slippage. This is common during periods of high trading activity when the price is moving quickly.</p>`,
      contracts: `
        <h2>Contract Addresses</h2>
        <p>All AEVON contracts are verified and open source on Blockscout.</p>
        <div class="docs-table">
          <div class="docs-table-row">
            <span class="docs-table-label">Pons V2 Factory</span>
            <span class="docs-table-value"><code><a href="https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" target="_blank" rel="noopener">0x7eD598...EC7e</a></code></span>
          </div>
          <div class="docs-table-row">
            <span class="docs-table-label">Pons V2 Router</span>
            <span class="docs-table-value"><code><a href="https://robinhoodchain.blockscout.com/address/0xe33E9E479dF8802cb0866d5d05258bEc4cF62948" target="_blank" rel="noopener">0xe33E9E...2948</a></code></span>
          </div>
        </div>
        <h3>Token Contracts</h3>
        <p>Each token launched through AEVON creates two contracts:</p>
        <ul>
          <li><strong>Token contract</strong> — Standard ERC-20 token with metadata</li>
          <li><strong>Curve contract</strong> — Bonding curve that handles buy/sell operations</li>
        </ul>
        <p>You can find the contract addresses for any token on its detail page. Click the contract address to copy it, or click "Explorer" to view it on Blockscout.</p>`,
      abi: `
        <h2>ABI Reference</h2>
        <p>Use these ABIs to interact with AEVON contracts programmatically.</p>
        <h3>Factory</h3>
        <pre><code>launchToken(params, launchConfigId, pairToken) payable
previewLaunchEconomics(launchConfigId, pairToken) view
launchFee() view returns (uint256)
getLaunchedToken(token) view returns (TokenInfo)</code></pre>
        <h3>Bonding Curve</h3>
        <pre><code>buy(quoteIn, minTokensOut, recipient) payable
sell(tokensIn, minQuoteOut, recipient)
getReserves() view returns (quoteReserve, tokenReserve)
realQuoteReserve() view returns (uint256)
graduationThreshold() view returns (uint256)
graduated() view returns (bool)</code></pre>
        <h3>ERC-20 Token</h3>
        <pre><code>name() view returns (string)
symbol() view returns (string)
balanceOf(address) view returns (uint256)
approve(address, uint256)
getTokenInfo() view returns (deployer, logo, description, socials)</code></pre>
        <h3>Events</h3>
        <pre><code>TokenLaunched(token, curve, deployer, pairToken, configId, threshold)
CurveBuy(buyer, recipient, quoteIn, tokensOut, fee, tax)
CurveSell(seller, recipient, tokensIn, quoteOut, fee, tax)</code></pre>`
    };
    content.innerHTML = sections[key] || '<p>Section not found.</p>';
  }
}

// Theme toggle
function initTheme() {
  const saved = localStorage.getItem('aevon-theme');
  const theme = saved || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('aevon-theme', next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  if (theme === 'dark') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  }
}
initTheme();

// Live Recent Buys Ticker — uses Blockscout API (RPC eth_getLogs returns 403)
class RecentBuysTicker {
  constructor() {
    this.items = [];
    this.maxItems = 30;
    this.el = document.getElementById('tickerContent');
    this.polling = false;
    this.buyTopic = null;
    this.sellTopic = null;
  }

  async start() {
    if (this.polling) return;
    this.polling = true;
    this.buyTopic = ethers.id('CurveBuy(address,address,uint256,uint256,uint256,uint256)');
    this.sellTopic = ethers.id('CurveSell(address,address,uint256,uint256,uint256,uint256)');
    await this.fetchRecent();
    this.pollInterval = setInterval(() => this.fetchRecent(), 30000);
  }

  async fetchRecent() {
    try {
      const discovered = window.tokenRegistry?._loadDiscoveryCache() || [];
      const local = window.tokenRegistry?.getAll() || [];
      const all = [...local, ...discovered].filter(t => t.curve);
      if (!all.length) return;

      const curves = all.slice(0, 4);
      const allEvents = [];

      const fetches = curves.map(async (t, idx) => {
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 300));
        try {
          const url = `${CONTRACTS.EXPLORER}/api?module=logs&action=getLogs&address=${t.curve}&fromBlock=0&toBlock=latest`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.status !== '1' || !data.result) return;
          for (const log of data.result) {
            const topic0 = log.topics?.[0];
            if (topic0 === this.buyTopic) {
              const buyer = '0x' + log.topics[1].slice(26);
              const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
              allEvents.push({
                type: 'buy', buyer, quoteIn: decoded[0], tokensOut: decoded[1],
                symbol: t.symbol || '???', name: t.name || 'Unknown',
                token: t.address || t.token, block: parseInt(log.blockNumber, 16), txHash: log.transactionHash
              });
            } else if (topic0 === this.sellTopic) {
              const seller = '0x' + log.topics[1].slice(26);
              const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
              allEvents.push({
                type: 'sell', buyer: seller, quoteOut: decoded[1], tokensIn: decoded[0],
                symbol: t.symbol || '???', name: t.name || 'Unknown',
                token: t.address || t.token, block: parseInt(log.blockNumber, 16), txHash: log.transactionHash
              });
            }
          }
        } catch {}
      });

      await Promise.allSettled(fetches);
      allEvents.sort((a, b) => b.block - a.block);
      this.items = allEvents.slice(0, this.maxItems);
      this.render();
    } catch (e) {
      console.warn('Ticker fetch error:', e);
    }
  }

  shortAddr(a) {
    return a ? a.slice(0, 6) + '...' + a.slice(-4) : '';
  }

  render() {
    if (!this.el) return;
    if (!this.items.length) {
      this.el.innerHTML = '<span class="ticker-placeholder">Watching for trades...</span>';
      return;
    }

    const duped = [...this.items, ...this.items];
    this.el.innerHTML = duped.map(item => {
      const ethVal = item.type === 'buy' ? item.quoteIn : item.quoteOut;
      const eth = parseFloat(ethers.formatEther(ethVal)).toFixed(4);
      const click = `onclick="window.app.router.navigate('/token/${item.token}')"`;
      const actionClass = item.type === 'sell' ? 'ti-action sell' : 'ti-action';
      const label = item.type === 'buy' ? 'BUY' : 'SELL';
      return `<span class="ticker-item" ${click}>
        <span class="${actionClass}">${label}</span>
        <span class="ti-symbol">$${item.symbol}</span>
        <span class="ti-amount">${eth} ETH</span>
        <span class="ti-addr">${this.shortAddr(item.buyer)}</span>
      </span><span class="ticker-sep">&bull;</span>`;
    }).join('');
  }

  stop() {
    this.polling = false;
    clearInterval(this.pollInterval);
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  window.app = app;
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  const ticker = new RecentBuysTicker();
  ticker.start();
  window.recentTicker = ticker;
});
