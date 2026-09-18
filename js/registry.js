// AEVON Token Registry
// Supabase as global store, localStorage as cache

const REGISTRY_KEY = 'aevon_tokens';
const ETH_PRICE_FALLBACK = 2600;
const ONCHAIN_CACHE_TTL = 60_000;
const ETH_PRICE_CACHE_TTL = 60_000;

const SUPABASE_URL = 'https://wsexiippjdfkvothshup.supabase.co';
const SUPABASE_ANON = 'sb_publishable_Iat7Mqle0m7drpNLwgTgQg_io09ceb2';

let ETH_PRICE_USD = ETH_PRICE_FALLBACK;
let _ethPriceTs = 0;
let _ethPriceFetching = null;

let _supabase = null;
function getSupabase() {
  if (!_supabase && window.supabase?.createClient) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return _supabase;
}

async function fetchEthPrice() {
  if (Date.now() - _ethPriceTs < ETH_PRICE_CACHE_TTL) return ETH_PRICE_USD;
  if (_ethPriceFetching) return _ethPriceFetching;
  _ethPriceFetching = (async () => {
    try {
      const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', { signal: AbortSignal.timeout(5000) });
      const data = await resp.json();
      if (data?.ethereum?.usd) {
        ETH_PRICE_USD = data.ethereum.usd;
        _ethPriceTs = Date.now();
      }
    } catch {
      if (!_ethPriceTs) ETH_PRICE_USD = ETH_PRICE_FALLBACK;
    }
    _ethPriceFetching = null;
    return ETH_PRICE_USD;
  })();
  return _ethPriceFetching;
}

async function batchedFetch(items, fn, concurrency = 5, delay = 200) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const batch = await Promise.allSettled(chunk.map(fn));
    results.push(...batch);
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, delay));
  }
  return results;
}

class TokenRegistry {
  constructor() {
    this.tokens = this._load();
    this.tokens = this.tokens.filter(t => t._aevon);
    this._save();
    this._onChainCache = new Map();
    this._dbSynced = false;
  }

  _loadDiscoveryCache() {
    return [];
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]'); }
    catch { return []; }
  }

  _save() {
    try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(this.tokens)); }
    catch {}
  }

  add(token) {
    const entry = { ...token, _aevon: true };
    const existing = this.tokens.findIndex(t =>
      t.address?.toLowerCase() === entry.address?.toLowerCase()
    );
    if (existing >= 0) {
      this.tokens[existing] = { ...this.tokens[existing], ...entry };
    } else {
      this.tokens.unshift(entry);
    }
    this._save();
    this._saveToDb(entry);
  }

  async _saveToDb(token) {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.from('aevon_tokens').upsert({
        address: token.address.toLowerCase(),
        curve: token.curve || null,
        deployer: token.deployer || null,
        name: token.name || '',
        symbol: token.symbol || '',
        logo: token.logo || '',
        description: token.description || '',
        twitter: token.twitter || '',
        telegram: token.telegram || '',
        discord: token.discord || '',
        website: token.website || '',
        tx_hash: token.txHash || null,
        creator_tax_bps: token.creatorTaxBps || 0
      }, { onConflict: 'address' });
    } catch (e) {
      console.warn('Supabase save failed:', e);
    }
  }

  async _syncFromDb() {
    if (this._dbSynced) return;
    this._dbSynced = true;
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from('aevon_tokens')
        .select('*')
        .order('created_at', { ascending: false });
      if (error || !data) return;
      for (const row of data) {
        const addr = row.address?.toLowerCase();
        if (!addr) continue;
        if (this.tokens.some(t => t.address?.toLowerCase() === addr)) continue;
        this.tokens.push({
          address: row.address,
          curve: row.curve,
          deployer: row.deployer,
          name: row.name,
          symbol: row.symbol,
          logo: row.logo,
          description: row.description,
          twitter: row.twitter,
          telegram: row.telegram,
          discord: row.discord,
          website: row.website,
          txHash: row.tx_hash,
          creatorTaxBps: row.creator_tax_bps || 0,
          launchedAt: row.created_at,
          _aevon: true
        });
      }
      this._save();
    } catch (e) {
      console.warn('Supabase sync failed:', e);
    }
  }

  remove(address) {
    this.tokens = this.tokens.filter(t => t.address?.toLowerCase() !== address?.toLowerCase());
    this._save();
  }

  getAll() { return this.tokens; }
  getCount() { return this.tokens.length; }
  has(address) { return this.tokens.some(t => t.address?.toLowerCase() === address?.toLowerCase()); }

  async _cachedOnChainData(address) {
    const key = address.toLowerCase();
    const cached = this._onChainCache.get(key);
    if (cached && Date.now() - cached.ts < ONCHAIN_CACHE_TTL) return cached.data;
    const data = await window.contractManager.getTokenOnChainData(address);
    if (data) this._onChainCache.set(key, { data, ts: Date.now() });
    return data;
  }

  _buildLiveEntry(source, onChain, extra = {}) {
    const qr = onChain.quoteReserve;
    const tr = onChain.tokenReserve;
    const priceEth = tr > 0n ? Number(qr) / Number(tr) : 0;
    const priceUsd = priceEth * ETH_PRICE_USD;
    const mcap = priceUsd * CONTRACTS.TOKEN_SUPPLY;
    const progressPct = onChain.progressBps / 100;
    return {
      token: source.address || source.token,
      curve: onChain.curve,
      name: source.name, symbol: source.symbol,
      description: source.description, logo: source.logo,
      deployer: onChain.deployer || source.deployer,
      launchedAt: source.launchedAt, txHash: source.txHash,
      twitter: source.twitter, telegram: source.telegram,
      discord: source.discord, website: source.website,
      creatorTaxBps: source.creatorTaxBps || 0,
      priceEth, priceUsd, marketCapUsd: mcap,
      graduationProgressPct: progressPct,
      raisedEth: Number(ethers.formatEther(onChain.realQuoteReserve)),
      graduationEth: Number(ethers.formatEther(onChain.graduationThreshold)),
      graduated: onChain.graduated,
      quoteReserve: qr, tokenReserve: tr,
      ...extra
    };
  }

  async fetchSingleToken(addr) {
    await fetchEthPrice();
    const lc = addr.toLowerCase();
    const stored = this.tokens.find(t => t.address?.toLowerCase() === lc);
    if (stored) {
      const onChain = await this._cachedOnChainData(stored.address);
      if (onChain) return this._buildLiveEntry(stored, onChain, { _aevon: true });
      return this._offlineEntry(stored);
    }
    const meta = await window.contractManager.getTokenMetadata(addr);
    const onChain = await this._cachedOnChainData(addr);
    if (meta && onChain) {
      return this._buildLiveEntry(
        { address: addr, name: meta.name, symbol: meta.symbol, description: meta.description,
          logo: meta.logo, deployer: meta.deployer, twitter: meta.twitter, telegram: meta.telegram,
          discord: meta.discord, website: meta.website, launchedAt: new Date().toISOString() },
        onChain, { _aevon: true }
      );
    }
    return null;
  }

  async fetchLiveData() {
    await fetchEthPrice();
    await this._syncFromDb();
    return await this._fetchLocalLive();
  }

  async _fetchLocalLive() {
    if (this.tokens.length === 0) return [];
    const results = await batchedFetch(this.tokens, async (stored) => {
      const onChain = await this._cachedOnChainData(stored.address);
      if (onChain) return this._buildLiveEntry(stored, onChain, { _aevon: true });
      return this._offlineEntry(stored);
    });
    return results.filter(r => r.status === 'fulfilled').map(r => r.value);
  }

  _offlineEntry(stored) {
    return {
      token: stored.address,
      curve: stored.curve || null,
      name: stored.name, symbol: stored.symbol,
      description: stored.description, logo: stored.logo,
      deployer: stored.deployer, launchedAt: stored.launchedAt,
      txHash: stored.txHash,
      twitter: stored.twitter, telegram: stored.telegram,
      discord: stored.discord, website: stored.website,
      creatorTaxBps: stored.creatorTaxBps || 0,
      priceEth: 0, priceUsd: 0, marketCapUsd: 0,
      graduationProgressPct: 0,
      raisedEth: 0, graduationEth: 4.2,
      graduated: false, _aevon: true, _offline: true
    };
  }
}

window.tokenRegistry = new TokenRegistry();
