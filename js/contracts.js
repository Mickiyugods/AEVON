// AEVON Token Launchpad - Contracts & Chain Config
// Robinhood Chain (4663) — Pons V2 Factory integration

const CONTRACTS = {
  CHAIN_ID: 4663,
  CHAIN_NAME: 'Robinhood Chain',
  RPC_URL: 'https://robinhood-rpc.publicnode.com',
  EXPLORER: 'https://robinhoodchain.blockscout.com',

  PONS_FACTORY: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
  PONS_ROUTER: '0xe33E9E479dF8802cb0866d5d05258bEc4cF62948',
  ZERO: '0x0000000000000000000000000000000000000000',

  CHAIN_CONFIG: {
    chainId: '0x1237',
    chainName: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
    blockExplorerUrls: ['https://robinhoodchain.blockscout.com']
  },

  FACTORY_ABI: [
    'function launchToken((string name, string symbol, string logo, string description, (string twitter, string telegram, string discord, string website, string farcaster) socials, address creatorFeeRecipient, uint16 creatorTaxBps, bool buybackEnabled, bytes32 expectedEconomics, bytes32 salt) params, uint256 launchConfigId, address pairToken, address[] snipeTaxExemptions) payable returns (address token, address curve)',
    'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
    'function launchFee() view returns (uint256)',
    'function launchEnabled() view returns (bool)',
    'function launchConfigCount() view returns (uint256)',
    'function getLaunchConfig(uint256 id) view returns ((uint256 supply, uint256 curveFeeBps, uint256 phantomQuote, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, bool enabled))',
    'function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))',
    'function canLaunch(address launcher) view returns (bool)',
    'function maxCreatorTaxBps() view returns (uint16)',
    'function approvedPairTokens(address pairToken) view returns (bool)',
    'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)'
  ],

  ROUTER_ABI: [
    'function launchAndBuy((string name, string symbol, string logo, string description, (string twitter, string telegram, string discord, string website, string farcaster) socials, address creatorFeeRecipient, uint16 creatorTaxBps, bool buybackEnabled, bytes32 expectedEconomics, bytes32 salt) params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)'
  ],

  CURVE_ABI: [
    'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)',
    'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)',
    'function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)',
    'function realQuoteReserve() view returns (uint256)',
    'function graduationThreshold() view returns (uint256)',
    'function sellableTokens() view returns (uint256)',
    'function graduated() view returns (bool)',
    'function readyToGraduate() view returns (bool)',
    'function feeBps() view returns (uint256)',
    'function creatorTaxBps() view returns (uint256)',
    'function currentSnipeTaxBps(address recipient) view returns (uint256)',
    'function isNativeQuote() view returns (bool)',
    'function pairToken() view returns (address)',
    'event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)',
    'event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)'
  ],

  ERC20_ABI: [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, (string twitter, string telegram, string discord, string website, string farcaster) tokenSocials)'
  ],

  TOKEN_SUPPLY: 1_000_000_000,
  DEFAULT_SLIPPAGE_BPS: 200,
  LAUNCH_FEE_FALLBACK: '0.0005'
};

class ContractManager {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.readProvider = null;
    this._initReadProvider();
  }

  _initReadProvider() {
    try {
      this.readProvider = new ethers.JsonRpcProvider(
        CONTRACTS.RPC_URL, CONTRACTS.CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 }
      );
    } catch (e) { console.warn('Read provider init failed:', e); }
  }

  async init(provider, signer) {
    this.provider = provider;
    this.signer = signer;
  }

  _rp() { return this.readProvider; }

  getFactory(s) {
    return new ethers.Contract(CONTRACTS.PONS_FACTORY, CONTRACTS.FACTORY_ABI, s || this._rp());
  }
  getRouter(s) {
    return new ethers.Contract(CONTRACTS.PONS_ROUTER, CONTRACTS.ROUTER_ABI, s || this.signer);
  }
  getCurve(addr, s) {
    return new ethers.Contract(addr, CONTRACTS.CURVE_ABI, s || this._rp());
  }
  getToken(addr, s) {
    return new ethers.Contract(addr, CONTRACTS.ERC20_ABI, s || this._rp());
  }

  async switchToRobinhood() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CONTRACTS.CHAIN_CONFIG.chainId }]
      });
      return true;
    } catch (err) {
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [CONTRACTS.CHAIN_CONFIG]
          });
          return true;
        } catch (e) { console.error('Add chain failed:', e); return false; }
      }
      console.error('Switch chain failed:', err);
      return false;
    }
  }

  async getLaunchFee() {
    try {
      return await this.getFactory().launchFee();
    } catch {
      return ethers.parseEther(CONTRACTS.LAUNCH_FEE_FALLBACK);
    }
  }

  async launchToken(params) {
    if (!this.signer) throw new Error('Connect wallet first');

    const network = await this.signer.provider.getNetwork();
    if (Number(network.chainId) !== CONTRACTS.CHAIN_ID) {
      throw new Error(`Wrong network (chainId ${network.chainId}). Please switch to Robinhood Chain (${CONTRACTS.CHAIN_ID}).`);
    }

    const factory = this.getFactory(this.signer);

    let fee;
    try {
      fee = await factory.launchFee();
    } catch (e) {
      console.error('launchFee() failed:', e);
      throw new Error('Cannot read launch fee. Check your network connection.');
    }

    const pairToken = CONTRACTS.ZERO;

    let economics;
    try {
      economics = await factory.previewLaunchEconomics(0n, pairToken);
      console.log('Economics hash:', economics);
    } catch (e) {
      console.error('previewLaunchEconomics() failed:', e);
      throw new Error('Cannot read launch economics from factory. Please try again.');
    }

    let logo = params.logo || '';
    if (logo.startsWith('data:') && logo.length > 512) {
      try {
        const resp = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: logo })
        });
        const data = await resp.json();
        if (data.ipfsUrl) {
          logo = data.ipfsUrl;
          console.log('Logo uploaded to IPFS:', logo);
        } else {
          console.warn('IPFS upload failed:', data.error);
          logo = '';
        }
      } catch (e) {
        console.warn('IPFS upload error:', e.message);
        logo = '';
      }
    }
    if (logo.length > 512) logo = '';

    const name = (params.name || '').slice(0, 64);
    const symbol = (params.symbol || '').slice(0, 16);
    const description = (params.description || '').slice(0, 2048);

    const deployer = await this.signer.getAddress();

    try {
      const canDo = await factory.canLaunch(deployer);
      if (!canDo) throw new Error('Your wallet is not allowed to launch tokens.');
    } catch (e) {
      if (e.message.includes('not allowed')) throw e;
      console.warn('canLaunch() check failed (skipping):', e.message);
    }

    try {
      const enabled = await factory.launchEnabled();
      if (!enabled) throw new Error('Token launching is currently disabled on this contract.');
    } catch (e) {
      if (e.message.includes('disabled')) throw e;
      console.warn('launchEnabled() check failed (skipping):', e.message);
    }

    const salt = ethers.hexlify(ethers.randomBytes(32));

    const tokenParams = {
      name,
      symbol,
      logo,
      description,
      socials: {
        twitter: (params.twitter || '').slice(0, 256),
        telegram: (params.telegram || '').slice(0, 256),
        discord: (params.discord || '').slice(0, 256),
        website: (params.website || '').slice(0, 256),
        farcaster: ''
      },
      creatorFeeRecipient: deployer,
      creatorTaxBps: params.creatorTaxBps || 0,
      buybackEnabled: true,
      expectedEconomics: economics,
      salt
    };

    let tx, receipt;
    const gasOverride = { gasLimit: 5000000n };

    try {
      if (params.initialBuyEth && parseFloat(params.initialBuyEth) > 0) {
        const router = this.getRouter();
        const buyAmt = ethers.parseEther(params.initialBuyEth);
        await router.launchAndBuy.staticCall(
          tokenParams, 0n, pairToken,
          buyAmt, 0n, deployer, [],
          { value: fee + buyAmt, from: deployer }
        );
        tx = await router.launchAndBuy(
          tokenParams, 0n, pairToken,
          buyAmt, 0n, deployer, [],
          { value: fee + buyAmt, ...gasOverride }
        );
      } else {
        await factory.launchToken.staticCall(
          tokenParams, 0n, pairToken, [],
          { value: fee, from: deployer }
        );
        tx = await factory.launchToken(tokenParams, 0n, pairToken, [], { value: fee, ...gasOverride });
      }
    } catch (e) {
      console.error('Launch revert details:', e);
      const reason = e.reason || e.shortMessage || e.message || 'Unknown error';
      const revertData = e.data || '';
      throw new Error(`Deploy failed: ${reason}${revertData ? ' (data: ' + revertData + ')' : ''}`);
    }

    receipt = await tx.wait();
    return this._parseDeployReceipt(receipt, deployer);
  }

  _parseDeployReceipt(receipt, deployer) {
    const iface = this.getFactory().interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === 'TokenLaunched') {
          return {
            tokenAddress: parsed.args[0],
            curveAddress: parsed.args[1],
            deployer: parsed.args[2] || deployer,
            txHash: receipt.hash
          };
        }
      } catch {}
    }
    return { txHash: receipt.hash };
  }

  async buyToken(curveAddress, quoteIn, minTokensOut, recipient) {
    if (!this.signer) throw new Error('Connect wallet first');
    const curve = this.getCurve(curveAddress, this.signer);
    const tx = await curve.buy(quoteIn, minTokensOut, recipient, { value: quoteIn });
    return await tx.wait();
  }

  async sellToken(tokenAddress, curveAddress, tokensIn, minQuoteOut, recipient) {
    if (!this.signer) throw new Error('Connect wallet first');
    const token = this.getToken(tokenAddress, this.signer);
    const allowance = await token.allowance(recipient, curveAddress);
    if (allowance < tokensIn) {
      const appTx = await token.approve(curveAddress, ethers.MaxUint256);
      await appTx.wait();
    }
    const curve = this.getCurve(curveAddress, this.signer);
    const tx = await curve.sell(tokensIn, minQuoteOut, recipient);
    return await tx.wait();
  }

  async getBuyQuote(curveAddress, quoteIn, recipient) {
    const curve = this.getCurve(curveAddress);
    const rcpt = recipient || CONTRACTS.ZERO;
    const [reserves, sellable, fb, ctb, stb] = await Promise.all([
      curve.getReserves(), curve.sellableTokens(),
      curve.feeBps(), curve.creatorTaxBps(), curve.currentSnipeTaxBps(rcpt)
    ]);
    const [qr, tr] = reserves;
    let snipe = stb;
    if (snipe > 0n) { const mx = 10000n - fb - ctb - 100n; if (snipe > mx) snipe = mx; }
    const fee = quoteIn * fb / 10000n;
    const tax = quoteIn * ctb / 10000n;
    const sf = quoteIn * snipe / 10000n;
    const net = quoteIn - fee - tax - sf;
    let out = (qr + net === 0n) ? 0n : net * tr / (qr + net);
    if (out > sellable) out = sellable;
    return { tokensOut: out, fee, tax };
  }

  async getSellQuote(curveAddress, tokensIn) {
    const curve = this.getCurve(curveAddress);
    const [reserves, fb, ctb] = await Promise.all([
      curve.getReserves(), curve.feeBps(), curve.creatorTaxBps()
    ]);
    const [qr, tr] = reserves;
    const gross = (tr + tokensIn === 0n) ? 0n : tokensIn * qr / (tr + tokensIn);
    const fee = gross * fb / 10000n;
    const tax = gross * ctb / 10000n;
    return { quoteOut: gross - fee - tax, fee, tax };
  }

  async discoverTokens() {
    try {
      const topic0 = ethers.id('TokenLaunched(address,address,address,address,uint256,uint256)');
      const url = `${CONTRACTS.EXPLORER}/api/v2/addresses/${CONTRACTS.PONS_FACTORY}/logs`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Blockscout API error ' + resp.status);
      const data = await resp.json();
      const logs = (data.items || []).filter(i => i.topics[0] === topic0);
      return logs.map(log => {
        const dataBytes = log.data && log.data !== '0x' ? log.data : null;
        let pairToken = CONTRACTS.ZERO;
        if (dataBytes && dataBytes.length >= 66) {
          pairToken = '0x' + dataBytes.slice(26, 66);
        }
        return {
          token: '0x' + log.topics[1].slice(26),
          curve: '0x' + log.topics[2].slice(26),
          deployer: '0x' + log.topics[3].slice(26),
          pairToken,
          blockNumber: log.block_number,
          txHash: log.tx_hash
        };
      });
    } catch (e) {
      console.warn('discoverTokens failed:', e);
      return [];
    }
  }

  async getTokenMetadata(tokenAddress) {
    try {
      const token = this.getToken(tokenAddress);
      const [name, symbol, info] = await Promise.all([
        token.name(), token.symbol(), token.getTokenInfo()
      ]);
      return {
        name, symbol,
        deployer: info.tokenDeployer,
        logo: info.tokenLogo || '',
        description: info.tokenDescription || '',
        twitter: info.tokenSocials?.twitter || '',
        telegram: info.tokenSocials?.telegram || '',
        discord: info.tokenSocials?.discord || '',
        website: info.tokenSocials?.website || ''
      };
    } catch (e) {
      console.warn('getTokenMetadata failed for', tokenAddress, e);
      return null;
    }
  }

  async getTokenOnChainData(tokenAddress) {
    try {
      const factory = this.getFactory();
      const info = await factory.getLaunchedToken(tokenAddress);
      if (!info.exists) return null;
      const curve = this.getCurve(info.curve);
      const [reserves, realQ, gradT, grad] = await Promise.all([
        curve.getReserves(), curve.realQuoteReserve(),
        curve.graduationThreshold(), curve.graduated()
      ]);
      const progressBps = gradT > 0n ? Number(realQ * 10000n / gradT) : 0;
      return {
        token: info.token, curve: info.curve, deployer: info.deployer,
        pairToken: info.pairToken, graduated: grad,
        quoteReserve: reserves[0], tokenReserve: reserves[1],
        realQuoteReserve: realQ, graduationThreshold: gradT,
        progressBps, exists: true
      };
    } catch (e) {
      console.error('getTokenOnChainData failed:', e);
      return null;
    }
  }
}

window.CONTRACTS = CONTRACTS;
window.contractManager = new ContractManager();
